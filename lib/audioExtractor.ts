// lib/audioExtractor.ts
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

let ffmpegInstance: FFmpeg | null = null;

export async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance && ffmpegInstance.loaded) {
    return ffmpegInstance;
  }
  const ffmpeg = new FFmpeg();
  await ffmpeg.load();
  ffmpegInstance = ffmpeg;
  return ffmpeg;
}

export interface ExtractedAudioResult {
  audioBlob: Blob;
  audioUrl: string;
}

export async function extractAudioFromVideoFile(
  videoFile: File | Blob,
  onProgress?: (progress: number) => void
): Promise<ExtractedAudioResult> {
  const ffmpeg = await getFFmpeg();

  if (onProgress) {
    ffmpeg.on("progress", ({ progress }) => {
      onProgress(Math.round(progress * 100));
    });
  }

  const extension = "name" in videoFile && videoFile.name.includes(".")
    ? videoFile.name.substring(videoFile.name.lastIndexOf("."))
    : ".mp4";

  const inputName = "input" + extension;
  const outputName = "audio.wav";

  await ffmpeg.writeFile(inputName, await fetchFile(videoFile));

   // Extrakce do mono WAV 16kHz
  await ffmpeg.exec([
    "-i", inputName,
    "-vn",
    "-af", "aresample=async=1000",
    "-acodec", "pcm_s16le",
    "-ar", "16000",
    "-ac", "1",
    "-fflags", "+bitexact",
    "-flags:a", "+bitexact",
    outputName
  ]);

  const data = await ffmpeg.readFile(outputName);
  const audioBlob = new Blob([data as Uint8Array], { type: "audio/wav" });
  const audioUrl = URL.createObjectURL(audioBlob);

  // Úklid souborů z virtuální paměti FFmpeg
  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile(outputName);

  return { audioBlob, audioUrl };
}

/**
 * Vytvoří standardní 44bajtovou WAV (RIFF) hlavičku pro PCM audio
 */
function createCanonicalWavHeader(
  dataLength: number,
  sampleRate: number = 16000,
  numChannels: number = 1,
  bitsPerSample: number = 16
): ArrayBuffer {
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);

  // RIFF chunk descriptor
  view.setUint8(0, 0x52); // 'R'
  view.setUint8(1, 0x49); // 'I'
  view.setUint8(2, 0x46); // 'F'
  view.setUint8(3, 0x46); // 'F'
  view.setUint32(4, 36 + dataLength, true); // Celková velikost - 8
  view.setUint8(8, 0x57);  // 'W'
  view.setUint8(9, 0x41);  // 'A'
  view.setUint8(10, 0x56); // 'V'
  view.setUint8(11, 0x45); // 'E'

  // "fmt " sub-chunk
  view.setUint8(12, 0x66); // 'f'
  view.setUint8(13, 0x6d); // 'm'
  view.setUint8(14, 0x74); // 't'
  view.setUint8(15, 0x20); // ' '
  view.setUint32(16, 16, true); // Subchunk1Size (16 pro PCM)
  view.setUint16(20, 1, true);  // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // "data" sub-chunk
  view.setUint8(36, 0x64); // 'd'
  view.setUint8(37, 0x61); // 'a'
  view.setUint8(38, 0x74); // 't'
  view.setUint8(39, 0x61); // 'a'
  view.setUint32(40, dataLength, true);

  return buffer;
}

/**
 * Bezpečně rozdělí WAV Blob na menší samostatně přehratelné a validní WAV chunky
 */
export async function chunkWavBlob(blob: Blob, chunkDurationSec: number = 120): Promise<Blob[]> {
  const arrayBuffer = await blob.arrayBuffer();
  const view = new DataView(arrayBuffer);

  // Kontrola RIFF & WAVE signatury
  const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));

  if (riff !== "RIFF" || wave !== "WAVE") {
    throw new Error("Soubor není platný WAV soubor.");
  }

  let sampleRate = 16000;
  let numChannels = 1;
  let bitsPerSample = 16;
  let dataOffset = -1;
  let dataLength = 0;

  // Projdeme jednotlivé RIFF sub-chunky a najdeme přesný začátek 'data'
  let pos = 12;
  while (pos < arrayBuffer.byteLength - 8) {
    const chunkId = String.fromCharCode(
      view.getUint8(pos),
      view.getUint8(pos + 1),
      view.getUint8(pos + 2),
      view.getUint8(pos + 3)
    );
    const chunkSize = view.getUint32(pos + 4, true);

    if (chunkId === "fmt ") {
      numChannels = view.getUint16(pos + 10, true);
      sampleRate = view.getUint32(pos + 12, true);
      bitsPerSample = view.getUint16(pos + 22, true);
    } else if (chunkId === "data") {
      dataOffset = pos + 8;
      dataLength = chunkSize;
      break;
    }

    pos += 8 + chunkSize;
  }

  if (dataOffset === -1) {
    throw new Error("V souboru WAV nebyl nalezen žádný 'data' chunk.");
  }

  const actualDataLength = Math.min(dataLength, arrayBuffer.byteLength - dataOffset);
  const bytesPerSec = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);

  // Zarovnání na celé audio vzorky
  let rawChunkSize = Math.floor(chunkDurationSec * bytesPerSec);
  rawChunkSize = Math.floor(rawChunkSize / blockAlign) * blockAlign;

  const rawPcmData = arrayBuffer.slice(dataOffset, dataOffset + actualDataLength);
  const chunks: Blob[] = [];

  for (let offset = 0; offset < rawPcmData.byteLength; offset += rawChunkSize) {
    const chunkPcm = rawPcmData.slice(offset, offset + rawChunkSize);
    const header = createCanonicalWavHeader(chunkPcm.byteLength, sampleRate, numChannels, bitsPerSample);
    
    // Vytvoříme validní WAV složený z čisté hlavičky + PCM vzorků
    chunks.push(new Blob([header, chunkPcm], { type: "audio/wav" }));
  }

  return chunks;
}