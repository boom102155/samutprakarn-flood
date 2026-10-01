import samutPrakanBoundary from "@/lib/samut-prakan-boundary.json";

export const revalidate = 1800;

interface OpenMeteoLocation {
  latitude: number;
  longitude: number;
  hourly?: {
    time?: string[];
    precipitation?: (number | null)[];
  };
}

function forecastGrid() {
  const ring = samutPrakanBoundary.geometry.coordinates[0];
  const longitudes = ring.map(([longitude]) => longitude);
  const latitudes = ring.map(([, latitude]) => latitude);
  const west = Math.min(...longitudes);
  const east = Math.max(...longitudes);
  const south = Math.min(...latitudes);
  const north = Math.max(...latitudes);
  const spacing = 0.06;
  const columns = Math.ceil((east - west) / spacing) + 1;
  const rows = Math.ceil((north - south) / spacing) + 1;

  return Array.from({ length: rows * columns }, (_, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    return {
      latitude: south + ((north - south) * row) / (rows - 1),
      longitude: west + ((east - west) * column) / (columns - 1),
    };
  });
}

export async function GET() {
  const grid = forecastGrid();
  const parameters = new URLSearchParams({
    latitude: grid.map(({ latitude }) => latitude.toFixed(4)).join(","),
    longitude: grid.map(({ longitude }) => longitude.toFixed(4)).join(","),
    hourly: "precipitation",
    forecast_hours: "25",
    timezone: "Asia/Bangkok",
    timeformat: "iso8601",
  });

  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${parameters}`, {
      next: { revalidate },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      return Response.json({ error: "ผู้ให้บริการพยากรณ์ฝนตอบกลับไม่สำเร็จ" }, { status: 502 });
    }

    const payload = await response.json() as OpenMeteoLocation[] | OpenMeteoLocation;
    const locations = Array.isArray(payload) ? payload : [payload];
    const times = locations[0]?.hourly?.time ?? [];
    const points = locations.flatMap((location) => {
      const precipitation = location.hourly?.precipitation;
      if (!precipitation?.length) return [];
      return [{
        latitude: location.latitude,
        longitude: location.longitude,
        precipitation,
      }];
    });

    if (!times.length || !points.length) {
      return Response.json({ error: "ยังไม่มีข้อมูลพยากรณ์ฝนสำหรับพื้นที่นี้" }, { status: 502 });
    }

    return Response.json({ generatedAt: new Date().toISOString(), times, points });
  } catch {
    return Response.json({ error: "เชื่อมต่อข้อมูลพยากรณ์ฝนไม่สำเร็จ โปรดลองอีกครั้ง" }, { status: 502 });
  }
}
