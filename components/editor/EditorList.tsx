// components/editor/EditorList.tsx
"use client";

import React, { useRef, useEffect, useState, MouseEvent, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RotateCcw, Link, Unlink, Plus, Trash2, Undo2, Redo2, ArrowUpDown, Combine, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SubtitleItem } from "@/lib/utils";
import { srtTimeToSeconds, formatSecondsToSRT } from "@/lib/utils"; // <--- PŘIDÁNO PRO SPLIT

interface Props {
  subtitles: SubtitleItem[];
  setSubtitles: React.Dispatch<React.SetStateAction<SubtitleItem[]>>;
  activeSubtitleId?: string;
  isSyncMode: boolean;
  setIsSyncMode: (val: boolean) => void;
  onSubtitleClick?: (startTime: string) => void;
  onClearSubtitles?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onSort?: () => void;
  selectedSubtitleIds: Set<string>;
  setSelectedSubtitleIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  searchQuery: string;
  scrollCommand?: { index: number, ts: number } | null;
}

export function EditorList({ 
  subtitles, 
  setSubtitles, 
  activeSubtitleId, 
  isSyncMode, 
  setIsSyncMode, 
  onSubtitleClick, 
  onClearSubtitles,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onSort,
  selectedSubtitleIds,
  setSelectedSubtitleIds,
  searchQuery,
  scrollCommand
}: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const rowVirtualizer = useVirtualizer({
    count: subtitles.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => (isMobile ? 74 : 44),
    overscan: 5,
  });

  // --- VS CODE STYLE SCROLLBAR MARKERY ---
  const searchMatchIndexes = useMemo(() => {
    if (!searchQuery) return [];
    const q = searchQuery.toLowerCase();
    return subtitles
      .map((sub, index) => sub.text.toLowerCase().includes(q) ? index : -1)
      .filter(index => index !== -1);
  }, [searchQuery, subtitles]);

  // Autoscroll pro Sync mód (OPRAVENO)
  useEffect(() => {
    if (isSyncMode && activeSubtitleId && selectedSubtitleIds.size === 0) {
      const activeIndex = subtitles.findIndex(s => s.id === activeSubtitleId);
      if (activeIndex !== -1) {
        rowVirtualizer.scrollToIndex(activeIndex, { align: "center", behavior: "smooth" });
      }
    }
    // Záměrně jsme odebrali 'subtitles' ze závislostí, aby to nescrollovalo na běžící video 
    // ve chvíli, kdy jen měníme text!
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSubtitleId, isSyncMode, rowVirtualizer, selectedSubtitleIds.size]);

  // --- EFEKT PRO SCROLL NA NAHRAZENÉ SLOVO ---
  useEffect(() => {
    if (scrollCommand) {
      rowVirtualizer.scrollToIndex(scrollCommand.index, { align: "center", behavior: "smooth" });
    }
  }, [scrollCommand, rowVirtualizer]);

  // --- LOGIKA VÝBĚRU (MULTI-SELECT) ---
  const handleRowInteraction = (e: MouseEvent, id: string, index: number, startTime: string) => {
    // 1. Shift + Click (Rozsah)
    if (e.shiftKey && lastSelectedIndex !== null) {
      e.preventDefault();
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      
      const newSelected = new Set(selectedSubtitleIds);
      for (let i = start; i <= end; i++) {
        newSelected.add(subtitles[i].id);
      }
      setSelectedSubtitleIds(newSelected);
      return;
    }
    
    // 2. Ctrl/Cmd + Click (Přidat/Odebrat jednotlivě)
    if (e.ctrlKey || e.metaKey) {
      const newSelected = new Set(selectedSubtitleIds);
      if (newSelected.has(id)) {
        newSelected.delete(id);
      } else {
        newSelected.add(id);
        setLastSelectedIndex(index);
      }
      setSelectedSubtitleIds(newSelected);
      return;
    }

    // 3. Obyčejný klik
    if (selectedSubtitleIds.size > 0) {
      setSelectedSubtitleIds(new Set([id]));
    }
    setLastSelectedIndex(index);

    if (isSyncMode && onSubtitleClick) {
      onSubtitleClick(startTime);
    }
  };

  // --- AKCE PRO VYBRANÉ ---
  const handleMergeSelected = () => {
    const selectedSubs = subtitles
      .map((sub, index) => ({ sub, index }))
      .filter(({ sub }) => selectedSubtitleIds.has(sub.id))
      .sort((a, b) => a.index - b.index);

    if (selectedSubs.length < 2) return;

    const first = selectedSubs[0].sub;
    const last = selectedSubs[selectedSubs.length - 1].sub;
    const mergedText = selectedSubs.map(s => s.sub.text).join('\n');

    const newSub: SubtitleItem = {
      id: crypto.randomUUID(),
      startTime: first.startTime,
      endTime: last.endTime,
      text: mergedText,
    };

    const idsToRemove = new Set(selectedSubs.map(s => s.sub.id));

    setSubtitles(prev => {
      const result = [];
      let inserted = false;
      for (const s of prev) {
        if (idsToRemove.has(s.id)) {
          if (!inserted) {
            result.push(newSub); // Místo prvního smazaného vložíme sloučený
            inserted = true;
          }
        } else {
          result.push(s);
        }
      }
      return result;
    });

    setSelectedSubtitleIds(new Set([newSub.id])); // Vybereme ten nově sloučený
  };

  const handleDeleteSelected = () => {
    setSubtitles((prev) => prev.filter(s => !selectedSubtitleIds.has(s.id)));
    setSelectedSubtitleIds(new Set());
  };

  const handleAddRow = (index: number) => {
    const newSub: SubtitleItem = {
      id: crypto.randomUUID(),
      startTime: subtitles[index].endTime,
      endTime: subtitles[index].endTime,
      text: "Nový text titulku",
    };
    const updated = [...subtitles];
    updated.splice(index + 1, 0, newSub);
    setSubtitles(updated);
  };

  const handleDeleteRow = (id: string) => {
    setSubtitles((prev) => prev.filter(s => s.id !== id));
  };

  // --- CHYTRÉ ROZDĚLENÍ (SPLIT) ---
  const handleTextKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, sub: SubtitleItem, index: number) => {
    // Ctrl + Enter (nebo Cmd + Enter)
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      
      const target = e.currentTarget;
      const cursorPosition = target.selectionStart || 0;

      // Pokud jsme na začátku nebo na konci textu, nic nedělíme
      if (cursorPosition === 0 || cursorPosition === sub.text.length) return;

      const text1 = sub.text.slice(0, cursorPosition).trim();
      const text2 = sub.text.slice(cursorPosition).trim();

      const startSec = srtTimeToSeconds(sub.startTime);
      const endSec = srtTimeToSeconds(sub.endTime);
      const duration = endSec - startSec;

      // Proporcionální rozdělení času (delší text dostane delší část času)
      const ratio = text1.length / (text1.length + text2.length);
      const midSec = startSec + (duration * ratio);

      const sub1: SubtitleItem = {
        id: crypto.randomUUID(),
        startTime: sub.startTime,
        endTime: formatSecondsToSRT(midSec),
        text: text1
      };
      
      const sub2: SubtitleItem = {
        id: crypto.randomUUID(),
        startTime: formatSecondsToSRT(midSec),
        endTime: sub.endTime,
        text: text2
      };

      const updated = [...subtitles];
      updated.splice(index, 1, sub1, sub2);
      setSubtitles(updated);
    }
  };

  return (
    <Card className="h-full flex flex-col border-zinc-200 dark:border-zinc-800">
      <CardHeader className="py-0 px-3 sm:px-4 border-b border-zinc-200 dark:border-zinc-800 flex flex-row items-center justify-between shrink-0">
        <CardTitle className="text-[11px] sm:text-xs font-medium uppercase text-muted-foreground tracking-wider flex items-center gap-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[14px] font-normal p-4 capitalize">
              Celkem: <span className="font-bold ml-1">{subtitles.length}</span>
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className={`h-6 px-2 text-[10px] ${isSyncMode ? "text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20" : "text-muted-foreground"}`}
            onClick={() => setIsSyncMode(!isSyncMode)}
          >
            {isSyncMode ? <Link className="w-3 h-3 mr-1" /> : <Unlink className="w-3 h-3 mr-1" />}
            {isSyncMode ? "Sync ZAP" : "Sync VYP"}
          </Button>
        </CardTitle>

        {/* Nástroje v hlavičce (Hromadné operace) */}
        <div className="flex items-center gap-1">
          
          {selectedSubtitleIds.size > 0 && (
            <>
              {/* Odznáček s křížkem pro zrušení výběru */}
              <div className="flex items-center bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-md overflow-hidden h-6 text-[10px] mr-1">
                <span className="px-2 font-medium">{selectedSubtitleIds.size} vybráno</span>
                <button
                  onClick={() => setSelectedSubtitleIds(new Set())}
                  className="px-1.5 hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors h-full flex items-center justify-center border-l border-blue-200/50 dark:border-blue-800/50"
                  title="Zrušit výběr"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              
              {selectedSubtitleIds.size > 1 && (
                <Button 
                  variant="ghost" size="icon" 
                  className="h-6 w-6 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
                  onClick={handleMergeSelected} title="Sloučit vybrané titulky"
                >
                  <Combine className="w-3.5 h-3.5" />
                </Button>
              )}
              
              <Button 
                variant="ghost" size="icon" 
                className="h-6 w-6 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30"
                onClick={handleDeleteSelected} title="Smazat vybrané řádky"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>

              <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800 mx-1"></div>
            </>
          )}

          <Button 
            variant="ghost" size="icon" 
            className="h-6 w-6 text-muted-foreground hover:text-indigo-600 disabled:opacity-30"
            onClick={onSort} disabled={subtitles.length < 2} title="Seřadit časově"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
          </Button>
          
          <Button 
            variant="ghost" size="icon" 
            className="h-6 w-6 text-muted-foreground disabled:opacity-30"
            onClick={onUndo} disabled={!canUndo} title="Zpět (Undo)"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </Button>

          <Button 
            variant="ghost" size="icon" 
            className="h-6 w-6 text-muted-foreground disabled:opacity-30"
            onClick={onRedo} disabled={!canRedo} title="Znovu (Redo)"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </Button>

          <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800 mx-1"></div>

          {/* Smazat VŠE - Pevně na konci, vždy dostupné! */}
          <Button 
            variant="ghost" size="icon" 
            className="h-6 w-6 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
            onClick={onClearSubtitles} disabled={subtitles.length === 0} title="Vymazat VŠECHNY titulky"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>

        </div>
      </CardHeader>

      {/* Obal pro tabulku a VS Code markery */}
      <div className="flex-1 relative flex flex-col min-h-0 overflow-hidden">
        
        <CardContent ref={parentRef} className="flex-1 overflow-y-auto p-0 relative w-full" onClick={() => setSelectedSubtitleIds(new Set())}>
          <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: "100%", position: "relative" }}>
            {rowVirtualizer.getVirtualItems().map((virtualItem) => {
              // ... (tvůj stávající kód uvnitř .map() zůstává BEZE ZMĚNY)
              const sub = subtitles[virtualItem.index];
              const index = virtualItem.index;
              const isPlaying = sub.id === activeSubtitleId;
              const isSelected = selectedSubtitleIds.has(sub.id);
              
              let rowClasses = "hover:bg-zinc-50 dark:hover:bg-zinc-800/50 border-l-2 border-l-transparent";
              if (isSelected) {
                rowClasses = "bg-blue-50/80 dark:bg-blue-900/20 border-l-2 border-l-blue-400";
              } else if (isPlaying) {
                rowClasses = "bg-indigo-50/60 dark:bg-indigo-500/10 border-l-2 border-l-indigo-500";
              }
              
              return (
                <div
                  key={virtualItem.key}
                  style={{
                    position: "absolute", top: 0, left: 0, width: "100%", height: `${virtualItem.size}px`,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                  className={`group px-2 py-1 transition-colors flex flex-col md:flex-row md:items-center gap-1.5 md:gap-3 cursor-pointer border-b border-zinc-100 dark:border-zinc-800/50 select-none ${rowClasses}`}
                  onClick={(e) => { e.stopPropagation(); handleRowInteraction(e, sub.id, index, sub.startTime); }}
                >
                  <div className="flex items-center justify-between md:justify-start gap-1.5 shrink-0">
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] font-mono text-muted-foreground w-8 md:w-10 text-left font-semibold">
                        #{index + 1}
                      </span>
                      
                      <div className="flex items-center gap-0.5 text-[11px] font-mono bg-zinc-100/50 dark:bg-zinc-800/50 px-1 py-0.5 rounded border border-zinc-200/60 dark:border-zinc-700/50" onClick={e => e.stopPropagation()}>
                        <Input
                          value={sub.startTime}
                          onChange={(e) => setSubtitles(prev => prev.map(s => s.id === sub.id ? { ...s, startTime: e.target.value } : s))}
                          className="h-5 w-24 md:w-28 text-[10px] md:text-[11px] font-mono px-1 border-none bg-transparent! text-center focus-visible:ring-1 focus-visible:ring-indigo-500"
                        />
                        <span className="text-muted-foreground text-[10px] opacity-40 px-0.5">-</span>
                        <Input
                          value={sub.endTime}
                          onChange={(e) => setSubtitles(prev => prev.map(s => s.id === sub.id ? { ...s, endTime: e.target.value } : s))}
                          className="h-5 w-24 md:w-28 text-[10px] md:text-[11px] font-mono px-1 border-none bg-transparent! text-center focus-visible:ring-1 focus-visible:ring-indigo-500"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 min-w-0" onClick={e => e.stopPropagation()}>
                    {(() => {
                      const isSearchMatch = searchQuery && sub.text.toLowerCase().includes(searchQuery.toLowerCase());
                      const inputBg = isSelected 
                        ? 'bg-white/60 dark:bg-black/40' 
                        : isSearchMatch 
                          ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700/50 ring-1 ring-amber-400' 
                          : 'bg-white dark:bg-zinc-900/90';

                      return (
                        <Input
                          value={sub.text}
                          onChange={(e) => {
                            const newText = e.target.value;
                            setSubtitles((prev) => prev.map((s) => (s.id === sub.id ? { ...s, text: newText } : s)));
                          }}
                          onKeyDown={(e) => handleTextKeyDown(e, sub, index)}
                          className={`w-full h-7 text-xs border-zinc-200 dark:border-zinc-800/80 focus-visible:ring-indigo-500 ${inputBg}`}
                        />
                      );
                    })()}
                  </div>

                  <div className="hidden md:flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-emerald-600 hover:bg-emerald-50" onClick={(e) => { e.stopPropagation(); handleAddRow(index); }} title="Vložit řádek pod">
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-red-600 hover:bg-red-50" onClick={(e) => { e.stopPropagation(); handleDeleteRow(sub.id); }} title="Smazat řádek">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>

        {/* --- SCROLLBAR MINIMAP (Značky vyhledávání - VS Code style) --- */}
        {searchQuery && searchMatchIndexes.length > 0 && (
          // Přidal jsem jemný py-1, aby první a poslední značka nebyla "uřízlá" okrajem
          <div className="absolute top-[17px] right-2 bottom-[17px] w-1.5 pointer-events-none z-50 opacity-90">
            {searchMatchIndexes.map(index => {
              // Matematicky přesný výpočet středu řádku vůči celkové výšce
              const itemHeight = isMobile ? 74 : 44;
              const totalHeight = Math.max(1, subtitles.length * itemHeight);
              const itemCenter = (index * itemHeight) + (itemHeight / 2);
              
              const topPercent = (itemCenter / totalHeight) * 100;
              
              return (
                <div 
                  key={index}
                  className="absolute right-0 w-full h-[3px] bg-amber-400 dark:bg-amber-500 shadow-[0_0_4px_rgba(245,158,11,0.8)] rounded-sm"
                  style={{ 
                    top: `${topPercent}%`, 
                    transform: 'translateY(-50%)'
                  }}
                />
              );
            })}
          </div>
        )}

      </div>
    </Card>
  );
}