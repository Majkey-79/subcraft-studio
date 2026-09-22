// components/editor/FpsSyncPanel.tsx
"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { srtTimeToSeconds, formatSecondsToSRT } from "@/lib/utils"; // PŘIDÁNO
import type { SubtitleItem } from "@/lib/utils";


interface Props {
  setSubtitles: React.Dispatch<React.SetStateAction<SubtitleItem[]>>;
}

const PRESETS = [
  { label: "25 → 23.976", from: 25, to: 23.976, desc: "PAL na NTSC" },
  { label: "23.976 → 25", from: 23.976, to: 25, desc: "NTSC na PAL" },
  { label: "24 → 23.976", from: 24, to: 23.976, desc: "Film na NTSC" },
  { label: "23.976 → 24", from: 23.976, to: 24, desc: "NTSC na Film" },
];


export function FpsSyncPanel({ setSubtitles }: Props) {
  const [fromFps, setFromFps] = useState<string>("25");
  const [toFps, setToFps] = useState<string>("23.976");

  const applyFpsChange = (sourceFps: number, targetFps: number) => {
    if (!sourceFps || !targetFps || sourceFps <= 0 || targetFps <= 0) return;

    const ratio = sourceFps / targetFps;

    setSubtitles((prev) =>
      prev.map((sub) => {
        const startSec = srtTimeToSeconds(sub.startTime);
        const endSec = srtTimeToSeconds(sub.endTime);

        return {
          ...sub,
          startTime: formatSecondsToSRT(startSec * ratio),
          endTime: formatSecondsToSRT(endSec * ratio),
        };
      })
    );
  };

  const handleCustomApply = () => {
    const f = parseFloat(fromFps.replace(",", "."));
    const t = parseFloat(toFps.replace(",", "."));
    if (!isNaN(f) && !isNaN(t)) {
      applyFpsChange(f, t);
    }
  };

  return (
    <div className="space-y-3">
      {/* Rychlé předvolby */}
      <div className="grid grid-cols-2 gap-1.5">
        {PRESETS.map((p) => (
          <Button
            key={p.label}
            variant="outline"
            size="sm"
            className="text-[11px] h-8 flex flex-col justify-center px-1"
            title={p.desc}
            onClick={() => applyFpsChange(p.from, p.to)}
          >
            <span className="font-mono font-medium">{p.label}</span>
          </Button>
        ))}
      </div>

      {/* Vlastní zadání FPS */}
      <div className="pt-1 space-y-1.5 border-t border-zinc-100 dark:border-zinc-800">
        <p className="text-[10px] text-muted-foreground font-medium">Vlastní přepočet:</p>
        <div className="flex items-center gap-1.5">
          <Input
            type="text"
            value={fromFps}
            onChange={(e) => setFromFps(e.target.value)}
            placeholder="Z FPS"
            className="h-8 text-xs font-mono text-center px-1"
          />
          <span className="text-xs text-muted-foreground font-bold">→</span>
          <Input
            type="text"
            value={toFps}
            onChange={(e) => setToFps(e.target.value)}
            placeholder="Na FPS"
            className="h-8 text-xs font-mono text-center px-1"
          />
          <Button
            size="sm"
            variant="secondary"
            className="h-8 text-xs shrink-0 px-2.5"
            onClick={handleCustomApply}
          >
            Změnit
          </Button>
        </div>
      </div>
    </div>
  );
}