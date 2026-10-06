import { randomUUID, timingSafeEqual } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { formatWeatherAlert, parseTmdWarnings, WeatherAlertCategory } from "@/lib/tmdWeatherWarnings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MULTICAST_RECIPIENTS = 500;
const TMD_WARNING_URL = "https://data.tmd.go.th/api/WeatherWarningNews/v2/";

interface LineSubscription {
  line_user_id: string;
  alert_types: string[] | null;
}

function hasCronAuthorization(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  if (!secret || !authorization.startsWith("Bearer ")) return false;
  const provided = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function userWantsWarning(alertTypes: string[] | null, categories: WeatherAlertCategory[]) {
  if (!alertTypes?.length || alertTypes.includes("all")) return true;
  return categories.some((category) => alertTypes.includes(category));
}

async function activeSubscriptions(): Promise<LineSubscription[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase server credentials are not configured");

  const subscriptions: LineSubscription[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("line_weather_subscriptions")
      .select("line_user_id, alert_types")
      .eq("status", "active")
      .order("line_user_id")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    subscriptions.push(...(data ?? []) as LineSubscription[]);
    if ((data?.length ?? 0) < pageSize) break;
  }
  return subscriptions;
}

async function sendMulticast(lineUserIds: string[], message: string, retryKey: string) {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not configured");

  const response = await fetch("https://api.line.me/v2/bot/message/multicast", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Line-Retry-Key": retryKey,
    },
    body: JSON.stringify({
      to: lineUserIds,
      messages: [{ type: "text", text: message }],
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 409 && detail.includes("already accepted")) return;
    throw new Error(`LINE multicast failed (${response.status}): ${detail.slice(0, 300)}`);
  }
}

async function deliverWarning(alertKey: string, message: string, recipients: string[]) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase server credentials are not configured");
  let sent = 0;
  let failed = 0;

  for (let offset = 0; offset < recipients.length; offset += MAX_MULTICAST_RECIPIENTS) {
    const batch = recipients.slice(offset, offset + MAX_MULTICAST_RECIPIENTS);
    const { data: previousRows, error: readError } = await supabase
      .from("line_weather_alert_deliveries")
      .select("line_user_id, status, attempt_count, retry_key")
      .eq("alert_key", alertKey)
      .in("line_user_id", batch);
    if (readError) throw readError;

    const previousByUser = new Map((previousRows ?? []).map((row) => [row.line_user_id, row]));
    const pending = batch.filter((lineUserId) => previousByUser.get(lineUserId)?.status !== "sent");
    if (!pending.length) continue;

    const existingRetryKeys = new Set(pending
      .map((lineUserId) => previousByUser.get(lineUserId)?.retry_key)
      .filter((retryKey): retryKey is string => Boolean(retryKey)));
    const retryKey = existingRetryKeys.size === 1 && pending.every((lineUserId) => previousByUser.get(lineUserId)?.retry_key)
      ? [...existingRetryKeys][0]
      : randomUUID();
    const now = new Date().toISOString();
    const deliveryRows = pending.map((lineUserId) => ({
      alert_key: alertKey,
      line_user_id: lineUserId,
      status: "sending",
      retry_key: retryKey,
      attempt_count: (previousByUser.get(lineUserId)?.attempt_count ?? 0) + 1,
      last_error: null,
      updated_at: now,
    }));

    const { error: saveError } = await supabase
      .from("line_weather_alert_deliveries")
      .upsert(deliveryRows, { onConflict: "alert_key,line_user_id" });
    if (saveError) throw saveError;

    try {
      await sendMulticast(pending, message, retryKey);
      const { error } = await supabase.from("line_weather_alert_deliveries").update({
        status: "sent",
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_error: null,
      }).eq("alert_key", alertKey).in("line_user_id", pending);
      if (error) throw error;
      sent += pending.length;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "LINE send failed";
      const { error: updateError } = await supabase.from("line_weather_alert_deliveries").update({
        status: "failed",
        last_error: detail.slice(0, 500),
        updated_at: new Date().toISOString(),
      }).eq("alert_key", alertKey).in("line_user_id", pending);
      if (updateError) throw updateError;
      failed += pending.length;
    }
  }

  return { sent, failed };
}

export async function GET(request: Request) {
  if (!hasCronAuthorization(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    return Response.json({ error: "LINE_CHANNEL_ACCESS_TOKEN is not configured" }, { status: 503 });
  }

  try {
    const uid = process.env.TMD_API_UID ?? "demo";
    const ukey = process.env.TMD_API_KEY ?? "demokey";
    const url = new URL(TMD_WARNING_URL);
    url.searchParams.set("uid", uid);
    url.searchParams.set("ukey", ukey);

    const response = await fetch(url, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      return Response.json({ error: `TMD WeatherWarningNews returned ${response.status}` }, { status: 502 });
    }

    const warnings = parseTmdWarnings(await response.text());
    const subscriptions = await activeSubscriptions();
    const results: { issueNo: string; category: string[]; sent: number; failed: number }[] = [];
    let totalSent = 0;
    let totalFailed = 0;

    for (const warning of warnings) {
      const recipients = subscriptions
        .filter((subscription) => userWantsWarning(subscription.alert_types, warning.categories))
        .map((subscription) => subscription.line_user_id);
      if (!recipients.length) continue;

      const delivery = await deliverWarning(warning.key, formatWeatherAlert(warning), recipients);
      totalSent += delivery.sent;
      totalFailed += delivery.failed;
      results.push({ issueNo: warning.issueNo, category: warning.categories, ...delivery });
    }

    return Response.json({
      checkedAt: new Date().toISOString(),
      source: "กรมอุตุนิยมวิทยา · WeatherWarningNews",
      activeWarnings: warnings.length,
      activeSubscribers: subscriptions.length,
      sent: totalSent,
      failed: totalFailed,
      results,
    });
  } catch (error) {
    console.error("Weather alert run failed", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "ตรวจประกาศเตือนหรือส่งข้อความไม่สำเร็จ" }, { status: 500 });
  }
}
