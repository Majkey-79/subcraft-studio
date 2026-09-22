"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, FileAudio } from "lucide-react";
import type { SubtitleItem } from "@/lib/utils";
// PŘIDÁN IMPORT chunkWavBlob
import { extractAudioFromVideoFile, chunkWavBlob } from "@/lib/audioExtractor";

interface Props {
  videoFile?: File | null;
  audioBlob?: Blob | null;
  isExtractingAudio?: boolean;
  extractionProgress?: number;
  setSubtitles: React.Dispatch<React.SetStateAction<SubtitleItem[]>>;
  audioLang: string;
  setAudioLang: (lang: string) => void;
}

export function VideoTranscribePanel({ 
  videoFile, 
  audioBlob,
  isExtractingAudio,
  extractionProgress,
  setSubtitles,
  audioLang,
  setAudioLang 
}: Props) {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [progressStatus, setProgressStatus] = useState<string>("");

  async function handleTranscribe() {
    if (!audioBlob && !videoFile) return;

    setIsLoading(true);
    setProgressStatus("Připravuji audio ke zpracování...");

    try {
      let targetBlob = audioBlob;

      // Pokud máme video nebo audio, které potřebuje extrakci/konverzi na WAV
      if (!targetBlob && videoFile) {
        setProgressStatus("Extrahuji audio z videa...");
        const { audioBlob: freshlyExtracted } = await extractAudioFromVideoFile(videoFile);
        targetBlob = freshlyExtracted;
      } else if (targetBlob && targetBlob.type !== "audio/wav") {
        setProgressStatus("Převádím audio na WAV formát...");
        const { audioBlob: freshlyExtracted } = await extractAudioFromVideoFile(targetBlob);
        targetBlob = freshlyExtracted;
      }

      if (!targetBlob) throw new Error("Chybí audio data.");

      // Rozsekání na 240 sekund = 4 minuty
      setProgressStatus("Dělím audio stopu...");
      const CHUNK_DURATION = 120; /* 60 sekund = 1 minuta */
      const chunks = await chunkWavBlob(targetBlob, CHUNK_DURATION);
      
      let allSubtitles: SubtitleItem[] = [];

      // Sériové zpracování chunků
      for (let i = 0; i < chunks.length; i++) {
        setProgressStatus(`Přepisuji část ${i + 1} z ${chunks.length}...`);
        
        const formData = new FormData();
        formData.append("file", chunks[i], `audio_chunk_${i}.wav`);
        formData.append("language", audioLang);
        formData.append("timeOffset", (i * CHUNK_DURATION).toString());

        const response = await fetch("/api/transcribe-agent", {
          method: "POST",
          body: formData,
        });

        let data;
        try {
          data = await response.json();
        } catch {
          data = { error: `HTTP chyba ${response.status}: ${response.statusText}` };
        }

        if (!response.ok) {
          console.error("Detailní chyba z API:", data);
          throw new Error(data.error || data.details || `Chyba v části ${i + 1} (status ${response.status})`);
        }

        if (data.subtitles && data.subtitles.length > 0) {
          allSubtitles = [...allSubtitles, ...data.subtitles];
          setSubtitles(allSubtitles);
        }

        // Malá pauza mezi chunky pro plynulé uvolňování kvóty
        if (i < chunks.length - 1) {
          await new Promise((res) => setTimeout(res, 3000));
        }
      }

      setProgressStatus(`Úspěšně vygenerováno ${allSubtitles.length} řádků.`);
    } catch (err: unknown) {
      console.error("Transkripce selhala:", err);
      setProgressStatus(`Chyba: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-2.5">
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-muted-foreground">
          Jazyk zvuku / titulků
        </label>
        
        <div className="flex items-center gap-2">
          <Select value={audioLang} onValueChange={(val) => val && setAudioLang(val)} disabled={isLoading || isExtractingAudio}>
            <SelectTrigger className="w-24 h-8 text-xs shrink-0 bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800">
              <SelectValue placeholder="Jazyk" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cs-CZ">Čeština</SelectItem>
              <SelectItem value="sk-SK">Slovenčina</SelectItem>
              <SelectItem value="en-US">English</SelectItem>
              <SelectItem value="de-DE">Deutsch</SelectItem>
              <SelectItem value="fr-FR">Francouzština</SelectItem>
              <SelectItem value="ja-JP">Japonština</SelectItem>
            </SelectContent>
          </Select>

          <Button
            onClick={handleTranscribe}
            disabled={(!videoFile && !audioBlob) || isLoading || isExtractingAudio}
            className="flex-1 h-8 text-xs gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-2 truncate"
          >
            {isExtractingAudio ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                <span className="truncate">Zvuk {extractionProgress}%</span>
              </>
            ) : isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                <span className="truncate">Přepisuji...</span>
              </>
            ) : (
              <>
                <FileAudio className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Vygenerovat</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {progressStatus && (
        <p className="text-[10px] text-muted-foreground font-mono pt-0.5">
          {progressStatus}
        </p>
      )}
    </div>
  );
}