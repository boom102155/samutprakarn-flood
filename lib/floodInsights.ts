import { FloodReport } from "@/lib/types";

export type MapPosition = [number, number];

export function parseMapPosition(input: string): MapPosition | null {
  let normalizedInput = input;
  try { normalizedInput = decodeURIComponent(input); } catch { /* Keep the user's text when a link has invalid escapes. */ }
  const patterns = [
    /geo:\s*(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/i,
    /@(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/,
    /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/i,
    /(?:map_)?(?:lat|latitude)=(-?\d{1,2}\.\d+)[^&]*&(?:map_)?(?:lon|lng|longitude)=(-?\d{1,3}\.\d+)/i,
    /[?&](?:q|query|ll|center|destination)=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/i,
    /(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/,
  ];
  for (const pattern of patterns) {
    const match = normalizedInput.match(pattern);
    if (!match) continue;
    const latitude = Number(match[1]);
    const longitude = Number(match[2]);
    if (latitude >= 5 && latitude <= 21 && longitude >= 97 && longitude <= 106) return [latitude, longitude];
  }
  return null;
}

export function distanceInMeters(from: MapPosition, to: MapPosition) {
  const radians = Math.PI / 180;
  const latitudeDifference = (to[0] - from[0]) * radians;
  const longitudeDifference = (to[1] - from[1]) * radians;
  const haversine = Math.sin(latitudeDifference / 2) ** 2
    + Math.cos(from[0] * radians) * Math.cos(to[0] * radians) * Math.sin(longitudeDifference / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function distanceToRouteInMeters(point: MapPosition, route: MapPosition[]) {
  if (!route.length) return Number.POSITIVE_INFINITY;
  if (route.length === 1) return distanceInMeters(point, route[0]);

  const radians = Math.PI / 180;
  const metersPerDegree = 111_320;
  const cosine = Math.cos(point[0] * radians);
  const projected = route.map(([latitude, longitude]) => [
    (longitude - point[1]) * metersPerDegree * cosine,
    (latitude - point[0]) * metersPerDegree,
  ] as const);
  let closest = Number.POSITIVE_INFINITY;
  for (let index = 1; index < projected.length; index += 1) {
    const [startX, startY] = projected[index - 1];
    const [endX, endY] = projected[index];
    const segmentX = endX - startX;
    const segmentY = endY - startY;
    const lengthSquared = segmentX * segmentX + segmentY * segmentY;
    const progress = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, -(startX * segmentX + startY * segmentY) / lengthSquared));
    closest = Math.min(closest, Math.hypot(startX + progress * segmentX, startY + progress * segmentY));
  }
  return closest;
}

export function reportFreshness(createdAt: string, now = Date.now()) {
  const ageMinutes = Math.max(0, Math.floor((now - Date.parse(createdAt)) / 60_000));
  if (ageMinutes < 120) return { label: "รายงานใหม่", tone: "fresh", ageMinutes };
  if (ageMinutes < 360) return { label: "เริ่มเก่า · ควรดูเวลา", tone: "aging", ageMinutes };
  return { label: "ข้อมูลเก่า · โปรดยืนยันหน้างาน", tone: "stale", ageMinutes };
}

export function reportMarkerOpacity(createdAt: string, now = Date.now()) {
  const ageHours = Math.max(0, (now - Date.parse(createdAt)) / 3_600_000);
  if (!Number.isFinite(ageHours)) return 1;
  return ageHours >= 24 ? 0.42 : ageHours >= 12 ? 0.67 : 1;
}

export function reportsNearPosition(reports: FloodReport[], position: MapPosition, radiusInMeters: number) {
  return reports
    .map((report) => ({ report, distance: distanceInMeters(position, [report.latitude, report.longitude]) }))
    .filter(({ distance }) => distance <= radiusInMeters)
    .sort((first, second) => first.distance - second.distance);
}
