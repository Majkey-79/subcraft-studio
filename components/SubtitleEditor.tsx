// components/SubtitleEditor.tsx
"use client";

import React, { useState, useMemo, useRef, useEffect, useSyncExternalStore } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { EditorSidebar } from "./editor/EditorSidebar";
import { EditorPreview } from "./editor/EditorPreview";
import { EditorList } from "./editor/EditorList";
import { Button } from "@/components/ui/button";
import { RotateCcw, Save, X, SlidersHorizontal } from "lucide-react";
import { useHistory } from "@/hooks/useHistory";
import { sortSubtitles, srtTimeToSeconds, formatSecondsToSRT, escapeRegExp } from "@/lib/utils";
import type { SubtitleItem } from "@/lib/utils";
import { extractAudioFromVideoFile } from "@/lib/audioExtractor";
import { parseSubtitlesAuto } from "@/lib/srtParser";


const STORAGE_KEY_SUBS = "subcraft_subtitles_backup";
const STORAGE_KEY_NAME = "subcraft_filename_backup";
const STORAGE_KEY_TIME = "subcraft_timestamp_backup";
const STORAGE_KEY_TRANSLATED = "subcraft_translated_ids_backup";

const subscribeStorage = (callback: () => void) => {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
};

function useBackupData() {
  return useSyncExternalStore(
    subscribeStorage,
    () => {
      const savedSubs = localStorage.getItem(STORAGE_KEY_SUBS);
      const savedTime = localStorage.getItem(STORAGE_KEY_TIME);
      if (!savedSubs || !savedTime) return null;
      try {
        const parsed = JSON.parse(savedSubs);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const date = new Date(parseInt(savedTime, 10));
          const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          return JSON.stringify({ timeStr });
        }
      } catch {
        return null;
      }
      return null;
    },
    () => null
  );
}

export function SubtitleEditor() {
  const {
    state: subtitles,
    set: setSubtitles,
    undo,
    redo,
    canUndo,
    canRedo,
    reset: resetSubtitles,
  } = useHistory<SubtitleItem[]>([]);

  const [subtitleFileName, setSubtitleFileName] = useState<string>("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSyncMode, setIsSyncMode] = useState<boolean>(true);

  const [isTranslating, setIsTranslating] = useState(false);
  const [translationProgress, setTranslationProgress] = useState<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [backupDismissed, setBackupDismissed] = useState(false);
  const [targetLang, setTargetLang] = useState<string>("cs");
  const [audioLang, setAudioLang] = useState<string>("en-US");

  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isExtractingAudio, setIsExtractingAudio] = useState<boolean>(false);
  const [extractionProgress, setExtractionProgress] = useState<number>(0);

  const [sourceLang, setSourceLang] = useState<string>("auto");
  const [translatedIds, setTranslatedIds] = useState<Set<string>>(new Set());

  const [selectedSubtitleIds, setSelectedSubtitleIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [scrollCommand, setScrollCommand] = useState<{ index: number, ts: number } | null>(null);

  const backupDataRaw = useBackupData();
  const backupData = useMemo(() => {
    return backupDataRaw ? JSON.parse(backupDataRaw) as { timeStr: string } : null;
  }, [backupDataRaw]);

  const hasBackup = Boolean(backupData) && !backupDismissed;
  const backupTimeString = backupData?.timeStr || "";

  const containerRef = useRef<HTMLDivElement>(null);
  const [topHeight, setTopHeight] = useState<number>(60); // Výchozí výška horní části v procentech

  useEffect(() => {
    if (subtitles.length === 0) return;

    const timer = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY_SUBS, JSON.stringify(subtitles));
      localStorage.setItem(STORAGE_KEY_NAME, subtitleFileName);
      localStorage.setItem(STORAGE_KEY_TIME, Date.now().toString());
      localStorage.setItem(STORAGE_KEY_TRANSLATED, JSON.stringify(Array.from(translatedIds)));
    }, 500);

    return () => clearTimeout(timer);
  }, [subtitles, subtitleFileName]);

    const restoreBackup = () => {
    try {
      const savedSubs = localStorage.getItem(STORAGE_KEY_SUBS);
      const savedName = localStorage.getItem(STORAGE_KEY_NAME);
      const savedTranslated = localStorage.getItem(STORAGE_KEY_TRANSLATED);

      if (savedSubs) {
        resetSubtitles(JSON.parse(savedSubs));
        if (savedName) setSubtitleFileName(savedName);
        if (savedTranslated) {
          try {
            setTranslatedIds(new Set(JSON.parse(savedTranslated)));
          } catch {
            setTranslatedIds(new Set());
          }
        }
      }
    } catch (e) {
      console.error("Chyba obnovení:", e);
    } finally {
      setBackupDismissed(true);
    }
  };

  const discardBackup = () => {
    localStorage.removeItem(STORAGE_KEY_SUBS);
    localStorage.removeItem(STORAGE_KEY_NAME);
    localStorage.removeItem(STORAGE_KEY_TIME);
    localStorage.removeItem(STORAGE_KEY_TRANSLATED);
    setTranslatedIds(new Set());
    setBackupDismissed(true);
  };

  // Úprava funkce handleVideoUpload & handleVideoRemove:
  const handleVideoUpload = async (file: File, newUrl: string) => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    if (audioUrl) URL.revokeObjectURL(audioUrl);

    setVideoFile(file);
    setVideoUrl(newUrl);
    setAudioBlob(null);
    setAudioUrl(null);

    // Automatická extrakce audia pro Waveform & Transkripci
    try {
      setIsExtractingAudio(true);
      setExtractionProgress(0);
      
      const { audioBlob: extractedBlob, audioUrl: extractedUrl } = 
        await extractAudioFromVideoFile(file, (p) => setExtractionProgress(p));
      
      setAudioBlob(extractedBlob);
      setAudioUrl(extractedUrl);
    } catch (err) {
      console.error("Extrakce zvuku selhala:", err);
    } finally {
      setIsExtractingAudio(false);
    }
  };

  const handleVideoRemove = () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setVideoFile(null);
    setVideoUrl(null);
    setAudioBlob(null);
    setAudioUrl(null);
  };

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  const handleSubtitleUpload = async (file: File) => {
    const text = await file.text();
    const parsed = parseSubtitlesAuto(text);

    setTranslatedIds(new Set());
    resetSubtitles(parsed);
    setSubtitleFileName(file.name);
    setBackupDismissed(true);
  };

  const handleExport = (format: 'srt' | 'vtt' | 'txt') => {
    if (subtitles.length === 0) return;
    
    let content = "";

    if (format === 'vtt') {
      content = "WEBVTT\n\n" + subtitles.map((sub, index) => {
        // VTT používá tečky místo čárek pro milisekundy
        const start = sub.startTime.replace(',', '.');
        const end = sub.endTime.replace(',', '.');
        return `${index + 1}\n${start} --> ${end}\n${sub.text}`;
      }).join('\n\n');
    } else if (format === 'txt') {
      // Čistý text (zrušíme interní odřádkování v titulku, každý titulek je jeden řádek)
      content = subtitles.map(sub => sub.text.replace(/\n/g, ' ')).join('\n');
    } else {
      // Standarní SRT
      content = subtitles.map((sub, index) => {
        return `${index + 1}\n${sub.startTime} --> ${sub.endTime}\n${sub.text}`;
      }).join('\n\n');
    }

    let baseName = subtitleFileName || 'upravene_titulky';
    baseName = baseName.replace(/\.(srt|vtt|txt)$/i, ''); // odstranění staré koncovky
    const finalFileName = `${baseName}_${targetLang}.${format}`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = finalFileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const activeSubtitle = useMemo(() => {
    return subtitles.find(sub => {
      const start = srtTimeToSeconds(sub.startTime);
      const end = srtTimeToSeconds(sub.endTime);
      return currentTime >= start && currentTime <= end;
    });
  }, [currentTime, subtitles]);

  // --- HLEDÁNÍ A NAHRAZOVÁNÍ ---
  const handleReplace = (search: string, replaceText: string, matchCase: boolean, replaceAll: boolean) => {
    if (!search) return;

    setSubtitles(prev => {
      const result = [...prev];
      
      if (replaceAll) {
        // Nahradí všechno všude
        const regex = new RegExp(escapeRegExp(search), matchCase ? 'g' : 'gi');
        return result.map(sub => ({ ...sub, text: sub.text.replace(regex, replaceText) }));
      } else {
        // Nahradí jen PRVNÍ nalezený výskyt v celém souboru
        const regex = new RegExp(escapeRegExp(search), matchCase ? '' : 'i');
        const index = result.findIndex(sub => regex.test(sub.text));
        
        if (index !== -1) {
          result[index] = { ...result[index], text: result[index].text.replace(regex, replaceText) };
          setScrollCommand({ index, ts: Date.now() });
        }
        return result;
      }
    });
  };

  const applyTimeShift = (shiftSeconds: number) => {
    setSubtitles(prev => prev.map(sub => {
      if (selectedSubtitleIds.size > 0 && !selectedSubtitleIds.has(sub.id)) {
        return sub;
      }
      const newStart = Math.max(0, srtTimeToSeconds(sub.startTime) + shiftSeconds);
      const newEnd = Math.max(0, srtTimeToSeconds(sub.endTime) + shiftSeconds);
      return {
        ...sub,
        startTime: formatSecondsToSRT(newStart),
        endTime: formatSecondsToSRT(newEnd)
      };
    }));
  };

  const handleRowClick = (startTimeStr: string) => {
    setCurrentTime(srtTimeToSeconds(startTimeStr));
  };

  const handleDrag = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = topHeight;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!containerRef.current) return;
      const containerH = containerRef.current.clientHeight;
      const deltaY = moveEvent.clientY - startY;
      const deltaPercent = (deltaY / containerH) * 100;
      
      const newHeight = Math.min(Math.max(startHeight + deltaPercent, 20), 80);
      setTopHeight(newHeight);
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      window.getSelection()?.removeAllRanges(); 
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const handleTranslate = async (targetLang: string, onlyUnfinished = false) => {
    if (subtitles.length === 0) return;
    
    // Pokud překládáme jen zbývající, vynecháme ta ID, která už v Setu máme
    const itemsToTranslate = onlyUnfinished 
      ? subtitles.filter(s => !translatedIds.has(s.id))
      : subtitles;

    if (itemsToTranslate.length === 0) {
      alert("Všechny titulky již byly přeloženy.");
      return;
    }

    // Pokud dáváme "Přeložit vše", resetujeme množinu přeložených ID
    if (!onlyUnfinished) {
      setTranslatedIds(new Set());
    }

    setIsTranslating(true);
    setTranslationProgress(0);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch('/api/translate-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          subtitles: itemsToTranslate, 
          sourceLanguage: sourceLang,
          targetLanguage: targetLang 
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error("Chyba při komunikaci s API.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let partialChunk = "";
      
      const translatedMap = new Map<string, string>();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        partialChunk += decoder.decode(value, { stream: true });
        const lines = partialChunk.split("\n");
        partialChunk = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const data = JSON.parse(line);

          // Zaznamenáme přeložená ID a texty
          setTranslatedIds(prev => {
            const next = new Set(prev);
            data.batch.forEach((item: { id: string; text: string }) => {
              next.add(item.id);
              translatedMap.set(item.id, item.text);
            });
            return next;
          });

          const percent = Math.round((data.currentBatch / data.totalBatches) * 100);
          setTranslationProgress(percent);

          setSubtitles(prev => prev.map(sub => ({
            ...sub,
            text: translatedMap.get(sub.id) || sub.text
          })));
        }
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log("Překlad byl pozastaven.");
      } else {
        console.error("Překlad selhal:", error);
        alert("Nepodařilo se přeložit titulky.");
      }
    } finally {
      setIsTranslating(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancelTranslation = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleClearSubtitles = () => {
    resetSubtitles([]);
    setSubtitleFileName("");
    setTranslatedIds(new Set());

    localStorage.removeItem(STORAGE_KEY_SUBS);
    localStorage.removeItem(STORAGE_KEY_NAME);
    localStorage.removeItem(STORAGE_KEY_TIME);
    localStorage.removeItem(STORAGE_KEY_TRANSLATED);
  };

  // Hlavní logika pro seřazení titulků
  const handleSortSubtitles = () => {
    if (subtitles.length === 0) return;
    setSubtitles(prev => sortSubtitles(prev));
  };

  return (
    <div className="h-[100vh] flex flex-col overflow-hidden bg-zinc-50 dark:bg-zinc-950 text-zinc-950 dark:text-zinc-50 relative">
      
      {/* Restore Banner */}
      {hasBackup && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center justify-between text-xs text-amber-700 dark:text-amber-400 shrink-0 z-50">
          <div className="flex items-center gap-2">
            <Save className="w-4 h-4 text-amber-500" />
            <span>Nalezena rozpracovaná verze titulků z <strong>{backupTimeString}</strong>.</span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="default" onClick={restoreBackup} className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white border-none">
              <RotateCcw className="w-3 h-3 mr-1" /> Obnovit
            </Button>
            <Button size="sm" variant="ghost" onClick={discardBackup} className="h-7 text-xs text-muted-foreground hover:text-zinc-900 dark:hover:text-zinc-100">
              <X className="w-3 h-3 mr-1" /> Zahodit
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden relative">
        {/* Sidebar - Desktop */}
        <div className="hidden md:block w-80 h-full border-r border-zinc-200 dark:border-zinc-800 shrink-0 z-10 relative">
          <EditorSidebar 
            subtitleFileName={subtitleFileName}
            subtitleCount={subtitles.length}
            subtitles={subtitles}
            videoFile={videoFile}
            audioBlob={audioBlob}
            isExtractingAudio={isExtractingAudio}
            extractionProgress={extractionProgress}
            onSubtitleDrop={handleSubtitleUpload}
            onSubtitleRemove={handleClearSubtitles}
            onVideoUpload={handleVideoUpload}
            onVideoRemove={handleVideoRemove}
            onTimeShift={applyTimeShift}
            setSubtitles={setSubtitles}
            onTranslate={handleTranslate}
            onCancelTranslate={handleCancelTranslation}
            isTranslating={isTranslating}
            translationProgress={translationProgress}
            onExport={handleExport}
            sourceLang={sourceLang}
            setSourceLang={setSourceLang}
            targetLang={targetLang}
            setTargetLang={setTargetLang}
            audioLang={audioLang}
            setAudioLang={setAudioLang}
            hasSubtitles={subtitles.length > 0}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            onReplace={handleReplace}
            selectedCount={selectedSubtitleIds.size}
          />
        </div>

        {/* Sidebar - Mobile Drawer */}
        <Sheet open={isMobileSidebarOpen} onOpenChange={setIsMobileSidebarOpen}>
          <SheetContent side="left" className="p-0 w-80 max-w-[85vw] h-full bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex flex-col">
            <SheetTitle className="sr-only">Nástroje a nastavení</SheetTitle>
            <EditorSidebar 
              subtitleFileName={subtitleFileName}
              subtitleCount={subtitles.length}
              subtitles={subtitles}
              videoFile={videoFile}
              audioBlob={audioBlob}
              isExtractingAudio={isExtractingAudio}
              extractionProgress={extractionProgress}
              onSubtitleDrop={(file) => { handleSubtitleUpload(file); setIsMobileSidebarOpen(false); }}
              onSubtitleRemove={handleClearSubtitles}
              onVideoUpload={(file, url) => { 
                handleVideoUpload(file, url);
                setIsMobileSidebarOpen(false); 
              }}
              onVideoRemove={handleVideoRemove}
              onTimeShift={applyTimeShift}
              setSubtitles={setSubtitles}
              onTranslate={handleTranslate}
              onCancelTranslate={handleCancelTranslation}
              isTranslating={isTranslating}
              translationProgress={translationProgress}
              onExport={(format) => { handleExport(format); setIsMobileSidebarOpen(false); }}
              sourceLang={sourceLang}
              setSourceLang={setSourceLang}
              targetLang={targetLang}
              setTargetLang={setTargetLang}
              audioLang={audioLang}
              setAudioLang={setAudioLang}
              hasSubtitles={subtitles.length > 0}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              onReplace={handleReplace}
              selectedCount={selectedSubtitleIds.size}
            />
          </SheetContent>
        </Sheet>

        {/* Hlavní pracovní plocha */}
        <div className="flex-1 flex flex-col min-w-0 h-full relative z-0">
          
          {/* Tlačítko pro mobilní zobrazení sidebaru */}
          <div className="md:hidden p-2 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-white dark:bg-zinc-900">
            <Button 
              variant="ghost" 
              size="sm" 
              className="gap-2 text-xs"
              onClick={() => setIsMobileSidebarOpen(true)}
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span>Menu & Nástroje</span>
            </Button>
          </div>

          <main ref={containerRef} className="flex-1 p-3 sm:p-4 overflow-hidden flex flex-col">
            
            <div 
              style={{ height: `${topHeight}%` }} 
              className="flex flex-col min-h-0"
            >
              <EditorPreview 
                videoUrl={videoUrl}
                audioUrl={audioUrl}
                isExtractingAudio={isExtractingAudio}
                extractionProgress={extractionProgress}
                currentTime={currentTime}
                setCurrentTime={setCurrentTime}
                activeSubtitle={activeSubtitle}
                subtitles={subtitles}
                onSubtitleTimeChange={(id, newStart, newEnd) => {
                  setSubtitles((prev) =>
                    prev.map((sub, index) => {
                      const currentId = sub.id !== undefined ? sub.id : index;
                      return String(currentId) === String(id)
                        ? { ...sub, startTime: newStart, endTime: newEnd }
                        : sub;
                    })
                  );
                }}
              />
            </div>

            <div 
              className="h-3 my-1 -mx-2 cursor-ns-resize group flex items-center justify-center shrink-0 z-10"
              onMouseDown={handleDrag}
              title="Táhnutím upravíte výšku oken"
            >
              <div className="w-12 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700 group-hover:bg-indigo-500 transition-colors" />
            </div>

            <div className="flex-1 flex flex-col min-h-0">
              <EditorList 
                subtitles={subtitles}
                setSubtitles={setSubtitles}
                activeSubtitleId={activeSubtitle?.id}
                isSyncMode={isSyncMode}
                setIsSyncMode={setIsSyncMode}
                onSubtitleClick={handleRowClick}
                onClearSubtitles={handleClearSubtitles}
                onUndo={undo}
                onRedo={redo}
                canUndo={canUndo}
                canRedo={canRedo}
                onSort={handleSortSubtitles}
                selectedSubtitleIds={selectedSubtitleIds}
                setSelectedSubtitleIds={setSelectedSubtitleIds}
                searchQuery={searchQuery}
                scrollCommand={scrollCommand}
              />
            </div>

          </main>
        </div>
      </div>
    </div>
  );
}