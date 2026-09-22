"use client";

import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Film, MonitorPlay, Square, Download, Loader2, AlertCircle } from "lucide-react";
import type { SubtitleItem } from "@/lib/utils";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

interface Props {
  videoFile: File | null;
  subtitles: SubtitleItem[];
}

export function VideoBurnPanel({ videoFile, subtitles }: Props) {
  const [isBurning, setIsBurning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const ffmpegRef = useRef<FFmpeg | null>(null);

  useEffect(() => {
    return () => {
      if (outputUrl) URL.revokeObjectURL(outputUrl);
    };
  }, [outputUrl]);

  const canBurn = videoFile !== null && subtitles.length > 0;

    const handleStartBurn = async () => {
    if (!videoFile || subtitles.length === 0) return;

    setIsBurning(true);
    setProgress(0);
    setOutputUrl(null);
    setErrorMsg(null);

    try {
      const ffmpeg = new FFmpeg();
      ffmpegRef.current = ffmpeg;

      // Budeme si ukládat logy pro případnou analýzu chyby
      let logHistory = "";

      ffmpeg.on("log", ({ message }) => {
        console.log("[FFmpeg LOG]:", message);
        logHistory += message + "\n"; // Připojíme do historie
      });

      ffmpeg.on("progress", ({ progress }) => {
        const percent = Math.max(0, Math.min(100, Math.round(progress * 100)));
        setProgress(percent);
      });

      await ffmpeg.load();

      const inputVideoName = "input.mp4";
      const srtFileName = "subs.srt";
      const outputVideoName = "output.mp4";
      const fontFileName = "OpenSans-Regular.ttf";

      // Saháme rovnou do naší lokální public složky
      const fontUrl = "/fonts/OpenSans-Regular.ttf"; 
      
      console.log("Stahuji font pro vykreslení titulků...");
      await ffmpeg.writeFile(fontFileName, await fetchFile(fontUrl));
      
      console.log("Nahrávám video do paměti...");
      await ffmpeg.writeFile(inputVideoName, await fetchFile(videoFile));

      const srtContent = subtitles
        .map((sub, i) => `${i + 1}\n${sub.startTime} --> ${sub.endTime}\n${sub.text}`)
        .join("\n\n");
      
      await ffmpeg.writeFile(srtFileName, new TextEncoder().encode(srtContent));

      console.log("Spouštím rendering...");
      const execResult = await ffmpeg.exec([
        "-i", inputVideoName,
        "-vf", `subtitles=${srtFileName}:fontsdir=/:force_style='Fontname=Open Sans,FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=1.5,Shadow=0,MarginV=25'`,
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-c:a", "copy",
        outputVideoName
      ]);

      // --- CHYTRÁ DETEKCE CHYB ---
      if (execResult !== 0) {
        const lowerLogs = logHistory.toLowerCase();
        if (lowerLogs.includes("av1") || lowerLogs.includes("hevc") || lowerLogs.includes("h265")) {
          throw new Error(
            "Tento formát videa (AV1 / HEVC) není ve webovém prohlížeči plně podporován. Použijte prosím standardní formát H.264 (běžné MP4)."
          );
        } else {
          throw new Error(
            "Vypalování selhalo. Zkuste prosím použít video ve standardním formátu H.264 (MP4)."
          );
        }
      }

      const data = await ffmpeg.readFile(outputVideoName);
      const uint8Data = data as Uint8Array;
      const blob = new Blob([uint8Data.buffer as ArrayBuffer], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
      
      setOutputUrl(url);
      console.log("Vypalování úspěšně dokončeno!");

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "";
      if (errorMessage.includes("terminate")) {
        console.log("Vypalování bylo zrušeno uživatelem.");
      } else {
        console.error("Chyba vypalování:", err);
        // Zobrazíme uživateli náš hezký a srozumitelný error
        setErrorMsg(errorMessage || "Během vypalování došlo k neznámé chybě.");
      }
    } finally {
      setIsBurning(false);
      ffmpegRef.current = null;
    }
  };

  const handleCancel = () => {
    if (ffmpegRef.current) ffmpegRef.current.terminate();
    setIsBurning(false);
    setProgress(0);
  };

  const handleDownload = () => {
    if (!outputUrl || !videoFile) return;
    const baseName = videoFile.name.replace(/\.[^/.]+$/, "");
    const finalFileName = `${baseName}_hardsubs.mp4`;
    const a = document.createElement("a");
    a.href = outputUrl;
    a.download = finalFileName;
    a.click();
  };

  return (
    <div className="space-y-3">
      {/* ... (zbytek UI zůstává naprosto stejný) ... */}
      {!videoFile ? (
        <div className="text-center p-3 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-lg bg-zinc-50 dark:bg-zinc-950">
          <Film className="w-4 h-4 mx-auto mb-1.5 text-muted-foreground" />
          <p className="text-[10px] text-muted-foreground">Pro vypálení titulků nejprve nahrajte video v sekci &quot;Vložit zdroje&quot;.</p>
        </div>
      ) : (
        <>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Vypálí aktuální titulky přímo do obrazu videa (Hardsubs). Výsledkem bude nový soubor <strong>.MP4</strong>.
          </p>

          {errorMsg && (
            <div className="p-2 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/50 rounded flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-red-600 mt-0.5 shrink-0" />
              <p className="text-[10px] text-red-600 dark:text-red-400">{errorMsg}</p>
            </div>
          )}

          {isBurning ? (
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin text-indigo-500" /> Vypalování...
                </span>
                <span className="font-semibold text-indigo-600 dark:text-indigo-400">{progress}%</span>
              </div>
              <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-indigo-600 h-full transition-all duration-300 ease-out rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <Button 
                onClick={handleCancel}
                variant="outline" 
                className="w-full h-8 text-xs gap-1.5 border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:hover:bg-red-900/20 mt-2"
              >
                <Square className="w-3 h-3 fill-current shrink-0" /> Zrušit
              </Button>
            </div>
          ) : outputUrl ? (
            <div className="space-y-2">
              <div className="p-2.5 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-900/50 rounded-lg flex items-center justify-between">
                <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">Video je připraveno!</span>
                <Button size="sm" onClick={handleDownload} className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white">
                  <Download className="w-3 h-3 mr-1" /> Stáhnout
                </Button>
              </div>
              <Button onClick={() => setOutputUrl(null)} variant="ghost" className="w-full h-7 text-xs text-muted-foreground">
                Vypálit jinou verzi
              </Button>
            </div>
          ) : (
            <Button 
              onClick={handleStartBurn}
              disabled={!canBurn}
              className="w-full h-8 text-xs gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <MonitorPlay className="w-3.5 h-3.5 shrink-0" />
              <span>Vypálit do videa (MP4)</span>
            </Button>
          )}
        </>
      )}
    </div>
  );
}