"use client";

import { useCallback, useEffect, useState } from "react";
import { demoReports, FloodReport, NewFloodReport, ReportCondition, districts } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { distanceInMeters } from "@/lib/floodInsights";

const STORAGE_KEY = "samutprakarn-flood-reports-v1";

function sampleReports(): FloodReport[] {
  const now = Date.now();
  const ageInMinutes = [12, 24, 37, 58, 95, 125, 188, 32, 69];
  return demoReports.map((report, index) => ({
    ...report,
    createdAt: new Date(now - ageInMinutes[index] * 60_000).toISOString(),
  }));
}

function fromDatabase(row: Record<string, unknown>): FloodReport {
  return {
    id: String(row.id),
    locationName: String(row.location_name ?? "ไม่ระบุตำแหน่ง"),
    district: String(row.district ?? districts[0]),
    subdistrict: String(row.subdistrict ?? ""),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    waterLevel: row.water_level as FloodReport["waterLevel"],
    trend: row.trend as FloodReport["trend"],
    passable: (row.passable as FloodReport["passable"]) ?? [],
    note: String(row.note ?? ""),
    photoUrl: row.photo_url ? String(row.photo_url) : undefined,
    createdAt: String(row.created_at),
    condition: (row.condition as ReportCondition) ?? "flooded",
    confirmations: Number(row.confirmations ?? 0),
    flags: (row.flags as string[]) ?? [],
  };
}

export class DuplicateFloodReportError extends Error {
  constructor(readonly candidate: FloodReport, readonly distanceMeters: number) {
    super("พบรายงานใกล้เคียงในพื้นที่นี้");
    this.name = "DuplicateFloodReportError";
  }
}

function sortReports(items: FloodReport[]) {
  return [...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function useFloodReports() {
  const [reports, setReports] = useState<FloodReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const liveMode = Boolean(supabase);

  useEffect(() => {
    let active = true;
    const client = supabase;
    const load = async () => {
      if (client) {
        const { data, error } = await client.from("reports").select("*").order("created_at", { ascending: false });
        if (!active) return;
        if (error) {
          setConnectionError("เชื่อมต่อฐานข้อมูลไม่สำเร็จ กำลังแสดงข้อมูลตัวอย่างในเครื่อง");
          setReports(sampleReports());
        } else {
          setReports((data ?? []).map((row) => fromDatabase(row as Record<string, unknown>)));
          setConnected(true);
          setConnectionError("");
        }
      } else {
        try {
          const saved = window.localStorage.getItem(STORAGE_KEY);
          const initial = saved ? (JSON.parse(saved) as FloodReport[]) : sampleReports();
          if (!saved) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
          if (active) setReports(sortReports(initial));
        } catch {
          if (active) setReports(sampleReports());
        }
      }
      if (active) setLoading(false);
    };

    void load();
    if (!client) return () => { active = false; };

    const channel = client
      .channel("public-flood-reports")
      .on("postgres_changes", { event: "*", schema: "public", table: "reports" }, (payload) => {
        if (!active) return;
        if (payload.eventType === "DELETE") {
          setReports((current) => current.filter((report) => report.id !== String(payload.old.id)));
          return;
        }
        const next = fromDatabase(payload.new as Record<string, unknown>);
        setReports((current) => sortReports([next, ...current.filter((report) => report.id !== next.id)]));
      })
      .subscribe((status) => {
        if (!active) return;
        if (status === "SUBSCRIBED") {
          setConnected(true);
          setConnectionError("");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setConnected(false);
          setConnectionError("การเชื่อมต่อเรียลไทม์ขัดข้อง ลองรีเฟรชหน้าเว็บอีกครั้ง");
        }
      });

    return () => {
      active = false;
      void client.removeChannel(channel);
    };
  }, []);

  const updateLocal = useCallback((updater: (current: FloodReport[]) => FloodReport[]) => {
    setReports((current) => {
      const next = sortReports(updater(current));
      if (!supabase) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const addReport = useCallback(async (report: NewFloodReport, allowDuplicate = false) => {
    if (supabase) {
      const { photoUrl, ...reportData } = report;
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report: reportData,
          photoDataUrl: photoUrl?.startsWith("data:image/jpeg;base64,") ? photoUrl : undefined,
          allowDuplicate,
        }),
      });
      const result = await response.json() as {
        status?: string;
        report?: Record<string, unknown>;
        candidate?: Record<string, unknown>;
        distanceMeters?: number | null;
        retryAfterSeconds?: number;
        error?: string;
      };
      if (response.status === 409 && result.status === "duplicate" && result.candidate) {
        throw new DuplicateFloodReportError(fromDatabase(result.candidate), result.distanceMeters ?? 0);
      }
      if (response.status === 429) {
        const waitMinutes = Math.max(1, Math.ceil((result.retryAfterSeconds ?? 600) / 60));
        throw new Error(`ส่งรายงานถี่เกินไป โปรดรอประมาณ ${waitMinutes} นาทีแล้วลองใหม่`);
      }
      if (!response.ok || !result.report) throw new Error(result.error || "บันทึกรายงานไม่สำเร็จ โปรดลองอีกครั้ง");
      const saved = fromDatabase(result.report);
      updateLocal((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      return saved;
    }

    const now = Date.now();
    const candidate = reports.find((existing) => {
      const age = now - Date.parse(existing.createdAt);
      const sameVehicles = existing.passable.length === report.passable.length
        && existing.passable.every((vehicle) => report.passable.includes(vehicle));
      return existing.condition === "flooded"
        && existing.district === report.district
        && existing.subdistrict === report.subdistrict
        && existing.waterLevel === report.waterLevel
        && existing.trend === report.trend
        && sameVehicles
        && age >= 0
        && age <= 15 * 60_000
        && distanceInMeters([report.latitude, report.longitude], [existing.latitude, existing.longitude]) <= 100;
    });
    if (candidate && !allowDuplicate) {
      throw new DuplicateFloodReportError(candidate, distanceInMeters([report.latitude, report.longitude], [candidate.latitude, candidate.longitude]));
    }

    const saved: FloodReport = {
      ...report,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      condition: "flooded",
      confirmations: 0,
      flags: [],
    };
    updateLocal((current) => [saved, ...current]);
    return saved;
  }, [reports, updateLocal]);

  const confirmReport = useCallback(async (id: string, condition: ReportCondition) => {
    const report = reports.find((item) => item.id === id);
    if (!report) return;
    if (supabase) {
      const { error } = await supabase.from("reports").update({ condition }).eq("id", id);
      if (error) throw new Error(`อัปเดตสถานะไม่สำเร็จ: ${error.message}`);
    }
    updateLocal((current) => current.map((item) => item.id === id ? { ...item, condition } : item));
  }, [reports, updateLocal]);

  const confirmStillFlooded = useCallback(async (id: string) => {
    const report = reports.find((item) => item.id === id);
    if (!report) return;
    if (supabase) {
      const { error } = await supabase.from("reports").update({ confirmations: report.confirmations + 1, condition: "flooded" }).eq("id", id);
      if (error) throw new Error(`ยืนยันรายงานไม่สำเร็จ: ${error.message}`);
    }
    updateLocal((current) => current.map((item) => item.id === id ? { ...item, condition: "flooded", confirmations: item.confirmations + 1 } : item));
  }, [reports, updateLocal]);

  const confirmReportDetails = useCallback(async (id: string) => {
    const report = reports.find((item) => item.id === id);
    if (!report) return;
    if (supabase) {
      const { error } = await supabase.from("reports").update({ confirmations: report.confirmations + 1 }).eq("id", id);
      if (error) throw new Error(`ยืนยันรายงานไม่สำเร็จ: ${error.message}`);
    }
    updateLocal((current) => current.map((item) => item.id === id ? { ...item, confirmations: item.confirmations + 1 } : item));
  }, [reports, updateLocal]);

  const flagReport = useCallback(async (id: string, reason: string) => {
    const report = reports.find((item) => item.id === id);
    if (!report || report.flags.includes(reason)) return;
    const flags = [...report.flags, reason];
    if (supabase) {
      const { error } = await supabase.from("reports").update({ flags }).eq("id", id);
      if (error) throw new Error(`ส่งแจ้งข้อมูลไม่ถูกต้องไม่สำเร็จ: ${error.message}`);
    }
    updateLocal((current) => current.map((item) => item.id === id ? { ...item, flags } : item));
  }, [reports, updateLocal]);

  return { reports, loading, liveMode, connected, connectionError, addReport, confirmReport, confirmStillFlooded, confirmReportDetails, flagReport };
}

export function timeAgo(isoDate: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(isoDate)) / 60_000));
  if (minutes < 1) return "เมื่อสักครู่";
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
  return `${Math.floor(hours / 24)} วันที่แล้ว`;
}

export function formatThaiDate(isoDate: string) {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(isoDate));
}
