import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Settings2 } from "lucide-react";
import { srtTimeToSeconds, formatSecondsToSRT } from "@/lib/utils"; // Uprav cestu podle struktury projektu
import type { SubtitleItem } from "@/lib/utils";

interface LinearSyncPanelProps {
  setSubtitles: React.Dispatch<React.SetStateAction<SubtitleItem[]>>;
}

export function LinearSyncPanel({ setSubtitles }: LinearSyncPanelProps) {
  const [syncPoint1, setSyncPoint1] = useState({ orig: "00:00:00,000", target: "00:00:00,000" });
  const [syncPoint2, setSyncPoint2] = useState({ orig: "01:00:00,000", target: "01:00:00,000" });

  const handleLinearSync = () => {
    const o1 = srtTimeToSeconds(syncPoint1.orig);
    const t1 = srtTimeToSeconds(syncPoint1.target);
    const o2 = srtTimeToSeconds(syncPoint2.orig);
    const t2 = srtTimeToSeconds(syncPoint2.target);

    if (o1 === o2) {
      alert("Původní časy obou bodů nesmí být totožné!");
      return;
    }

    const ratio = (t2 - t1) / (o2 - o1);
    const shift = t1 - (o1 * ratio);

    setSubtitles((prev) => prev.map(sub => {
      const newStart = Math.max(0, (srtTimeToSeconds(sub.startTime) * ratio) + shift);
      const newEnd = Math.max(0, (srtTimeToSeconds(sub.endTime) * ratio) + shift);
      
      return {
        ...sub,
        startTime: formatSecondsToSRT(newStart),
        endTime: formatSecondsToSRT(newEnd)
      };
    }));
  };

  return (
    <div className="space-y-4">

      <div className="space-y-1 ">
        <p className="text-[10px] text-muted-foreground leading-tight">
          Zadej původní a skutečný čas pro začátek a konec filmu.
        </p>

        {/* Bod 1 */}
        <div className="space-y-1.5">
          <span className="text-[10px] font-semibold text-zinc-700 dark:text-zinc-300">První slovo (Start)</span>
          <div className="flex items-center gap-1.5">
            <Input 
              value={syncPoint1.orig} 
              onChange={(e) => setSyncPoint1(p => ({...p, orig: e.target.value}))}
              className="h-7 text-[10px] font-mono px-2" 
              title="Čas v titulcích"
            />
            <span className="text-muted-foreground text-[10px]">→</span>
            <Input 
              value={syncPoint1.target} 
              onChange={(e) => setSyncPoint1(p => ({...p, target: e.target.value}))}
              className="h-7 text-[10px] font-mono px-2 border-indigo-200 focus-visible:ring-indigo-500" 
              title="Skutečný čas ve videu"
            />
          </div>
        </div>

        {/* Bod 2 */}
        <div className="space-y-1.5 pb-2">
          <span className="text-[10px] font-semibold text-zinc-700 dark:text-zinc-300">Poslední slovo (Konec)</span>
          <div className="flex items-center gap-1.5">
            <Input 
              value={syncPoint2.orig} 
              onChange={(e) => setSyncPoint2(p => ({...p, orig: e.target.value}))}
              className="h-7 text-[10px] font-mono px-2" 
              title="Čas v titulcích"
            />
            <span className="text-muted-foreground text-[10px]">→</span>
            <Input 
              value={syncPoint2.target} 
              onChange={(e) => setSyncPoint2(p => ({...p, target: e.target.value}))}
              className="h-7 text-[10px] font-mono px-2 border-indigo-200 focus-visible:ring-indigo-500" 
              title="Skutečný čas ve videu"
            />
          </div>
        </div>

        <Button 
          onClick={handleLinearSync} 
          className="w-full h-7 text-[11px] bg-indigo-600 hover:bg-indigo-700 text-white mt-1"
        >
          Aplikovat roztažení
        </Button>
      </div>
    </div>
  );
}