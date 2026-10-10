import { createHmac, randomUUID } from "node:crypto";
import { districts, subdistrictsByDistrict, waterLevels, type NewFloodReport, type VehicleType, type WaterTrend } from "@/lib/types";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const vehicleTypes: VehicleType[] = ["มอเตอร์ไซค์", "รถเก๋ง", "รถกระบะ / รถยกสูง", "เรือเท่านั้น"];
const trends: WaterTrend[] = ["น้ำกำลังขึ้น", "ทรงตัว", "กำลังลด"];
const maxRequestBytes = 4 * 1024 * 1024;
const maxPhotoBytes = 3 * 1024 * 1024;

interface SubmitBody {
  report?: Partial<NewFloodReport>;
  photoDataUrl?: string;
  allowDuplicate?: boolean;
}

interface SubmissionResult {
  status?: string;
  report?: Record<string, unknown>;
  distance_meters?: number;
  retry_after_seconds?: number;
}

function fail(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

function requestIp(request: Request) {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || "unknown";
}

function validatedReport(value: SubmitBody["report"]): NewFloodReport | null {
  if (!value || typeof value !== "object") return null;
  const { locationName, district, subdistrict, latitude, longitude, waterLevel, trend, passable, note } = value;
  if (typeof locationName !== "string" || locationName.trim().length < 1 || locationName.length > 120) return null;
  if (typeof district !== "string" || !districts.includes(district as (typeof districts)[number])) return null;
  if (typeof subdistrict !== "string" || !subdistrictsByDistrict[district]?.includes(subdistrict)) return null;
  if (typeof latitude !== "number" || !Number.isFinite(latitude) || latitude < 5 || latitude > 21) return null;
  if (typeof longitude !== "number" || !Number.isFinite(longitude) || longitude < 97 || longitude > 106) return null;
  if (typeof waterLevel !== "string" || !waterLevels.includes(waterLevel as (typeof waterLevels)[number])) return null;
  if (typeof trend !== "string" || !trends.includes(trend as WaterTrend)) return null;
  if (!Array.isArray(passable) || !passable.every((item) => typeof item === "string" && vehicleTypes.includes(item as VehicleType))) return null;
  if (typeof note !== "string" || note.length > 400) return null;

  return {
    locationName: locationName.trim(),
    district,
    subdistrict,
    latitude,
    longitude,
    waterLevel: waterLevel as NewFloodReport["waterLevel"],
    trend: trend as WaterTrend,
    passable: passable as VehicleType[],
    note,
  };
}

function parsePhoto(photoDataUrl: string | undefined) {
  if (!photoDataUrl) return null;
  const match = photoDataUrl.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) return null;
  const buffer = Buffer.from(match[1], "base64");
  if (!buffer.length || buffer.length > maxPhotoBytes) return null;
  return buffer;
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxRequestBytes) return fail("ข้อมูลรายงานมีขนาดใหญ่เกินไป โปรดย่อรูปแล้วลองใหม่", 413);

  const supabase = getSupabaseAdmin();
  const rateLimitSecret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabase || !rateLimitSecret) return fail("ระบบรับรายงานยังไม่ได้ตั้งค่าฝั่งเซิร์ฟเวอร์", 503);

  let body: SubmitBody;
  try {
    body = await request.json() as SubmitBody;
  } catch {
    return fail("ข้อมูลรายงานไม่ถูกต้อง", 400);
  }

  const report = validatedReport(body.report);
  if (!report) return fail("กรุณาตรวจสอบตำแหน่งและรายละเอียดรายงานอีกครั้ง", 400);
  const photo = parsePhoto(body.photoDataUrl);
  if (body.photoDataUrl && !photo) return fail("ไฟล์รูปไม่ถูกต้องหรือมีขนาดเกิน 10 MB", 400);

  const ipHash = createHmac("sha256", rateLimitSecret).update(requestIp(request)).digest("hex");
  const { data, error } = await supabase.rpc("submit_flood_report", {
    p_ip_hash: ipHash,
    p_location_name: report.locationName,
    p_district: report.district,
    p_subdistrict: report.subdistrict,
    p_latitude: report.latitude,
    p_longitude: report.longitude,
    p_water_level: report.waterLevel,
    p_trend: report.trend,
    p_passable: report.passable,
    p_note: report.note,
    p_photo_url: null,
    p_allow_duplicate: body.allowDuplicate === true,
  });

  if (error) {
    console.error("Flood report submission failed", error.code ?? "database_error");
    return fail("บันทึกรายงานไม่สำเร็จ โปรดลองอีกครั้ง", 500);
  }

  const result = data as SubmissionResult;
  if (result.status === "rate_limited") {
    const retryAfter = Math.max(1, result.retry_after_seconds ?? 600);
    return Response.json({
      error: "ส่งรายงานถี่เกินไป โปรดรอสักครู่ก่อนส่งรายงานใหม่",
      retryAfterSeconds: retryAfter,
    }, { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(retryAfter) } });
  }
  if (result.status === "duplicate" && result.report) {
    return Response.json({
      status: "duplicate",
      candidate: result.report,
      distanceMeters: result.distance_meters ?? null,
    }, { status: 409, headers: { "Cache-Control": "no-store" } });
  }
  if (result.status !== "created" || !result.report) return fail("ไม่สามารถบันทึกรายงานได้ โปรดลองอีกครั้ง", 500);

  const reportId = String(result.report.id);
  if (photo) {
    const photoPath = `${randomUUID()}.jpg`;
    const { error: uploadError } = await supabase.storage.from("report-photos").upload(photoPath, photo, {
      contentType: "image/jpeg",
      upsert: false,
    });
    if (uploadError) {
      await supabase.from("reports").delete().eq("id", reportId);
      console.error("Flood report photo upload failed", uploadError.message);
      return fail("อัปโหลดรูปไม่สำเร็จ โปรดลองส่งรายงานอีกครั้ง", 502);
    }

    const photoUrl = supabase.storage.from("report-photos").getPublicUrl(photoPath).data.publicUrl;
    const { error: photoUpdateError } = await supabase.from("reports").update({ photo_url: photoUrl }).eq("id", reportId);
    if (photoUpdateError) {
      await supabase.storage.from("report-photos").remove([photoPath]);
      await supabase.from("reports").delete().eq("id", reportId);
      console.error("Flood report photo link failed", photoUpdateError.message);
      return fail("บันทึกรูปประกอบรายงานไม่สำเร็จ โปรดลองอีกครั้ง", 500);
    }
  }

  const { data: saved, error: readError } = await supabase.from("reports").select("*").eq("id", reportId).single();
  if (readError || !saved) return fail("บันทึกรายงานแล้วแต่โหลดผลลัพธ์ไม่สำเร็จ", 500);
  return Response.json({ status: "created", report: saved }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
