"use client";

import { useEffect, useRef } from "react";
import type Hls from "hls.js";

export type CameraFeedStatus = "loading" | "live" | "offline";

interface CameraHlsFeedProps {
  src: string;
  title: string;
  onStatus: (status: CameraFeedStatus) => void;
}

export default function CameraHlsFeed({ src, title, onStatus }: CameraHlsFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let disposed = false;
    let player: Hls | null = null;
    const markLive = () => onStatus("live");
    const markOffline = () => onStatus("offline");

    video.addEventListener("playing", markLive);
    video.addEventListener("error", markOffline);

    const start = async () => {
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = src;
        video.play().catch(() => undefined);
        return;
      }

      const HlsLibrary = (await import("hls.js")).default;
      if (disposed) return;
      if (!HlsLibrary.isSupported()) {
        onStatus("offline");
        return;
      }

      player = new HlsLibrary({ enableWorker: true, lowLatencyMode: true });
      player.on(HlsLibrary.Events.MEDIA_ATTACHED, () => player?.loadSource(src));
      player.on(HlsLibrary.Events.MANIFEST_PARSED, () => video.play().catch(() => undefined));
      player.on(HlsLibrary.Events.ERROR, (_event, data) => {
        if (data.fatal) onStatus("offline");
      });
      player.attachMedia(video);
    };

    onStatus("loading");
    void start().catch(() => onStatus("offline"));

    return () => {
      disposed = true;
      video.removeEventListener("playing", markLive);
      video.removeEventListener("error", markOffline);
      player?.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, [onStatus, src]);

  return <video ref={videoRef} className="camera-video" title={title} controls muted autoPlay playsInline preload="none" />;
}
