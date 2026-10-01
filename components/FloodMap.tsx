"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { CircleMarker, MapContainer, Marker, Polygon, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { Check, Flag, MapPin, Navigation, X } from "lucide-react";
import { FloodReport, levelColors, reportFlags, severityLabel } from "@/lib/types";
import { formatThaiDate, timeAgo } from "@/lib/useFloodReports";
import samutPrakanBoundary from "@/lib/samut-prakan-boundary.json";

const center: [number, number] = [13.607, 100.66];
const provinceRing: [number, number][] = samutPrakanBoundary.geometry.coordinates[0].map(
  ([longitude, latitude]) => [latitude, longitude] as [number, number],
);
const provinceBounds = L.latLngBounds(provinceRing);

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
  className?: string;
}

function reportMarker(report: FloodReport) {
  const color = levelColors[report.waterLevel];
  const ageHours = (Date.now() - Date.parse(report.createdAt)) / 3_600_000;
  const opacity = ageHours >= 24 ? 0.42 : ageHours >= 12 ? 0.67 : 1;
  return L.divIcon({
    className: "report-dot-shell",
    html: `<span class="report-dot${report.condition === "receded" ? " is-receded" : ""}" style="--marker-color:${color};--marker-opacity:${opacity}"></span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -13],
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
            <Popup minWidth={248} maxWidth={300} closeButton>
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
