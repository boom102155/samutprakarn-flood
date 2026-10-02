import {
  CanalCondition,
  CanalStation,
  canalConditionLabels,
  relevantCanalStationIds,
} from "@/lib/canalLevels";

export const revalidate = 300;

const sourceUrl = "https://weather.bangkok.go.th/water/PageMap/GoogleMap";
const stationDetailUrl = "https://weather.bangkok.go.th/water/StationDetail";
const stationIds = new Set<number>(relevantCanalStationIds);
const bmaBrowserHeaders = {
  Accept: "application/json, text/javascript, */*; q=0.01",
  "Accept-Language": "th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7",
  Origin: "https://weather.bangkok.go.th",
  Referer: "https://weather.bangkok.go.th/water/",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "X-Requested-With": "XMLHttpRequest",
};

interface BmaStation {
  water_id?: number;
  water_code?: string;
  river_name?: string;
  water_shortname?: string;
  district_name?: string;
  latitude?: number;
  longitude?: number;
  wl_in?: number | null;
  wl_out01?: number | null;
  wl_out02?: number | null;
  txtStatus?: string;
  warning?: number | null;
  critical?: number | null;
  warning_out01?: number | null;
  critical_out01?: number | null;
  site_timestampTH?: string;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseBangkokTimestamp(value?: string): string | null {
  const match = value?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const [, dayText, monthText, yearText, hourText, minuteText] = match;
  const year = Number(yearText) > 2400 ? Number(yearText) - 543 : Number(yearText);
  const timestamp = Date.UTC(year, Number(monthText) - 1, Number(dayText), Number(hourText) - 7, Number(minuteText));
  return new Date(timestamp).toISOString();
}

function conditionFor(status?: string): CanalCondition {
  const normalized = status?.trim() ?? "";
  if (normalized === "ปกติ" || normalized === "ปกติ ") return "normal";
  if (normalized.includes("เตือน")) return "warning";
  if (normalized.includes("วิกฤต")) return "critical";
  return "offline";
}

function mapStation(row: BmaStation): CanalStation | null {
  const id = Number(row.water_id);
  const latitude = numberOrNull(row.latitude);
  const longitude = numberOrNull(row.longitude);
  if (!stationIds.has(id) || latitude === null || longitude === null) return null;

  const condition = conditionFor(row.txtStatus);
  return {
    id: String(id),
    code: row.water_code ?? `WL.${id}`,
    canalName: row.river_name?.trim() || "คลองไม่ระบุชื่อ",
    stationName: row.water_shortname?.trim() || row.river_name?.trim() || "สถานีวัดระดับน้ำ",
    district: row.district_name?.trim() || "",
    latitude,
    longitude,
    waterLevel: numberOrNull(row.wl_in),
    outsideLevel: numberOrNull(row.wl_out01),
    outerLevel: numberOrNull(row.wl_out02),
    condition,
    conditionLabel: row.txtStatus?.trim() || canalConditionLabels[condition],
    warningLevel: numberOrNull(row.warning),
    criticalLevel: numberOrNull(row.critical),
    outsideWarningLevel: numberOrNull(row.warning_out01),
    outsideCriticalLevel: numberOrNull(row.critical_out01),
    observedAt: parseBangkokTimestamp(row.site_timestampTH),
  };
}

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

function inputValue(html: string, id: string) {
  const tag = html.match(new RegExp(`<input\\b[^>]*id=["']${id}["'][^>]*>`, "i"))?.[0];
  const value = tag?.match(/\bvalue=["']([^"']*)["']/i)?.[1];
  return value ? htmlText(value) : "";
}

function stationDetailFallback(html: string, id: number): CanalStation | null {
  const stationOption = html.match(new RegExp(`<option\\b[^>]*value=["']${id}["'][^>]*>([\\s\\S]*?)<\\/option>`, "i"))?.[1];
  const location = stationOption ? htmlText(stationOption) : "";
  const separator = location.indexOf(":");
  const marker = html.match(/L\.marker\(\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i);
  const table = html.match(/<table\b[^>]*id=["']example["'][^>]*>([\s\S]*?)<\/table>/i)?.[1];
  const readings = table ? [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].flatMap(([, row]) => {
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(([, cell]) => htmlText(cell));
    if (cells.length < 3) return [];
    const observedAt = parseBangkokTimestamp(cells[1]);
    const waterLevel = Number(cells[2].replace(/,/g, ""));
    return observedAt && Number.isFinite(waterLevel) ? [{ observedAt, waterLevel }] : [];
  }) : [];
  const current = readings.at(-1);
  if (!marker || !current) return null;

  const warningText = inputValue(html, "txt_warning");
  const criticalText = inputValue(html, "txt_critical");
  const warningLevel = warningText && warningText !== "-" ? numberOrNull(Number(warningText)) : null;
  const criticalLevel = criticalText && criticalText !== "-" ? numberOrNull(Number(criticalText)) : null;
  const condition = warningLevel === null && criticalLevel === null
    ? "offline"
    : criticalLevel !== null && current.waterLevel >= criticalLevel
      ? "critical"
      : warningLevel !== null && current.waterLevel >= warningLevel
        ? "warning"
        : "normal";
  const conditionLabel = condition === "critical"
    ? "วิกฤต · เทียบเกณฑ์สถานี"
    : condition === "warning"
      ? "เตือนภัย · เทียบเกณฑ์สถานี"
      : condition === "normal"
        ? "ปกติ · เทียบเกณฑ์สถานี"
        : canalConditionLabels[condition];
  const stationName = location.slice(separator + 1).trim() || inputValue(html, "txt_water_shortname") || "สถานีวัดระดับน้ำ";

  return {
    id: String(id),
    code: inputValue(html, "txt_water_code") || `WL.${id}`,
    canalName: separator > 0 ? location.slice(0, separator).trim() : inputValue(html, "txt_water_name") || "คลองไม่ระบุชื่อ",
    stationName,
    district: "",
    latitude: Number(marker[1]),
    longitude: Number(marker[2]),
    waterLevel: current.waterLevel,
    outsideLevel: null,
    outerLevel: null,
    condition,
    conditionLabel,
    statusIsDerived: true,
    warningLevel,
    criticalLevel,
    outsideWarningLevel: null,
    outsideCriticalLevel: null,
    observedAt: current.observedAt,
  };
}

async function fallbackStation(id: number) {
  try {
    const response = await fetch(`${stationDetailUrl}?id=${id}`, {
      headers: {
        ...bmaBrowserHeaders,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      next: { revalidate },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return null;
    return stationDetailFallback(await response.text(), id);
  } catch {
    return null;
  }
}

async function fetchStationDetailFallback() {
  const ids = [...relevantCanalStationIds];
  const stations: CanalStation[] = [];
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(8, ids.length) }, async () => {
    while (nextIndex < ids.length) {
      const id = ids[nextIndex++];
      const station = await fallbackStation(id);
      if (station) stations.push(station);
    }
  });
  await Promise.all(workers);
  return stations;
}

export async function GET() {
  let upstreamStatus = "ไม่ทราบสถานะ";
  try {
    const response = await fetch(sourceUrl, {
      method: "POST",
      headers: { ...bmaBrowserHeaders, "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
      body: new URLSearchParams({ payload: "TEST_DATA_GOES_HERE" }),
      next: { revalidate },
      signal: AbortSignal.timeout(15_000),
    });

    if (response.ok) {
      const rows = await response.json() as BmaStation[];
      const stations = rows.map(mapStation).filter((station): station is CanalStation => station !== null);
      if (stations.length) {
        return Response.json({ generatedAt: new Date().toISOString(), source: "bma-map", stations });
      }
      upstreamStatus = "ไม่พบสถานีในข้อมูลแผนที่";
    } else {
      upstreamStatus = `HTTP ${response.status}`;
    }
  } catch {
    upstreamStatus = "เชื่อมต่อฟีดแผนที่ไม่สำเร็จ";
  }

  const stations = await fetchStationDetailFallback();
  if (stations.length) {
    return Response.json({ generatedAt: new Date().toISOString(), source: "station-details", stations });
  }

  return Response.json({ error: `ข้อมูลสถานีคลอง กทม. ยังใช้งานไม่ได้ (${upstreamStatus}) โปรดลองใหม่` }, { status: 502 });
}
