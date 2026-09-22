// app/api/transcribe-agent/route.ts
import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";

// --- INICIALIZACE GOOGLE CLOUD CREDENTIALS ---
if (process.env.GCP_CREDENTIALS) {
  const keyPath = path.join("/tmp", "gcp-key.json");
  if (!fs.existsSync(keyPath)) {
    fs.writeFileSync(keyPath, process.env.GCP_CREDENTIALS);
  }
  process.env.GOOGLE_APPLICATION_CREDENTIALS = keyPath;
}

const projectId = process.env.GOOGLE_CLOUD_PROJECT || "nexus-webapp-504800";
const location = process.env.GOOGLE_CLOUD_LOCATION || "global";

const ai = new GoogleGenAI({
  vertexai: true,
  project: projectId,
  location: location,
});

// Převede sekundy/offset (např. "1.250s" nebo 1.25) na SRT formát HH:MM:SS,mmm s přičtením timeOffsetu
function formatSecondsToSRTTime(secondsStr: string | number, offsetSeconds: number = 0): string {
  let seconds = 0;
  if (typeof secondsStr === "string") {
    seconds = parseFloat(secondsStr.replace("s", "")) || 0;
  } else if (typeof secondsStr === "number") {
    seconds = secondsStr;
  }

  const totalMillis = Math.max(0, Math.round((seconds + offsetSeconds) * 1000));
  const hours = Math.floor(totalMillis / 3600000);
  const minutes = Math.floor((totalMillis % 3600000) / 60000);
  const secs = Math.floor((totalMillis % 60000) / 1000);
  const millis = totalMillis % 1000;

  const pad = (num: number, size: number = 2) => String(num).padStart(size, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)},${pad(millis, 3)}`;
}

// Inteligentní seskupování slov do přirozených titulků s lookahead ochranou proti osamoceným slovům
function groupWordsIntoSubtitles(
  words: Array<{ word?: string; text?: string; startOffset?: string; start_offset?: string; endOffset?: string; end_offset?: string }>,
  timeOffset: number
) {
  const subtitles = [];
  let currentBlockWords: typeof words = [];

  const parseSec = (val?: string | number) => {
    if (typeof val === "number") return val;
    if (typeof val === "string") return parseFloat(val.replace("s", "")) || 0;
    return 0;
  };

  const getWordText = (w?: (typeof words)[0]) => (w?.word || w?.text || "").trim();

  for (let i = 0; i < words.length; i++) {
    const currentWord = words[i];
    currentBlockWords.push(currentWord);

    const isLastWord = i === words.length - 1;
    const nextWord = words[i + 1];
    const afterNextWord = words[i + 2];

    const currentText = getWordText(currentWord);
    const currentEnd = parseSec(currentWord.endOffset || currentWord.end_offset);

    let pauseDuration = 0;
    let nextStart = currentEnd;
    if (nextWord) {
      nextStart = parseSec(nextWord.startOffset || nextWord.start_offset);
      pauseDuration = Math.max(0, nextStart - currentEnd);
    }

    // Detekce konce věty (tečka, otazník, vykřičník)
    const endsWithSentencePunctuation = /[.?!]$/.test(currentText);

    // --- LOOKAHEAD ANALÝZA ---
    let shouldSplit = false;

    if (isLastWord) {
      // 1. Konec celého chunku
      shouldSplit = true;
    } else if (endsWithSentencePunctuation) {
      // 2. Narazili jsme na konec věty -> přirozené místo pro rozdělení
      shouldSplit = true;
    } else if (pauseDuration > 0.6) {
      // 3. Výrazná pauza v mluvení (>0.6s) -> rozdělit podle dechu řečníka
      shouldSplit = true;
    } else if (currentBlockWords.length >= 7) {
      // 4. Dosažen preferovaný počet slov (7 slov).
      // Zkontrolujeme následující 1-2 slova, abychom nevytvořili "sirotka" na konci věty:
      const nextWordText = getWordText(nextWord);
      const nextIsSentenceEnd = /[.?!]$/.test(nextWordText);
      
      const afterNextWordText = getWordText(afterNextWord);
      const afterNextIsSentenceEnd = /[.?!]$/.test(afterNextWordText);

      // Pokud další slovo dokončuje větu a není před ním pauza, NEBUDEME teď stříhat
      // Raději toto slovo přibereme do aktuálního titulku v dalším kroku cyklu
      if (nextIsSentenceEnd && pauseDuration < 0.4) {
        shouldSplit = false;
      } 
      // Pokud je věta u konce za 2 slova a celkově nepřesáhneme 9 slov, také ještě počkáme
      else if (currentBlockWords.length === 7 && afterNextIsSentenceEnd && pauseDuration < 0.3) {
        shouldSplit = false;
      } 
      // Pokud už máme 9 nebo více slov, rozdělíme bezpečně, aby titulek nebyl příliš dlouhý
      else if (currentBlockWords.length >= 9) {
        shouldSplit = true;
      } 
      else {
        shouldSplit = true;
      }
    }

    if (shouldSplit && currentBlockWords.length > 0) {
      const firstWord = currentBlockWords[0];
      const lastWord = currentBlockWords[currentBlockWords.length - 1];

      const startRawSec = parseSec(firstWord.startOffset || firstWord.start_offset);
      let endRawSec = parseSec(lastWord.endOffset || lastWord.end_offset);

      // --- DOLADĚNÍ ČASOVÁNÍ PRO POHODLNÉ ČTENÍ (PACING) ---
      const MIN_DURATION = 1.3; // Min. doba zobrazení v sekundách
      const EXTENSION_PAD = 0.5; // Přídavek do ticha pro plynulý dojezd

      let targetEndSec = endRawSec + EXTENSION_PAD;

      // Zajištění minimální délky zobrazení
      if (targetEndSec - startRawSec < MIN_DURATION) {
        targetEndSec = startRawSec + MIN_DURATION;
      }

      // Bezpečnostní mezera před dalším slovem (80ms)
      if (nextWord) {
        const maxAllowedEnd = nextStart - 0.08;
        if (targetEndSec > maxAllowedEnd) {
          targetEndSec = Math.max(endRawSec, maxAllowedEnd);
        }
      }

      const blockText = currentBlockWords
        .map((w) => getWordText(w))
        .filter(Boolean)
        .join(" ");

      if (blockText) {
        subtitles.push({
          id: crypto.randomUUID(),
          startTime: formatSecondsToSRTTime(startRawSec, timeOffset),
          endTime: formatSecondsToSRTTime(targetEndSec, timeOffset),
          text: blockText,
        });
      }

      currentBlockWords = [];
    }
  }

  return subtitles;
}

// Pomocná funkce pro automatický retry při vyčerpání Rate Limitu (429 / Quota)
async function generateWithRetry(requestPayload: any, maxRetries = 8) {
  const retryDelays = [10000, 20000, 30000, 45000, 60000, 75000, 90000, 120000];

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await ai.models.generateContent(requestPayload);
    } catch (err: any) {
      const isRateLimit =
        err?.status === 429 ||
        String(err?.message).includes("RESOURCE_EXHAUSTED") ||
        String(err?.message).toLowerCase().includes("quota");

      if (isRateLimit && attempt < maxRetries) {
        const waitTime = retryDelays[attempt - 1] || 30000;
        console.warn(
          `⏳ [Rate Limit 429] Uvolňuji Google Cloud kvótu, čekám ${waitTime / 1000}s před pokusem ${attempt + 1}/${maxRetries}...`
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      } else {
        throw err;
      }
    }
  }
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const language = (formData.get("language") as string) || "cs-CZ";
    const timeOffset = parseFloat((formData.get("timeOffset") as string) || "0");

    console.log(`\n🎙️ [Transcribe Request] Chunk Offset: ${timeOffset}s, Jazyk: ${language}, Velikost: ${file?.size}B`);

    if (!file || file.size === 0) {
      return NextResponse.json({ error: "Audio soubor nebyl přiložen." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = file.type || "audio/wav";

    const response: any = await generateWithRetry({
      model: "gemini-3.5-transcribe-preview",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                data: base64Audio,
                mimeType: mimeType,
              },
            },
          ],
        },
      ],
      config: {
        audioTranscriptionConfig: {
          wordTimestamp: true,
          languageCodes: [language],
        },
      } as any,
    });

    let subtitles: Array<{ id: string; startTime: string; endTime: string; text: string }> = [];

    const part = response?.candidates?.[0]?.content?.parts?.[0] as any;
    const audioTx = part?.audioTranscription || part?.audio_transcription;

    if (audioTx?.words && Array.isArray(audioTx.words) && audioTx.words.length > 0) {
      console.log(`✅ Detekováno ${audioTx.words.length} slov s časovými razítky.`);
      subtitles = groupWordsIntoSubtitles(audioTx.words, timeOffset);
    } else if (response?.text && response.text.trim()) {
      console.log(`ℹ️ Model vrátil textový blok: "${response.text}"`);
      subtitles = [
        {
          id: crypto.randomUUID(),
          startTime: formatSecondsToSRTTime(0, timeOffset),
          endTime: formatSecondsToSRTTime(60, timeOffset),
          text: response.text.trim(),
        },
      ];
    } else {
      console.warn("⚠️ V této části audia nebyla detekována žádná mluvená řeč.");
    }

    console.log(`📤 Odesílám ${subtitles.length} přesně oříznutých titulků na frontend.\n`);
    return NextResponse.json({ subtitles });
  } catch (error: unknown) {
    console.error("❌ [GC Agent AI Transcribe Error]:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    return NextResponse.json(
      { error: "Při cloudové transkripci došlo k chybě.", details: errorMessage },
      { status: 500 }
    );
  }
}