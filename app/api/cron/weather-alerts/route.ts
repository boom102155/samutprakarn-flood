import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  categoryForTmdCondition,
  formatWeatherAlert,
  parseTmdHourlyForecasts,
  parseTmdWarnings,
} from "@/lib/tmdWeatherWarnings";
import type { TmdHourlyForecast, WeatherAlertCategory } from "@/lib/tmdWeatherWarnings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MULTICAST_RECIPIENTS = 500;
const TMD_WARNING_URL = "https://data.tmd.go.th/api/WeatherWarningNews/v2/";
const TMD_HOURLY_PLACE_URL = "https://data.tmd.go.th/nwpapi/v1/forecast/location/hourly/place";

interface LineSubscription {
  line_user_id: string;
  alert_types: string[] | null;
  latitude: number | null;
  longitude: number | null;
}

interface ForecastZone {
  forecastLocation: TmdHourlyForecast;
  subscribers: LineSubscription[];
  forecasts: TmdHourlyForecast[];
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
      .select("line_user_id, alert_types, latitude, longitude")
      .eq("status", "active")
      .order("line_user_id")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    subscriptions.push(...(data ?? []) as LineSubscription[]);
    if ((data?.length ?? 0) < pageSize) break;
  }
  return subscriptions;
}

async function fetchTmdHourlyForecasts(accessToken: string) {
  const url = new URL(TMD_HOURLY_PLACE_URL);
  url.searchParams.set("province", "สมุทรปราการ");
  url.searchParams.set("subarea", "1");
  url.searchParams.set("fields", "tc,rh,cond,rain");
  url.searchParams.set("duration", "6");

  const response = await fetch(url, {
    headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`TMD hourly forecast returned ${response.status}`);
  return parseTmdHourlyForecasts(await response.json());
}

function distanceSquared(latitude: number, longitude: number, forecast: TmdHourlyForecast) {
  const latitudeDelta = latitude - forecast.latitude;
  const longitudeDelta = (longitude - forecast.longitude) * Math.cos((latitude * Math.PI) / 180);
  return latitudeDelta ** 2 + longitudeDelta ** 2;
}

function groupSubscribersByForecastZone(subscriptions: LineSubscription[], forecasts: TmdHourlyForecast[]) {
  const locations = [...new Map(forecasts.map((forecast) => [forecast.locationKey, forecast])).values()];
  const zones = new Map<string, ForecastZone>();

  for (const subscription of subscriptions) {
    const latitude = subscription.latitude;
    const longitude = subscription.longitude;
    if (latitude === null || longitude === null) continue;
    const nearest = locations.reduce<TmdHourlyForecast | null>((best, candidate) => (
      !best || distanceSquared(latitude, longitude, candidate)
        < distanceSquared(latitude, longitude, best)
        ? candidate
        : best
    ), null);
    if (!nearest) continue;

    const zone = zones.get(nearest.locationKey) ?? {
      forecastLocation: nearest,
      subscribers: [],
      forecasts: forecasts.filter((forecast) => forecast.locationKey === nearest.locationKey),
    };
    zone.subscribers.push(subscription);
    zones.set(nearest.locationKey, zone);
  }

  return [...zones.values()];
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

function forecastConditionText(code: number) {
  if (code === 7) return "ฝนตกหนัก";
  if (code === 8) return "ฝนฟ้าคะนอง";
  if (code === 9) return "อากาศหนาวจัด";
  if (code === 10) return "อากาศหนาว";
  if (code === 12) return "อากาศร้อนจัด";
  return "สภาพอากาศเสี่ยง";
}

function formatForecastAlert(zone: ForecastZone, forecast: TmdHourlyForecast, conditionText: string) {
  const forecastTime = new Intl.DateTimeFormat("th-TH", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(new Date(forecast.time));
  const readings = [
    forecast.temperatureC !== null ? `อุณหภูมิ ${forecast.temperatureC.toFixed(1)}°C` : "",
    forecast.humidityPercent !== null ? `ความชื้น ${Math.round(forecast.humidityPercent)}%` : "",
    forecast.rainMm !== null ? `ฝน ${forecast.rainMm.toFixed(1)} มม./ชม.` : "",
  ].filter(Boolean).join(" · ");
  const category = categoryForTmdCondition(forecast.conditionCode ?? 0);
  const advice = category === "heat"
    ? "หลีกเลี่ยงกิจกรรมกลางแดด ดื่มน้ำ และสังเกตอาการเพลียแดด"
    : category === "cold"
      ? "เตรียมเสื้อผ้าให้เหมาะกับอากาศและดูแลเด็กเล็ก/ผู้สูงอายุ"
      : "ตรวจสอบสภาพอากาศก่อนเดินทางและหลีกเลี่ยงพื้นที่เสี่ยง";

  return [
    `⚠️ TMD พยากรณ์${conditionText}`,
    `พื้นที่ที่ติดตาม: ${zone.forecastLocation.locationName || "สมุทรปราการ"}`,
    `ช่วงพยากรณ์: ${forecastTime}${readings ? `\n${readings}` : ""}`,
    advice,
    "พยากรณ์จากแบบจำลอง TMD ไม่ใช่การตรวจวัด ณ จุดนั้น",
  ].join("\n\n").slice(0, 4900);
}

async function deliverLocalForecastAlerts(
  subscriptions: LineSubscription[],
  categoriesWithOfficialWarnings: Set<WeatherAlertCategory>,
) {
  const accessToken = process.env.TMD_NWP_ACCESS_TOKEN;
  if (!accessToken) return { status: "token_not_configured", zones: 0, sent: 0, failed: 0 };

  const forecasts = await fetchTmdHourlyForecasts(accessToken);
  const zones = groupSubscribersByForecastZone(subscriptions, forecasts);
  const now = Date.now();
  const latestAlertTime = now + 3 * 60 * 60 * 1000;
  const alertedToday = new Set<string>();
  let sent = 0;
  let failed = 0;

  for (const zone of zones) {
    for (const forecast of zone.forecasts) {
      const forecastTimestamp = Date.parse(forecast.time);
      if (!Number.isFinite(forecastTimestamp) || forecastTimestamp < now - 60 * 60 * 1000 || forecastTimestamp > latestAlertTime || forecast.conditionCode === null) continue;
      const category = categoryForTmdCondition(forecast.conditionCode);
      if (!category || categoriesWithOfficialWarnings.has(category)) continue;

      const day = forecast.time.slice(0, 10);
      const notificationKey = `${zone.forecastLocation.locationKey}|${category}|${day}`;
      if (alertedToday.has(notificationKey)) continue;
      alertedToday.add(notificationKey);

      const recipients = zone.subscribers
        .filter((subscription) => userWantsWarning(subscription.alert_types, [category]))
        .map((subscription) => subscription.line_user_id);
      if (!recipients.length) continue;

      const alertKey = createHash("sha256").update(`tmd-nwp|${notificationKey}`).digest("hex");
      const result = await deliverWarning(alertKey, formatForecastAlert(zone, forecast, forecastConditionText(forecast.conditionCode)), recipients);
      sent += result.sent;
      failed += result.failed;
    }
  }

  return { status: "checked", zones: zones.length, sent, failed };
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
    const officialWarningCategories = new Set(warnings.flatMap((warning) => warning.categories));
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

    let localForecast: { status: string; zones: number; sent: number; failed: number };
    try {
      localForecast = await deliverLocalForecastAlerts(subscriptions, officialWarningCategories);
      totalSent += localForecast.sent;
      totalFailed += localForecast.failed;
    } catch (error) {
      console.error("TMD hourly forecast alert failed", error instanceof Error ? error.message : "unknown error");
      localForecast = { status: "failed", zones: 0, sent: 0, failed: 0 };
    }

    return Response.json({
      checkedAt: new Date().toISOString(),
      source: "กรมอุตุนิยมวิทยา · WeatherWarningNews",
      activeWarnings: warnings.length,
      activeSubscribers: subscriptions.length,
      sent: totalSent,
      failed: totalFailed,
      localForecast,
      results,
    });
  } catch (error) {
    console.error("Weather alert run failed", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "ตรวจประกาศเตือนหรือส่งข้อความไม่สำเร็จ" }, { status: 500 });
  }
}
