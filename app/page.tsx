"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useCallback } from "react";
import {
  Activity, AlertTriangle, ArrowDown, ArrowDownRight, ArrowRight, ArrowUpRight, BadgeCheck,
  Bell, Camera, Check, CheckCheck, ChevronDown, ChevronRight, Clock3, CloudRain,
  Crosshair, ExternalLink, Home, Info, Map, MapPin, MessageCircle, Phone, Plus, Radio, RefreshCw, Route, Search, Send, ShieldAlert, Upload, Waves, X,
} from "lucide-react";
import {
  districts, FloodReport, levelColors, NewFloodReport, severityLabel,
  subdistrictsByDistrict, VehicleType, waterLevels, WaterTrend,
} from "@/lib/types";
import { timeAgo, useFloodReports } from "@/lib/useFloodReports";
import { distanceToRouteInMeters, MapPosition, parseMapPosition, reportFreshness, reportsNearPosition } from "@/lib/floodInsights";
import { RainForecastData, RainMapPoint, rainForecastOptions } from "@/lib/rainForecast";
import { ThaiWaterStation, ThaiWaterStationCondition, thaiWaterSourceUrl, thaiWaterStationColors, thaiWaterStationLabels } from "@/lib/thaiwaterStations";
import CameraHlsFeed, { CameraFeedStatus } from "@/components/CameraHlsFeed";

const FloodMap = dynamic(() => import("@/components/FloodMap"), {
  ssr: false,
  loading: () => <div className="map-loading"><span className="spinner" /> กำลังเปิดแผนที่…</div>,
});

type View = "home" | "report" | "map" | "latest" | "cctv";
type Position = [number, number];

const navItems: { id: View; label: string; short: string; icon: typeof Home }[] = [
  { id: "home", label: "หน้าหลัก", short: "หน้าหลัก", icon: Home },
  { id: "report", label: "รายงานระดับน้ำ", short: "รายงาน", icon: Plus },
  { id: "map", label: "แผนที่ระดับน้ำ", short: "แผนที่", icon: Map },
  { id: "latest", label: "อัปเดตล่าสุด", short: "ล่าสุด", icon: Activity },
  { id: "cctv", label: "กล้อง CCTV", short: "กล้อง", icon: Camera },
];

const levelGroups = [
  { label: "แห้ง", short: "แห้ง", color: "#15946a", test: (level: string) => level === waterLevels[0] },
  { label: "ไม่เกินหัวเข่า", short: "ระดับเข่า", color: "#dfb72e", test: (level: string) => level === waterLevels[1] || level === waterLevels[2] },
  { label: "หัวเข่า–เอว", short: "ระดับเอว", color: "#ed8933", test: (level: string) => level === waterLevels[3] },
  { label: "เอว–หน้าอก", short: "ระดับอก", color: "#e6534c", test: (level: string) => level === waterLevels[4] },
  { label: "เลยหน้าอก", short: "เกินอก", color: "#956341", test: (level: string) => level === waterLevels[5] },
  { label: "มิดหัว", short: "มิดหัว", color: "#8b6bc4", test: (level: string) => level === waterLevels[6] },
];

const vehicleOptions: VehicleType[] = ["มอเตอร์ไซค์", "รถเก๋ง", "รถกระบะ / รถยกสูง", "เรือเท่านั้น"];
const trendOptions: { value: WaterTrend; icon: typeof ArrowDown; className: string }[] = [
  { value: "น้ำกำลังขึ้น", icon: ArrowUpRight, className: "rising" },
  { value: "ทรงตัว", icon: ArrowRight, className: "steady" },
  { value: "กำลังลด", icon: ArrowDownRight, className: "falling" },
];

const cameras: { id: string; name: string; road: string; district: string; subdistrict: string; coordinates: Position; feedUrl: string; feedType: "embed" | "image" | "hls"; sourceUrl?: string; sourceLabel?: string }[] = [
  { id: "itic-bmai-0208", name: "ถ.บางนา–ตราด · iTIC BMAI0208", road: "ถนนบางนา–ตราด", district: districts[1], subdistrict: "บางแก้ว", coordinates: [13.6665541, 100.6409509], feedUrl: "https://camera1.iticfoundation.org/hls/10.8.0.21_8001.m3u8", feedType: "hls", sourceUrl: "https://traffic.longdo.com/cameralist?open=ITICM_BMAMI0208", sourceLabel: "Longdo Traffic · iTIC Motion" },
  { id: "itic-bmai-0209", name: "ถ.บางนา–ตราด · iTIC BMAI0209", road: "ถนนบางนา–ตราด", district: districts[1], subdistrict: "บางแก้ว", coordinates: [13.6688515, 100.6291749], feedUrl: "https://camera1.iticfoundation.org/hls/10.8.0.21_8002.m3u8", feedType: "hls", sourceUrl: "https://traffic.longdo.com/cameralist?open=ITICM_BMAMI0209", sourceLabel: "Longdo Traffic · iTIC Motion" },
];

function markerOpacity(createdAt: string) {
  const hours = (Date.now() - Date.parse(createdAt)) / 3_600_000;
  return hours >= 24 ? 0.42 : hours >= 12 ? 0.67 : 1;
}

async function compressImage(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("อ่านรูปไม่สำเร็จ"));
    reader.onload = () => {
      const image = new window.Image();
      image.onerror = () => reject(new Error("เปิดรูปไม่สำเร็จ"));
      image.onload = () => {
        const scale = Math.min(1, 1280 / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        const context = canvas.getContext("2d");
        if (!context) return reject(new Error("เตรียมรูปไม่สำเร็จ"));
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function WaterLegend({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`water-legend${compact ? " compact" : ""}`} aria-label="คำอธิบายสีระดับน้ำ">
      {levelGroups.map((group) => <span key={group.label} className="legend-item"><i style={{ backgroundColor: group.color }} />{compact ? group.short : group.label}</span>)}
    </div>
  );
}

function Shell({ view, onNavigate, children, isLive, connected }: { view: View; onNavigate: (view: View) => void; children: React.ReactNode; isLive: boolean; connected: boolean }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand-lockup" onClick={() => onNavigate("home")} aria-label="น้ำสมุทรปราการ หน้าหลัก">
          <span className="brand-symbol"><Waves size={22} strokeWidth={2.2} /></span>
          <span><strong>น้ำสมุทรปราการ</strong><small>FLOOD WATCH · SAMUT PRAKAN</small></span>
        </button>
        <div className="sidebar-caption">ศูนย์ติดตามสถานการณ์</div>
        <nav className="side-nav" aria-label="เมนูหลัก">
          {navItems.map((item) => {
            const Icon = item.icon;
            return <button key={item.id} className={`side-nav-item${view === item.id ? " active" : ""}`} onClick={() => onNavigate(item.id)}><Icon size={19} /><span>{item.label}</span>{view === item.id && <i className="nav-active-mark" />}</button>;
          })}
        </nav>
        <div className="sidebar-lower">
          <div className={`connection-card${isLive && connected ? " connected" : ""}`}>
            <span className="connection-indicator"><i /></span>
            <div><b>{isLive ? (connected ? "เชื่อมต่อแล้ว" : "รอเชื่อมต่อ") : "โหมดตัวอย่าง"}</b><small>{isLive ? (connected ? "รายงานเรียลไทม์" : "ตรวจสอบการเชื่อมต่อ") : "ข้อมูลตัวอย่างในเครื่อง"}</small></div>
          </div>
          <a className="side-help" href="tel:1669"><span className="help-icon"><Phone size={16} /></span><span><b>เหตุฉุกเฉิน</b><small>โทร 1669</small></span><ChevronRight size={15} /></a>
          <a className="side-line-oa" href="https://line.me/R/ti/p/@565nqqyz" target="_blank" rel="noreferrer" aria-label="เพิ่มเพื่อน LINE OA @ปราการอากาศ">
            <span className="line-oa-icon"><MessageCircle size={19} strokeWidth={2.2} /></span>
            <span><b>@ปราการอากาศ</b><small>เพิ่มเพื่อนใน LINE OA</small></span>
            <ExternalLink size={14} aria-hidden="true" />
          </a>
          <span className="sidebar-footnote">ข้อมูลเพื่อการติดตามสถานการณ์<br />โปรดตรวจสอบหน้างานก่อนเดินทาง</span>
        </div>
      </aside>
      <div className="main-column">
        <header className="mobile-header">
          <button className="mobile-brand" onClick={() => onNavigate("home")}><span className="brand-symbol"><Waves size={19} /></span><b>น้ำสมุทรปราการ</b></button>
          <span className={`mobile-live${isLive && connected ? " is-connected" : ""}`}><i />{isLive ? (connected ? "เรียลไทม์" : "กำลังเชื่อมต่อ") : "ตัวอย่าง"}</span>
        </header>
        <main id="main-content">{children}</main>
      </div>
      <nav className="mobile-nav" aria-label="เมนูหลัก">
        {navItems.map((item) => {
          const Icon = item.icon;
          return <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => onNavigate(item.id)} aria-current={view === item.id ? "page" : undefined}><Icon size={19} strokeWidth={view === item.id ? 2.3 : 1.8} /><span>{item.short}</span></button>;
        })}
      </nav>
    </div>
  );
}

function ReportRow({ report, onClick, compact = false }: { report: FloodReport; onClick: () => void; compact?: boolean }) {
  const freshness = reportFreshness(report.createdAt);
  return (
    <button className={`report-row${compact ? " compact-row" : ""}${report.condition === "receded" ? " row-receded" : ""}`} onClick={onClick}>
      <span className="row-severity-dot" style={{ background: levelColors[report.waterLevel], opacity: markerOpacity(report.createdAt) }} />
      <span className="row-main"><span className="row-location">{report.locationName}{report.condition === "receded" && <em className="receded-tag">น้ำลดแล้ว</em>}</span><span className="row-area">{report.subdistrict} · {report.district.replace("อำเภอ", "")}</span>{!compact && <span className="row-detail">{report.trend} · {report.passable.join(", ") || "ไม่ระบุรถที่ผ่านได้"} · กดยืนยัน {report.confirmations} ครั้ง</span>}<span className={`report-freshness ${freshness.tone}`}>{freshness.label}</span></span>
      <span className="row-level"><strong style={{ color: levelColors[report.waterLevel] }}>{severityLabel(report.waterLevel)}</strong><small><Clock3 size={12} />{timeAgo(report.createdAt)}</small></span>
      <ChevronRight size={17} className="row-chevron" />
    </button>
  );
}

function PageHeader({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-header"><div><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

function WaterLevelFigure({ level }: { level: (typeof waterLevels)[number] }) {
  const levelIndex = waterLevels.indexOf(level);
  const waterlineY = [116, 110, 95, 76, 58, 39, 12][levelIndex];
  const color = levelColors[level];
  const dry = levelIndex === 0;
  const wave = `M5 ${waterlineY} C13 ${waterlineY - 2} 20 ${waterlineY + 2} 28 ${waterlineY} S44 ${waterlineY - 2} 52 ${waterlineY} S60 ${waterlineY + 2} 63 ${waterlineY}`;

  return (
    <svg className="level-figure" viewBox="0 0 68 124" role="img" aria-label={`${severityLabel(level)} ${levelMeasurement(level)}`}>
      {!dry && <path d={`${wave} L63 122 L5 122 Z`} fill={color} fillOpacity=".34" />}
      <circle cx="34" cy="13" r="6" fill="#24435d" />
      <path d="M27 21 L23 23 C20 25 19 30 18 34 L15 45 C14 49 20 52 22 47 L26 36 L27 56 L23 88 L21 108 C20 112 26 114 28 110 L34 75 L40 110 C42 114 48 112 47 108 L45 88 L41 56 L42 36 L46 47 C48 52 54 49 53 45 L50 34 C49 30 48 25 45 23 L41 21 C37 24 31 24 27 21Z" fill="#24435d" />
      {dry ? <path d="M7 116 H61" stroke={color} strokeWidth="2.5" strokeLinecap="round" /> : <path d={wave} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />}
    </svg>
  );
}

function NearbyReports({ reports, onSelectReport }: { reports: FloodReport[]; onSelectReport: (id: string) => void }) {
  const [position, setPosition] = useState<MapPosition | null>(null);
  const [radius, setRadius] = useState(3000);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [error, setError] = useState("");
  const nearby = position ? reportsNearPosition(reports, position, radius) : [];

  const findNearby = () => {
    if (!navigator.geolocation) { setError("อุปกรณ์นี้ระบุตำแหน่งไม่ได้ ลองเปิดแผนที่แล้วเลือกพื้นที่เอง"); return; }
    setError("");
    setLoadingLocation(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { setPosition([coords.latitude, coords.longitude]); setLoadingLocation(false); },
      () => { setError("ระบุตำแหน่งไม่สำเร็จ โปรดอนุญาตตำแหน่งหรือดูรายงานตามอำเภอ"); setLoadingLocation(false); },
      { enableHighAccuracy: true, timeout: 12_000 },
    );
  };

  return (
    <section className="nearby-panel">
      <div className="nearby-heading"><div><span className="nearby-icon"><Crosshair size={17} /></span><span><h2>รายงานใกล้ฉัน</h2><p>ใช้ตำแหน่งปัจจุบันเพื่อหารายงานใกล้ที่สุด</p></span></div><button type="button" className="button button-secondary nearby-locate" onClick={findNearby} disabled={loadingLocation}><Crosshair size={15} />{loadingLocation ? "กำลังค้นหา…" : position ? "อัปเดตตำแหน่ง" : "ใช้ตำแหน่งฉัน"}</button></div>
      {position ? <>
        <div className="nearby-toolbar"><span>พบ {nearby.length} จุดในระยะ</span><label><span className="sr-only">เลือกรัศมีค้นหารายงาน</span><select value={radius} onChange={(event) => setRadius(Number(event.target.value))}><option value={1000}>1 กม.</option><option value={3000}>3 กม.</option><option value={5000}>5 กม.</option></select></label></div>
        {nearby.length ? <div className="nearby-list">{nearby.slice(0, 3).map(({ report, distance }) => {
          const freshness = reportFreshness(report.createdAt);
          return <button type="button" key={report.id} className="nearby-report" onClick={() => onSelectReport(report.id)}>
            <i style={{ backgroundColor: levelColors[report.waterLevel] }} />
            <span><b>{report.locationName}</b><small>{report.subdistrict} · {report.condition === "receded" ? "มีผู้แจ้งว่าน้ำลด" : severityLabel(report.waterLevel)} · {freshness.label}</small></span>
            <strong>{distance < 1000 ? `${Math.round(distance)} ม.` : `${(distance / 1000).toFixed(1)} กม.`}</strong>
            <ChevronRight size={15} />
          </button>;
        })}</div> : <div className="nearby-empty"><MapPin size={16} /><span>ยังไม่มีรายงานในรัศมีนี้ ลองเพิ่มระยะค้นหา หรือดูข้อมูลตามอำเภอ</span></div>}
        <p className="nearby-disclaimer">ระยะทางเป็นเส้นตรงโดยประมาณ ไม่ใช่ระยะทางตามถนน</p>
      </> : <div className="nearby-empty"><MapPin size={16} /><span>อนุญาตตำแหน่งเพื่อดูรายงานรอบตัว ระบบใช้ตำแหน่งเพื่อคำนวณบนอุปกรณ์นี้</span></div>}
      {error && <p className="nearby-error" role="status">{error}</p>}
    </section>
  );
}

interface WatchedArea {
  district: string;
  subdistrict: string;
}

const WATCHED_AREAS_STORAGE_KEY = "samutprakarn-watched-areas-v1";
const WATCH_NOTIFICATIONS_STORAGE_KEY = "samutprakarn-watch-notifications-v1";

function WatchedAreas({ areas, notificationsEnabled, onChange, onToggleNotifications }: {
  areas: WatchedArea[];
  notificationsEnabled: boolean;
  onChange: (areas: WatchedArea[]) => void;
  onToggleNotifications: () => Promise<string | null>;
}) {
  const [district, setDistrict] = useState(districts[0]);
  const [subdistrict, setSubdistrict] = useState("ทุกตำบล");
  const [message, setMessage] = useState("");
  const options = subdistrictsByDistrict[district] ?? [];
  const addArea = () => {
    if (areas.some((area) => area.district === district && area.subdistrict === subdistrict)) { setMessage("ติดตามพื้นที่นี้อยู่แล้ว"); return; }
    setMessage("");
    onChange([...areas, { district, subdistrict }]);
  };

  const toggleNotifications = async () => {
    setMessage("");
    const error = await onToggleNotifications();
    if (error) setMessage(error);
  };

  return (
    <section className="watched-area-panel">
      <div className="watched-heading"><div><span className="watched-icon"><Bell size={17} /></span><span><h2>ติดตามพื้นที่ที่สนใจ</h2><p>บันทึกไว้ในอุปกรณ์นี้ ไม่ต้องสมัครสมาชิก</p></span></div><button type="button" className={`watch-notification-button${notificationsEnabled ? " is-enabled" : ""}`} onClick={() => void toggleNotifications()} disabled={areas.length === 0 && !notificationsEnabled}><Bell size={14} />{notificationsEnabled ? "ปิดแจ้งเตือน" : "เปิดแจ้งเตือน"}</button></div>
      <div className="watch-add-row"><label><span className="sr-only">เลือกอำเภอที่ต้องการติดตาม</span><select value={district} onChange={(event) => { setDistrict(event.target.value); setSubdistrict("ทุกตำบล"); }}>{districts.map((item) => <option key={item}>{item}</option>)}</select></label><label><span className="sr-only">เลือกตำบลที่ต้องการติดตาม</span><select value={subdistrict} onChange={(event) => setSubdistrict(event.target.value)}><option>ทุกตำบล</option>{options.map((item) => <option key={item}>{item}</option>)}</select></label><button type="button" className="button button-secondary" onClick={addArea}><Plus size={15} />เพิ่มพื้นที่</button></div>
      {areas.length > 0 ? <div className="watched-area-list">{areas.map((area) => <span className="watched-area-chip" key={`${area.district}|${area.subdistrict}`}>{area.subdistrict === "ทุกตำบล" ? area.district : `${area.subdistrict} · ${area.district.replace("อำเภอ", "")}`}<button type="button" onClick={() => onChange(areas.filter((item) => item !== area))} aria-label={`เลิกติดตาม${area.subdistrict === "ทุกตำบล" ? area.district : area.subdistrict}`}><X size={13} /></button></span>)}</div> : <p className="watched-empty">เลือกอำเภอหรือตำบลเพื่อบันทึกพื้นที่ที่อยากติดตาม</p>}
      <p className="watched-footnote">การแจ้งเตือนทำงานเมื่อเปิดเว็บไซต์ค้างไว้ และเบราว์เซอร์อนุญาตการแจ้งเตือน{message && <span role="status"> · {message}</span>}</p>
    </section>
  );
}

function ReportActivity({ reports }: { reports: FloodReport[] }) {
  const periods = Array.from({ length: 6 }, (_, index) => {
    const start = (5 - index) * 4;
    const end = start + 4;
    const count = reports.filter((report) => {
      const ageHours = (Date.now() - Date.parse(report.createdAt)) / 3_600_000;
      return ageHours >= start && ageHours < end;
    }).length;
    return { label: `${start}–${end}`, count };
  });
  const maximum = Math.max(1, ...periods.map((period) => period.count));
  const total = periods.reduce((sum, period) => sum + period.count, 0);
  return <section className="report-activity"><div className="report-activity-heading"><div><h2>รายงานใน 24 ชั่วโมง</h2><p>แบ่งช่วงละ 4 ชั่วโมง · ตัวเลขใต้กราฟคือชั่วโมงที่แล้ว · ไม่ใช่ค่าระดับน้ำ</p></div><strong>{total} <small>จุด</small></strong></div><div className="activity-bars" aria-label="จำนวนรายงานแยกตามช่วง 4 ชั่วโมง">{periods.map((period) => <div className="activity-bar-column" key={period.label}><span>{period.count}</span><i><b style={{ height: `${Math.max(period.count ? 8 : 0, period.count / maximum * 100)}%` }} /></i><small>{period.label}</small></div>)}</div></section>;
}

function levelMeasurement(level: (typeof waterLevels)[number]) {
  return level.replace(severityLabel(level), "").trim() || "0 ซม.";
}

function HomeView({ reports, onNavigate, onSelectReport, isLive, connected, watchedAreas, notificationsEnabled, onWatchAreasChange, onToggleNotifications }: {
  reports: FloodReport[];
  onNavigate: (view: View) => void;
  onSelectReport: (id: string) => void;
  isLive: boolean;
  connected: boolean;
  watchedAreas: WatchedArea[];
  notificationsEnabled: boolean;
  onWatchAreasChange: (areas: WatchedArea[]) => void;
  onToggleNotifications: () => Promise<string | null>;
}) {
  const latestReports = reports.slice(0, 4);
  const lastReport = reports[0]?.createdAt;
  const highestGroupCount = Math.max(1, ...levelGroups.map((group) => reports.filter((report) => group.test(report.waterLevel)).length));
  return (
    <div className="content-page home-view">
      {!isLive && <div className="demo-banner"><Info size={15} /><span><strong>กำลังแสดงข้อมูลตัวอย่าง</strong> รายงานในหน้านี้ยังไม่ใช่ข้อมูลสถานการณ์จริง ตั้งค่า Supabase เพื่อรับข้อมูลจากประชาชน</span><button onClick={() => onNavigate("report")}>ทดลองส่งรายงาน <ChevronRight size={14} /></button></div>}
      {isLive && !connected && <div className="demo-banner warning-banner"><AlertTriangle size={16} /><span><strong>ยังเชื่อมต่อฐานข้อมูลไม่ได้</strong> ตรวจสอบค่า Supabase ใน Environment Variables แล้วโหลดหน้าใหม่</span></div>}
      <section className="home-intro">
        <div className="home-intro-copy"><h1>เช็กน้ำสมุทรปราการ<br /><span>ช่วยกันรายงานจากพื้นที่</span></h1><p>ติดตามระดับน้ำสมุทรปราการจากรายงานล่าสุดของคนในพื้นที่ เพื่อวางแผนเส้นทางและช่วยกันดูแลชุมชน</p><div className="intro-actions"><button className="button button-primary button-report-main" onClick={() => onNavigate("report")}><Plus size={20} />รายงานระดับน้ำ</button><button className="button button-quiet" onClick={() => onNavigate("map")}><Map size={17} />ดูแผนที่ <ArrowRight size={15} /></button></div></div>
        <div className="intro-rack" aria-label="จำนวนรายงานแยกตามระดับน้ำ"><div className="rack-heading"><strong>ระดับน้ำตามรายงาน</strong><span>{reports.length} จุด</span></div><div className="rack-slides">{levelGroups.map((group) => { const count = reports.filter((report) => group.test(report.waterLevel)).length; return <div className="rack-slide" key={group.label}><i className="rack-tab" style={{ background: group.color }} /><span className="rack-label">{group.label}</span><span className="rack-track"><i style={{ width: `${Math.max(count ? 5 : 0, count / highestGroupCount * 100)}%`, background: group.color }} /></span><b>{count}</b></div>; })}</div><button className="rack-footer" onClick={() => onNavigate("latest")}><span>ข้อมูลล่าสุด {lastReport ? timeAgo(lastReport) : "—"}</span><span>เปิดรายงานทั้งหมด <ArrowRight size={13} /></span></button></div>
      </section>
      <NearbyReports reports={reports} onSelectReport={onSelectReport} />
      <section className="home-workspace">
        <div className="home-map-panel">
          <div className="section-heading"><div><h2>สถานการณ์บนแผนที่ จังหวัดสมุทรปราการ</h2><p>แตะจุดเพื่อดูรายงานในพื้นที่</p></div><button className="text-link" onClick={() => onNavigate("map")}>เปิดแผนที่ <ArrowRight size={15} /></button></div>
          <WaterLegend compact />
          <div className="home-map-wrap"><FloodMap reports={reports} onSelect={(report) => onSelectReport(report.id)} className="preview-map" /></div>
          <div className="map-footnote"><span><i className="status-pulse" />แสดงรายงานทุกจุด</span><span>แผนที่ © OpenStreetMap</span></div>
        </div>
        <div className="home-latest-panel">
          <div className="section-heading"><div><h2>จุดรายงานล่าสุด</h2><p>เรียงตามเวลาที่ได้รับข้อมูล</p></div><button className="round-icon-button" onClick={() => onNavigate("latest")} aria-label="ดูรายงานทั้งหมด"><ArrowRight size={17} /></button></div>
          <div className="home-report-list">{latestReports.length ? latestReports.map((report) => <ReportRow key={report.id} report={report} compact onClick={() => onSelectReport(report.id)} />) : <div className="empty-state small-empty"><MapPin size={20} /><p>ยังไม่มีรายงานในพื้นที่</p><button className="text-link" onClick={() => onNavigate("report")}>เป็นคนแรกที่รายงาน</button></div>}</div>
          <button className="all-reports-link" onClick={() => onNavigate("latest")}>ดูจุดรายงานทั้งหมด <ArrowRight size={15} /></button>
        </div>
      </section>
      <section className="home-bottom-grid">
        <WatchedAreas areas={watchedAreas} notificationsEnabled={notificationsEnabled} onChange={onWatchAreasChange} onToggleNotifications={onToggleNotifications} />
        <EmergencyContacts />
        <details className="safety-reading-guide"><summary><Info size={16} />อ่านข้อมูลและใช้แผนที่อย่างไรให้ปลอดภัย</summary><div>
          <p><b>รายงานใหม่</b> คือข้อมูลที่ส่งมาไม่เกิน 2 ชั่วโมง · <b>เริ่มเก่า</b> คือ 2–6 ชั่วโมง · <b>ข้อมูลเก่า</b> คือเกิน 6 ชั่วโมง ควรตรวจสอบหน้างานก่อนตัดสินใจ</p>
          <p><b>ไม่มีรายงาน ไม่ได้แปลว่าถนนแห้ง</b> และข้อมูลรถที่ผ่านได้เป็นสิ่งที่ผู้รายงานพบ ณ เวลานั้น ไม่รับรองสภาพถนนปัจจุบัน จำนวนครั้งยืนยันนับการกดบนเว็บไซต์ ไม่ได้ยืนยันว่าเป็นคนละคน</p>
          <p>ค่าจากสถานี ThaiWater เป็นระดับน้ำเทียบระดับทะเลปานกลาง (ม.รทก.) ไม่ใช่ความลึกน้ำบนถนน ส่วนพยากรณ์ฝนไม่ใช่แผนที่น้ำท่วม</p>
          <p>หากมีเหตุฉุกเฉิน โทร <a href="tel:1669">1669</a> และหลีกเลี่ยงการขับผ่านน้ำที่มองไม่เห็นพื้นถนน</p>
        </div></details>
      </section>
    </div>
  );
}

function ReportView({ onSubmit, reports, onNavigate }: { onSubmit: (report: NewFloodReport, photo?: File) => Promise<FloodReport>; reports: FloodReport[]; onNavigate: (view: View) => void }) {
  const [position, setPosition] = useState<Position | null>(null);
  const [coordinateInput, setCoordinateInput] = useState("");
  const [locationName, setLocationName] = useState("");
  const [district, setDistrict] = useState(districts[0]);
  const [subdistrict, setSubdistrict] = useState("");
  const [waterLevel, setWaterLevel] = useState<(typeof waterLevels)[number] | "">("");
  const [trend, setTrend] = useState<WaterTrend | "">("");
  const [passable, setPassable] = useState<VehicleType[]>([]);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<File | undefined>();
  const [photoPreview, setPhotoPreview] = useState("");
  const [positionError, setPositionError] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const subdistrictOptions = subdistrictsByDistrict[district] ?? [];

  const toggleVehicle = (vehicle: VehicleType) => setPassable((current) => current.includes(vehicle) ? current.filter((item) => item !== vehicle) : [...current, vehicle]);
  const applyCoordinates = (value: string) => {
    setCoordinateInput(value);
    const parsed = parseMapPosition(value);
    if (parsed) {
      setPosition(parsed);
      setPositionError("");
    } else if (value.trim()) {
      setPositionError("อ่านพิกัดจากลิงก์นี้ไม่ได้ ลองวางลิงก์ Google Maps หรือพิกัดแบบ 13.59, 100.60");
    } else setPositionError("");
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setPositionError("เบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง โปรดเลือกบนแผนที่แทน");
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { setPosition([coords.latitude, coords.longitude]); setPositionError(""); setGeoLoading(false); },
      () => { setPositionError("ระบุตำแหน่งไม่สำเร็จ โปรดอนุญาตการเข้าถึงตำแหน่งหรือเลือกบนแผนที่"); setGeoLoading(false); },
      { enableHighAccuracy: true, timeout: 12_000 },
    );
  };

  const handlePhoto = async (file?: File) => {
    setError("");
    if (!file) { setPhoto(undefined); setPhotoPreview(""); return; }
    if (!file.type.startsWith("image/")) { setError("เลือกได้เฉพาะไฟล์รูปภาพ"); return; }
    if (file.size > 10 * 1024 * 1024) { setError("รูปมีขนาดใหญ่เกิน 10 MB โปรดเลือกไฟล์ที่เล็กกว่า"); return; }
    try { setPhoto(file); setPhotoPreview(await compressImage(file)); }
    catch { setError("เปิดรูปไม่สำเร็จ โปรดลองเลือกรูปอื่น"); }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!position) { setPositionError("โปรดเลือกตำแหน่งบนแผนที่ หรือวางลิงก์/พิกัดก่อนส่งรายงาน"); return; }
    if (!waterLevel || !trend) { setError("โปรดเลือกระดับน้ำและแนวโน้มก่อนส่งรายงาน"); return; }
    if (!subdistrict) { setError("โปรดเลือกตำบลของจุดรายงาน"); return; }
    setSubmitting(true);
    try {
      const report: NewFloodReport = {
        locationName: locationName.trim() || `${subdistrict} ${district.replace("อำเภอ", "")}`,
        district,
        subdistrict,
        latitude: position[0],
        longitude: position[1],
        waterLevel,
        trend,
        passable,
        note: note.trim(),
        photoUrl: photoPreview || undefined,
      };
      const saved = await onSubmit(report, photo);
      setSuccess(true);
      setTimeout(() => { setSuccess(false); onNavigate("map"); }, 1500);
      setPosition([saved.latitude, saved.longitude]);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "ส่งรายงานไม่สำเร็จ โปรดลองอีกครั้ง");
    } finally { setSubmitting(false); }
  };

  if (success) return <div className="content-page"><div className="success-screen"><span className="success-check"><CheckCheck size={30} /></span><h1>ขอบคุณที่ช่วยรายงาน</h1><p>ข้อมูลระดับน้ำถูกเพิ่มในแผนที่แล้ว<br />ช่วยกันยืนยันข้อมูลให้ชุมชนได้ที่แผนที่ระดับน้ำ</p><button className="button button-primary" onClick={() => onNavigate("map")}>ดูตำแหน่งบนแผนที่ <ArrowRight size={16} /></button></div></div>;

  return (
    <div className="content-page report-view">
      <PageHeader title="รายงานระดับน้ำ" description="บอกสถานการณ์ที่คุณเห็น เพื่อให้คนในพื้นที่วางแผนได้ดีขึ้น." />
      <div className="report-layout">
        <form className="report-form" onSubmit={submit}>
          <section className="form-section location-section">
            <div className="form-section-heading"><span className="form-step">1</span><div><h2>จุดที่พบสถานการณ์</h2><p>ใช้ตำแหน่งปัจจุบัน แตะบนแผนที่ หรือวางพิกัด</p></div></div>
            <div className="location-actions"><button type="button" className="button button-secondary" onClick={useCurrentLocation} disabled={geoLoading}><Crosshair size={16} />{geoLoading ? "กำลังค้นหาตำแหน่ง…" : "ใช้ตำแหน่งปัจจุบัน"}</button><span>หรือวางลิงก์ตำแหน่ง</span></div>
            <label className="field-label" htmlFor="coordinates">Google Maps / พิกัด LINE</label>
            <div className="input-with-icon"><MapPin size={17} /><input id="coordinates" value={coordinateInput} onChange={(event) => applyCoordinates(event.target.value)} placeholder="วางลิงก์ หรือพิกัด 13.59, 100.60" autoComplete="off" /></div>
            <p className="coordinate-help">ลิงก์แผนที่ที่มีพิกัด หรือพิกัดตำแหน่งที่แชร์จาก LINE</p>
            {position && <div className="coordinate-confirm"><BadgeCheck size={14} /> พิกัด {position[0].toFixed(5)}, {position[1].toFixed(5)}</div>}
            {positionError && <p className="field-error">{positionError}</p>}
            <div className="report-pick-map"><FloodMap reports={[]} pickMode pickedPosition={position} onMapPick={(next) => { setPosition(next); setPositionError(""); }} className="form-map" /></div>
            <div className="field-row location-fields">
              <div className="field"><label htmlFor="locationName">ชื่อสถานที่ / ถนน <span className="optional">(ถ้ามี)</span></label><input id="locationName" value={locationName} onChange={(event) => setLocationName(event.target.value)} placeholder="เช่น ถนนกิ่งแก้ว หน้าวัด" maxLength={120} /></div>
            </div>
            <div className="field-row">
              <div className="field"><label htmlFor="district">อำเภอ <span className="required">*</span></label><div className="select-wrap"><select id="district" value={district} onChange={(event) => { setDistrict(event.target.value); setSubdistrict(""); }}><option value="">เลือกอำเภอ</option>{districts.map((item) => <option key={item} value={item}>{item}</option>)}</select><ChevronDown size={16} /></div></div>
              <div className="field"><label htmlFor="subdistrict">ตำบล <span className="required">*</span></label><div className="select-wrap"><select id="subdistrict" value={subdistrict} onChange={(event) => setSubdistrict(event.target.value)}><option value="">เลือกตำบล</option>{subdistrictOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select><ChevronDown size={16} /></div></div>
            </div>
          </section>
          <section className="form-section">
            <div className="form-section-heading"><span className="form-step">2</span><div><h2>ระดับน้ำที่พบ</h2><p>เลือกค่าที่ใกล้เคียงกับสถานการณ์จริง</p></div></div>
            <div className="level-choice-grid">
              {waterLevels.map((level) => <button key={level} type="button" className={`level-choice${waterLevel === level ? " selected" : ""}`} onClick={() => setWaterLevel(level)} aria-pressed={waterLevel === level} aria-label={`${severityLabel(level)} ${levelMeasurement(level)}`}><span className="level-choice-figure"><WaterLevelFigure level={level} /></span><span className="level-choice-copy"><strong>{severityLabel(level)}</strong><small>{levelMeasurement(level)}</small></span>{waterLevel === level && <Check size={15} />}</button>)}
            </div>
          </section>
          <section className="form-section">
            <div className="form-section-heading"><span className="form-step">3</span><div><h2>แนวโน้มและรถที่ผ่านได้</h2><p>ช่วยแจ้งว่าระดับน้ำเปลี่ยนไปอย่างไร</p></div></div>
            <span className="field-label">แนวโน้มระดับน้ำ <span className="required">*</span></span>
            <div className="trend-choices">{trendOptions.map(({ value, icon: Icon, className }) => <button key={value} type="button" className={`trend-choice ${className}${trend === value ? " selected" : ""}`} onClick={() => setTrend(value)} aria-pressed={trend === value}><Icon size={17} />{value}</button>)}</div>
            <span className="field-label vehicle-label">รถที่ผ่านได้ <span className="optional">(เลือกได้หลายข้อ)</span></span>
            <div className="vehicle-choices">{vehicleOptions.map((item) => <button key={item} type="button" className={`vehicle-choice${passable.includes(item) ? " selected" : ""}`} onClick={() => toggleVehicle(item)} aria-pressed={passable.includes(item)}>{passable.includes(item) && <Check size={14} />}{item}</button>)}</div>
          </section>
          <section className="form-section final-form-section">
            <div className="form-section-heading"><span className="form-step">4</span><div><h2>รายละเอียดเพิ่มเติม</h2><p>เพิ่มบริบทให้คนที่กำลังวางแผนเดินทาง</p></div></div>
            <div className="field"><label htmlFor="note">หมายเหตุ <span className="optional">(ไม่บังคับ)</span></label><textarea id="note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={400} rows={3} placeholder="เช่น รถเล็กควรใช้เส้นทางเลี่ยง น้ำเริ่มลดแล้ว" /><span className="character-count">{note.length}/400</span></div>
            <div className="field photo-field"><span className="field-label">แนบรูป <span className="optional">(ไม่บังคับ · ไม่เกิน 10 MB)</span></span><label className="photo-upload" htmlFor="photo"><Upload size={18} /><span><b>{photo ? "เปลี่ยนรูปภาพ" : "เลือกภาพจากอุปกรณ์"}</b><small>รองรับไฟล์รูป JPG, PNG หรือ WebP</small></span><input id="photo" type="file" accept="image/*" onChange={(event) => void handlePhoto(event.target.files?.[0])} /></label>{photoPreview && <div className="photo-preview"><Image src={photoPreview} alt="ตัวอย่างรูปที่แนบ" width={45} height={45} unoptimized /><span>{photo?.name}</span><button type="button" onClick={() => void handlePhoto()} aria-label="ลบรูป"><X size={15} /></button></div>}</div>
          </section>
          {error && <div className="form-alert" role="alert"><AlertTriangle size={16} />{error}</div>}
          <button type="submit" className="button button-primary submit-report" disabled={submitting}>{submitting ? <><span className="button-spinner" />กำลังส่งรายงาน…</> : <><Send size={17} />ส่งรายงานระดับน้ำ</>}</button>
          <p className="form-privacy"><ShieldAlert size={14} />ส่งรายงานโดยไม่แสดงข้อมูลส่วนตัวของผู้แจ้ง</p>
        </form>
        <aside className="report-side-note"><div className="report-side-mark"><CloudRain size={21} /></div><h2>ข้อมูลที่ช่วยคนอื่นได้</h2><p>รายงานจากสิ่งที่คุณเห็น ณ จุดนั้น เลือกระดับน้ำใกล้เคียงและระบุเวลาโดยประมาณในหมายเหตุได้เลย</p><div className="side-note-rule" /><div className="side-note-stat"><MapPin size={15} /><span><b>{reports.length} จุด</b><small>ในระบบขณะนี้</small></span></div><button className="text-link" onClick={() => onNavigate("latest")}>ดูจุดรายงานล่าสุด <ArrowRight size={14} /></button><div className="honesty-note"><Info size={14} /><span>โปรดใช้วิจารณญาณและตรวจสอบสภาพเส้นทางจริงก่อนเดินทาง</span></div></aside>
      </div>
    </div>
  );
}

interface RoutePlan {
  coordinates: MapPosition[];
  distanceKm: number;
  durationMinutes: number;
  origin: MapPosition;
  destination: MapPosition;
}

function RouteChecker({ reports, onRouteChange, onOriginPositionChange, onSelectReport }: { reports: FloodReport[]; onRouteChange: (route: MapPosition[] | undefined) => void; onOriginPositionChange: (position: MapPosition | null, accuracyMeters: number | null, isCurrent: boolean) => void; onSelectReport: (id: string) => void }) {
  const [origin, setOrigin] = useState("");
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [originFromCurrent, setOriginFromCurrent] = useState(false);
  const [destination, setDestination] = useState("");
  const [resolvedDestination, setResolvedDestination] = useState("");
  const [route, setRoute] = useState<RoutePlan | null>(null);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const matches = route ? reports.map((report) => ({ report, distance: distanceToRouteInMeters([report.latitude, report.longitude], route.coordinates) })).filter(({ distance }) => distance <= 350).sort((first, second) => first.distance - second.distance) : [];

  const useCurrentLocation = () => {
    if (!navigator.geolocation) { setError("เบราว์เซอร์นี้ระบุตำแหน่งไม่ได้ โปรดวางพิกัดต้นทางแทน"); return; }
    setError("");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const position: MapPosition = [coords.latitude, coords.longitude];
        setOrigin(`${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`);
        setLocationAccuracy(coords.accuracy);
        setOriginFromCurrent(true);
        setRoute(null);
        setLocating(false);
        onRouteChange(undefined);
        onOriginPositionChange(position, coords.accuracy, true);
      },
      (geolocationError) => {
        const message = geolocationError.code === geolocationError.PERMISSION_DENIED
          ? "ยังไม่ได้รับอนุญาตตำแหน่ง เปิดสิทธิ์ Location ให้เบราว์เซอร์แล้วลองใหม่"
          : geolocationError.code === geolocationError.POSITION_UNAVAILABLE
            ? "อุปกรณ์ยังระบุตำแหน่งไม่ได้ ลองเปิด GPS หรือออกไปบริเวณที่โล่ง"
            : "ค้นหาตำแหน่งใช้เวลานานเกินไป ลองเปิด GPS แล้วแตะค้นหาอีกครั้ง";
        setError(message);
        setLocating(false);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    );
  };

  const checkRoute = async () => {
    const start = parseMapPosition(origin);
    if (!start) { setError("ต้นทางต้องเป็นพิกัด เช่น 13.59, 100.60 หรือใช้ปุ่มตำแหน่งฉัน"); return; }
    if (!destination.trim()) { setError("ใส่ชื่อสถานที่หรือพิกัดปลายทางก่อน"); return; }
    setLoadingRoute(true);
    setError("");
    setRoute(null);
    setResolvedDestination("");
    onRouteChange(undefined);
    try {
      let end = parseMapPosition(destination);
      if (!end) {
        const geocodeResponse = await fetch(`/api/geocode?q=${encodeURIComponent(destination.trim())}`);
        const geocode = await geocodeResponse.json() as { latitude?: number; longitude?: number; displayName?: string; error?: string };
        if (!geocodeResponse.ok || typeof geocode.latitude !== "number" || typeof geocode.longitude !== "number") throw new Error(geocode.error || "ไม่พบสถานที่นี้ ลองเพิ่มชื่ออำเภอหรือใส่พิกัดแทน");
        end = [geocode.latitude, geocode.longitude];
        setResolvedDestination(geocode.displayName ?? destination.trim());
      }
      const url = `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson`;
      const response = await fetch(url);
      if (!response.ok) throw new Error("เชื่อมต่อข้อมูลเส้นทางไม่ได้ ลองอีกครั้งหรือเปิดแผนที่นำทางโดยตรง");
      const result = await response.json() as { code?: string; routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[] };
      const best = result.routes?.[0];
      if (result.code !== "Ok" || !best?.geometry.coordinates.length) throw new Error("ไม่พบเส้นทางระหว่างพิกัดนี้ ตรวจสอบจุดเริ่มต้นและปลายทางอีกครั้ง");
      const coordinates = best.geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude] as MapPosition);
      const nextRoute = { coordinates, distanceKm: best.distance / 1000, durationMinutes: best.duration / 60, origin: start, destination: end };
      setRoute(nextRoute);
      onRouteChange(coordinates);
    } catch (routeError) {
      setError(routeError instanceof Error ? routeError.message : "ตรวจสอบเส้นทางไม่สำเร็จ โปรดลองอีกครั้ง");
    } finally { setLoadingRoute(false); }
  };

  const directionsUrl = route && `https://www.google.com/maps/dir/?api=1&origin=${route.origin.join(",")}&destination=${route.destination.join(",")}&travelmode=driving`;

  return (
    <section className="route-checker">
      <div className="route-checker-heading"><span className="route-icon"><Route size={18} /></span><div><h2>เช็กจุดรายงานตามเส้นทาง</h2><p>ใช้พิกัดต้นทางและค้นหาปลายทางด้วยชื่อสถานที่หรือพิกัด</p></div></div>
      <div className="route-inputs"><label><span>ต้นทาง</span><input value={origin} onChange={(event) => {
        const value = event.target.value;
        const position = parseMapPosition(value);
        setOrigin(value);
        setLocationAccuracy(null);
        setOriginFromCurrent(false);
        setRoute(null);
        onRouteChange(undefined);
        onOriginPositionChange(position, null, false);
        setError("");
      }} placeholder="พิกัด เช่น 13.59, 100.60" autoComplete="off" /></label><button type="button" className="route-location-button" onClick={useCurrentLocation} disabled={locating} aria-label="ใช้ตำแหน่งปัจจุบันเป็นต้นทาง"><Crosshair size={16} />{locating ? "กำลังหา…" : "ตำแหน่งฉัน"}</button><label><span>ปลายทาง</span><input value={destination} onChange={(event) => { setDestination(event.target.value); setResolvedDestination(""); setRoute(null); onRouteChange(undefined); setError(""); }} placeholder="ชื่อสถานที่ หรือพิกัด" autoComplete="off" /></label><button type="button" className="button button-primary route-submit" onClick={() => void checkRoute()} disabled={loadingRoute || locating}><Route size={16} />{loadingRoute ? "กำลังค้นหาเส้นทาง…" : "เช็กเส้นทาง"}</button></div>
      {originFromCurrent && locationAccuracy !== null && <div className={`route-location-accuracy${locationAccuracy > 100 ? " is-approximate" : ""}`} role="status"><Crosshair size={15} /><span><b>{parseMapPosition(origin)?.map((part) => part.toFixed(6)).join(", ")}</b> · อุปกรณ์ประเมินคลาดเคลื่อน ±{Math.round(locationAccuracy)} ม.{locationAccuracy > 100 ? " · ความแม่นยำต่ำ ลองเปิด GPS แล้วค้นหาใหม่ในที่โล่ง" : " · วงรอบหมุดแสดงช่วงคลาดเคลื่อน"}</span></div>}
      {resolvedDestination && <p className="route-resolved-place"><MapPin size={14} />ปลายทางที่พบ: {resolvedDestination}</p>}
      {error && <p className="route-error" role="alert">{error}</p>}
      {route && <div className="route-result">
        <div className="route-result-summary"><span><b>{route.distanceKm.toFixed(1)} กม.</b> · เวลาเดินทางประมาณ {Math.max(1, Math.round(route.durationMinutes))} นาที</span>{directionsUrl && <a href={directionsUrl} target="_blank" rel="noreferrer">เปิดนำทาง <ExternalLink size={13} /></a>}</div>
        <p className="route-result-caution">เส้นสีน้ำเงินคือแนวทางอ้างอิงจาก OpenStreetMap · พบ {matches.length} รายงานภายใน 350 ม. จากเส้นทาง</p>
        {matches.length ? <div className="route-report-list">{matches.slice(0, 4).map(({ report, distance }) => {
          const freshness = reportFreshness(report.createdAt);
          return <button type="button" className="route-report" key={report.id} onClick={() => onSelectReport(report.id)}><i style={{ backgroundColor: levelColors[report.waterLevel] }} /><span><b>{report.locationName}</b><small>{report.condition === "receded" ? "มีผู้แจ้งว่าน้ำลด" : severityLabel(report.waterLevel)} · {freshness.label} · ยืนยัน {report.confirmations} ครั้ง (ไม่ใช่จำนวนผู้ใช้)</small></span><strong>{Math.round(distance)} ม.</strong><ChevronRight size={14} /></button>;
        })}</div> : <div className="route-no-reports"><Info size={15} /><span>ยังไม่มีรายงานใกล้แนวเส้นทางนี้ ซึ่งไม่ได้ยืนยันว่าถนนแห้ง โปรดตรวจสอบสภาพจริงก่อนเดินทาง</span></div>}
      </div>}
      <p className="route-footnote">ชื่อปลายทางค้นหาผ่าน <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> และส่งพิกัดให้ OSRM คำนวณเส้นทาง · ไม่ใช่คำรับรองว่าเส้นทางปลอดภัย</p>
    </section>
  );
}

function MapView({ reports, selectedId, onStillFlooded, onReceded, onFlag, onSelectReport }: { reports: FloodReport[]; selectedId: string | null; onStillFlooded: (id: string) => void; onReceded: (id: string) => void; onFlag: (id: string, reason: string) => void; onSelectReport: (id: string) => void }) {
  const visible = reports;
  const [stationLayerEnabled, setStationLayerEnabled] = useState(true);
  const [thaiWaterStations, setThaiWaterStations] = useState<ThaiWaterStation[]>([]);
  const [stationLoading, setStationLoading] = useState(true);
  const [stationError, setStationError] = useState("");
  const [stationRetryToken, setStationRetryToken] = useState(0);
  const [rainEnabled, setRainEnabled] = useState(true);
  const [rainLoading, setRainLoading] = useState(false);
  const [rainError, setRainError] = useState("");
  const [rainForecast, setRainForecast] = useState<RainForecastData | null>(null);
  const [forecastHours, setForecastHours] = useState(1);
  const [rainRetryToken, setRainRetryToken] = useState(0);
  const [routeCoordinates, setRouteCoordinates] = useState<MapPosition[]>();
  const [routeStart, setRouteStart] = useState<{ position: MapPosition; accuracyMeters: number | null; isCurrent: boolean } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setStationLoading(true);
    setStationError("");

    void fetch("/api/thaiwater-stations", { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json() as { stations?: ThaiWaterStation[]; error?: string };
        if (!response.ok) throw new Error(result.error || "โหลดข้อมูลสถานี ThaiWater ไม่สำเร็จ");
        setThaiWaterStations(result.stations ?? []);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setStationError(error instanceof Error ? error.message : "โหลดข้อมูลสถานี ThaiWater ไม่สำเร็จ");
      })
      .finally(() => {
        if (!controller.signal.aborted) setStationLoading(false);
      });

    return () => controller.abort();
  }, [stationRetryToken]);

  useEffect(() => {
    if (!rainEnabled || rainForecast) return;
    const controller = new AbortController();
    setRainLoading(true);
    setRainError("");

    void fetch("/api/rain-forecast", { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json() as RainForecastData & { error?: string };
        if (!response.ok) throw new Error(result.error || "โหลดพยากรณ์ฝนไม่สำเร็จ");
        if (!result.times?.length || !result.points?.length) throw new Error("ยังไม่มีข้อมูลพยากรณ์ฝน");
        setRainForecast(result);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setRainError(error instanceof Error ? error.message : "โหลดพยากรณ์ฝนไม่สำเร็จ");
      })
      .finally(() => {
        if (!controller.signal.aborted) setRainLoading(false);
      });

    return () => controller.abort();
  }, [rainEnabled, rainForecast, rainRetryToken]);

  const targetForecastTime = Date.now() + forecastHours * 60 * 60 * 1000;
  const forecastIndex = rainForecast?.times.reduce((closestIndex, time, index, times) => (
    Math.abs(Date.parse(time) - targetForecastTime) < Math.abs(Date.parse(times[closestIndex]) - targetForecastTime)
      ? index
      : closestIndex
  ), 0) ?? 0;
  const rainMapPoints = useMemo<RainMapPoint[]>(() => rainForecast?.points.map((point) => ({
    latitude: point.latitude,
    longitude: point.longitude,
    precipitation: point.precipitation[forecastIndex] ?? null,
  })) ?? [], [rainForecast, forecastIndex]);
  const forecastRainValues = rainMapPoints.flatMap((point) => point.precipitation === null ? [] : [point.precipitation]);
  const maximumRain = forecastRainValues.length ? Math.max(...forecastRainValues) : null;
  const forecastTime = rainForecast?.times[forecastIndex];
  const forecastTimeLabel = forecastTime
    ? new Intl.DateTimeFormat("th-TH", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }).format(new Date(forecastTime))
    : "";
  const forecastStatusLabel = maximumRain === null
    ? "ยังไม่มีค่าพยากรณ์ฝน"
    : maximumRain < 0.2
      ? maximumRain === 0 ? "ไม่คาดการณ์ฝน" : "ฝนน้อยกว่า 0.2 มม./ชม."
      : `ฝนสูงสุด ${maximumRain.toLocaleString("th-TH", { maximumFractionDigits: 1 })} มม./ชม.`;
  const forecastUpdatedLabel = rainForecast
    ? new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }).format(new Date(rainForecast.generatedAt))
    : "";
  const stationConditionCounts = (["critical", "warning", "normal", "stale", "offline"] as ThaiWaterStationCondition[]).map((condition) => ({
    condition,
    count: thaiWaterStations.filter((station) => station.condition === condition).length,
  }));

  return (
    <div className="content-page map-page">
      <PageHeader title="แผนที่ระดับน้ำ" description="สถานการณ์จากรายงานของคนในพื้นที่สมุทรปราการ" action={<div className="map-total"><span className="status-pulse" />{visible.length} จุดบนแผนที่</div>} />
      <RouteChecker reports={visible} onRouteChange={setRouteCoordinates} onOriginPositionChange={(position, accuracyMeters, isCurrent) => setRouteStart(position ? { position, accuracyMeters, isCurrent } : null)} onSelectReport={onSelectReport} />
      <div className="map-legend-block">
        <div className="map-data-layer-controls">
        <section className={`water-station-control${stationLayerEnabled ? " is-enabled" : ""}`} aria-label="ชั้นข้อมูลสถานีระดับน้ำ ThaiWater">
          <div className="water-station-heading">
            <button type="button" className="water-station-toggle" aria-pressed={stationLayerEnabled} onClick={() => setStationLayerEnabled((enabled) => !enabled)}>
              <Waves size={18} />
              <span><strong>สถานีระดับน้ำ ThaiWater</strong><small>{stationLoading ? "กำลังโหลดข้อมูลสถานี…" : stationError ? "เชื่อมต่อข้อมูลไม่ได้" : `${thaiWaterStations.length} สถานีในสมุทรปราการ`}</small></span>
              <i className="water-station-toggle-indicator" />
            </button>
            <button type="button" className="water-station-refresh" onClick={() => setStationRetryToken((token) => token + 1)} disabled={stationLoading} aria-label="โหลดข้อมูลสถานี ThaiWater ล่าสุด" title="โหลดข้อมูลล่าสุด"><RefreshCw size={15} className={stationLoading ? "is-spinning" : ""} /></button>
          </div>
          {stationError ? <p className="water-station-error" role="alert">{stationError}<button type="button" onClick={() => setStationRetryToken((token) => token + 1)}>ลองใหม่</button></p> : <>
            <div className="water-station-legend" aria-label="สถานะสถานี ThaiWater">
              {stationConditionCounts.filter(({ count }) => count > 0).map(({ condition, count }) => <span key={condition}><i style={{ backgroundColor: thaiWaterStationColors[condition] }} />{thaiWaterStationLabels[condition]}<b>{count}</b></span>)}
            </div>
            <p className="water-station-attribution">ระดับน้ำเป็น ม.รทก. · ข้อมูลเก่าคืออัปเดตเกิน 24 ชม. · <a href={thaiWaterSourceUrl} target="_blank" rel="noreferrer">ThaiWater</a></p>
          </>}
        </section>
        <section className={`rain-forecast-control${rainEnabled ? " is-enabled" : ""}`} aria-label="ชั้นพยากรณ์ฝน">
          <div className="rain-forecast-heading">
            <button type="button" className="rain-layer-toggle" aria-pressed={rainEnabled} onClick={() => setRainEnabled((enabled) => !enabled)}>
              <CloudRain size={18} />
              <span><strong>พยากรณ์ฝน</strong><small>{rainEnabled ? "เปิดชั้นฝนบนแผนที่" : "เลือกเวลาเพื่อดูฝนคาดการณ์"}</small></span>
              <i className="rain-toggle-indicator" />
            </button>
            {rainEnabled && <span className="rain-forecast-status">{rainLoading ? <><span className="spinner" />กำลังโหลดพยากรณ์…</> : rainError ? "โหลดข้อมูลไม่สำเร็จ" : forecastTimeLabel ? <>{forecastStatusLabel} · {forecastTimeLabel}</> : "เตรียมข้อมูลพยากรณ์"}</span>}
          </div>
          {rainEnabled && <>
            <div className="rain-time-options" role="group" aria-label="เลือกเวลาพยากรณ์ฝน">
              {rainForecastOptions.map((option) => <button key={option.hours} type="button" className={forecastHours === option.hours ? "selected" : ""} aria-pressed={forecastHours === option.hours} onClick={() => setForecastHours(option.hours)}>{option.label}</button>)}
            </div>
            {rainError && <p className="rain-forecast-error" role="alert"><AlertTriangle size={14} />{rainError}<button type="button" onClick={() => { setRainForecast(null); setRainError(""); setRainRetryToken((token) => token + 1); }}>ลองใหม่</button></p>}
            {rainForecast && <>
              <div className="rain-forecast-scale" aria-label="ปริมาณฝนคาดการณ์ หน่วยมิลลิเมตรในหนึ่งชั่วโมง">
                <strong>ฝน (มม./ชม.)</strong>
                <span><i className="rain-scale-light" />0.2–1</span>
                <span><i className="rain-scale-medium" />1–2.5</span>
                <span><i className="rain-scale-heavy" />2.5–7.5</span>
                <span><i className="rain-scale-intense" />7.5–15</span>
                <span><i className="rain-scale-extreme" />15+</span>
              </div>
              <p className="rain-forecast-note">พยากรณ์รายชั่วโมง · อัปเดต {forecastUpdatedLabel} น. · <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> (CC BY 4.0) · ไม่ใช่ระดับน้ำท่วม</p>
            </>}
          </>}
        </section>
        </div>
        <WaterLegend />
        <p><Info size={15} />จุดขอบประ = มีผู้แจ้งว่าน้ำลดแล้ว · แตะจุดเพื่ออัปเดตว่ายังท่วมหรือน้ำลดแล้ว</p>
      </div>
      <div id="flood-map" className="full-map-wrap"><FloodMap reports={visible} selectedId={selectedId} onStillFlooded={onStillFlooded} onReceded={onReceded} onFlag={onFlag} waterStations={stationLayerEnabled ? thaiWaterStations : undefined} rainForecastPoints={rainEnabled && rainForecast ? rainMapPoints : undefined} routeCoordinates={routeCoordinates} routeStartPosition={routeStart?.position} routeStartAccuracyMeters={routeStart?.accuracyMeters} routeStartIsCurrent={routeStart?.isCurrent} showDistrictBoundaries className="full-map" /></div>
      <div className="map-bottom-note"><span><MapPin size={15} /> {visible.length} รายงานทั้งหมด</span><span><Clock3 size={15} /> ทุกจุดแสดงเวลาที่ส่งรายงานล่าสุด</span>{stationLayerEnabled && <span><Waves size={15} />{thaiWaterStations.length} สถานี ThaiWater</span>}<span><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a></span><span><a href="https://www.geoboundaries.org/" target="_blank" rel="noreferrer">ขอบเขตอำเภอ geoBoundaries · CC BY 3.0 IGO</a></span></div>
    </div>
  );
}

function LatestView({ reports, onSelectReport }: { reports: FloodReport[]; onSelectReport: (id: string) => void }) {
  const [district, setDistrict] = useState("ทุกอำเภอ");
  const [subdistrict, setSubdistrict] = useState("ทุกตำบล");
  const areaReports = reports.filter((report) => (district === "ทุกอำเภอ" || report.district === district) && (subdistrict === "ทุกตำบล" || report.subdistrict === subdistrict));
  const counts = levelGroups.map((group) => ({ ...group, count: areaReports.filter((report) => group.test(report.waterLevel)).length }));
  const latest = areaReports[0]?.createdAt;
  const options = district === "ทุกอำเภอ" ? [] : subdistrictsByDistrict[district] ?? [];
  const total = Math.max(1, counts.reduce((sum, item) => sum + item.count, 0));
  return (
    <div className="content-page latest-view">
      <PageHeader title="อัปเดตระดับน้ำล่าสุด" description="รายงานจากพื้นที่ เรียงจากข้อมูลที่ส่งเข้ามาล่าสุด" />
      <section className="latest-toolbar"><div className="filter-intro"><span className="filter-icon"><Search size={17} /></span><div><b>กรองตามพื้นที่</b><small>เลือกอำเภอและตำบลที่ต้องการดู</small></div></div><div className="filter-controls"><label className="select-wrap"><span className="sr-only">เลือกอำเภอ</span><select value={district} onChange={(event) => { setDistrict(event.target.value); setSubdistrict("ทุกตำบล"); }}><option>ทุกอำเภอ</option>{districts.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={16} /></label><label className={`select-wrap${district === "ทุกอำเภอ" ? " disabled" : ""}`}><span className="sr-only">เลือกตำบล</span><select value={subdistrict} onChange={(event) => setSubdistrict(event.target.value)} disabled={district === "ทุกอำเภอ"}><option>ทุกตำบล</option>{options.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={16} /></label></div></section>
       <section className="latest-summary"><div className="latest-summary-top"><div><span className="summary-live-dot" /><span>รายงานตามตัวกรอง</span></div><span>{latest ? `รายงานล่าสุด ${timeAgo(latest)}` : "ยังไม่มีรายงาน"}</span></div><div className="latest-count"><strong>{areaReports.length}</strong><span>จุด</span><small>ตรงกับตัวกรองที่เลือก</small></div><div className="count-bar" aria-label="จำนวนจุดตามระดับน้ำ">{counts.map((item) => <span key={item.label} style={{ background: item.color, width: `${item.count / total * 100}%` }} title={`${item.label}: ${item.count} จุด`} />)}</div><div className="count-labels">{counts.map((item) => <span key={item.label}><i style={{ background: item.color }} />{item.label}<b>{item.count}</b></span>)}</div></section>
       <ReportActivity reports={areaReports} />
       <section className="latest-list-section"><div className="latest-list-heading"><div><h2>รายงานในพื้นที่</h2><p>แตะรายการเพื่อเปิดตำแหน่งบนแผนที่</p></div><span className="result-count">{areaReports.length} รายงาน</span></div><div className="latest-list">{areaReports.length ? areaReports.map((report) => <ReportRow key={report.id} report={report} onClick={() => onSelectReport(report.id)} />) : <div className="empty-state"><MapPin size={24} /><h3>ยังไม่มีรายงานในพื้นที่นี้</h3><p>เลือกอำเภออื่น หรือเป็นคนแรกที่ส่งข้อมูลจากพื้นที่</p></div>}</div></section>
    </div>
  );
}

function CctvView({ onNavigate }: { onNavigate: (view: View) => void }) {
  const [query, setQuery] = useState("");
  const [district, setDistrict] = useState("ทุกอำเภอ");
  const [selected, setSelected] = useState(cameras[0]);
  const [feedStatus, setFeedStatus] = useState<CameraFeedStatus>("loading");
  const updateFeedStatus = useCallback((status: CameraFeedStatus) => setFeedStatus(status), []);
  useEffect(() => setFeedStatus(selected.feedUrl ? "loading" : "offline"), [selected.id, selected.feedUrl]);
  const filtered = cameras.filter((camera) => (district === "ทุกอำเภอ" || camera.district === district) && `${camera.name} ${camera.road} ${camera.subdistrict} ${camera.district}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="content-page cctv-view">
      <PageHeader title="กล้อง CCTV สมุทรปราการ" description="ค้นหากล้องตามถนนหรือจุดสำคัญในจังหวัด" />
       <div className="cctv-disclaimer"><Info size={16} /><span><b>กล้องสาธารณะที่เปิดดูได้ {cameras.length} จุด</b> — ฟีด iTIC Motion บนถนนบางนา–ตราด ผ่าน Longdo Traffic</span><button onClick={() => onNavigate("map")}>ดูแผนที่น้ำ <ArrowRight size={14} /></button></div>
      <div className="cctv-layout">
        <section className="camera-stage-wrap">
          <div className="camera-stage">{selected.feedUrl && <div className="camera-live-feed">{selected.feedType === "hls" ? <CameraHlsFeed src={selected.feedUrl} title={`CCTV ${selected.name}`} onStatus={updateFeedStatus} /> : selected.feedType === "image" ? <Image src={selected.feedUrl} alt={`ภาพ CCTV ${selected.name}`} fill unoptimized sizes="(max-width: 900px) 100vw, 60vw" onLoad={() => updateFeedStatus("live")} onError={() => updateFeedStatus("offline")} /> : <iframe src={selected.feedUrl} title={`CCTV ${selected.name}`} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen onLoad={() => updateFeedStatus("live")} />}</div>}<div className="camera-grid-lines" /><div className="camera-stage-top"><span><Radio size={14} /> CCTV · {selected.name}</span><span className={`feed-unavailable${feedStatus === "live" ? " feed-live" : ""}`}><i />{!selected.feedUrl ? "ยังไม่มีสัญญาณภาพ" : feedStatus === "live" ? "กำลังรับภาพ" : feedStatus === "loading" ? "กำลังเชื่อมต่อภาพ" : "สัญญาณภาพขัดข้อง"}</span></div>{!selected.feedUrl && <div className="camera-placeholder"><div className="camera-orbit"><Camera size={37} strokeWidth={1.4} /></div><h2>ยังไม่มีภาพถ่ายทอดสด</h2><p>จุดนี้เป็นรายการตัวอย่าง<br />เพิ่ม URL จากหน่วยงานเพื่อแสดงภาพ</p><span className="camera-location-tag"><MapPin size={13} />{selected.name} · {selected.road}</span></div>}<div className="camera-stage-bottom"><span>{selected.district} · {selected.subdistrict}</span><span>{selected.coordinates[0].toFixed(4)}° N · {selected.coordinates[1].toFixed(4)}° E</span></div></div>
          <div className="camera-stage-caption"><span><ShieldAlert size={15} />{selected.feedUrl ? `ภาพจาก ${selected.sourceLabel ?? "แหล่งสาธารณะ"}` : "กล้องตัวอย่างยังไม่มีภาพถ่ายทอดสด"}</span>{selected.sourceUrl ? <a className="text-link" href={selected.sourceUrl} target="_blank" rel="noreferrer">เปิดต้นทาง <ExternalLink size={14} /></a> : <button className="text-link" onClick={() => onNavigate("report")}>รายงานจากจุดนี้ <ArrowRight size={14} /></button>}</div>
        </section>
       <section className="camera-list-panel"><div className="camera-list-heading"><div><h2>ค้นหาจุดกล้อง</h2><p>{filtered.length} จุดในรายการ</p></div><span className="camera-total-icon"><Camera size={17} /></span></div><div className="camera-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาถนน / จุดสำคัญ" aria-label="ค้นหาชื่อถนนหรือจุดกล้อง" />{query && <button onClick={() => setQuery("")} aria-label="ล้างการค้นหา"><X size={15} /></button>}</div><div className="select-wrap camera-district-select"><select value={district} onChange={(event) => setDistrict(event.target.value)} aria-label="กรองกล้องตามอำเภอ"><option>ทุกอำเภอ</option>{districts.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={15} /></div><div className="camera-list">{filtered.map((camera, index) => <button key={camera.id} className={`camera-list-item${selected.id === camera.id ? " selected" : ""}`} onClick={() => setSelected(camera)}><span className="camera-number">{String(index + 1).padStart(2, "0")}</span><span className="camera-item-main"><b>{camera.name}</b><small>{camera.road} · {camera.subdistrict}</small></span><span className={`camera-unavailable-dot${camera.feedUrl ? " is-live" : ""}`} title={camera.feedUrl ? "มีฟีดสาธารณะ" : "ยังไม่ได้เชื่อมต่อภาพ"} /><ChevronRight size={16} /></button>)}{filtered.length === 0 && <div className="empty-state small-empty"><Search size={20} /><p>ไม่พบจุดที่ค้นหา</p><button className="text-link" onClick={() => { setQuery(""); setDistrict("ทุกอำเภอ"); }}>ล้างตัวกรอง</button></div>}</div><p className="camera-source-note"><Info size={13} />กล้องในรายการนี้มีฟีดสาธารณะ</p></section>
      </div>
    </div>
  );
}

function EmergencyContacts() {
  return (
    <section className="emergency-panel"><div className="emergency-heading"><span className="emergency-symbol"><Phone size={17} /></span><div><h2>เบอร์ฉุกเฉิน</h2><p>ข้อมูลตามรายการที่ให้มา · โปรดยืนยันก่อนเผยแพร่จริง</p></div><span className="emergency-callout"><ShieldAlert size={14} /> โทรด่วน</span></div><div className="emergency-list">
      <div className="emergency-row"><span className="emergency-name"><b>สมาคมกู้ภัยสมุทรปราการ</b><small>กู้ภัยปราการ</small></span><span className="emergency-number-links"><a href="tel:0650811122">065-081-1122</a><i>หรือ</i><a href="tel:1669">1669</a></span><Phone size={15} aria-hidden="true" /></div>
      <div className="emergency-row"><span className="emergency-name"><b>มูลนิธิกู้ภัยบางปู 811</b><small>พื้นที่บางปูและใกล้เคียง</small></span><span className="emergency-number-links"><a href="tel:0967261458">096-726-1458</a><i>หรือ</i><a href="tel:1669">1669</a></span><Phone size={15} aria-hidden="true" /></div>
      <div className="emergency-row"><span className="emergency-name"><b>ศูนย์กู้ชีพเทศบาลนครสมุทรปราการ</b><small>เพชรสมุทร · 10:00–21:00 น.</small></span><span className="emergency-number-links"><a href="tel:0877020388">087-702-0388</a></span><Phone size={15} aria-hidden="true" /></div>
      <div className="emergency-row"><span className="emergency-name"><b>เหตุด่วนเหตุร้าย / อัคคีภัย</b><small>แจ้งเหตุฉุกเฉิน</small></span><span className="emergency-number-links"><a href="tel:191">191</a><i>/</i><a href="tel:199">199</a></span><Phone size={15} aria-hidden="true" /></div>
      <div className="emergency-row"><span className="emergency-name"><b>ศูนย์ช่วยเหลือสังคม</b><small>กลุ่มเปราะบาง / อพยพ · 24 ชม.</small></span><span className="emergency-number-links"><a href="tel:1300">1300</a></span><Phone size={15} aria-hidden="true" /></div>
    </div></section>
  );
}

export default function FloodWatchApp() {
  const { reports, loading, liveMode, connected, connectionError, addReport, confirmReport, confirmStillFlooded, flagReport } = useFloodReports();
  const [view, setView] = useState<View>("home");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [watchedAreas, setWatchedAreas] = useState<WatchedArea[]>([]);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const previousReportIds = useRef<Set<string> | null>(null);
  const [, setMinuteTick] = useState(0);

  useEffect(() => {
    try {
      const storedAreas = window.localStorage.getItem(WATCHED_AREAS_STORAGE_KEY);
      const parsedAreas = storedAreas ? JSON.parse(storedAreas) as WatchedArea[] : [];
      if (Array.isArray(parsedAreas)) setWatchedAreas(parsedAreas.filter((area) => districts.includes(area.district) && (area.subdistrict === "ทุกตำบล" || subdistrictsByDistrict[area.district]?.includes(area.subdistrict))));
      setNotificationsEnabled(window.localStorage.getItem(WATCH_NOTIFICATIONS_STORAGE_KEY) === "true");
    } catch { /* Keep area watching available in memory if storage is blocked. */ }
  }, []);

  useEffect(() => {
    if (loading) return;
    const currentIds = new Set(reports.map((report) => report.id));
    if (!previousReportIds.current) {
      previousReportIds.current = currentIds;
      return;
    }
    const newReports = reports.filter((report) => !previousReportIds.current?.has(report.id));
    previousReportIds.current = currentIds;
    if (!notificationsEnabled || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    for (const report of newReports) {
      const isWatched = watchedAreas.some((area) => area.district === report.district && (area.subdistrict === "ทุกตำบล" || area.subdistrict === report.subdistrict));
      if (isWatched) new Notification(`มีรายงานใหม่ · ${report.subdistrict}`, { body: `${report.locationName} · ${reportFreshness(report.createdAt).label}`, tag: report.id });
    }
  }, [reports, loading, notificationsEnabled, watchedAreas]);

  useEffect(() => {
    const timer = window.setInterval(() => setMinuteTick((tick) => tick + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const syncFromUrl = () => {
      const requested = new URLSearchParams(window.location.search).get("view") as View | null;
      if (requested && navItems.some((item) => item.id === requested)) setView(requested);
      const id = new URLSearchParams(window.location.search).get("report");
      if (id) setSelectedId(id);
    };
    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, []);

  useEffect(() => {
    if (view !== "map") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("focus") !== "map") return;

    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        document.getElementById("flood-map")?.scrollIntoView({ behavior: "smooth", block: "start" });
        url.searchParams.delete("focus");
        window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [view]);

  const navigate = (next: View, reportId?: string) => {
    setView(next);
    if (reportId) setSelectedId(reportId);
    const url = new URL(window.location.href);
    if (next === "home") url.searchParams.delete("view");
    else url.searchParams.set("view", next);
    if (reportId) url.searchParams.set("report", reportId);
    else url.searchParams.delete("report");
    window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const selectedReport = reports.find((report) => report.id === selectedId) ?? null;
  const chooseReport = (id: string) => navigate("map", id);

  const runReportAction = async (action: () => Promise<void>) => {
    setActionError("");
    try { await action(); }
    catch (error) { setActionError(error instanceof Error ? error.message : "บันทึกการเปลี่ยนแปลงไม่สำเร็จ"); }
  };

  const saveWatchedAreas = (areas: WatchedArea[]) => {
    setWatchedAreas(areas);
    try { window.localStorage.setItem(WATCHED_AREAS_STORAGE_KEY, JSON.stringify(areas)); } catch { /* Keep changes for this session. */ }
  };

  const toggleAreaNotifications = async () => {
    if (notificationsEnabled) {
      setNotificationsEnabled(false);
      try { window.localStorage.setItem(WATCH_NOTIFICATIONS_STORAGE_KEY, "false"); } catch { /* The setting still applies until this page closes. */ }
      return null;
    }
    if (typeof Notification === "undefined") return "เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน";
    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permission !== "granted") return "ยังไม่ได้รับอนุญาตจากเบราว์เซอร์ เปิดได้ในการตั้งค่าเว็บไซต์";
    setNotificationsEnabled(true);
    try { window.localStorage.setItem(WATCH_NOTIFICATIONS_STORAGE_KEY, "true"); } catch { /* Keep the setting active for this session. */ }
    return null;
  };

  return (
    <Shell view={view} onNavigate={navigate} isLive={liveMode} connected={connected}>
      {!loading && !liveMode && view !== "home" && <div className="global-connection-alert sample-connection-alert"><Info size={15} />โหมดตัวอย่าง — รายงานยังบันทึกเฉพาะในอุปกรณ์นี้และไม่ซิงก์กับผู้ใช้อื่น<button onClick={() => navigate("report")}>ส่งรายงาน <ChevronRight size={14} /></button></div>}
      {connectionError && <div className="global-connection-alert"><AlertTriangle size={15} />{connectionError}<button onClick={() => window.location.reload()}>โหลดใหม่</button></div>}
      {actionError && <div className="global-connection-alert"><AlertTriangle size={15} />{actionError}<button onClick={() => setActionError("")} aria-label="ปิด"><X size={15} /></button></div>}
      {view === "home" && <HomeView reports={reports} onNavigate={navigate} onSelectReport={chooseReport} isLive={liveMode} connected={connected} watchedAreas={watchedAreas} notificationsEnabled={notificationsEnabled} onWatchAreasChange={saveWatchedAreas} onToggleNotifications={toggleAreaNotifications} />}
      {view === "report" && <ReportView reports={reports} onSubmit={addReport} onNavigate={navigate} />}
        {view === "map" && <MapView reports={reports} selectedId={selectedId} onSelectReport={chooseReport} onStillFlooded={(id) => void runReportAction(() => confirmStillFlooded(id))} onReceded={(id) => void runReportAction(() => confirmReport(id, "receded"))} onFlag={(id, reason) => void runReportAction(() => flagReport(id, reason))} />}
      {view === "latest" && <LatestView reports={reports} onSelectReport={chooseReport} />}
      {view === "cctv" && <CctvView onNavigate={navigate} />}
      {loading && <div className="loading-ribbon"><span className="spinner" />กำลังโหลดรายงานล่าสุด…</div>}
      {selectedReport && view !== "map" && <span className="sr-only">เลือกจุด {selectedReport.locationName}</span>}
    </Shell>
  );
}
