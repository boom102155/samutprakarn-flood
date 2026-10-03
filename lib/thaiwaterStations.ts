export type ThaiWaterStationKind = "river" | "canal";
export type ThaiWaterStationCondition = "normal" | "warning" | "critical" | "stale" | "offline";

export interface ThaiWaterStation {
  id: string;
  stationCode: string;
  kind: ThaiWaterStationKind;
  stationName: string;
  waterwayName: string;
  district: string;
  subdistrict: string;
  latitude: number;
  longitude: number;
  waterLevel: number | null;
  bankLevel: number | null;
  outsideLevel: number | null;
  warningLevel: number | null;
  criticalLevel: number | null;
  observedAt: string | null;
  condition: ThaiWaterStationCondition;
  conditionLabel: string;
}

export const thaiWaterStationColors: Record<ThaiWaterStationCondition, string> = {
  normal: "#15946a",
  warning: "#e4b932",
  critical: "#d94d48",
  stale: "#8392a2",
  offline: "#aab5c0",
};

export const thaiWaterStationLabels: Record<ThaiWaterStationCondition, string> = {
  normal: "ปกติ",
  warning: "เฝ้าระวัง",
  critical: "อันตราย",
  stale: "ข้อมูลเก่า",
  offline: "ไม่มีข้อมูล",
};

export const thaiWaterSourceUrl = "https://www.thaiwater.net/";
