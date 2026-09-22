// lib/srtParser.ts
import { srtTimeToSeconds, formatSecondsToSRT, SubtitleItem } from "./utils";

/**
 * Inteligentní parser, který automaticky detekuje a zpracuje SRT, WebVTT a MicroDVD (.sub).
 */
export function parseSubtitlesAuto(rawContent: string, defaultFps: number = 23.976): SubtitleItem[] {
  const content = rawContent.trim();
  if (!content) return [];

  // 1. DETEKCE: MicroDVD formát {123}{456}Text
  if (/^\{\d+\}\{\d+\}/m.test(content)) {
    const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
    let detectedFps = defaultFps;
    const parsed: SubtitleItem[] = [];

    for (const line of lines) {
      const match = line.match(/^\{(\d+)\}\{(\d+)\}(.*)$/);
      if (!match) continue;

      const startFrame = parseInt(match[1], 10);
      const endFrame = parseInt(match[2], 10);
      const rawText = match[3] || "";

      // Zkusit najít deklaraci FPS na prvním řádku
      if (startFrame === 1 && endFrame === 1) {
        const fpsMatch = rawText.match(/^([\d.]+)/);
        if (fpsMatch) {
          const fpsVal = parseFloat(fpsMatch[1]);
          if (!isNaN(fpsVal) && fpsVal > 0) {
            detectedFps = fpsVal;
            continue;
          }
        }
      }

      // Ignorovat vodoznaky a reklamy na začátku
      if (startFrame <= 25 && /titulky\.com/i.test(rawText)) continue;

      const startSeconds = startFrame / detectedFps;
      const endSeconds = endFrame / detectedFps;
      const formattedText = rawText.replace(/\|/g, "\n").trim();

      if (formattedText) {
        parsed.push({
          id: crypto.randomUUID(),
          startTime: formatSecondsToSRT(startSeconds),
          endTime: formatSecondsToSRT(endSeconds),
          text: formattedText,
        });
      }
    }
    return sanitizeSubtitles(parsed);
  }

  // 2. DETEKCE: Klasické SRT nebo WebVTT
  const cleanText = content.replace(/^```(srt|vtt)?/gi, "").replace(/```$/gi, "").trim();
  const blocks = cleanText.split(/\n\r?\n/);
  const rawSubtitles: SubtitleItem[] = [];

  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;

    const timeLineIndex = lines.findIndex(l => l.includes("-->"));
    if (timeLineIndex === -1) continue;

    const timeLine = lines[timeLineIndex];
    const [rawStart, rawEnd] = timeLine.split("-->").map((t) => t.trim().replace(".", ","));
    
    // U WebVTT vyčistíme metadata z pravé strany času
    const cleanEnd = rawEnd.split(/\s+/)[0];
    const text = lines.slice(timeLineIndex + 1).join("\n").trim();

    if (rawStart && cleanEnd) {
      rawSubtitles.push({
        id: crypto.randomUUID(),
        startTime: rawStart,
        endTime: cleanEnd,
        text: text || "",
      });
    }
  }

  return sanitizeSubtitles(rawSubtitles);
}

/**
 * Opravuje halucinované časy z AI (např. end < start nebo nepřirozeně dlouhé trvání)
 */
function sanitizeSubtitles(subs: SubtitleItem[]): SubtitleItem[] {
  const MAX_SINGLE_SUB_DURATION_SEC = 12; // Maximální rozumná délka jednoho titulku

  return subs.map((sub, index) => {
    let startSec = srtTimeToSeconds(sub.startTime);
    let endSec = srtTimeToSeconds(sub.endTime);
    const nextSub = subs[index + 1];
    const nextStartSec = nextSub ? srtTimeToSeconds(nextSub.startTime) : Infinity;

    // 1. Chyba: End time je menší než Start time
    if (endSec < startSec) {
      if (nextStartSec !== Infinity && startSec > nextStartSec) {
        startSec = Math.max(0, nextStartSec - 3);
      }
      endSec = startSec + 2.5;
    }

    // 2. Chyba: Titulek trvá příliš dlouho nebo přetéká do dalšího titulku
    const duration = endSec - startSec;
    if (duration > MAX_SINGLE_SUB_DURATION_SEC || endSec > nextStartSec) {
      if (nextStartSec !== Infinity && nextStartSec > startSec) {
        endSec = Math.min(startSec + MAX_SINGLE_SUB_DURATION_SEC, nextStartSec - 0.1);
      } else {
        endSec = startSec + Math.min(duration, MAX_SINGLE_SUB_DURATION_SEC);
      }
    }

    return {
      ...sub,
      startTime: formatSecondsToSRT(startSec),
      endTime: formatSecondsToSRT(endSec),
    };
  });
}