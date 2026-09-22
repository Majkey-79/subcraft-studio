// components/editor/EditorPreview.tsx
"use client";

import React, { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { EditorWaveform } from "./EditorWaveform";
import { EditorVideoPlayer } from "./EditorVideoPlayer";
import { Clock, MessageSquare, AlertCircle, CheckCircle2, Lightbulb } from "lucide-react";
import { srtTimeToSeconds, formatSecondsToSRT } from "@/lib/utils"; // PŘIDÁNO
import type { SubtitleItem } from "@/lib/utils";

interface Props {
  videoUrl: string | null;
  audioUrl?: string | null;
  isExtractingAudio?: boolean;  
  extractionProgress?: number;
  currentTime: number;
  setCurrentTime: (time: number) => void;
  activeSubtitle?: SubtitleItem;
  subtitles?: SubtitleItem[];
  duration?: number;
  onSubtitleTimeChange?: (id: string | number, newStartTime: string, newEndTime: string) => void;
}

const TIPS = [
  "Mezerník spouští video, F zapne celou obrazovku.",
  "Kliknutím na řádek v tabulce přetočíte video.",
  "Dvojklikem do tabulky můžete titulek upravit.",
  "Zkratkou Ctrl + Enter rozdělíte titulek v místě kurzoru.",
  "Ideální rychlost čtení je 12–17 znaků za sekundu (CPS).",
  "V levém panelu posunete časování všech titulků.",
  "Pomocí dvoubodu snadno srovnáte rozjeté časování.",
  "Krátké titulky do 3s rozdělte na více řádků.",
];

function TipCarousel() {
  const [index, setIndex] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % TIPS.length);
        setFade(true);
      }, 200);
    }, 7000);

    return () => clearInterval(interval);
  }, []);

  const currentTip = TIPS[index];

  const renderTipWithKbd = (text: string) => {
    const parts = text.split(/(Mezerník|F)/g);
    return parts.map((part, i) => {
      if (part === "Mezerník" || part === "F") {
        return (
          <kbd
            key={i}
            className="px-1 py-0.5 mx-0.5 rounded bg-zinc-200 dark:bg-zinc-800 font-mono text-[9px] text-zinc-800 dark:text-zinc-200 font-semibold"
          >
            {part}
          </kbd>
        );
      }
      return part;
    });
  };

  return (
    <div className="h-11 text-[10px] text-muted-foreground bg-zinc-100 dark:bg-zinc-900/40 px-2.5 py-1.5 rounded-lg border border-zinc-200/60 dark:border-zinc-800/60 flex items-center gap-2 overflow-hidden shrink-0">
      <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0" />
      <div
        className={`leading-tight transition-opacity duration-200 line-clamp-2 ${
          fade ? "opacity-100" : "opacity-0"
        }`}
      >
        {renderTipWithKbd(currentTip)}
      </div>
    </div>
  );
}

export function EditorPreview({ 
  videoUrl, 
  audioUrl,
  isExtractingAudio,
  extractionProgress,
  currentTime, 
  setCurrentTime, 
  activeSubtitle, 
  subtitles = [], 
  onSubtitleTimeChange
}: Props) {
  const [isPlaying, setIsPlaying] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Bezpečný Seek, který udrží přehrávání v běhu
  const handleSeek = (time: number) => {
    setCurrentTime(time);
    const vid = videoRef.current;
    const aud = audioRef.current;
    if (vid) vid.currentTime = time;
    if (aud) aud.currentTime = time;
  };

  // Synchronní přepínač přehrávání pro obě stopy
  const togglePlay = () => {
    const vid = videoRef.current;
    const aud = audioRef.current;

    const shouldPlay = isPlaying ? false : true;

    if (shouldPlay) {
      if (vid && vid.paused) vid.play().catch(() => {});
      if (aud && aud.paused) {
        if (vid) aud.currentTime = vid.currentTime;
        aud.play().catch(() => {});
      }
      setIsPlaying(true);
    } else {
      if (vid && !vid.paused) vid.pause();
      if (aud && !aud.paused) aud.pause();
      setIsPlaying(false);
    }
  };

  const startSec = activeSubtitle ? srtTimeToSeconds(activeSubtitle.startTime) : 0;
  const endSec = activeSubtitle ? srtTimeToSeconds(activeSubtitle.endTime) : 0;
  const subtitleDuration = Math.max(0, endSec - startSec);
  const charCount = activeSubtitle ? activeSubtitle.text.length : 0;
  const cps = subtitleDuration > 0 ? charCount / subtitleDuration : 0;
  const isCpsHigh = cps > 18;

  return (
    <div className="h-full flex flex-col gap-3 overflow-y-auto">
      <Card className="flex-1 flex flex-col md:flex-row gap-4 p-4 border-zinc-200 dark:border-zinc-800 min-h-0">
        
        <EditorVideoPlayer
          videoRef={videoRef}
          audioRef={audioRef}
          videoUrl={videoUrl}
          audioUrl={audioUrl}
          currentTime={currentTime}
          setCurrentTime={setCurrentTime}
          activeSubtitle={activeSubtitle}
          isPlaying={isPlaying}
          setIsPlaying={setIsPlaying}
          togglePlay={togglePlay}
        />

        <div className="w-full md:w-80 flex flex-col justify-between gap-4 bg-zinc-50 dark:bg-zinc-800/40 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 shrink-0">
          <div className="space-y-4">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="w-3.5 h-3.5" />
                <h3 className="text-[11px] font-semibold uppercase tracking-wider">Aktuální čas</h3>
              </div>
              <p className="text-3xl font-mono font-bold text-indigo-600 dark:text-indigo-400">
                {formatSecondsToSRT(currentTime)}
              </p>
            </div>

            <hr className="border-zinc-200 dark:border-zinc-800" />

            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <MessageSquare className="w-3.5 h-3.5" />
                <span className="text-[11px] font-semibold uppercase tracking-wider">Aktivní řádek</span>
              </div>

              {activeSubtitle ? (
                <div className="space-y-3 bg-white dark:bg-zinc-900 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800">
                  <p className="text-xs font-medium leading-relaxed text-zinc-900 dark:text-zinc-100 min-h-10">
                    {activeSubtitle.text}
                  </p>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/80 text-[11px]">
                    <div>
                      <span className="text-muted-foreground block text-[10px]">Trvání:</span>
                      <span className="font-mono font-medium">{subtitleDuration.toFixed(2)}s</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[10px]">Počet znaků:</span>
                      <span className="font-mono font-medium">{charCount}</span>
                    </div>
                  </div>

                  <div className="pt-1 flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground text-[10px]">Rychlost čtení:</span>
                    <div className="flex items-center gap-1">
                      {isCpsHigh ? (
                        <span className="text-amber-500 font-medium flex items-center gap-1" title="Příliš rychlý text pro pohodlné čtení">
                          <AlertCircle className="w-3 h-3" /> {cps.toFixed(1)} cps
                        </span>
                      ) : (
                        <span className="text-emerald-500 font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> {cps.toFixed(1)} cps
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 text-center text-xs text-muted-foreground">
                  Na aktuální pozici v čase není žádný titulek.
                </div>
              )}
            </div>
          </div>
          <TipCarousel />
        </div>
      </Card>

      <EditorWaveform
        videoRef={videoRef}
        videoUrl={videoUrl}
        audioUrl={audioUrl}
        isExtractingAudio={isExtractingAudio}
        extractionProgress={extractionProgress}
        currentTime={currentTime}
        onSeek={handleSeek}
        subtitles={subtitles}
        isPlaying={isPlaying}
        onTogglePlay={togglePlay}
        onSubtitleTimeChange={onSubtitleTimeChange}
      />
    </div>
  );
}