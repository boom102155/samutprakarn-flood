export type CanalCondition = "normal" | "warning" | "critical" | "offline";

export interface CanalStation {
  id: string;
  code: string;
  canalName: string;
  stationName: string;
  district: string;
  latitude: number;
  longitude: number;
  waterLevel: number | null;
  outsideLevel: number | null;
  outerLevel: number | null;
  condition: CanalCondition;
  conditionLabel: string;
  warningLevel: number | null;
  criticalLevel: number | null;
  outsideWarningLevel: number | null;
  outsideCriticalLevel: number | null;
  observedAt: string | null;
}

export interface CanalReading {
  observedAt: string;
  waterLevel: number;
}

export interface CanalHistory {
  stationId: string;
  readings: CanalReading[];
  earliestAt: string | null;
  latestAt: string | null;
}

export const canalConditionColors: Record<CanalCondition, string> = {
  normal: "#15946a",
  warning: "#d09b1c",
  critical: "#d94d48",
  offline: "#8392a2",
};

export const canalConditionLabels: Record<CanalCondition, string> = {
  normal: "ปกติ",
  warning: "เตือนภัย",
  critical: "วิกฤต",
  offline: "ขัดข้อง / ไม่มีข้อมูล",
};

export const canalSourceUrl = "https://weather.bangkok.go.th/water/";

// BMA monitoring stations in Samut Prakan and upstream drainage areas that
// connect to the province. IDs are from the BMA water-monitoring directory.
export const relevantCanalStationIds = [
  39, 40, 42, 48, 49, 50, 64, 65, 66, 130, 131, 132, 135, 173, 174, 191,
  200, 201, 202, 204, 205, 206, 262, 263, 277, 279, 289, 298, 309, 317,
] as const;
