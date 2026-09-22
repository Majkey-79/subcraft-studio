// components/editor/EditorVideoPlayer.tsx
"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { 
  Film, Play, Pause, Volume2, VolumeX, 
  Maximize, Minimize, RotateCcw, RotateCw, Gauge 
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import type { SubtitleItem } from "@/lib/utils";

interface Props {
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  audioRef?: React.RefObject<HTMLAudioElement | null>;
  videoUrl: string | null;
  audioUrl?: string | null;
  currentTime: number;
  setCurrentTime: (time: number) => void;
  activeSubtitle?: SubtitleItem;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  togglePlay: () => void;
}

const formatTime = (seconds: number) => {
  if (isNaN(seconds)) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function EditorVideoPlayer({ 
  videoRef: externalVideoRef,
  audioRef: externalAudioRef,
  videoUrl, 
  audioUrl,
  currentTime, 
  setCurrentTime, 
  activeSubtitle,
  isPlaying,
  setIsPlaying,
  togglePlay
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  
  const internalVideoRef = useRef<HTMLVideoElement | null>(null);
  const videoRef = externalVideoRef || internalVideoRef;

  const internalAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioRef = externalAudioRef || internalAudioRef;

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isHoveringControls, setIsHoveringControls] = useState(false);
  const [videoError, setVideoError] = useState(false);
  
  // NOVÝ STAV PRO RYCHLOST PŘEHRÁVÁNÍ
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  // Aplikování rychlosti na obě stopy
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
      videoRef.current.preservesPitch = true;
    }
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
      audioRef.current.preservesPitch = true;
    }
  }, [playbackRate, videoUrl, audioUrl]);

  // --- AKTIVNÍ A/V SYNCHRONIZAČNÍ SMYČKA (MASTER-SLAVE) ---
  useEffect(() => {
    const updateLoop = () => {
      const vid = videoRef.current;
      const aud = audioRef.current;

      const activeMedia = aud || vid;
      const isAnyPlaying = (vid && !vid.paused) || (aud && !aud.paused);

      if (activeMedia && isAnyPlaying) {
        const currentPos = activeMedia.currentTime;
        setCurrentTime(currentPos);

        // Pokud máme obě stopy a drift je větší než 80ms, srovnáme video k audiu
        if (vid && aud && !videoError) {
          const drift = vid.currentTime - aud.currentTime;
          if (Math.abs(drift) > 0.08) {
            vid.currentTime = aud.currentTime;
          }
        }

        animFrameRef.current = requestAnimationFrame(updateLoop);
      }
    };

    if (isPlaying) {
      animFrameRef.current = requestAnimationFrame(updateLoop);
    } else if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, setCurrentTime, videoError]);

  // Pomocná synchronizace při Seeku (posunu na časové ose)
  const performSeek = useCallback((newTime: number) => {
    const vid = videoRef.current;
    const aud = audioRef.current;

    setCurrentTime(newTime);
    if (vid) vid.currentTime = newTime;
    if (aud) aud.currentTime = newTime;

    if (isPlaying) {
      if (vid && vid.paused) vid.play().catch(() => {});
      if (aud && aud.paused) aud.play().catch(() => {});
    }
  }, [isPlaying, setCurrentTime]);

  // Autohide ovládacích prvků
  useEffect(() => {
    if (isPlaying && !isHoveringControls && !showSpeedMenu) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setShowControls(false), 2500);
    } else {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setShowControls(true);
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isPlaying, isHoveringControls, showSpeedMenu]);

  const handleMouseMove = () => {
    setShowControls(true);
    if (isPlaying && !isHoveringControls && !showSpeedMenu) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setShowControls(false), 2500);
    }
  };

  const handleMouseLeaveContainer = () => {
    if (isPlaying && !isHoveringControls && !showSpeedMenu) setShowControls(false);
    setShowSpeedMenu(false); // Zavře menu rychlosti při opuštění přehrávače
  };

  const handleSkip = useCallback((seconds: number) => {
    const primary = audioRef.current || videoRef.current;
    if (primary) {
      const maxDur = duration || primary.duration || 0;
      const newTime = Math.max(0, Math.min(maxDur, primary.currentTime + seconds));
      performSeek(newTime);
    }
  }, [duration, performSeek]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(err => console.warn(err));
    } else {
      document.exitFullscreen();
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
      switch (e.code) {
        case "ArrowLeft":
          e.preventDefault();
          handleSkip(-10);
          break;
        case "ArrowRight":
          e.preventDefault();
          handleSkip(10);
          break;
        case "Space":
          e.preventDefault();
          togglePlay();
          break;
        case "KeyF":
          e.preventDefault();
          toggleFullscreen();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlay, handleSkip, toggleFullscreen]);

  // Synchronizace při prokliku myší přes tabulku / externí čas
  useEffect(() => {
    const aud = audioRef.current;
    const vid = videoRef.current;
    const target = aud || vid;

    if (target && Math.abs(target.currentTime - currentTime) > 0.15) {
      if (aud) aud.currentTime = currentTime;
      if (vid) vid.currentTime = currentTime;
    }
  }, [currentTime]);

  // Synchronizace hlasitosti
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = audioUrl ? 0 : volume;
      videoRef.current.muted = audioUrl ? true : isMuted;
    }
    if (audioRef.current) {
      audioRef.current.volume = volume;
      audioRef.current.muted = isMuted;
    }
  }, [volume, isMuted, audioUrl]);

  return (
    <div 
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeaveContainer}
      className="flex-1 flex flex-col items-center justify-center bg-black rounded-xl relative overflow-hidden min-h-[250px] group"
    >
      {videoUrl ? (
        <>
          <div className="w-full h-full relative flex items-center justify-center" onClick={() => setShowSpeedMenu(false)}>
            {videoError && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-zinc-900 text-zinc-400">
                <Film className="w-12 h-12 mb-3 opacity-20" />
                <p className="text-sm font-medium mb-1 text-zinc-300">Nepodporovaný kodek videa</p>
                <p className="text-xs opacity-70">Přehrává se extrahovaná zvuková stopa</p>
              </div>
            )}
            
            <video
              ref={videoRef}
              src={videoUrl}
              muted={!!audioUrl}
              playsInline
              className={`w-full h-full object-contain cursor-pointer transition-opacity duration-300 ${videoError ? "opacity-0 pointer-events-none" : "opacity-100"}`}
              onClick={(e) => {
                e.stopPropagation();
                setShowSpeedMenu(false);
                togglePlay();
              }}
              onLoadStart={() => setVideoError(false)}
              onError={() => setVideoError(true)}
              onLoadedMetadata={(e) => {
                setVideoError(false);
                if (!audioUrl) setDuration(e.currentTarget.duration);
              }}
              onEnded={() => setIsPlaying(false)}
            />
            
            {audioUrl && (
              <audio
                ref={audioRef}
                src={audioUrl}
                onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                onEnded={() => setIsPlaying(false)}
              />
            )}
          </div>

          <div className={`absolute left-4 right-4 text-center pointer-events-none transition-all duration-300 ${showControls ? "bottom-20" : "bottom-6"}`}>
            {activeSubtitle ? (
              <span className="inline-block bg-black/80 text-white font-medium text-sm md:text-base px-3 py-1.5 rounded-md backdrop-blur-sm shadow-lg max-w-[90%] font-mono">
                {activeSubtitle.text}
              </span>
            ) : null}
          </div>

          <div 
            onMouseEnter={() => setIsHoveringControls(true)}
            onMouseLeave={() => setIsHoveringControls(false)}
            className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-4 pb-3 pt-12 transition-opacity duration-300 ${
              showControls ? "opacity-100" : "opacity-0"
            }`}
          >
            <div className="mb-3 flex items-center gap-2 group/slider">
              <Slider
                value={[currentTime]}
                max={duration || 100}
                step={0.01}
                onValueChange={(val) => {
                  const newTime = Array.isArray(val) ? val[0] : val;
                  performSeek(newTime);
                }}
                className="cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between text-white">
              <div className="flex items-center gap-4">
                <button onClick={togglePlay} className="hover:text-indigo-400 transition-colors">
                  {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
                </button>
                
                <div className="flex items-center gap-2 group/volume relative">
                  <button onClick={() => setIsMuted(!isMuted)} className="hover:text-indigo-400 transition-colors">
                    {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                  </button>
                  <div className="w-0 overflow-hidden group-hover/volume:w-20 transition-all duration-300 ease-in-out">
                    <Slider
                      value={[isMuted ? 0 : volume]}
                      max={1}
                      step={0.05}
                      onValueChange={(val) => {
                        const newVol = Array.isArray(val) ? val[0] : val;
                        setVolume(newVol);
                        if (newVol > 0) setIsMuted(false);
                      }}
                      className="w-full"
                    />
                  </div>
                </div>

                <div className="text-xs font-mono font-medium opacity-90 select-none hidden sm:block">
                  {formatTime(currentTime)} <span className="opacity-50">/</span> {formatTime(duration)}
                </div>
              </div>

              <div className="flex items-center gap-3 relative">
                
                {/* MENU RYCHLOSTI PŘEHRÁVÁNÍ */}
                <div className="relative flex items-center">
                  <button 
                    onClick={() => setShowSpeedMenu(!showSpeedMenu)} 
                    className={`hover:text-indigo-400 transition-colors flex items-center gap-1 text-xs font-mono font-medium px-2 py-1 rounded ${showSpeedMenu ? 'bg-white/10 text-indigo-400' : ''}`}
                    title="Rychlost přehrávání"
                  >
                    <Gauge className="w-3.5 h-3.5" />
                    {playbackRate}x
                  </button>
                  
                  {showSpeedMenu && (
                    <div className="absolute bottom-full right-0 mb-2 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl overflow-hidden py-1 min-w-[80px] z-50 animate-in fade-in zoom-in-95 duration-100">
                      {PLAYBACK_RATES.map((rate) => (
                        <button
                          key={rate}
                          onClick={() => {
                            setPlaybackRate(rate);
                            setShowSpeedMenu(false);
                          }}
                          className={`w-full text-left px-3 py-1.5 text-xs font-mono hover:bg-indigo-600 transition-colors ${playbackRate === rate ? 'text-indigo-400 bg-white/5 hover:text-white' : 'text-zinc-300'}`}
                        >
                          {rate === 1 ? 'Normální' : `${rate}x`}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="w-px h-4 bg-zinc-700 mx-1"></div>

                <button onClick={() => handleSkip(-10)} className="hover:text-indigo-400 transition-colors opacity-80 hover:opacity-100" title="-10s">
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button onClick={() => handleSkip(10)} className="hover:text-indigo-400 transition-colors opacity-80 hover:opacity-100" title="+10s">
                  <RotateCw className="w-4 h-4" />
                </button>
                <button onClick={toggleFullscreen} className="hover:text-indigo-400 transition-colors ml-1">
                  {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="text-center p-6 text-zinc-500">
          <Film className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p className="text-xs">Nahrajte video v levém panelu pro živý náhled titulků</p>
        </div>
      )}
    </div>
  );
}