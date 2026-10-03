export interface DistrictBoundaryFeature {
  type: "Feature";
  properties: {
    name: string;
    sourceName: string;
  };
  geometry: {
    type: "Polygon";
    coordinates: number[][][];
  };
}

export interface DistrictBoundaryCollection {
  type: "FeatureCollection";
  features: DistrictBoundaryFeature[];
}
