// Změna v route.ts: Přidání kontroly signalu a oprava modelu

import { NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const BATCH_SIZE = 40;

export async function POST(req: Request) {
  try {
    const { subtitles, targetLanguage = "Czech" } = await req.json();

    if (!subtitles || !Array.isArray(subtitles) || subtitles.length === 0) {
      return NextResponse.json({ error: "Chybí data titulků." }, { status: 400 });
    }

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
            // Pokud klient zrušil požadavek (AbortController), ukončíme smyčku na serveru
            if (req.signal.aborted) {
              break;
            }

            const batch = itemsToTranslate.slice(i, i + BATCH_SIZE);
            const currentBatchIndex = Math.floor(i / BATCH_SIZE) + 1;

            const systemInstruction = `
              Jsi špičkový profesionální překladatel filmových a seriálových titulků.
              Automaticky detekuj původní jazyk titulků a přelož je do cílového jazyka: "${targetLanguage}".

              DŮLEŽITÉ POKYNY:
              1. PŘIROZENOST A KONTEXT: Překládej idiomy, slang a hovorový jazyk přirozeně s ohledem na kulturu a zvyklosti cílového jazyka (např. americké/evropské reálie přizpůsob tak, aby dávaly v kontextu scény smysl).
              2. POHLAVÍ A TYKÁNÍ/VYKÁNÍ: Dbej na kontinuitu dialogu mezi postavami (v češtině/němčině atd. hlídej tykání/vykání, v angličtině přirozený tón).
              3. FORMÁTOVÁNÍ:
                - Zachovej původní rozdělení a délku řádků tak, aby se text pohodlně četl.
                - Ponech odřádkování (\\n) a HTML/SRT značky (např. <i>...</i>, <b>...</b>).
                - Zachovej přesně klíč "id" – nesmí se změnit.
              4. VLASTNÍ JMÉNA: Názvy ulic, měst a vlastní jména postav NEPŘEKLÁDEJ doslovně, pokud nemají v cílovém jazyce etablovaný oficiální překlad.
              `;

            const response = await ai.models.generateContent({
              model: "gemini-3.7-flash", // Použij standardní produkční název modelu
              contents: `Přelož následující dávku titulků:\n\n${JSON.stringify(batch)}`,
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
              throw new Error(`Model nevrátil text pro dávku ${currentBatchIndex}.`);
            }

            const parsedBatch: { id: string; text: string }[] = JSON.parse(responseText);

            const chunkData = JSON.stringify({
              batch: parsedBatch,
              currentBatch: currentBatchIndex,
              totalBatches,
            }) + "\n";

            controller.enqueue(encoder.encode(chunkData));
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
    console.error("Gemini API Error:", details);
    return NextResponse.json(
      { error: "Selhal překlad pomocí AI.", details },
      { status: 500 }
    );
  }
}