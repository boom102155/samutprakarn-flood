import { DistrictBoundaryCollection } from "@/lib/districtBoundaries";

export const dynamic = "force-dynamic";

const sourceUrl = "https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/9469f09/releaseData/gbOpen/THA/ADM2/geoBoundaries-THA-ADM2_simplified.geojson";
const districtNames: Record<string, string> = {
  "Mueang Samut Prakan": "อำเภอเมืองสมุทรปราการ",
  "Phra Pradaeng": "อำเภอพระประแดง",
  "Bang Phli": "อำเภอบางพลี",
  "Phra Samut Chedi": "อำเภอพระสมุทรเจดีย์",
  "Bang Bo": "อำเภอบางบ่อ",
  "Bang Sao Thong": "อำเภอบางเสาธง",
};

interface GeoBoundarySource {
  features: Array<{
    type: "Feature";
    properties: { shapeName?: string };
    geometry: { type: "Polygon"; coordinates: number[][][] };
  }>;
}

export async function GET() {
  try {
    const response = await fetch(sourceUrl, {
      next: { revalidate: 2_592_000 },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      return Response.json({ error: "โหลดขอบเขตอำเภอไม่สำเร็จ" }, { status: 502, headers: { "Cache-Control": "no-store" } });
    }

    const source = await response.json() as GeoBoundarySource;
    const features = Object.entries(districtNames).flatMap(([sourceName, name]) => {
      const feature = source.features.find((item) => item.properties.shapeName === sourceName);
      if (!feature) return [];
      return [{
        type: "Feature" as const,
        properties: { name, sourceName },
        geometry: feature.geometry,
      }];
    });

    if (features.length !== Object.keys(districtNames).length) {
      return Response.json({ error: "ข้อมูลขอบเขตอำเภอไม่ครบ" }, { status: 502, headers: { "Cache-Control": "no-store" } });
    }

    const result: DistrictBoundaryCollection = { type: "FeatureCollection", features };
    return Response.json(result, { headers: { "Cache-Control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800" } });
  } catch {
    return Response.json({ error: "เชื่อมต่อข้อมูลขอบเขตอำเภอไม่สำเร็จ" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
