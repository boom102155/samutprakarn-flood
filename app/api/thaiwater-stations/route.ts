import { ThaiWaterStation, ThaiWaterStationCondition, thaiWaterStationLabels } from "@/lib/thaiwaterStations";

export const dynamic = "force-dynamic";

const baseUrl = "https://api-v3.thaiwater.net/api/v1/thaiwater30/public";

interface LocalizedName {
  th?: string;
  en?: string;
}

interface StationGeocode {
  province_code?: number | string;
  amphoe_name?: LocalizedName | string;
  tumbon_name?: LocalizedName | string;
}

interface ThaiWaterStationInfo {
  id?: number | string;
  tele_station_oldcode?: string;
  tele_station_name?: LocalizedName | string;
  tele_station_lat?: number | string;
  tele_station_long?: number | string;
  left_bank?: number | string | null;
  right_bank?: number | string | null;
  min_bank?: number | string | null;
  warning_level_m?: number | string | null;
  critical_level_m?: number | string | null;
  critical_level_msl?: number | string | null;
  canal_oldcode?: string;
  canal_name?: LocalizedName | string;
  canal_lat?: number | string;
  canal_long?: number | string;
  warning_level?: number | string | null;
  critical_level?: number | string | null;
}

interface ThaiWaterObservation {
  id?: number | string;
  waterlevel_datetime?: string;
  waterlevel_m?: number | string | null;
  waterlevel_msl?: number | string | null;
  situation_level?: number | string | null;
  canal_datetime?: string;
  canal_value?: number | string | null;
  canal_out?: number | string | null;
  geocode?: StationGeocode;
  station?: ThaiWaterStationInfo;
  river_name?: LocalizedName | string;
}

interface ThaiWaterResponse {
  result?: string;
  data?: ThaiWaterObservation[];
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function nameText(value?: LocalizedName | string) {
  if (typeof value === "string") return value.trim();
  return value?.th?.trim() || value?.en?.trim() || "";
}

function parseBangkokTimestamp(value?: string) {
  if (!value) return null;
  const local = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (local) {
    const [, year, month, day, hour, minute, second = "0"] = local;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour) - 7, Number(minute), Number(second))).toISOString();
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function isSamutPrakan(row: ThaiWaterObservation) {
  return String(row.geocode?.province_code ?? "") === "11";
}

function stationCondition(waterLevel: number | null, bankLevel: number | null, warningLevel: number | null, criticalLevel: number | null, observedAt: string | null): { condition: ThaiWaterStationCondition; label: string } {
  if (waterLevel === null || !observedAt) return { condition: "offline", label: thaiWaterStationLabels.offline };
  if (Date.now() - Date.parse(observedAt) > 24 * 60 * 60 * 1000) return { condition: "stale", label: thaiWaterStationLabels.stale };
  if (bankLevel !== null && waterLevel > bankLevel) {
    return { condition: "critical", label: `สูงกว่าตลิ่ง ${(waterLevel - bankLevel).toFixed(2)} ม.` };
  }
  if (criticalLevel !== null && waterLevel >= criticalLevel) return { condition: "critical", label: thaiWaterStationLabels.critical };
  if (warningLevel !== null && waterLevel >= warningLevel) return { condition: "warning", label: thaiWaterStationLabels.warning };
  return { condition: "normal", label: thaiWaterStationLabels.normal };
}

function mapRiverStation(row: ThaiWaterObservation): ThaiWaterStation | null {
  if (!isSamutPrakan(row) || !row.station) return null;
  const station = row.station;
  const latitude = numberOrNull(station.tele_station_lat);
  const longitude = numberOrNull(station.tele_station_long);
  if (latitude === null || longitude === null) return null;

  const waterLevel = numberOrNull(row.waterlevel_msl) ?? numberOrNull(row.waterlevel_m);
  const banks = [numberOrNull(station.left_bank), numberOrNull(station.right_bank)].filter((value): value is number => value !== null);
  const bankLevel = numberOrNull(station.min_bank) ?? (banks.length ? Math.min(...banks) : null);
  const warningLevel = numberOrNull(station.warning_level_m);
  const criticalLevel = numberOrNull(station.critical_level_msl) ?? numberOrNull(station.critical_level_m);
  const observedAt = parseBangkokTimestamp(row.waterlevel_datetime);
  const { condition, label } = stationCondition(waterLevel, bankLevel, warningLevel, criticalLevel, observedAt);
  const id = String(station.id ?? row.id ?? station.tele_station_oldcode ?? `${latitude},${longitude}`);

  return {
    id: `river-${id}`,
    stationCode: station.tele_station_oldcode ?? `WL.${id}`,
    kind: "river",
    stationName: nameText(station.tele_station_name) || "สถานีวัดระดับน้ำ",
    waterwayName: nameText(row.river_name),
    district: nameText(row.geocode?.amphoe_name),
    subdistrict: nameText(row.geocode?.tumbon_name),
    latitude,
    longitude,
    waterLevel,
    bankLevel,
    outsideLevel: null,
    warningLevel,
    criticalLevel,
    observedAt,
    condition,
    conditionLabel: label,
  };
}

function mapCanalStation(row: ThaiWaterObservation): ThaiWaterStation | null {
  if (!isSamutPrakan(row) || !row.station) return null;
  const station = row.station;
  const latitude = numberOrNull(station.canal_lat);
  const longitude = numberOrNull(station.canal_long);
  if (latitude === null || longitude === null) return null;

  const waterLevel = numberOrNull(row.canal_value);
  const warningLevel = numberOrNull(station.warning_level);
  const criticalLevel = numberOrNull(station.critical_level);
  const observedAt = parseBangkokTimestamp(row.canal_datetime);
  const { condition, label } = stationCondition(waterLevel, null, warningLevel, criticalLevel, observedAt);
  const id = String(station.id ?? row.id ?? station.canal_oldcode ?? `${latitude},${longitude}`);
  const canalName = nameText(station.canal_name) || "คลองไม่ระบุชื่อ";

  return {
    id: `canal-${id}`,
    stationCode: station.canal_oldcode ?? `CANAL.${id}`,
    kind: "canal",
    stationName: canalName,
    waterwayName: canalName,
    district: nameText(row.geocode?.amphoe_name),
    subdistrict: nameText(row.geocode?.tumbon_name),
    latitude,
    longitude,
    waterLevel,
    bankLevel: null,
    outsideLevel: numberOrNull(row.canal_out),
    warningLevel,
    criticalLevel,
    observedAt,
    condition,
    conditionLabel: label,
  };
}

async function fetchData(endpoint: string) {
  const response = await fetch(`${baseUrl}/${endpoint}`, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`ThaiWater ${endpoint}: HTTP ${response.status}`);
  const result = await response.json() as ThaiWaterResponse;
  if (result.result && result.result !== "OK") throw new Error(`ThaiWater ${endpoint}: ${result.result}`);
  return result.data ?? [];
}

export async function GET() {
  const [riverResult, canalResult] = await Promise.allSettled([
    fetchData("waterlevel?province_code=11"),
    fetchData("canal_waterlevel"),
  ]);
  const riverRows = riverResult.status === "fulfilled" ? riverResult.value : [];
  const canalRows = canalResult.status === "fulfilled" ? canalResult.value : [];
  const stations = [
    ...riverRows.map(mapRiverStation),
    ...canalRows.map(mapCanalStation),
  ].filter((station): station is ThaiWaterStation => station !== null);

  if (!stations.length) {
    return Response.json({ error: "ยังดึงข้อมูลสถานีระดับน้ำสมุทรปราการจาก ThaiWater ไม่ได้" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }

  return Response.json({ generatedAt: new Date().toISOString(), stations }, { headers: { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=60" } });
}
