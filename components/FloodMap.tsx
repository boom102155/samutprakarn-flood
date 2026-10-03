"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { Circle, CircleMarker, MapContainer, Marker, Pane, Polygon, Polyline, Popup, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { Check, Flag, MapPin, Navigation, Share2, Waves, X } from "lucide-react";
import { FloodReport, levelColors, reportFlags, severityLabel, WaterLevel } from "@/lib/types";
import { formatThaiDate, timeAgo } from "@/lib/useFloodReports";
import { RainMapPoint } from "@/lib/rainForecast";
import { DistrictBoundaryFeature } from "@/lib/districtBoundaries";
import { ThaiWaterStation, thaiWaterStationColors } from "@/lib/thaiwaterStations";
import RainForecastOverlay from "@/components/RainForecastOverlay";
import samutPrakanBoundary from "@/lib/samut-prakan-boundary.json";
import { MapPosition, reportFreshness } from "@/lib/floodInsights";

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
  waterStations?: ThaiWaterStation[];
  pickMode?: boolean;
  pickedPosition?: [number, number] | null;
  onMapPick?: (position: [number, number]) => void;
  rainForecastPoints?: RainMapPoint[];
  routeCoordinates?: MapPosition[];
  routeStartPosition?: MapPosition | null;
  routeStartAccuracyMeters?: number | null;
  routeStartIsCurrent?: boolean;
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

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("\"", "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function waterStationMarker(station: ThaiWaterStation) {
  const level = station.waterLevel === null ? "—" : station.waterLevel.toFixed(2);
  const title = escapeHtml(`${station.stationName} · ${level} ม.รทก. · ${station.conditionLabel}`);
  return L.divIcon({
    className: "thaiwater-marker-shell",
    html: `<span class="thaiwater-marker ${station.condition}" style="--station-color:${thaiWaterStationColors[station.condition]}" title="${title}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 8c3.5 0 3.5-3 7-3s3.5 3 7 3 3.5-3 7-3M2 15c3.5 0 3.5-3 7-3s3.5 3 7 3 3.5-3 7-3"/></svg><b>${level}</b></span>`,
    iconSize: [62, 30],
    iconAnchor: [31, 15],
    popupAnchor: [0, -17],
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
  const selected = reports.find((report) => report.id === selectedId);
  const selectedLatitude = selected?.latitude ?? null;
  const selectedLongitude = selected?.longitude ?? null;
  useEffect(() => {
    if (!hasFitProvince.current) {
      hasFitProvince.current = true;
      map.fitBounds(provinceBounds, { padding: [24, 24], maxZoom: 12, animate: false });
    }
    if (selectedLatitude !== null && selectedLongitude !== null) map.flyTo([selectedLatitude, selectedLongitude], Math.max(map.getZoom(), 14), { duration: 0.7 });
  }, [map, selectedId, selectedLatitude, selectedLongitude]);
  return null;
}

function RouteCamera({ coordinates, startPosition }: { coordinates?: MapPosition[]; startPosition?: MapPosition | null }) {
  const map = useMap();
  useEffect(() => {
    if (coordinates && coordinates.length > 1) map.fitBounds(L.latLngBounds(coordinates), { padding: [32, 32], maxZoom: 14 });
    else if (startPosition) map.flyTo(startPosition, Math.max(map.getZoom(), 15), { duration: 0.6 });
  }, [coordinates, map, startPosition]);
  return null;
}

function OpenSelectedReport({ selectedId, reports }: { selectedId?: string | null; reports: FloodReport[] }) {
  const map = useMap();
  const selected = reports.find((report) => report.id === selectedId);
  const selectedLatitude = selected?.latitude ?? null;
  const selectedLongitude = selected?.longitude ?? null;
  useEffect(() => {
    if (selectedLatitude === null || selectedLongitude === null) return;
    map.eachLayer((layer) => {
      if (!(layer instanceof L.Marker) || !layer.getPopup()) return;
      const iconClass = layer.options.icon?.options.className ?? "";
      if (iconClass.includes("report-dot-shell") && layer.getLatLng().equals([selectedLatitude, selectedLongitude])) layer.openPopup();
    });
  }, [map, selectedId, selectedLatitude, selectedLongitude]);
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
  const [showFullPhoto, setShowFullPhoto] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const freshness = reportFreshness(report.createdAt);

  const shareReport = async () => {
    const url = new URL(window.location.href);
    url.searchParams.set("view", "map");
    url.searchParams.set("report", report.id);
    try {
      if (navigator.share) await navigator.share({ title: `รายงานน้ำท่วม: ${report.locationName}`, text: `${report.locationName} · ${freshness.label}`, url: url.toString() });
      else {
        await navigator.clipboard.writeText(url.toString());
        setShareMessage("คัดลอกลิงก์แล้ว");
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setShareMessage("แชร์ไม่สำเร็จ ลองคัดลอกลิงก์จากแถบที่อยู่");
    }
  };

  useEffect(() => {
    if (!showFullPhoto) return;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowFullPhoto(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [showFullPhoto]);

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
      {report.photoUrl && <>
        <button type="button" className="popup-photo-button" onClick={() => setShowFullPhoto(true)} aria-label="ดูภาพรายงานขนาดเต็ม">
          <Image className="popup-photo" src={report.photoUrl} alt={`ภาพรายงานจาก ${report.locationName}`} width={260} height={145} unoptimized />
        </button>
        <span className="popup-photo-hint">แตะรูปเพื่อดูขนาดเต็ม</span>
      </>}
      <p className="popup-timestamp" title={formatThaiDate(report.createdAt)}>{timeAgo(report.createdAt)} · {formatThaiDate(report.createdAt)}</p>
      <div className={`popup-trust-line ${freshness.tone}`}><span>{freshness.label}</span><b>ยืนยัน {report.confirmations} ครั้ง</b></div>
      {report.condition === "receded" && <p className="receded-callout"><Check size={14} /> มีผู้แจ้งว่าน้ำลดแล้ว</p>}
      <button type="button" className="popup-share-button" onClick={() => void shareReport()}><Share2 size={13} />แชร์ตำแหน่งรายงาน</button>
      {shareMessage && <span className="popup-share-message" role="status">{shareMessage}</span>}
      <div className="popup-divider" />
      <p className="popup-question">ตอนนี้จุดนี้เป็นอย่างไร</p>
      <div className="popup-actions">
        <button type="button" className="popup-action still-flooded" onClick={() => props.onStillFlooded?.(report.id)}><Waves size={15} /> ยังท่วมอยู่</button>
        <button type="button" className="popup-action receded" onClick={() => props.onReceded?.(report.id)}><Check size={14} /> น้ำลดแล้ว</button>
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
      {showFullPhoto && report.photoUrl && createPortal(
        <div className="photo-lightbox" onClick={() => setShowFullPhoto(false)}>
          <div className="photo-lightbox-dialog" role="dialog" aria-modal="true" aria-label={`ภาพรายงานจาก ${report.locationName}`} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => {
            if (event.key === "Tab") {
              event.preventDefault();
              event.currentTarget.querySelector<HTMLButtonElement>(".photo-lightbox-close")?.focus();
            }
          }}>
            <div className="photo-lightbox-heading">
              <span>{report.locationName}</span>
              <button type="button" className="photo-lightbox-close" onClick={() => setShowFullPhoto(false)} aria-label="ปิดภาพขนาดเต็ม" autoFocus><X size={20} /></button>
            </div>
            <div className="photo-lightbox-image">
              <Image src={report.photoUrl} alt={`ภาพรายงานจาก ${report.locationName} ขนาดเต็ม`} fill sizes="94vw" unoptimized />
            </div>
            <p>แตะบริเวณรอบภาพหรือกด Esc เพื่อปิด</p>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function ThaiWaterStationPopup({ station }: { station: ThaiWaterStation }) {
  const bankDifference = station.waterLevel !== null && station.bankLevel !== null
    ? station.waterLevel - station.bankLevel
    : null;
  const observedAtTitle = station.observedAt ? formatThaiDate(station.observedAt) : undefined;

  return (
    <div className="map-popup thaiwater-popup">
      <div className="thaiwater-popup-heading">
        <span className="thaiwater-popup-icon" style={{ backgroundColor: thaiWaterStationColors[station.condition] }}><Waves size={15} /></span>
        <span><strong>{station.waterwayName || station.stationName}</strong><small>{station.stationName}{station.district ? ` · ${station.district}` : ""}{station.subdistrict ? ` · ${station.subdistrict}` : ""}</small></span>
      </div>
      <div className={`thaiwater-status ${station.condition}`}>
        <i />
        <strong>{station.conditionLabel}</strong>
        <span>{station.kind === "canal" ? "สถานีคลอง" : "สถานีระดับน้ำ"}</span>
      </div>
      <div className="thaiwater-readings">
        <span>ระดับน้ำ</span>
        <strong>{station.waterLevel === null ? "ไม่มีข้อมูล" : `${station.waterLevel.toFixed(2)} ม.รทก.`}</strong>
        {station.bankLevel !== null && <>
          <span>ระดับตลิ่ง</span>
          <strong>{station.bankLevel.toFixed(2)} ม.รทก.</strong>
          {bankDifference !== null && <span className="thaiwater-bank-difference">{bankDifference > 0 ? `สูงกว่าตลิ่ง ${bankDifference.toFixed(2)} ม.` : `ต่ำกว่าตลิ่ง ${Math.abs(bankDifference).toFixed(2)} ม.`}</span>}
        </>}
        {station.outsideLevel !== null && <><span>ระดับด้านนอก</span><strong>{station.outsideLevel.toFixed(2)} ม.รทก.</strong></>}
      </div>
      {(station.warningLevel !== null || station.criticalLevel !== null) && <p className="thaiwater-threshold">เกณฑ์สถานี: {station.warningLevel !== null && <>เตือน {station.warningLevel.toFixed(2)}</>}{station.warningLevel !== null && station.criticalLevel !== null && " · "}{station.criticalLevel !== null && <>วิกฤต {station.criticalLevel.toFixed(2)}</>} ม.</p>}
      <p className={`thaiwater-observed${station.condition === "stale" ? " is-stale" : ""}`} title={observedAtTitle}>
        {station.observedAt ? `วัดเมื่อ ${timeAgo(station.observedAt)} · ${formatThaiDate(station.observedAt)}` : "ไม่มีเวลาอัปเดตจากสถานี"}
        {station.condition === "stale" && <span>ข้อมูลนี้เก่ากว่า 24 ชั่วโมง</span>}
      </p>
      <a className="thaiwater-source-link" href="https://www.thaiwater.net/water/wl" target="_blank" rel="noreferrer">สสน. · ข้อมูลจากคลังข้อมูลน้ำแห่งชาติ (ThaiWater)</a>
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
        {props.routeCoordinates && props.routeCoordinates.length > 1 && <Polyline positions={props.routeCoordinates} pathOptions={{ color: "#1769dc", weight: 5, opacity: 0.82, lineCap: "round", lineJoin: "round" }} />}
        <MapCamera selectedId={props.selectedId} reports={props.reports} />
        <RouteCamera coordinates={props.routeCoordinates} startPosition={props.routeStartPosition} />
        <OpenSelectedReport selectedId={props.selectedId} reports={props.reports} />
        <MapPickHandler enabled={Boolean(props.pickMode)} onPick={props.onMapPick} />
        {props.routeStartPosition && props.routeStartAccuracyMeters !== null && props.routeStartAccuracyMeters !== undefined && props.routeStartAccuracyMeters > 0 && props.routeStartAccuracyMeters <= 10_000 && <Circle center={props.routeStartPosition} radius={props.routeStartAccuracyMeters} pathOptions={{ color: "#1769dc", weight: 1.5, fillColor: "#287bea", fillOpacity: 0.12, interactive: false }} />}
        {props.routeStartPosition && <CircleMarker center={props.routeStartPosition} radius={9} pathOptions={{ color: "#ffffff", weight: 3, fillColor: "#145ca8", fillOpacity: 1 }}>
          <Tooltip direction="top" offset={[0, -9]} permanent>{props.routeStartIsCurrent ? "ตำแหน่งฉัน" : "จุดเริ่มต้น"}</Tooltip>
          <Popup><div className="route-location-popup"><strong>{props.routeStartIsCurrent ? "ตำแหน่งฉัน" : "จุดเริ่มต้น"}</strong><span>{props.routeStartPosition[0].toFixed(6)}, {props.routeStartPosition[1].toFixed(6)}</span>{props.routeStartIsCurrent && props.routeStartAccuracyMeters !== null && props.routeStartAccuracyMeters !== undefined && <small>อุปกรณ์ประเมินคลาดเคลื่อน ±{Math.round(props.routeStartAccuracyMeters)} ม.</small>}</div></Popup>
        </CircleMarker>}
        {props.reports.map((report) => (
          <Marker
            key={report.id}
            position={[report.latitude, report.longitude]}
            icon={reportMarker(report)}
            eventHandlers={{ click: () => props.onSelect?.(report) }}
          >
            <Popup minWidth={248} maxWidth={300} autoPan autoPanPadding={[30, 30]} keepInView closeButton closeOnClick={false}>
              <ReportPopup report={report} props={props} />
            </Popup>
          </Marker>
        ))}
        {props.waterStations && props.waterStations.length > 0 && (
          <Pane name="thaiwater-stations" style={{ zIndex: 625 }}>
            {props.waterStations.map((station) => (
              <Marker
                key={station.id}
                position={[station.latitude, station.longitude]}
                icon={waterStationMarker(station)}
                pane="thaiwater-stations"
              >
                <Tooltip direction="top" offset={[0, -8]}>{station.stationName} · {station.waterLevel === null ? "ไม่มีข้อมูล" : `${station.waterLevel.toFixed(2)} ม.รทก.`}</Tooltip>
                <Popup minWidth={255} maxWidth={310} maxHeight={360} autoPan autoPanPadding={[30, 30]} keepInView closeButton closeOnClick={false}>
                  <ThaiWaterStationPopup station={station} />
                </Popup>
              </Marker>
            ))}
          </Pane>
        )}
        {props.pickedPosition && <CircleMarker center={props.pickedPosition} radius={9} pathOptions={{ color: "#162b42", weight: 1.5, fillColor: "#1769dc", fillOpacity: 1 }}><Popup><span className="picked-label"><Navigation size={13} /> ตำแหน่งที่เลือก</span></Popup></CircleMarker>}
      </MapContainer>
      {props.reports.length === 0 && <div className="map-empty-message"><MapPin size={17} /> ยังไม่มีรายงานในพื้นที่นี้</div>}
    </div>
  );
}
