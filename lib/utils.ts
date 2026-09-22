// lib/utils.ts
export { cn } from "cn";

export interface SubtitleItem {
  id: string;
  startTime: string;
  endTime: string;
  text: string;
}

/**
 * Bezpečně převede časový řetězec SRT ("00:01:20,500" i "00:01:20.500") na sekundy.
 * Ošetřeno proti crashi při neplatném nebo prázdném řetězci.
 */
export const srtTimeToSeconds = (timeString: string): number => {
  if (!timeString) return 0;
  try {
    const normalized = timeString.replace(',', '.');
    const parts = normalized.split(':');
    
    if (parts.length < 3) return 0;

    const hours = parseFloat(parts[0]) || 0;
    const minutes = parseFloat(parts[1]) || 0;
    const seconds = parseFloat(parts[2]) || 0;

    return hours * 3600 + minutes * 60 + seconds;
  } catch {
    return 0;
  }
};

/**
 * Převede sekundy na SRT časový formát (HH:MM:SS,mmm)
 */
export const formatSecondsToSRT = (totalSeconds: number): string => {
  if (isNaN(totalSeconds) || totalSeconds < 0) return "00:00:00,000";

  // Převést rovnou na celočíselné milisekundy pro zamezení plovoucí desetinné čárky
  const totalMs = Math.round(totalSeconds * 1000);
  
  const h = Math.floor(totalMs / 3600000);
  const m = Math.floor((totalMs % 3600000) / 60000);
  const s = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
};

/**
 * Seřadí pole titulků chronologicky podle počátečního času (startTime)
 */
export function sortSubtitles(subtitles: SubtitleItem[]): SubtitleItem[] {
  return [...subtitles].sort((a, b) => {
    return srtTimeToSeconds(a.startTime) - srtTimeToSeconds(b.startTime);
  });
}

/**
 * Escapuje speciální znaky pro bezpečné použití v Regulárních výrazech
 */
export function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}