import { CanalHistory, CanalReading, relevantCanalStationIds } from "@/lib/canalLevels";

const stationIds = new Set<number>(relevantCanalStationIds);
const sourceUrl = "https://weather.bangkok.go.th/water/StationDetail";
const bmaBrowserHeaders = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7",
  Referer: "https://weather.bangkok.go.th/water/",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
};

function htmlText(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseBangkokTimestamp(value: string): string | null {
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const [, dayText, monthText, yearText, hourText, minuteText] = match;
  const year = Number(yearText) > 2400 ? Number(yearText) - 543 : Number(yearText);
  const timestamp = Date.UTC(year, Number(monthText) - 1, Number(dayText), Number(hourText) - 7, Number(minuteText));
  return new Date(timestamp).toISOString();
}

function parseReadings(html: string): CanalReading[] {
  const table = html.match(/<table\b[^>]*id=["']example["'][^>]*>([\s\S]*?)<\/table>/i)?.[1];
  if (!table) return [];

  const readings: CanalReading[] = [];
  for (const [, row] of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(([, cell]) => htmlText(cell));
    if (cells.length < 3) continue;

    const observedAt = parseBangkokTimestamp(cells[1]);
    const waterLevel = Number(cells[2].replace(/,/g, ""));
    if (observedAt && Number.isFinite(waterLevel)) readings.push({ observedAt, waterLevel });
  }
  return readings;
}

export async function GET(request: Request) {
  const stationId = Number(new URL(request.url).searchParams.get("stationId"));
  if (!Number.isInteger(stationId) || !stationIds.has(stationId)) {
    return Response.json({ error: "รหัสสถานีคลองไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    const response = await fetch(`${sourceUrl}?id=${stationId}`, {
      headers: bmaBrowserHeaders,
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      return Response.json({ error: "โหลดข้อมูลย้อนหลังจากสถานีไม่สำเร็จ" }, { status: 502 });
    }

    const readings = parseReadings(await response.text());
    const result: CanalHistory = {
      stationId: String(stationId),
      readings,
      earliestAt: readings[0]?.observedAt ?? null,
      latestAt: readings.at(-1)?.observedAt ?? null,
    };
    return Response.json(result);
  } catch {
    return Response.json({ error: "เชื่อมต่อประวัติระดับน้ำไม่สำเร็จ โปรดลองอีกครั้ง" }, { status: 502 });
  }
}
