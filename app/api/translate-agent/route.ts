// app/api/translate-agent/route.ts
import { NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import fs from "fs";
import path from "path";

// Inicializace credentials pro Google Cloud
if (process.env.GCP_CREDENTIALS) {
  const keyPath = path.join("/tmp", "gcp-key.json");
  if (!fs.existsSync(keyPath)) {
    fs.writeFileSync(keyPath, process.env.GCP_CREDENTIALS);
  }
  process.env.GOOGLE_APPLICATION_CREDENTIALS = keyPath;
}

const projectId = process.env.GOOGLE_CLOUD_PROJECT || "your-project";
// 🎯 Důležité: us-central1 má pro modely Gemini 3.x stabilní alokované kvóty
const location = process.env.GOOGLE_CLOUD_LOCATION || "global";

const ai = new GoogleGenAI({
  vertexai: true,
  project: projectId,
  location: location,
});

const BATCH_SIZE = 50;

const LANGUAGE_NAMES: Record<string, string> = {
  auto: "Automatická detekce",
  cs: "Čeština",
  en: "Angličtina",
  fr: "Francouzština",
  de: "Němčina",
  es: "Španělština",
  it: "Italština",
  sk: "Slovenčina",
  pl: "Polština",
  jp: "Japonština",
};

// Pomocná funkce pro bezpečné odeslání s automatickým opakováním při 429
async function generateWithRetry(params: any, retries = 8, delay = 1500): Promise<any> {
  try {
    return await ai.models.generateContent(params);
  } catch (error: any) {
    const isRateLimit =
      error?.status === 429 ||
      error?.message?.includes("429") ||
      error?.message?.includes("RESOURCE_EXHAUSTED") ||
      error?.message?.includes("Quota");

    if (isRateLimit && retries > 0) {
      console.warn(`[Vertex AI Translate] 429 Rate limit / Busy node. Čekám ${delay}ms... (zbývá ${retries} pokusů)`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return generateWithRetry(params, retries - 1, delay * 1.5);
    }
    throw error;
  }
}

export async function POST(req: Request) {
  try {
    const { subtitles, sourceLanguage = "auto", targetLanguage = "cs" } = await req.json();

    if (!subtitles || !Array.isArray(subtitles) || subtitles.length === 0) {
      return NextResponse.json({ error: "Chybí data titulků." }, { status: 400 });
    }

    const srcName = LANGUAGE_NAMES[sourceLanguage] || sourceLanguage;
    const tgtName = LANGUAGE_NAMES[targetLanguage] || targetLanguage;

    const itemsToTranslate = subtitles.map((s: { id: string; text: string }) => ({
      id: s.id,
      text: s.text,
    }));

    const totalBatches = Math.ceil(itemsToTranslate.length / BATCH_SIZE);
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for (let i = 0; i < itemsToTranslate.length; i += BATCH_SIZE) {
            if (req.signal.aborted) break;

            const batch = itemsToTranslate.slice(i, i + BATCH_SIZE);
            const currentBatchIndex = Math.floor(i / BATCH_SIZE) + 1;

            const sourceInstruction =
              sourceLanguage === "auto"
                ? "Automaticky detekuj zdrojový jazyk každé repliky"
                : `Zdrojový jazyk je: "${srcName}"`;

            const systemInstruction = `
              Jsi špičkový profesionální filmový překladatel a titulkář.
              ${sourceInstruction} a přelož VŠECHNY texty kompletně do jazyka: "${tgtName}".

              STRIKTNÍ PRAVIDLA KVALITY:
              1. ZÁKAZ PONECHÁNÍ V PŮVODNÍM JAZYCE: Každý řádek MUSÍ být přeložen do jazyka "${tgtName}". Žádný řádek nesmí zůstat nepřeložen (kromě mezinárodních citoslovcí nebo jmen postav).
              2. PŘIROZENÁ MLUVENÁ ŘEČ: Používej přirozené filmové dialogy a idiomy.
              3. KONTINUITA: Udržuj konzistentní tykání/vykání a správné rody sloves (mužský/ženský).
              4. STRUKTURA: Zachovej stejný počet prvků a stejné "id".
            `;

            const response = await generateWithRetry({
              model: "gemini-3.7-flash",
              contents: `Přelož následující JSON pole titulků do jazyka "${tgtName}":\n\n${JSON.stringify(batch)}`,
              config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      text: { type: Type.STRING },
                    },
                    required: ["id", "text"],
                  },
                },
                temperature: 0.3,
              },
            });

            const responseText = response.text;
            if (!responseText) {
              throw new Error(`Model nevrátil data pro dávku ${currentBatchIndex}.`);
            }

            const parsedBatch: { id: string; text: string }[] = JSON.parse(responseText);

            const chunkData =
              JSON.stringify({
                batch: parsedBatch,
                currentBatch: currentBatchIndex,
                totalBatches,
              }) + "\n";

            controller.enqueue(encoder.encode(chunkData));

            // Drobná mikropauza (500ms) mezi dávkami proti rate limitům
            if (i + BATCH_SIZE < itemsToTranslate.length) {
              await new Promise((r) => setTimeout(r, 500));
            }
          }

          controller.close();
        } catch (err: unknown) {
          controller.error(err as Error);
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "application/x-ndjson" },
    });
  } catch (error: unknown) {
    const details = error instanceof Error ? error.message : String(error);
    console.error("[Vertex AI Translate] Chyba:", details);
    return NextResponse.json(
      { error: "Selhal překlad pomocí Vertex AI.", details },
      { status: 500 }
    );
  }
}