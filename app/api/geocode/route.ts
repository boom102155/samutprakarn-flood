export const dynamic = "force-dynamic";

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2 || query.length > 160) {
    return Response.json({ error: "ใส่ชื่อสถานที่อย่างน้อย 2 ตัวอักษร" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const search = new URL("https://nominatim.openstreetmap.org/search");
    search.searchParams.set("format", "jsonv2");
    search.searchParams.set("limit", "1");
    search.searchParams.set("countrycodes", "th");
    search.searchParams.set("accept-language", "th");
    search.searchParams.set("q", `${query}, Samut Prakan, Thailand`);
    const response = await fetch(search, {
      headers: {
        Accept: "application/json",
        "User-Agent": "SamutPrakanFloodWatch/1.0 (public flood information website)",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("ค้นหาสถานที่ไม่สำเร็จ โปรดลองอีกครั้ง");

    const results = await response.json() as NominatimResult[];
    const result = results[0];
    if (!result) return Response.json({ error: "ไม่พบสถานที่ในสมุทรปราการ ลองเพิ่มชื่อตำบล/อำเภอ หรือใส่พิกัดแทน" }, { status: 404, headers: { "Cache-Control": "no-store" } });

    return Response.json({ latitude: Number(result.lat), longitude: Number(result.lon), displayName: result.display_name }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "บริการค้นหาสถานที่ขัดข้อง โปรดลองอีกครั้งหรือใส่พิกัดแทน" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
