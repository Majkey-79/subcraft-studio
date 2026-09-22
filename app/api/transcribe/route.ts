import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// PŘIDÁN PARAMETR offsetSeconds
function formatSecondsToSRTTime(secondsStr: string, offsetSeconds: number = 0): string {
  const seconds = (parseFloat(secondsStr.replace("s", "")) || 0) + offsetSeconds;
  const totalMillis = Math.max(0, Math.round(seconds * 1000));
  
  const hours = Math.floor(totalMillis / 3600000);
  const minutes = Math.floor((totalMillis % 3600000) / 60000);
  const secs = Math.floor((totalMillis % 60000) / 1000);
  const millis = totalMillis % 1000;

  const pad = (num: number, size: number = 2) => String(num).padStart(size, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)},${pad(millis, 3)}`;
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const language = (formData.get("language") as string) || "cs-CZ";
    const timeOffset = parseFloat((formData.get("timeOffset") as string) || "0"); // NOVÉ

    console.log("Transcribe language:", language, "Offset:", timeOffset);

    if (!file || file.size === 0) {
      return NextResponse.json({ error: "Audio soubor nebyl přiložen." }, { status: 400 });
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: "Na serveru chybí GEMINI_API_KEY." }, { status: 500 });
    }

    const uploadResult = await ai.files.upload({
      file: file,
      config: { mimeType: file.type || "audio/wav" },
    });

    const interaction = await ai.interactions.create({
      model: "gemini-3.5-transcribe",
      input: [
        { type: "audio", uri: uploadResult.uri, mime_type: uploadResult.mimeType },
      ],
      generation_config: {
        transcription_config: {
          language_codes: language ? [language] : [],
          mode: { type: "verbatim", timestamp_granularities: ["word"] },
        },
      },
    });

    type ContentItem = { annotations?: Array<{ type: string; text: string; start_offset: string; end_offset: string; }>; };
    const words: Array<{ text: string; start_offset: string; end_offset: string }> = [];

    for (const step of interaction.steps ?? []) {
      const stepContent = "content" in step ? (step as { content?: ContentItem[] }).content : undefined;
      for (const content of stepContent ?? []) {
        for (const annotation of content.annotations ?? []) {
          if (annotation.type === "word_info") words.push(annotation);
        }
      }
    }

    if (words.length === 0) return NextResponse.json({ subtitles: [] });

    const subtitles = [];
    let currentBlockWords: typeof words = [];

    for (let i = 0; i < words.length; i++) {
      const currentWord = words[i];
      currentBlockWords.push(currentWord);

      const isLastWord = i === words.length - 1;
      const nextWord = words[i + 1];

      let pauseDuration = 0;
      if (nextWord) {
        const currentEnd = parseFloat(currentWord.end_offset.replace("s", "")) || 0;
        const nextStart = parseFloat(nextWord.start_offset.replace("s", "")) || 0;
        pauseDuration = nextStart - currentEnd;
      }

      const endsWithSentencePunctuation = /[.?!]$/.test(currentWord.text.trim());

      if (isLastWord || currentBlockWords.length >= 7 || pauseDuration > 0.8 || endsWithSentencePunctuation) {
        const firstWord = currentBlockWords[0];
        const lastWord = currentBlockWords[currentBlockWords.length - 1];

        subtitles.push({
          id: crypto.randomUUID(),
          startTime: formatSecondsToSRTTime(firstWord.start_offset, timeOffset), // APLIKOVÁN OFFSET
          endTime: formatSecondsToSRTTime(lastWord.end_offset, timeOffset), // APLIKOVÁN OFFSET
          text: currentBlockWords.map((w) => w.text).join(" "),
        });

        currentBlockWords = [];
      }
    }

    return NextResponse.json({ subtitles });
  } catch (error: unknown) {
    console.error("Transkripce selhala:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStatus = (typeof error === "object" && error !== null && "status" in error && typeof error.status === "number") ? error.status : 500;

    const isQuotaError = errorStatus === 429 || errorMessage.includes("RESOURCE_EXHAUSTED") || errorMessage.toLowerCase().includes("quota") || errorMessage.toLowerCase().includes("rate limit");

    if (isQuotaError) {
      return NextResponse.json({ error: "Byl překročen limit Google API (Quota Exceeded). Chvíli počkejte.", details: errorMessage }, { status: 429 });
    }
    return NextResponse.json({ error: "Při transkripci došlo k chybě.", details: errorMessage }, { status: errorStatus >= 400 && errorStatus < 600 ? errorStatus : 500 });
  }
}