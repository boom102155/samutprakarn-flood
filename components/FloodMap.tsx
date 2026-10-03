"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { CircleMarker, MapContainer, Marker, Pane, Polygon, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { Check, Flag, MapPin, Navigation, X } from "lucide-react";
import { FloodReport, levelColors, reportFlags, severityLabel, WaterLevel } from "@/lib/types";
import { formatThaiDate, timeAgo } from "@/lib/useFloodReports";
import { RainMapPoint } from "@/lib/rainForecast";
import { DistrictBoundaryFeature } from "@/lib/districtBoundaries";
import RainForecastOverlay from "@/components/RainForecastOverlay";
import samutPrakanBoundary from "@/lib/samut-prakan-boundary.json";

const center: [number, number] = [13.607, 100.66];
const provinceRing: [number, number][] = samutPrakanBoundary.geometry.coordinates[0].map(
  ([longitude, latitude]) => [latitude, longitude] as [number, number],
);
const provinceBounds = L.latLngBounds(provinceRing);
const provinceImageBounds: [[number, number], [number, number]] = [
  [provinceBounds.getSouth(), provinceBounds.getWest()],
  [provinceBounds.getNorth(), provinceBounds.getEast()],
];
const markerDepthLabels: Record<WaterLevel, string> = {
  "แห้ง": "0",
  "ต่ำกว่าข้อเท้า < 10 ซม.": "<10",
  "ข้อเท้า–หัวเข่า 10–50 ซม.": "10–50",
  "หัวเข่า–เอว 50–100 ซม.": "50–100",
  "เอว–หน้าอก 100–130 ซม.": "100–130",
  "เลยหน้าอก 130–180 ซม.": "130–180",
  "มิดหัว–ท่วมหลังคา > 180 ซม.": "180+",
};

interface FloodMapProps {
  reports: FloodReport[];
  selectedId?: string | null;
  onSelect?: (report: FloodReport) => void;
  onStillFlooded?: (id: string) => void;
  onReceded?: (id: string) => void;
  onFlag?: (id: string, reason: string) => void;
  pickMode?: boolean;
  pickedPosition?: [number, number] | null;
  onMapPick?: (position: [number, number]) => void;
  rainForecastPoints?: RainMapPoint[];
  showDistrictBoundaries?: boolean;
  className?: string;
}

const districtColors: Record<string, string> = {
  "Bang Bo": "#527fbc",
  "Bang Phli": "#3a9794",
  "Bang Sao Thong": "#7968a8",
  "Mueang Samut Prakan": "#568ba6",
  "Phra Pradaeng": "#aa7198",
  "Phra Samut Chedi": "#6d9060",
};

function reportMarker(report: FloodReport) {
  const color = levelColors[report.waterLevel];
  const depthLabel = markerDepthLabels[report.waterLevel];
  const escapedLabel = depthLabel.replace("<", "&lt;");
  const title = report.waterLevel === "แห้ง"
    ? severityLabel(report.waterLevel)
    : `${depthLabel} ซม. · ${severityLabel(report.waterLevel)}`;
  const escapedTitle = title.replaceAll("&", "&amp;").replaceAll("\"", "&quot;").replaceAll("<", "&lt;");
  const pulseDelay = Array.from(report.id).reduce((sum, character) => sum + character.charCodeAt(0), 0) % 3600;
  return L.divIcon({
    className: "report-dot-shell",
    html: `<span class="report-dot${report.condition === "receded" ? " is-receded" : ""}" style="--marker-color:${color};--marker-pulse-delay:-${pulseDelay}ms" title="${escapedTitle}" aria-label="${escapedTitle}"><span class="report-dot-value">${escapedLabel}</span></span>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    popupAnchor: [0, -21],
  });
}

function ProvinceHighlight() {
  const map = useMap();
  const [maskBounds, setMaskBounds] = useState(() => map.getBounds().pad(0.65));
  useMapEvents({
    moveend: () => setMaskBounds(map.getBounds().pad(0.65)),
    zoomend: () => setMaskBounds(map.getBounds().pad(0.65)),
    resize: () => setMaskBounds(map.getBounds().pad(0.65)),
  });

  const outsideRing: [number, number][] = [
    [maskBounds.getSouth(), maskBounds.getWest()],
    [maskBounds.getSouth(), maskBounds.getEast()],
    [maskBounds.getNorth(), maskBounds.getEast()],
    [maskBounds.getNorth(), maskBounds.getWest()],
    [maskBounds.getSouth(), maskBounds.getWest()],
  ];

  return (
    <>
      <Polygon
        positions={[outsideRing, provinceRing]}
        pathOptions={{ color: "#102a49", weight: 0, fillColor: "#102a49", fillOpacity: 0.56, fillRule: "evenodd", interactive: false }}
      />
      <Polygon
        positions={provinceRing}
        pathOptions={{ color: "#d94d48", weight: 2.5, opacity: 0.95, fillColor: "#ffffff", fillOpacity: 0.16, lineJoin: "round", interactive: false }}
      />
    </>
  );
}

function MapCamera({ selectedId, reports }: { selectedId?: string | null; reports: FloodReport[] }) {
  const map = useMap();
  const hasFitProvince = useRef(false);
  useEffect(() => {
    if (!hasFitProvince.current) {
      hasFitProvince.current = true;
      map.fitBounds(provinceBounds, { padding: [24, 24], maxZoom: 12, animate: false });
    }
    if (!selectedId) return;
    const selected = reports.find((report) => report.id === selectedId);
    if (selected) map.flyTo([selected.latitude, selected.longitude], Math.max(map.getZoom(), 14), { duration: 0.7 });
  }, [map, reports, selectedId]);
  return null;
}

function districtCentroid(coordinates: number[][][]) {
  const ring = coordinates[0];
  let areaTwice = 0;
  let longitudeTotal = 0;
  let latitudeTotal = 0;

  for (let index = 0; index < ring.length - 1; index += 1) {
    const [longitude, latitude] = ring[index];
    const [nextLongitude, nextLatitude] = ring[index + 1];
    const cross = longitude * nextLatitude - nextLongitude * latitude;
    areaTwice += cross;
    longitudeTotal += (longitude + nextLongitude) * cross;
    latitudeTotal += (latitude + nextLatitude) * cross;
  }

  if (Math.abs(areaTwice) < 1e-10) {
    const longitude = ring.reduce((sum, point) => sum + point[0], 0) / ring.length;
    const latitude = ring.reduce((sum, point) => sum + point[1], 0) / ring.length;
    return [latitude, longitude] as [number, number];
  }

  return [latitudeTotal / (3 * areaTwice), longitudeTotal / (3 * areaTwice)] as [number, number];
}

function DistrictBoundaries() {
  const [features, setFeatures] = useState<DistrictBoundaryFeature[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/district-boundaries", { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json() as { features?: DistrictBoundaryFeature[] };
        if (response.ok && result.features?.length === 6) setFeatures(result.features);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  if (!features.length) return null;

  return (
    <>
      {features.map((feature) => {
        const color = districtColors[feature.properties.sourceName];
        const positions = feature.geometry.coordinates.map((ring) => ring.map(([longitude, latitude]) => [latitude, longitude] as [number, number]));
        return <Polygon key={feature.properties.name} positions={positions} pathOptions={{ color, weight: 1.8, opacity: 0.9, fillColor: color, fillOpacity: 0.16, lineJoin: "round" }} interactive={false} />;
      })}
      <Pane name="district-labels" style={{ zIndex: 550, pointerEvents: "none" }}>
        {features.map((feature) => {
          const color = districtColors[feature.properties.sourceName];
          const label = feature.properties.name;
          const width = Math.max(104, Math.min(150, label.length * 6 + 24));
          const icon = L.divIcon({
            className: "district-label-shell",
            html: `<span class="district-name-label" style="--district-color:${color}"><i></i>${label}</span>`,
            iconSize: [width, 28],
            iconAnchor: [width / 2, 14],
          });
          return <Marker key={feature.properties.name} position={districtCentroid(feature.geometry.coordinates)} icon={icon} pane="district-labels" interactive={false} />;
        })}
      </Pane>
    </>
  );
}

function MapPickHandler({ enabled, onPick }: { enabled: boolean; onPick?: (position: [number, number]) => void }) {
  useMapEvents({
    click(event) {
      if (enabled) onPick?.([event.latlng.lat, event.latlng.lng]);
    },
  });
  return null;
}

function ReportPopup({ report, props }: { report: FloodReport; props: FloodMapProps }) {
  const [showFlags, setShowFlags] = useState(false);
  const [sentFlag, setSentFlag] = useState("");
  return (
    <div className="map-popup" onClick={(event) => event.stopPropagation()}>
      <div className="popup-heading-row">
        <span className="popup-level-dot" style={{ background: levelColors[report.waterLevel] }} />
        <strong>{severityLabel(report.waterLevel)}</strong>
        <button type="button" className="popup-close" aria-label="ปิดรายละเอียดจุด" onClick={(event) => event.currentTarget.closest(".leaflet-popup")?.querySelector<HTMLElement>(".leaflet-popup-close-button")?.click()}><X size={15} /></button>
      </div>
      <p className="popup-location">{report.locationName}</p>
      <p className="popup-meta">{report.trend} · {report.passable.length ? report.passable.join(", ") : "ยังไม่ระบุรถที่ผ่านได้"}</p>
      {report.note && <p className="popup-note">{report.note}</p>}
      {report.photoUrl && <Image className="popup-photo" src={report.photoUrl} alt={`ภาพรายงานจาก ${report.locationName}`} width={260} height={145} unoptimized />}
      <p className="popup-timestamp" title={formatThaiDate(report.createdAt)}>{timeAgo(report.createdAt)} · {formatThaiDate(report.createdAt)}</p>
      {report.condition === "receded" && <p className="receded-callout"><Check size={14} /> มีผู้แจ้งว่าน้ำลดแล้ว</p>}
      <div className="popup-divider" />
      <p className="popup-question">ตอนนี้จุดนี้เป็นอย่างไร</p>
      <div className="popup-actions">
        <button type="button" className="popup-action primary" onClick={() => props.onStillFlooded?.(report.id)}><Check size={14} /> ยังท่วมอยู่</button>
        <button type="button" className="popup-action" onClick={() => props.onReceded?.(report.id)}><Check size={14} /> น้ำลดแล้ว</button>
      </div>
      <div className="popup-divider" />
      {!showFlags ? (
        <button type="button" className="flag-toggle" onClick={(event) => { event.stopPropagation(); setShowFlags(true); }}><Flag size={14} /> แจ้งข้อมูลไม่ถูกต้อง</button>
      ) : (
        <div className="popup-flag-list">
          <div className="flag-list-head"><span>เลือกเหตุผลที่แจ้ง</span><button type="button" aria-label="ปิดตัวเลือก" onClick={(event) => { event.stopPropagation(); setShowFlags(false); }}><X size={14} /></button></div>
          {reportFlags.map((reason) => (
            <button key={reason} type="button" className="flag-reason" onClick={(event) => { event.stopPropagation(); props.onFlag?.(report.id, reason); setSentFlag(reason); }}>
              {sentFlag === reason ? <Check size={13} /> : <Flag size={13} />}{reason}
            </button>
          ))}
          {sentFlag && <span className="flag-success">รับแจ้งแล้ว ขอบคุณที่ช่วยตรวจสอบ</span>}
        </div>
      )}
    </div>
  );
}

export default function FloodMap(props: FloodMapProps) {
  return (
    <div className={`flood-map ${props.className ?? ""}${props.pickMode ? " is-picking" : ""}`}>
      {props.pickMode && <div className="map-pick-hint"><MapPin size={15} /> แตะบนแผนที่เพื่อเลือกตำแหน่ง</div>}
      <MapContainer center={center} zoom={10} scrollWheelZoom className="leaflet-map">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {props.rainForecastPoints && <RainForecastOverlay points={props.rainForecastPoints} bounds={provinceImageBounds} />}
        {props.showDistrictBoundaries && <DistrictBoundaries />}
        <ProvinceHighlight />
        <MapCamera selectedId={props.selectedId} reports={props.reports} />
        <MapPickHandler enabled={Boolean(props.pickMode)} onPick={props.onMapPick} />
        {props.reports.map((report) => (
          <Marker
            key={report.id}
            position={[report.latitude, report.longitude]}
            icon={reportMarker(report)}
            eventHandlers={{ click: () => props.onSelect?.(report) }}
          >
            <Popup minWidth={248} maxWidth={300} maxHeight={360} autoPan autoPanPadding={[30, 30]} keepInView closeButton closeOnClick={false}>
              <ReportPopup report={report} props={props} />
            </Popup>
          </Marker>
        ))}
        {props.pickedPosition && <CircleMarker center={props.pickedPosition} radius={9} pathOptions={{ color: "#162b42", weight: 1.5, fillColor: "#1769dc", fillOpacity: 1 }}><Popup><span className="picked-label"><Navigation size={13} /> ตำแหน่งที่เลือก</span></Popup></CircleMarker>}
      </MapContainer>
      {props.reports.length === 0 && <div className="map-empty-message"><MapPin size={17} /> ยังไม่มีรายงานในพื้นที่นี้</div>}
    </div>
  );
}
