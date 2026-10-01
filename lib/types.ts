export const waterLevels = [
  "แห้ง",
  "ต่ำกว่าข้อเท้า < 10 ซม.",
  "ข้อเท้า–หัวเข่า 10–50 ซม.",
  "หัวเข่า–เอว 50–100 ซม.",
  "เอว–หน้าอก 100–130 ซม.",
  "เลยหน้าอก 130–180 ซม.",
  "มิดหัว–ท่วมหลังคา > 180 ซม.",
] as const;

export type WaterLevel = (typeof waterLevels)[number];
export type WaterTrend = "น้ำกำลังขึ้น" | "ทรงตัว" | "กำลังลด";
export type VehicleType = "มอเตอร์ไซค์" | "รถเก๋ง" | "รถกระบะ / รถยกสูง" | "เรือเท่านั้น";
export type ReportCondition = "flooded" | "receded";

export interface FloodReport {
  id: string;
  locationName: string;
  district: string;
  subdistrict: string;
  latitude: number;
  longitude: number;
  waterLevel: WaterLevel;
  trend: WaterTrend;
  passable: VehicleType[];
  note: string;
  photoUrl?: string;
  createdAt: string;
  condition: ReportCondition;
  confirmations: number;
  flags: string[];
}

export type NewFloodReport = Omit<FloodReport, "id" | "createdAt" | "condition" | "confirmations" | "flags">;

export const levelColors: Record<WaterLevel, string> = {
  "แห้ง": "#15946a",
  "ต่ำกว่าข้อเท้า < 10 ซม.": "#a7c83b",
  "ข้อเท้า–หัวเข่า 10–50 ซม.": "#e4b932",
  "หัวเข่า–เอว 50–100 ซม.": "#ef8b33",
  "เอว–หน้าอก 100–130 ซม.": "#e6534c",
  "เลยหน้าอก 130–180 ซม.": "#956341",
  "มิดหัว–ท่วมหลังคา > 180 ซม.": "#8b6bc4",
};

export function severityLabel(level: WaterLevel) {
  if (level === waterLevels[0]) return "แห้ง";
  if (level === waterLevels[1]) return "ต่ำกว่าข้อเท้า";
  if (level === waterLevels[2]) return "ข้อเท้า–หัวเข่า";
  if (level === waterLevels[3]) return "หัวเข่า–เอว";
  if (level === waterLevels[4]) return "เอว–หน้าอก";
  if (level === waterLevels[5]) return "เลยหน้าอก";
  return "มิดหัว–ท่วมหลังคา";
}

export const districts = ["อำเภอเมืองสมุทรปราการ", "อำเภอบางพลี", "อำเภอพระประแดง", "อำเภอพระสมุทรเจดีย์", "อำเภอบางบ่อ", "อำเภอบางเสาธง"];

export const subdistrictsByDistrict: Record<string, string[]> = {
  "อำเภอเมืองสมุทรปราการ": ["ปากน้ำ", "บางเมือง", "ท้ายบ้าน", "สำโรงเหนือ", "บางปู"],
  "อำเภอบางพลี": ["บางแก้ว", "บางพลีใหญ่", "ราชาเทวะ", "หนองปรือ"],
  "อำเภอพระประแดง": ["ตลาด", "บางพึ่ง", "สำโรง", "บางหญ้าแพรก"],
  "อำเภอพระสมุทรเจดีย์": ["ปากคลองบางปลากด", "แหลมฟ้าผ่า", "นาเกลือ"],
  "อำเภอบางบ่อ": ["บางบ่อ", "คลองด่าน", "บ้านระกาศ"],
  "อำเภอบางเสาธง": ["บางเสาธง", "ศีรษะจรเข้น้อย", "ศีรษะจรเข้ใหญ่"],
};

export const reportFlags = [
  "ระดับน้ำไม่ตรงความจริง",
  "ตำแหน่งผิด",
  "รูปไม่เกี่ยวข้อง / ไม่เหมาะสม",
  "น้ำลดแล้ว / ข้อมูลเก่า",
];

export const demoReports: Omit<FloodReport, "createdAt">[] = [
  { id: "demo-1", locationName: "แยกปากน้ำ ถนนสุขุมวิท", district: districts[0], subdistrict: "ปากน้ำ", latitude: 13.5995, longitude: 100.5972, waterLevel: waterLevels[3], trend: "ทรงตัว", passable: ["รถกระบะ / รถยกสูง"], note: "รถเล็กควรหลีกเลี่ยงช่องซ้าย", condition: "flooded", confirmations: 8, flags: [] },
  { id: "demo-2", locationName: "ถนนกิ่งแก้ว หน้าวัดกิ่งแก้ว", district: districts[1], subdistrict: "ราชาเทวะ", latitude: 13.6631, longitude: 100.7234, waterLevel: waterLevels[4], trend: "น้ำกำลังขึ้น", passable: ["รถกระบะ / รถยกสูง"], note: "น้ำเอ่อบริเวณทางเข้าวัด", condition: "flooded", confirmations: 12, flags: [] },
  { id: "demo-3", locationName: "ถนนสุขุมวิท บางปู", district: districts[0], subdistrict: "บางปู", latitude: 13.528, longitude: 100.647, waterLevel: waterLevels[2], trend: "กำลังลด", passable: ["มอเตอร์ไซค์", "รถกระบะ / รถยกสูง"], note: "ฝนหยุดแล้ว น้ำเริ่มลด", condition: "flooded", confirmations: 4, flags: [] },
  { id: "demo-4", locationName: "ตลาดพระประแดง", district: districts[2], subdistrict: "ตลาด", latitude: 13.6589, longitude: 100.5335, waterLevel: waterLevels[1], trend: "ทรงตัว", passable: ["มอเตอร์ไซค์", "รถเก๋ง"], note: "มีน้ำขังเล็กน้อยริมทาง", condition: "flooded", confirmations: 3, flags: [] },
  { id: "demo-5", locationName: "ถนนเทพารักษ์ กม. 12", district: districts[1], subdistrict: "บางพลีใหญ่", latitude: 13.608, longitude: 100.682, waterLevel: waterLevels[5], trend: "กำลังลด", passable: ["เรือเท่านั้น"], note: "โปรดใช้เส้นทางเลี่ยง", condition: "flooded", confirmations: 6, flags: [] },
  { id: "demo-6", locationName: "ถนนสุขสวัสดิ์ พระสมุทรเจดีย์", district: districts[3], subdistrict: "ปากคลองบางปลากด", latitude: 13.588, longitude: 100.505, waterLevel: waterLevels[0], trend: "ทรงตัว", passable: ["มอเตอร์ไซค์", "รถเก๋ง", "รถกระบะ / รถยกสูง"], note: "สภาพทางปกติ", condition: "flooded", confirmations: 2, flags: [] },
  { id: "demo-7", locationName: "ทางเข้ามาร์เก็ตวิลเลจ สุวรรณภูมิ", district: districts[1], subdistrict: "ราชาเทวะ", latitude: 13.652, longitude: 100.719, waterLevel: waterLevels[2], trend: "ทรงตัว", passable: ["รถกระบะ / รถยกสูง"], note: "น้ำขังใกล้ทางเข้า", condition: "flooded", confirmations: 5, flags: [] },
  { id: "demo-8", locationName: "ถนนบางนา–ตราด กม. 27", district: districts[4], subdistrict: "บางบ่อ", latitude: 13.586, longitude: 100.836, waterLevel: waterLevels[1], trend: "กำลังลด", passable: ["มอเตอร์ไซค์", "รถเก๋ง"], note: "ช่องทางหลักผ่านได้", condition: "flooded", confirmations: 1, flags: [] },
  { id: "demo-9", locationName: "ถนนวัดศรีวารีน้อย", district: districts[5], subdistrict: "บางเสาธง", latitude: 13.638, longitude: 100.798, waterLevel: waterLevels[3], trend: "น้ำกำลังขึ้น", passable: ["รถกระบะ / รถยกสูง"], note: "โปรดติดตามสถานการณ์", condition: "flooded", confirmations: 3, flags: [] },
];
