export interface RainForecastLocation {
  latitude: number;
  longitude: number;
  precipitation: (number | null)[];
}

export interface RainForecastData {
  generatedAt: string;
  times: string[];
  points: RainForecastLocation[];
}

export interface RainMapPoint {
  latitude: number;
  longitude: number;
  precipitation: number | null;
}

export const rainForecastOptions = [
  { hours: 0, label: "ชั่วโมงนี้" },
  { hours: 1, label: "+1 ชม." },
  { hours: 3, label: "+3 ชม." },
  { hours: 6, label: "+6 ชม." },
  { hours: 12, label: "+12 ชม." },
  { hours: 24, label: "+24 ชม." },
] as const;
