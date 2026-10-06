import { createHmac, timingSafeEqual } from "node:crypto";
import samutPrakanBoundary from "@/lib/samut-prakan-boundary.json";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface LineEvent {
  type?: string;
  replyToken?: string;
  source?: { type?: string; userId?: string };
  message?: {
    type?: string;
    text?: string;
    latitude?: number;
    longitude?: number;
  };
}

interface LineWebhookBody {
  events?: LineEvent[];
}

type QuickReplyItem =
  | { type: "message"; label: string; text: string }
  | { type: "location"; label: string };

function messageAction(label: string, text: string): QuickReplyItem {
  return { type: "message", label, text };
}

function locationAction(label = "แชร์ตำแหน่ง"): QuickReplyItem {
  return { type: "location", label };
}

function validSignature(body: string, signature: string, channelSecret: string) {
  const expected = createHmac("sha256", channelSecret).update(body).digest();
  let received: Buffer;
  try {
    received = Buffer.from(signature, "base64");
  } catch {
    return false;
  }
  return received.length === expected.length && timingSafeEqual(received, expected);
}

async function reply(replyToken: string | undefined, text: string, quickReplies: QuickReplyItem[] = []) {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!replyToken || !channelAccessToken) return;

  const response = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${channelAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      replyToken,
      messages: [{
        type: "text",
        text: text.slice(0, 4900),
        ...(quickReplies.length ? { quickReply: { items: quickReplies.map((action) => ({ type: "action", action })) } } : {}),
      }],
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    console.error("LINE reply failed", response.status);
  }
}

function isInsideSamutPrakan(latitude: number, longitude: number) {
  const ring = samutPrakanBoundary.geometry.coordinates[0] as [number, number][];
  let inside = false;

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [currentLongitude, currentLatitude] = ring[index];
    const [previousLongitude, previousLatitude] = ring[previous];
    const crosses = (currentLatitude > latitude) !== (previousLatitude > latitude)
      && longitude < ((previousLongitude - currentLongitude) * (latitude - currentLatitude)) / (previousLatitude - currentLatitude) + currentLongitude;
    if (crosses) inside = !inside;
  }

  return inside;
}

async function replyGettingStarted(replyToken?: string) {
  await reply(
    replyToken,
    "🌦️ รับแจ้งเตือนสภาพอากาศเสี่ยงในสมุทรปราการ\n\nกด “เริ่มสมัคร” เพื่ออ่านรายละเอียดและเลือกยินยอมก่อนแชร์ตำแหน่ง ระบบจะเก็บพิกัดแบบปัดเศษประมาณ 1 กม. เพื่อเลือกคำเตือนใกล้พื้นที่ และไม่ติดตามตำแหน่งเบื้องหลัง",
    [messageAction("เริ่มสมัคร", "สมัคร")],
  );
}

async function replyConsentPrompt(replyToken?: string) {
  await reply(
    replyToken,
    "ก่อนสมัคร ระบบจะใช้ตำแหน่งที่คุณเลือกเพื่อคัดเลือกประกาศเตือนสภาพอากาศในสมุทรปราการ และเก็บเฉพาะพิกัดที่ปัดเศษประมาณ 1 กม. รับตำแหน่งครั้งเดียว ไม่ติดตามเบื้องหลัง\n\nคุณยินยอมให้ใช้และจัดเก็บตำแหน่งตามนี้หรือไม่?",
    [messageAction("ยินยอม", "ยินยอม"), messageAction("ไม่ยินยอม", "ไม่ยินยอม")],
  );
}

async function replyLocationPrompt(replyToken: string | undefined, text = "ขอบคุณครับ แชร์ตำแหน่งที่ต้องการติดตามได้โดยกดปุ่มด้านล่าง แล้วเลือกจุดบนแผนที่") {
  await reply(replyToken, text, [locationAction(), messageAction("ยกเลิก", "หยุด")]);
}

async function handleEvent(event: LineEvent) {
  const lineUserId = event.source?.type === "user" ? event.source.userId : undefined;
  if (!lineUserId) return;

  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase service-role configuration is missing");

  if (event.type === "follow") {
    const { data: existing, error: readError } = await supabase
      .from("line_weather_subscriptions")
      .select("status")
      .eq("line_user_id", lineUserId)
      .maybeSingle();
    if (readError) throw readError;

    if (!existing) {
      const { error } = await supabase.from("line_weather_subscriptions").insert({ line_user_id: lineUserId });
      if (error) throw error;
    } else if (existing.status === "unfollowed") {
      const { error } = await supabase.from("line_weather_subscriptions").update({
        status: "awaiting_consent",
        latitude: null,
        longitude: null,
        consented_at: null,
        unsubscribed_at: null,
        updated_at: new Date().toISOString(),
      }).eq("line_user_id", lineUserId);
      if (error) throw error;
    }

    await replyGettingStarted(event.replyToken);
    return;
  }

  if (event.type === "unfollow") {
    const { error } = await supabase.from("line_weather_subscriptions").upsert({
      line_user_id: lineUserId,
      status: "unfollowed",
      latitude: null,
      longitude: null,
      consented_at: null,
      unsubscribed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "line_user_id" });
    if (error) throw error;
    const { error: deliveryError } = await supabase.from("line_weather_alert_deliveries").delete().eq("line_user_id", lineUserId);
    if (deliveryError) throw deliveryError;
    return;
  }

  if (event.type !== "message" || !event.message) return;

  if (event.message.type === "text") {
    const command = event.message.text?.trim().toLocaleLowerCase("th-TH") ?? "";
    if (["สมัคร", "เริ่ม", "start", "subscribe"].includes(command)) {
      const { error } = await supabase.from("line_weather_subscriptions").upsert({
        line_user_id: lineUserId,
        status: "awaiting_consent",
        latitude: null,
        longitude: null,
        consented_at: null,
        unsubscribed_at: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "line_user_id" });
      if (error) throw error;
      await replyConsentPrompt(event.replyToken);
      return;
    }

    if (["ยินยอม", "ยอมรับ", "consent"].includes(command)) {
      const { data: subscription, error: readError } = await supabase
        .from("line_weather_subscriptions")
        .select("status")
        .eq("line_user_id", lineUserId)
        .maybeSingle();
      if (readError) throw readError;
      if (!subscription || !["awaiting_consent", "awaiting_location"].includes(subscription.status)) {
        await replyGettingStarted(event.replyToken);
        return;
      }

      const { error } = await supabase.from("line_weather_subscriptions").update({
        status: "awaiting_location",
        consented_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("line_user_id", lineUserId);
      if (error) throw error;
      await replyLocationPrompt(event.replyToken, "ขอบคุณครับ เลือก “แชร์ตำแหน่ง” ด้านล่างเพื่อเปิดแผนที่และส่งตำแหน่งที่ต้องการติดตาม ระบบจะรับพิกัดครั้งเดียว ไม่ติดตามตำแหน่งเบื้องหลัง");
      return;
    }

    if (["ไม่ยินยอม", "ไม่ยอมรับ", "decline"].includes(command)) {
      const { error } = await supabase.from("line_weather_subscriptions").upsert({
        line_user_id: lineUserId,
        status: "awaiting_consent",
        latitude: null,
        longitude: null,
        consented_at: null,
        unsubscribed_at: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "line_user_id" });
      if (error) throw error;
      await reply(event.replyToken, "รับทราบครับ ยังไม่ได้สมัครและไม่มีการบันทึกตำแหน่ง หากต้องการเริ่มใหม่ กดปุ่มด้านล่างได้เลย", [messageAction("เริ่มสมัคร", "สมัคร")]);
      return;
    }

    if (["หยุด", "ยกเลิก", "ปิดแจ้งเตือน", "stop", "unsubscribe"].includes(command)) {
      const { error } = await supabase.from("line_weather_subscriptions").upsert({
        line_user_id: lineUserId,
        status: "unsubscribed",
        latitude: null,
        longitude: null,
        consented_at: null,
        unsubscribed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "line_user_id" });
      if (error) throw error;
      const { error: deliveryError } = await supabase.from("line_weather_alert_deliveries").delete().eq("line_user_id", lineUserId);
      if (deliveryError) throw deliveryError;
      await reply(event.replyToken, "ยกเลิกการแจ้งเตือนและลบตำแหน่งที่บันทึกไว้แล้ว หากต้องการสมัครใหม่ กดปุ่มด้านล่างได้เลย", [messageAction("เริ่มสมัครใหม่", "สมัคร")]);
      return;
    }

    if (["ตำแหน่ง", "เปลี่ยนพื้นที่", "เปลี่ยนตำแหน่ง", "location"].includes(command)) {
      const { data: subscription, error: readError } = await supabase
        .from("line_weather_subscriptions")
        .select("status, consented_at")
        .eq("line_user_id", lineUserId)
        .maybeSingle();
      if (readError) throw readError;
      if (!subscription?.consented_at) {
        await replyGettingStarted(event.replyToken);
        return;
      }
      const { error } = await supabase.from("line_weather_subscriptions").update({
        status: "awaiting_location",
        updated_at: new Date().toISOString(),
      }).eq("line_user_id", lineUserId);
      if (error) throw error;
      await replyLocationPrompt(event.replyToken, "เลือก “แชร์ตำแหน่ง” ด้านล่างเพื่อเปลี่ยนพื้นที่ที่ต้องการติดตามครับ");
      return;
    }

    if (["สถานะ", "status"].includes(command)) {
      const { data: subscription, error } = await supabase
        .from("line_weather_subscriptions")
        .select("status, latitude, longitude")
        .eq("line_user_id", lineUserId)
        .maybeSingle();
      if (error) throw error;
      const statusMessage = subscription?.status === "active"
        ? `กำลังรับประกาศเตือนในสมุทรปราการ พื้นที่ประมาณ ${Number(subscription.latitude).toFixed(2)}, ${Number(subscription.longitude).toFixed(2)}\nพิมพ์ “ตำแหน่ง” เพื่อเปลี่ยนพื้นที่ หรือ “หยุด” เพื่อยกเลิก`
        : subscription?.status === "unsubscribed"
          ? "ยังไม่ได้สมัครรับแจ้งเตือน พิมพ์ “สมัคร” เพื่อเริ่มต้น"
          : "ยังตั้งค่าไม่เสร็จ พิมพ์ “สมัคร” เพื่อเริ่มต้น";
      await reply(event.replyToken, statusMessage, subscription?.status === "active"
        ? [messageAction("เปลี่ยนตำแหน่ง", "ตำแหน่ง"), messageAction("หยุดรับแจ้งเตือน", "หยุด")]
        : [messageAction("เริ่มสมัคร", "สมัคร")]);
      return;
    }

    await replyGettingStarted(event.replyToken);
    return;
  }

  if (event.message.type === "location") {
    const { data: subscription, error: readError } = await supabase
      .from("line_weather_subscriptions")
      .select("status, consented_at")
      .eq("line_user_id", lineUserId)
      .maybeSingle();
    if (readError) throw readError;
      if (!subscription?.consented_at || !["awaiting_location", "active"].includes(subscription.status)) {
      await replyGettingStarted(event.replyToken);
      return;
    }

    const latitude = Number(event.message.latitude);
    const longitude = Number(event.message.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !isInsideSamutPrakan(latitude, longitude)) {
      await replyLocationPrompt(event.replyToken, "บริการนี้ครอบคลุมจังหวัดสมุทรปราการ กรุณาเลือกตำแหน่งภายในจังหวัดเพื่อรับแจ้งเตือนครับ");
      return;
    }

    const { error } = await supabase.from("line_weather_subscriptions").upsert({
      line_user_id: lineUserId,
      status: "active",
      latitude: Math.round(latitude * 100) / 100,
      longitude: Math.round(longitude * 100) / 100,
      alert_types: ["all"],
      consented_at: subscription.consented_at,
      unsubscribed_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "line_user_id" });
    if (error) throw error;
    await reply(event.replyToken, "✅ สมัครรับประกาศเตือนสภาพอากาศสำคัญในสมุทรปราการแล้ว\nบันทึกตำแหน่งแบบปัดเศษประมาณ 1 กม. และไม่ติดตามตำแหน่งต่อเนื่อง", [
      messageAction("เปลี่ยนตำแหน่ง", "ตำแหน่ง"),
      messageAction("หยุดรับแจ้งเตือน", "หยุด"),
    ]);
  }
}

export async function POST(request: Request) {
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  if (!channelSecret) return Response.json({ error: "LINE_CHANNEL_SECRET is not configured" }, { status: 503 });

  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature") ?? "";
  if (!validSignature(rawBody, signature, channelSecret)) {
    return Response.json({ error: "Invalid LINE webhook signature" }, { status: 401 });
  }

  let body: LineWebhookBody;
  try {
    body = JSON.parse(rawBody) as LineWebhookBody;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.events?.length) return Response.json({ ok: true });
  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    return Response.json({ error: "LINE_CHANNEL_ACCESS_TOKEN is not configured" }, { status: 503 });
  }
  if (!getSupabaseAdmin()) {
    return Response.json({ error: "Supabase server credentials are not configured" }, { status: 503 });
  }

  try {
    for (const event of body.events) await handleEvent(event);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("LINE weather webhook processing failed", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "Unable to process LINE webhook event" }, { status: 500 });
  }
}
