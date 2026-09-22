// components/editor/EditorWaveform.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin, { Region } from "wavesurfer.js/dist/plugins/regions.js";
import { Play, Pause, ZoomIn, ZoomOut, AlertTriangle, Loader2, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { srtTimeToSeconds, formatSecondsToSRT } from "@/lib/utils"; // PŘIDÁNO
import type { SubtitleItem } from "@/lib/utils";


interface Props {
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  videoUrl: string | null;
  audioUrl?: string | null;
  isExtractingAudio?: boolean;
  extractionProgress?: number;
  currentTime: number;
  onSeek: (time: number) => void;
  subtitles: SubtitleItem[];
  peaks?: number[][] | Float32Array[];
  duration?: number;
  isPlaying?: boolean;
  onTogglePlay?: () => void;
  onSubtitleTimeChange?: (id: string | number, newStartTime: string, newEndTime: string) => void;
}

export function EditorWaveform({
  videoUrl,
  audioUrl,
  isExtractingAudio,
  extractionProgress,
  currentTime,
  onSeek,
  subtitles = [],
  peaks,
  duration,
  isPlaying = false,
  onTogglePlay,
  onSubtitleTimeChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);
  const isUpdatingFromDragRef = useRef<boolean>(false);

  const [zoomLevel, setZoomLevel] = useState<number>(20);
  const [isReady, setIsReady] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);
  const [showSubtitlesOverlay, setShowSubtitlesOverlay] = useState<boolean>(true);

  // 1. Inicializace WaveSurferu – spouští se POUZE při změně audio/video zdroje
  useEffect(() => {
    if (!containerRef.current) return;
    
    // Pokud se právě extrahuje audio, počkáme na něj (nepoužijeme zatím videoUrl)
    if (isExtractingAudio) return;
    
    const sourceUrl = audioUrl || videoUrl;
    if (!sourceUrl) return;

    setIsReady(false);
    setHasError(false);

    const wsRegions = RegionsPlugin.create();
    regionsRef.current = wsRegions;

    wsRegions.on("region-updated", (region: Region) => {
      if (!onSubtitleTimeChange) return;

      const subId = region.id.replace("sub-", "");
      const newStartTime = formatSecondsToSRT(region.start);
      const newEndTime = formatSecondsToSRT(region.end);

      isUpdatingFromDragRef.current = true;
      onSubtitleTimeChange(subId, newStartTime, newEndTime);

      setTimeout(() => {
        isUpdatingFromDragRef.current = false;
      }, 150);
    });

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "#52525b",
      progressColor: "#6366f1",
      cursorColor: "#a855f7",
      cursorWidth: 2,
      height: 64,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      minPxPerSec: zoomLevel,
      peaks: peaks,
      duration: duration,
      interact: true,
      url: sourceUrl,
      normalize: true,
      plugins: [wsRegions],
    });

    // Ztišíme pouze samotnou instanci WaveSurferu (hlavní přehrávač hraje dál ze svého videa)
    ws.setVolume(0);

    ws.on("ready", () => {
      setIsReady(true);
      setHasError(false);
      ws.zoom(zoomLevel);
    });

    ws.on("interaction", (newTime) => {
      onSeek(newTime);
    });

    ws.on("error", (err) => {
      console.warn("WaveSurfer chyba načítání:", err);
      setHasError(true);
      setIsReady(false);
    });

    wavesurferRef.current = ws;

    return () => {
      ws.destroy();
      wavesurferRef.current = null;
      regionsRef.current = null;
      setIsReady(false);
    };
  }, [audioUrl, videoUrl, isExtractingAudio]); // Přidáno isExtractingAudio

  // 2. Vykreslování a inkrementální aktualizace bloků titulků
  useEffect(() => {
    if (!regionsRef.current || !isReady || isUpdatingFromDragRef.current) return;

    if (!showSubtitlesOverlay) {
      regionsRef.current.clearRegions();
      return;
    }

    const existingRegions = regionsRef.current.getRegions();
    const existingMap = new Map(existingRegions.map((r) => [r.id, r]));
    const currentSubIds = new Set<string>();

    subtitles.forEach((sub, index) => {
      const id = `sub-${sub.id !== undefined ? sub.id : index}`;
      currentSubIds.add(id);

      const start = srtTimeToSeconds(sub.startTime);
      const end = srtTimeToSeconds(sub.endTime);

      if (end > start) {
        const existing = existingMap.get(id);
        if (existing) {
          if (Math.abs(existing.start - start) > 0.01 || Math.abs(existing.end - end) > 0.01) {
            existing.setOptions({
              start,
              end,
              content: `${index + 1}`,
            });
          }
        } else {
          regionsRef.current?.addRegion({
            id,
            start,
            end,
            content: `${index + 1}`,
            color: "rgba(99, 102, 241, 0.35)",
            drag: true,
            resize: true,
          });
        }
      }
    });

    existingRegions.forEach((r) => {
      if (!currentSubIds.has(r.id)) {
        r.remove();
      }
    });
  }, [subtitles, isReady, showSubtitlesOverlay]);

  // 3. Plynulá synchronizace času videa s vlnovou křivkou
  useEffect(() => {
    if (!wavesurferRef.current || !isReady) return;

    const wsTime = wavesurferRef.current.getCurrentTime();
    if (Math.abs(wsTime - currentTime) > 0.15) {
      try {
        wavesurferRef.current.setTime(currentTime);
      } catch (e) {
        // Ignorovat
      }
    }
  }, [currentTime, isReady]);

  // 4. Reaktivní Zoom
  useEffect(() => {
    if (wavesurferRef.current && isReady) {
      try {
        wavesurferRef.current.zoom(zoomLevel);
      } catch (e) {
        console.warn("Chyba při nastavení zoomu:", e);
      }
    }
  }, [zoomLevel, isReady]);

  if (!videoUrl && !peaks) {
    return (
      <div className="h-24 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl flex items-center justify-center text-xs text-muted-foreground bg-zinc-50/50 dark:bg-zinc-900/30">
        Pro zobrazení časové osy a zvukové křivky nahrajte video v levém panelu.
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="outline"
            className="h-7 w-7"
            onClick={onTogglePlay}
            disabled={!isReady || isExtractingAudio}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </Button>

          <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
            {(!isReady || isExtractingAudio) && !hasError && (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500 shrink-0" />
            )}
            <span>
              {hasError
                ? "Audio křivka nedostupná"
                : isExtractingAudio
                ? `Extrahuji audio z videa... ${extractionProgress ?`${Math.round(extractionProgress)}%` : "0%"}`
                : isReady
                ? "Audio Stopa (Synchronizovaná s videem)"
                : "Zpracovávám audio stopu..."}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={showSubtitlesOverlay ? "secondary" : "ghost"}
            className="h-7 px-2 text-[11px] gap-1.5 font-medium"
            onClick={() => setShowSubtitlesOverlay((prev) => !prev)}
            disabled={!isReady}
            title="Zobrazit nebo skrýt bloky titulků na zvukové křivce"
          >
            <Layers className={`w-3.5 h-3.5 ${showSubtitlesOverlay ? "text-indigo-500" : "text-muted-foreground"}`} />
            <span>Titulky {showSubtitlesOverlay ? "Zobrazeny" : "Skryty"}</span>
          </Button>

          <div className="h-4 w-[1px] bg-zinc-200 dark:bg-zinc-800" />

          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => setZoomLevel((prev) => Math.max(10, prev - 15))}
              disabled={!isReady}
            >
              <ZoomOut className="w-3 h-3" />
            </Button>
            <span className="text-[10px] font-mono text-muted-foreground w-8 text-center">
              {zoomLevel}x
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => setZoomLevel((prev) => Math.min(200, prev + 15))}
              disabled={!isReady}
            >
              <ZoomIn className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </div>

      {hasError ? (
        <div className="h-16 flex items-center justify-center gap-2 bg-zinc-950/50 rounded border border-zinc-800 text-xs text-zinc-400 p-2 text-center">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          <span>Dekódování zvukové křivky selhalo. Přehrávání i titulky fungují dál.</span>
        </div>
      ) : (
        <div className="relative w-full rounded bg-zinc-950/50 p-1 overflow-hidden">
          {(!isReady || isExtractingAudio) && (
            <div className="absolute inset-0 z-10 bg-zinc-950/80 backdrop-blur-[1px] flex flex-col items-center justify-center gap-2">
              <div className="w-full h-12 flex items-center justify-center gap-1 px-8 animate-pulse">
                {Array.from({ length: 60 }).map((_, i, arr) => {
                  const total = arr.length;
                  const envelope = Math.sin((i / (total - 1)) * Math.PI);
                  const wave = Math.abs(Math.sin(i * 0.35));
                  const heightPercent = Math.max(10, Math.round(wave * envelope * 85 + 15));

                  return (
                    <div
                      key={i}
                      className="w-1 bg-indigo-500/80 rounded-full transition-all duration-300"
                      style={{
                        height: `${heightPercent}%`,
                      }}
                    />
                  );
                })}
              </div>              
            </div>
          )}

          <div ref={containerRef} className="w-full overflow-x-auto cursor-pointer min-h-[64px]" />
        </div>
      )}
    </div>
  );
}