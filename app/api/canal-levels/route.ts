import {
  CanalCondition,
  CanalStation,
  canalConditionLabels,
  relevantCanalStationIds,
} from "@/lib/canalLevels";

export const revalidate = 300;

const sourceUrl = "https://weather.bangkok.go.th/water/PageMap/GoogleMap";
const stationIds = new Set<number>(relevantCanalStationIds);

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

export async function GET() {
  try {
    const response = await fetch(sourceUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
      body: new URLSearchParams({ payload: "TEST_DATA_GOES_HERE" }),
      next: { revalidate },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      return Response.json({ error: "ระบบตรวจวัดระดับน้ำ กทม. ตอบกลับไม่สำเร็จ" }, { status: 502 });
    }

    const rows = await response.json() as BmaStation[];
    const stations = rows.map(mapStation).filter((station): station is CanalStation => station !== null);
    if (!stations.length) {
      return Response.json({ error: "ไม่พบข้อมูลสถานีคลองในพื้นที่ใกล้เคียง" }, { status: 502 });
    }

    return Response.json({ generatedAt: new Date().toISOString(), stations });
  } catch {
    return Response.json({ error: "เชื่อมต่อข้อมูลสถานีคลองไม่สำเร็จ โปรดลองอีกครั้ง" }, { status: 502 });
  }
}
