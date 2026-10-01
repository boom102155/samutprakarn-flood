"use client";

import { useEffect, useState } from "react";
import { ImageOverlay } from "react-leaflet";
import { RainMapPoint } from "@/lib/rainForecast";

interface RainForecastOverlayProps {
  points: RainMapPoint[];
  bounds: [[number, number], [number, number]];
}

function rainColor(amount: number): [number, number, number, number] | null {
  if (amount < 0.2) return null;
  if (amount < 1) return [125, 211, 252, 90];
  if (amount < 2.5) return [56, 189, 248, 112];
  if (amount < 7.5) return [37, 99, 235, 145];
  if (amount < 15) return [124, 58, 237, 172];
  return [190, 24, 93, 198];
}

function createRainImage(points: RainMapPoint[], bounds: RainForecastOverlayProps["bounds"]) {
  const validPoints = points.filter((point) => point.precipitation !== null && Number.isFinite(point.precipitation));
  if (!validPoints.length) return "";

  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return "";

  const image = context.createImageData(size, size);
  const [[south, west], [north, east]] = bounds;
  for (let y = 0; y < size; y += 1) {
    const latitude = north - (y / (size - 1)) * (north - south);
    const latitudeScale = Math.cos((latitude * Math.PI) / 180);
    for (let x = 0; x < size; x += 1) {
      const longitude = west + (x / (size - 1)) * (east - west);
      let weightedRain = 0;
      let totalWeight = 0;
      let exactRain: number | null = null;

      for (const point of validPoints) {
        const latitudeDistance = latitude - point.latitude;
        const longitudeDistance = (longitude - point.longitude) * latitudeScale;
        const distanceSquared = latitudeDistance * latitudeDistance + longitudeDistance * longitudeDistance;
        if (distanceSquared < 0.000001) {
          exactRain = point.precipitation;
          break;
        }
        const weight = 1 / (distanceSquared * distanceSquared + 0.00000001);
        weightedRain += (point.precipitation ?? 0) * weight;
        totalWeight += weight;
      }

      const amount = exactRain ?? (totalWeight ? weightedRain / totalWeight : 0);
      const color = rainColor(amount);
      if (!color) continue;
      const offset = (y * size + x) * 4;
      image.data[offset] = color[0];
      image.data[offset + 1] = color[1];
      image.data[offset + 2] = color[2];
      image.data[offset + 3] = color[3];
    }
  }

  context.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

export default function RainForecastOverlay({ points, bounds }: RainForecastOverlayProps) {
  const [imageUrl, setImageUrl] = useState("");

  useEffect(() => {
    setImageUrl(createRainImage(points, bounds));
  }, [points, bounds]);

  if (!imageUrl) return null;
  return <ImageOverlay bounds={bounds} url={imageUrl} opacity={0.88} zIndex={200} />;
}
