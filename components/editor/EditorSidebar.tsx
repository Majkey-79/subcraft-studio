"use client";

import React, { useRef, useState } from "react";
import { 
  Upload, Film, Clock, Languages, Wand2, FileText, ChevronDown, 
  ChevronUp, Settings2, Gauge, Square, Sparkles, Download, AudioLines, X, Search, MonitorPlay
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LinearSyncPanel } from "./LinearSyncPanel"; 
import { FpsSyncPanel } from "./FpsSyncPanel";
import type { SubtitleItem } from "@/lib/utils";
import { VideoTranscribePanel } from "./VideoTranscribePanel";
import { VideoBurnPanel } from "./VideoBurnPanel";
import { escapeRegExp } from "@/lib/utils";

interface Props {
  subtitleFileName?: string;
  subtitleCount?: number;
  videoFile?: File | null;
  audioBlob?: Blob | null;
  isExtractingAudio?: boolean;
  extractionProgress?: number;
  onSubtitleDrop: (file: File) => void;
  onSubtitleRemove?: () => void;
  onVideoUpload: (file: File, url: string) => void;
  onVideoRemove?: () => void;
  onTimeShift: (seconds: number) => void;
  setSubtitles: React.Dispatch<React.SetStateAction<SubtitleItem[]>>;
  onTranslate: (targetLang: string, onlyUnfinished?: boolean) => void;
  onCancelTranslate: () => void;
  isTranslating: boolean;
  translationProgress?: number;
  onExport?: (format: 'srt' | 'vtt' | 'txt') => void;
  sourceLang: string;
  setSourceLang: (lang: string) => void;
  targetLang: string;
  setTargetLang: (lang: string) => void;
  audioLang: string;
  setAudioLang: (lang: string) => void;
  hasSubtitles?: boolean;
  subtitles: SubtitleItem[];
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  onReplace: (search: string, replace: string, matchCase: boolean, replaceAll: boolean) => void;
  selectedCount?: number;
}

const CollapsibleSection = ({ 
  title, 
  icon: Icon, 
  children, 
  defaultOpen = true 
}: { 
  title: string; 
  icon: React.ElementType; 
  children: React.ReactNode;
  defaultOpen?: boolean;  
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="space-y-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
      >
        <span className="flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" /> {title}</span>
        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      <div className={`grid transition-all duration-200 ease-in-out ${isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="overflow-hidden">
          <div className="pt-2">{children}</div>
        </div>
      </div>
    </div>
  );
};

export function EditorSidebar({
  subtitleFileName,
  subtitleCount = 0,
  videoFile,
  audioBlob,
  isExtractingAudio = false,  
  extractionProgress = 0,
  onSubtitleDrop,
  onSubtitleRemove,
  onVideoUpload,
  onVideoRemove,
  onTimeShift,
  setSubtitles,
  onTranslate,
  onCancelTranslate,
  isTranslating,
  translationProgress = 0,
  onExport,
  sourceLang,
  setSourceLang,
  targetLang,
  setTargetLang,
  audioLang,
  setAudioLang,
  hasSubtitles,
  subtitles,
  searchQuery,
  setSearchQuery,
  onReplace,
  selectedCount
}: Props) {
  const [customShift, setCustomShift] = useState<string>("0");
  const [exportFormat, setExportFormat] = useState<'srt' | 'vtt' | 'txt'>('srt');
  const [replaceText, setReplaceText] = useState("");
  const [matchCase, setMatchCase] = useState(false);

 
  const [isDragOverSub, setIsDragOverSub] = useState<boolean>(false);
  const [isDragOverVideo, setIsDragOverVideo] = useState<boolean>(false);

  const subInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const handleSubFiles = (files: FileList | null) => {
    if (files && files.length > 0) onSubtitleDrop(files[0]);
  };

  const handleVideoFiles = (files: FileList | null) => {
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith("video/") || file.name.match(/\.(mp4|webm|mov|mkv)$/i)) {
        const url = URL.createObjectURL(file);
        onVideoUpload(file, url);
      }
    }
  };

  // Spočítá počet aktuálních výskytů hledaného slova
  const searchOccurrences = React.useMemo(() => {
    if (!searchQuery) return 0;
    try {
      const regex = new RegExp(escapeRegExp(searchQuery), matchCase ? 'g' : 'gi');
      return subtitles.reduce((acc, sub) => {
        const matches = sub.text.match(regex);
        return acc + (matches ? matches.length : 0);
      }, 0);
    } catch {
      return 0;
    }
  }, [searchQuery, subtitles, matchCase]);

  return (
    <aside className="w-full h-full bg-white dark:bg-zinc-900 flex flex-col p-4 gap-4 overflow-y-auto">

      {/* Integrované záhlaví v horní části sidebaru */}
      <div className="space-y-3 pb-3 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 p-1.5 rounded-lg text-primary shrink-0">
              <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="font-semibold text-xs leading-none">SubCraft Studio</h1> 
              <p className="text-[10px] text-muted-foreground mt-0.5">Editor & AI titulky</p>
            </div>
          </div>

          {/* Přepínač témat + Dokonalý Split-button pro Export */}
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            
            {/* Obal tlačítka, který zaručí stejnou výšku a zaoblení obou částí */}
            <div 
              className={`flex items-stretch h-8 rounded-md bg-indigo-600 text-white shadow-sm overflow-hidden transition-all ${
                subtitleCount === 0 
                  ? 'opacity-50 pointer-events-none' // Zšedne a zakáže klikání, když nejsou titulky
                  : 'focus-within:ring-2 focus-within:ring-indigo-500 focus-within:ring-offset-1 dark:focus-within:ring-offset-zinc-950'
              }`}
            >
              
              {/* Hlavní tlačítko exportu */}
              <button 
                onClick={() => onExport?.(exportFormat)}
                title={`Exportovat jako .${exportFormat.toUpperCase()}`}
                className="flex items-center justify-center px-2.5 text-xs font-medium hover:bg-indigo-700 transition-colors border-r border-indigo-800/50 outline-none"
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                <span>{exportFormat.toUpperCase()}</span>
              </button>
              
              {/* Dropdown zobáček */}
              <DropdownMenu>
                <DropdownMenuTrigger 
                  className="flex items-center justify-center px-1.5 hover:bg-indigo-700 transition-colors outline-none"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[100px] border-zinc-200 dark:border-zinc-800">
                  <DropdownMenuItem className="text-xs font-mono cursor-pointer" onClick={() => { setExportFormat('srt'); onExport?.('srt'); }}>
                    Formát .SRT
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-xs font-mono cursor-pointer" onClick={() => { setExportFormat('vtt'); onExport?.('vtt'); }}>
                    Formát .VTT
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-xs font-mono cursor-pointer" onClick={() => { setExportFormat('txt'); onExport?.('txt'); }}>
                    Formát .TXT
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
            </div>
          </div>
        </div>

        {/* Informační badge o počtu řádků  */}
        {/*
        {subtitleCount > 0 && (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] font-normal py-0.5 px-2">
              Celkem řádků: <span className="font-semibold ml-1">{subtitleCount}</span>
            </Badge>
          </div>
        )}
            
       */}
      </div>

      <input ref={subInputRef} type="file" accept=".srt,.vtt" className="hidden" onChange={(e) => handleSubFiles(e.target.files)} />
      <input ref={videoInputRef} type="file" accept="video/*,.mp4,.webm,.mov,.mkv" className="hidden" onChange={(e) => handleVideoFiles(e.target.files)} />

      {/* Vložit zdroje */}
      <div className="space-y-2.5">
        <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          Vložit zdroje
        </h2>

        {/* Dropzone - Titulky */}
        <div
          onClick={() => subInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragOverSub(true); }}
          onDragLeave={() => setIsDragOverSub(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragOverSub(false); handleSubFiles(e.dataTransfer.files); }}
          className={`border-2 border-dashed rounded-xl p-3 text-center cursor-pointer transition-all duration-150 ${
            isDragOverSub
              ? "border-indigo-500 bg-indigo-500/10 scale-[1.01]"
              : subtitleFileName
              ? "border-emerald-500/50 bg-emerald-500/5 dark:bg-emerald-500/10"
              : "border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/40 hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
          }`}
        >
          {subtitleFileName ? (
            <div className="flex items-center justify-between gap-2 text-left">
              <div className="flex items-center gap-2 overflow-hidden flex-1">
                <FileText className="w-4 h-4 text-emerald-500 shrink-0" />
                <div className="overflow-hidden">
                  <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 truncate" title={subtitleFileName}>{subtitleFileName}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {subtitleCount > 0 ? `${subtitleCount} řádků` : "Klikněte pro změnu"}
                  </p>
                </div>
              </div>

              {onSubtitleRemove && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 shrink-0 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation(); // Zabránění vyvolání dialogu výběru souboru
                    if (subInputRef.current) subInputRef.current.value = "";
                    onSubtitleRemove();
                  }}
                  title="Odebrat titulky"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          ) : (
            <>
              <Upload className="w-4 h-4 mx-auto mb-1 text-zinc-400" />
              <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Přetáhněte titulky (.SRT, .VTT)</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">nebo klikněte pro výběr</p>
            </>
          )}
        </div>

        {/* Dropzone pro Video */}
        <div
          onClick={() => videoInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragOverVideo(true); }}
          onDragLeave={() => setIsDragOverVideo(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragOverVideo(false); handleVideoFiles(e.dataTransfer.files); }}
          className={`border-2 border-dashed rounded-xl p-3 text-center cursor-pointer transition-all duration-150 ${
            isDragOverVideo
              ? "border-indigo-500 bg-indigo-500/10 scale-[1.01]"
              : videoFile
              ? "border-indigo-500/50 bg-indigo-500/5 dark:bg-indigo-500/10"
              : "border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/40 hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
          }`}
        >
          {videoFile ? (
            <div className="flex items-center justify-between gap-2 text-left">
              <div className="flex items-center gap-2 overflow-hidden flex-1">
                <Film className="w-4 h-4 text-indigo-500 shrink-0" />
                <div className="overflow-hidden">
                  <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400 truncate" title={videoFile.name}>{videoFile.name}</p>
                  <p className="text-[10px] text-muted-foreground">Klikněte pro změnu videa</p>
                </div>
              </div>

              {/* Tlačítko pro odebrání videa */}
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 shrink-0 transition-colors"
                onClick={(e) => {
                  e.stopPropagation(); // Zabránění vyvolání file dialogu při kliknutí na křížek
                  if (videoInputRef.current) videoInputRef.current.value = "";
                  if (onVideoRemove) onVideoRemove();
                }}
                title="Odebrat video"
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          ) : (
            <>
              <Film className="w-4 h-4 mx-auto mb-1 text-zinc-400" />
              <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Přetáhněte video</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">nebo klikněte pro výběr</p>
            </>
          )}
        </div>
      </div>

      <CollapsibleSection title="Hledat a nahradit" icon={Search} defaultOpen={false}>
        <div className="space-y-2.5">
          <div className="space-y-1.5">
              <Input 
                placeholder="Hledat..." 
                value={searchQuery} 
                onChange={e => setSearchQuery(e.target.value)} 
                className=" h-8 text-xs! bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-indigo-500/50" 
              />
             <Input 
               placeholder="Nahradit za..." 
               value={replaceText} 
               onChange={e => setReplaceText(e.target.value)} 
               className="h-8 text-xs! bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-indigo-500/50" 
             />
          </div>

          <div className="flex items-center justify-between">
            <button 
              onClick={() => setMatchCase(!matchCase)}
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded transition-colors ${matchCase ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' : 'text-muted-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
              title="Rozlišovat velká a malá písmena"
            >
              Aa (Velikost)
            </button>
            <span className="text-[10px] text-muted-foreground font-mono">
              Výskytů: <span className="font-bold text-zinc-900 dark:text-zinc-100">{searchOccurrences}</span>
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <Button 
              size="sm" 
              variant="secondary" 
              className="h-7 text-xs" 
              disabled={searchOccurrences === 0}
              onClick={() => onReplace(searchQuery, replaceText, matchCase, false)}
            >
              Nahradit další
            </Button>
            <Button 
              size="sm" 
              className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700 text-white" 
              disabled={searchOccurrences === 0}
              onClick={() => onReplace(searchQuery, replaceText, matchCase, true)}
            >
              Nahradit vše
            </Button>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection 
        title={`Přečasování ${selectedCount && selectedCount > 0 ? `(${selectedCount} vybraných)` : "(Vše)"}`} 
        icon={Clock}
        defaultOpen={false}
      >
       <div className="space-y-2">
          <div className="grid grid-cols-2 gap-1.5">
            <Button variant="outline" size="sm" onClick={() => onTimeShift(-0.5)} className="text-xs font-mono h-8">-0.5s</Button>
            <Button variant="outline" size="sm" onClick={() => onTimeShift(0.5)} className="text-xs font-mono h-8">+0.5s</Button>
            <Button variant="outline" size="sm" onClick={() => onTimeShift(-1.0)} className="text-xs font-mono h-8">-1.0s</Button>
            <Button variant="outline" size="sm" onClick={() => onTimeShift(1.0)} className="text-xs font-mono h-8">+1.0s</Button>
          </div>
          <div className="flex gap-1.5">
            <Input type="number" step="0.1" value={customShift} onChange={(e) => setCustomShift(e.target.value)} placeholder="Sekundy" className="h-8 text-xs font-mono" />
            <Button size="sm" variant="secondary" className="h-8 text-xs shrink-0" onClick={() => onTimeShift(parseFloat(customShift) || 0)}>
              Aplikovat
            </Button>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Změna FPS" icon={Gauge} defaultOpen={false}>
        <FpsSyncPanel setSubtitles={setSubtitles} />
      </CollapsibleSection>

      <CollapsibleSection title="Dvoubodová Sync" icon={Settings2} defaultOpen={false}>
        <LinearSyncPanel setSubtitles={setSubtitles} />
      </CollapsibleSection>

      {/* --- NOVÁ SEKCE PRO VYPALOVÁNÍ --- */}
      <CollapsibleSection title="Export do MP4 (Hardsubs)" icon={MonitorPlay} defaultOpen={false}>
        <VideoBurnPanel 
          videoFile={videoFile || null} 
          subtitles={subtitles} 
        />
      </CollapsibleSection>

      {/* Transkripce z videa (před překladem) */}
      <CollapsibleSection title="AI Transkripce" icon={AudioLines} defaultOpen={true}>
        <VideoTranscribePanel 
          videoFile={videoFile}
          audioBlob={audioBlob}
          isExtractingAudio={isExtractingAudio}
          extractionProgress={extractionProgress}
          setSubtitles={setSubtitles} 
          audioLang={audioLang}
          setAudioLang={setAudioLang}
        />
      </CollapsibleSection>

      <CollapsibleSection title="AI Překlad" icon={Languages} defaultOpen={false}>
        <div className="space-y-2.5">
          {/* Výběr zdrojového a cílového jazyka vedle sebe */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <span className="text-[10px] font-medium text-muted-foreground">Z jazyka</span>
              <Select value={sourceLang} onValueChange={(val) => val && setSourceLang(val)} disabled={isTranslating}>
                <SelectTrigger className="w-full h-8 text-xs bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800">
                  <SelectValue placeholder="Zdroj" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto detekce</SelectItem>
                  <SelectItem value="fr">Français</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="de">Deutsch</SelectItem>
                  <SelectItem value="es">Español</SelectItem>
                  <SelectItem value="it">Italiano</SelectItem>
                  <SelectItem value="cs">Čeština</SelectItem>
                  <SelectItem value="sk">Slovenčina</SelectItem>
                  <SelectItem value="pl">Polski</SelectItem>                  
                  <SelectItem value="jp">日本語</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] font-medium text-muted-foreground">Do jazyka</span>
              <Select value={targetLang} onValueChange={(val) => val && setTargetLang(val)} disabled={isTranslating}>
                <SelectTrigger className="w-full h-8 text-xs bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800">
                  <SelectValue placeholder="Cíl" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cs">Čeština</SelectItem>
                  <SelectItem value="sk">Slovenčina</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="de">Deutsch</SelectItem>
                  <SelectItem value="fr">Français</SelectItem>
                  <SelectItem value="es">Español</SelectItem>
                  <SelectItem value="it">Italiano</SelectItem>
                  <SelectItem value="pl">Polski</SelectItem>              
                  <SelectItem value="jp">日本語</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* Tlačítko akce pod selecty */}
          {isTranslating ? (
            <Button 
              className="w-full h-8 text-xs gap-1.5 bg-red-600 hover:bg-red-700 text-white"
              onClick={onCancelTranslate}
            >
              <Square className="w-3.5 h-3.5 fill-current shrink-0" />
              <span>Zastavit překlad</span>
            </Button>
          ) : (
            <Button 
              className="w-full h-8 text-xs gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
              onClick={() => onTranslate(targetLang, false)}
              disabled={!hasSubtitles}
            >
              <Wand2 className="w-3.5 h-3.5 shrink-0" />
              <span>Přeložit vše ({subtitleCount > 0 ? subtitleCount : 0})</span>
            </Button>
          )}

          {!isTranslating && subtitleFileName && (
            <Button 
              variant="outline"
              className="w-full h-7 text-xs gap-1.5 border-dashed"
              onClick={() => onTranslate(targetLang, true)}
            >
              <Wand2 className="w-3 h-3 text-indigo-500" />
              <span>Přeložit pouze zbývající</span>
            </Button>
          )}

          {isTranslating && (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                <span>Průběh překladu</span>
                <span className="font-semibold text-indigo-600 dark:text-indigo-400">{translationProgress}%</span>
              </div>
              <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-indigo-600 h-full transition-all duration-300 ease-out rounded-full"
                  style={{ width: `${translationProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </CollapsibleSection>

    </aside>
  );
}