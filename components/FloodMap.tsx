"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { CircleMarker, MapContainer, Marker, Pane, Polygon, Popup, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { ArrowDownRight, ArrowUpRight, Check, Flag, MapPin, Minus, Navigation, RefreshCw, Waves, X } from "lucide-react";
import { FloodReport, levelColors, reportFlags, severityLabel } from "@/lib/types";
import { formatThaiDate, timeAgo } from "@/lib/useFloodReports";
import { RainMapPoint } from "@/lib/rainForecast";
import { CanalHistory, CanalStation, canalConditionColors } from "@/lib/canalLevels";
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

interface FloodMapProps {
  reports: FloodReport[];
  selectedId?: string | null;
  onSelect?: (report: FloodReport) => void;
  onStillFlooded?: (id: string) => void;
  onReceded?: (id: string) => void;
  onFlag?: (id: string, reason: string) => void;
  canalStations?: CanalStation[];
  selectedCanalId?: string | null;
  canalHistoryById?: Record<string, CanalHistoryState>;
  onCanalSelect?: (station: CanalStation) => void;
  onCanalHistoryRetry?: (stationId: string) => void;
  pickMode?: boolean;
  pickedPosition?: [number, number] | null;
  onMapPick?: (position: [number, number]) => void;
  rainForecastPoints?: RainMapPoint[];
  className?: string;
}

export interface CanalHistoryState {
  loading: boolean;
  data?: CanalHistory;
  error?: string;
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

function MapCamera({ selectedId, selectedCanalId, reports, canalStations }: { selectedId?: string | null; selectedCanalId?: string | null; reports: FloodReport[]; canalStations: CanalStation[] }) {
  const map = useMap();
  const hasFitProvince = useRef(false);
  const hasFitStations = useRef(false);
  useEffect(() => {
    if (!hasFitProvince.current) {
      hasFitProvince.current = true;
      map.fitBounds(provinceBounds, { padding: [24, 24], maxZoom: 12, animate: false });
    }
    if (selectedId) {
      const selected = reports.find((report) => report.id === selectedId);
      if (selected) {
        map.flyTo([selected.latitude, selected.longitude], Math.max(map.getZoom(), 14), { duration: 0.7 });
        return;
      }
    }
    if (selectedCanalId) {
      const selected = canalStations.find((station) => station.id === selectedCanalId);
      if (selected) map.flyTo([selected.latitude, selected.longitude], Math.max(map.getZoom(), 13), { duration: 0.7 });
    }
  }, [canalStations, map, reports, selectedCanalId, selectedId]);

  useEffect(() => {
    if (!canalStations.length || hasFitStations.current) return;
    hasFitStations.current = true;
    const bounds = L.latLngBounds(provinceRing);
    canalStations.forEach((station) => bounds.extend([station.latitude, station.longitude]));
    map.fitBounds(bounds, { padding: [26, 26], maxZoom: 10, animate: false });
  }, [canalStations, map]);
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

function CanalPopup({ station, historyState, onRetry }: { station: CanalStation; historyState?: CanalHistoryState; onRetry?: () => void }) {
  const comparisons = [
    { label: "8 ชั่วโมงก่อน", hours: 8 },
    { label: "1 วันก่อน", hours: 24 },
    { label: "3 วันก่อน", hours: 72 },
  ];
  const currentLevel = station.waterLevel;
  const currentTime = station.observedAt ? Date.parse(station.observedAt) : NaN;
  const readings = historyState?.data?.readings ?? [];

  const comparisonFor = (hours: number) => {
    if (currentLevel === null || !Number.isFinite(currentTime)) return null;
    const target = currentTime - hours * 60 * 60 * 1000;
    const closest = readings.reduce<CanalHistory["readings"][number] | null>((best, reading) => {
      const distance = Math.abs(Date.parse(reading.observedAt) - target);
      return !best || distance < Math.abs(Date.parse(best.observedAt) - target) ? reading : best;
    }, null);
    if (!closest || Math.abs(Date.parse(closest.observedAt) - target) > 45 * 60 * 1000) return null;
    return { reading: closest, difference: currentLevel - closest.waterLevel };
  };

  return (
    <div className="map-popup canal-popup">
      <div className="canal-popup-heading">
        <span className="canal-marker-key" style={{ backgroundColor: canalConditionColors[station.condition] }}><Waves size={13} /></span>
        <span><strong>{station.canalName}</strong><small>{station.stationName}{station.district ? ` · ${station.district}` : ""}</small></span>
      </div>
      <div className="canal-status-reading">
        <span className="canal-status-dot" style={{ backgroundColor: canalConditionColors[station.condition] }} />
        <strong>{station.conditionLabel}</strong>
        <b>{currentLevel === null ? "—" : `${currentLevel.toFixed(2)} ม.`}</b>
      </div>
      <p className="canal-unit-note">ระดับอ้างอิง ม.รทก. · เป็นค่าจากสถานี ไม่ใช่ความลึกคลอง</p>
      {(station.outsideLevel !== null || station.outerLevel !== null) && (
        <div className="canal-gate-levels">
          {station.outsideLevel !== null && <span>ด้านนอก <b>{station.outsideLevel.toFixed(2)} ม.</b></span>}
          {station.outerLevel !== null && <span>ด้านนอกสุด <b>{station.outerLevel.toFixed(2)} ม.</b></span>}
        </div>
      )}
      {(station.warningLevel !== null || station.criticalLevel !== null) && (
        <p className="canal-threshold-note">เกณฑ์สถานี: {station.warningLevel !== null && <>เตือน {station.warningLevel.toFixed(2)}</>}{station.warningLevel !== null && station.criticalLevel !== null && " · "}{station.criticalLevel !== null && <>วิกฤต {station.criticalLevel.toFixed(2)}</>} ม.รทก.</p>
      )}
      <p className="popup-timestamp canal-observed-at" title={station.observedAt ? formatThaiDate(station.observedAt) : undefined}>
        อัปเดต {station.observedAt ? timeAgo(station.observedAt) : "ไม่มีเวลาในข้อมูล"}{station.observedAt ? ` · ${formatThaiDate(station.observedAt)}` : ""}
      </p>
      <div className="popup-divider" />
      <div className="canal-history-heading"><strong>เปลี่ยนแปลงเทียบกับปัจจุบัน</strong>{historyState?.loading && <span className="spinner" aria-label="กำลังโหลดประวัติ" />}</div>
      {historyState?.error ? (
        <p className="canal-history-error" role="alert">{historyState.error}<button type="button" onClick={onRetry}><RefreshCw size={12} />ลองใหม่</button></p>
      ) : (
        <div className="canal-history-list">
          {comparisons.map(({ label, hours }) => {
            const comparison = historyState?.loading ? null : comparisonFor(hours);
            const isBeyondSourceRange = hours > 48;
            const direction = comparison
              ? Math.abs(comparison.difference) < 0.01 ? "steady" : comparison.difference > 0 ? "rising" : "falling"
              : null;
            const TrendIcon = direction === "rising" ? ArrowUpRight : direction === "falling" ? ArrowDownRight : Minus;
            const deltaLabel = comparison
              ? Math.abs(comparison.difference) < 0.01 ? "คงที่" : `${comparison.difference > 0 ? "+" : "−"}${Math.abs(comparison.difference).toFixed(2)} ม.`
              : "";
            return (
              <div className={`canal-history-row${direction ? ` ${direction}` : ""}`} key={hours}>
                <span>{label}</span>
                {historyState?.loading ? <small>กำลังอ่านข้อมูล…</small> : comparison ? (
                  <small title={`ค่าก่อนหน้า ${comparison.reading.waterLevel.toFixed(2)} ม.รทก. · ${formatThaiDate(comparison.reading.observedAt)}`}>
                    <TrendIcon size={13} />{deltaLabel}
                  </small>
                ) : <small className="canal-history-unavailable">{isBeyondSourceRange ? "ต้นทางมีข้อมูลย้อนหลัง 48 ชม." : "ไม่มีข้อมูลช่วงเวลานี้"}</small>}
              </div>
            );
          })}
        </div>
      )}
      <p className="canal-history-footnote">ค่าการเปลี่ยนแปลงเป็นเมตรเทียบกับค่าปัจจุบัน · ประวัติจากระบบ กทม. ครอบคลุมประมาณ 48 ชม.</p>
      <a className="canal-source-link" href={`https://weather.bangkok.go.th/water/StationDetail?id=${station.id}`} target="_blank" rel="noreferrer">ดูข้อมูลสถานีต้นทาง</a>
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
        <ProvinceHighlight />
        <MapCamera selectedId={props.selectedId} selectedCanalId={props.selectedCanalId} reports={props.reports} canalStations={props.canalStations ?? []} />
        <MapPickHandler enabled={Boolean(props.pickMode)} onPick={props.onMapPick} />
        {props.reports.map((report) => (
          <Marker
            key={report.id}
            position={[report.latitude, report.longitude]}
            icon={reportMarker(report)}
            eventHandlers={{ click: () => props.onSelect?.(report) }}
          >
            <Popup minWidth={248} maxWidth={300} closeButton closeOnClick={false}>
              <ReportPopup report={report} props={props} />
            </Popup>
          </Marker>
        ))}
        {props.canalStations && props.canalStations.length > 0 && (
          <Pane name="canal-stations" style={{ zIndex: 650 }}>
            {props.canalStations.map((station) => (
              <CircleMarker
                key={station.id}
                center={[station.latitude, station.longitude]}
                radius={9}
                pane="canal-stations"
                pathOptions={{ color: canalConditionColors[station.condition], weight: 3, fillColor: "#ffffff", fillOpacity: 1 }}
                eventHandlers={{ click: () => props.onCanalSelect?.(station) }}
              >
                <Tooltip direction="top" offset={[0, -8]}>{station.canalName} · {station.conditionLabel}</Tooltip>
                <Popup minWidth={270} maxWidth={330} closeButton closeOnClick={false}>
                  <CanalPopup
                    station={station}
                    historyState={props.canalHistoryById?.[station.id]}
                    onRetry={() => props.onCanalHistoryRetry?.(station.id)}
                  />
                </Popup>
              </CircleMarker>
            ))}
          </Pane>
        )}
        {props.pickedPosition && <CircleMarker center={props.pickedPosition} radius={9} pathOptions={{ color: "#162b42", weight: 1.5, fillColor: "#1769dc", fillOpacity: 1 }}><Popup><span className="picked-label"><Navigation size={13} /> ตำแหน่งที่เลือก</span></Popup></CircleMarker>}
      </MapContainer>
      {props.reports.length === 0 && <div className="map-empty-message"><MapPin size={17} /> ยังไม่มีรายงานในพื้นที่นี้</div>}
    </div>
  );
}
