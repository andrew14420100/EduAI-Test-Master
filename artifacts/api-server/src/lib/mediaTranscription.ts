import { createWriteStream } from "node:fs";
import { access, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pipeline } from "node:stream/promises";
import type { File } from "@google-cloud/storage";
import { aiTranscribe } from "./aiProvider.ts";
import { isMeaningfulText, normalizeText } from "./contentStudy.ts";
import { MAX_MEDIA_UPLOAD_BYTES } from "./mediaLimits.ts";

const execFileAsync = promisify(execFile);

const MAX_AUDIO_TRANSCRIPTION_BYTES = 24 * 1024 * 1024;
const MAX_MEDIA_DURATION_SECONDS = 75 * 60;
const TRANSCRIPTION_CHUNK_SECONDS = 8 * 60;
const TRANSCRIPTION_ATTEMPTS = 3;
const MAX_MEDIA_TRANSCRIPT_CHARS = 300_000;

export type MediaTranscriptionResult =
  | { status: "ready"; text: string; error: null }
  | { status: "unsupported"; text: null; error: string }
  | { status: "failed"; text: null; error: string };

type ProbeResult = {
  duration: number | null;
  hasAudio: boolean;
};

function mediaLimitMessage() {
  return "Il file supera il limite di 250 MB previsto per l'analisi audio o video.";
}

async function commandAvailable(command: "ffmpeg" | "ffprobe") {
  try {
    await access(`/usr/bin/${command}`);
    return true;
  } catch {
    try {
      await execFileAsync(command, ["-version"], {
        maxBuffer: 8 * 1024,
        timeout: 10_000,
        killSignal: "SIGKILL",
      });
      return true;
    } catch {
      return false;
    }
  }
}

async function probeMedia(inputPath: string): Promise<ProbeResult> {
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration:stream=codec_type",
      "-of",
      "json",
      inputPath,
    ],
    { maxBuffer: 64 * 1024, timeout: 30_000, killSignal: "SIGKILL" },
  );
  const parsed = JSON.parse(stdout) as {
    format?: { duration?: string };
    streams?: Array<{ codec_type?: string }>;
  };
  const duration = Number(parsed.format?.duration);
  return {
    duration: Number.isFinite(duration) && duration >= 0 ? duration : null,
    hasAudio: Boolean(parsed.streams?.some((stream) => stream.codec_type === "audio")),
  };
}

async function extractAudioChunks(sourcePath: string, outputPattern: string) {
  await execFileAsync(
    "ffmpeg",
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
       sourcePath,
      "-map",
      "0:a:0",
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-b:a",
      "32k",
       "-f",
       "segment",
       "-segment_time",
       String(TRANSCRIPTION_CHUNK_SECONDS),
       "-reset_timestamps",
       "1",
       outputPattern,
    ],
    { maxBuffer: 64 * 1024, timeout: 15 * 60_000, killSignal: "SIGKILL" },
  );
}

async function transcribeFile(filePath: string) {
  const audio = await readFile(filePath);
  return (await aiTranscribe(audio, "audio.m4a")).text;
}

async function transcribeWithRetry(filePath: string, chunkNumber: number) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= TRANSCRIPTION_ATTEMPTS; attempt++) {
    try {
      return await transcribeFile(filePath);
    } catch (error) {
      lastError = error;
      if (attempt < TRANSCRIPTION_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1_500));
      }
    }
  }
  throw new Error(
    `La parte ${chunkNumber} dell'audio non è stata trascritta dopo ${TRANSCRIPTION_ATTEMPTS} tentativi.`,
    { cause: lastError },
  );
}

async function cleanTemporaryDirectory(directory: string) {
  await rm(directory, { recursive: true, force: true }).catch(() => undefined);
}

/**
 * Transcribe private audio or video without buffering the media in Node memory.
 * The source is converted to compact mono audio and split into short segments.
 * Segment retries make long lectures recoverable instead of failing as one request.
 */
export async function transcribeMediaObject(params: {
  objectFile: File;
  contentType: string;
  size: number | null;
}): Promise<MediaTranscriptionResult> {
  const { objectFile, contentType, size } = params;
  if (size !== null && size > MAX_MEDIA_UPLOAD_BYTES) {
    return { status: "failed", text: null, error: mediaLimitMessage() };
  }
  if (!(await commandAvailable("ffprobe"))) {
    return {
      status: "failed",
      text: null,
      error: "Il motore di analisi audio non è disponibile al momento. Riprova più tardi.",
    };
  }

  const isVideo = contentType.toLowerCase().startsWith("video/");
  const directory = await mkdtemp(join(tmpdir(), "eduai-media-"));
  const sourceExtension = isVideo
    ? ".mp4"
    : contentType.includes("mpeg")
      ? ".mp3"
      : contentType.includes("wav")
        ? ".wav"
        : contentType.includes("aac")
          ? ".aac"
          : ".m4a";
  const sourcePath = join(directory, `source${sourceExtension}`);
  const chunkPattern = join(directory, "speech-%03d.mp3");

  try {
    await pipeline(objectFile.createReadStream(), createWriteStream(sourcePath));
    const sourceInfo = await stat(sourcePath);
    if (sourceInfo.size > MAX_MEDIA_UPLOAD_BYTES) {
      return { status: "failed", text: null, error: mediaLimitMessage() };
    }

    const probe = await probeMedia(sourcePath);
    if (probe.duration !== null && probe.duration > MAX_MEDIA_DURATION_SECONDS) {
      return {
        status: "failed",
        text: null,
        error: "Il media supera la durata massima di 75 minuti prevista per la trascrizione.",
      };
    }
    if (!probe.hasAudio) {
      return {
        status: "unsupported",
        text: null,
        error: isVideo
          ? "Il video non contiene una traccia audio: non è possibile ricavare testo per verifiche o flashcard."
          : "Il file audio non contiene una traccia leggibile per la trascrizione.",
      };
    }

    if (!(await commandAvailable("ffmpeg"))) {
      return {
        status: "failed",
        text: null,
        error: "Il motore di estrazione audio non è disponibile al momento. Riprova più tardi.",
      };
    }

    await extractAudioChunks(sourcePath, chunkPattern);
    const chunks = (await readdir(directory))
      .filter((name) => /^speech-\d{3}\.mp3$/.test(name))
      .sort()
      .map((name) => join(directory, name));
    if (chunks.length === 0) {
      return {
        status: "failed",
        text: null,
        error: "Non è stato possibile preparare l'audio per la trascrizione.",
      };
    }
    for (const chunk of chunks) {
      const info = await stat(chunk);
      if (info.size > MAX_AUDIO_TRANSCRIPTION_BYTES) {
        return {
          status: "failed",
          text: null,
          error: "Una parte dell'audio è troppo grande per essere trascritta in sicurezza.",
        };
      }
    }

    const transcribedChunks: string[] = [];
    for (let index = 0; index < chunks.length; index += 1) {
      transcribedChunks.push(
        await transcribeWithRetry(chunks[index]!, index + 1),
      );
    }
    const text = normalizeText(
      transcribedChunks.join("\n\n"),
      MAX_MEDIA_TRANSCRIPT_CHARS,
    );
    if (!isMeaningfulText(text)) {
      return {
        status: "unsupported",
        text: null,
        error: "Non è stato rilevato parlato sufficiente per creare contenuti di studio affidabili.",
      };
    }
    return { status: "ready", text, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/no such file|not found|ENOENT/i.test(message)) {
      return {
        status: "failed",
        text: null,
        error: "Il motore di analisi del media non è disponibile al momento. Riprova più tardi.",
      };
    }
    return {
      status: "failed",
      text: null,
      error: "La trascrizione non è riuscita. Controlla il file e riprova più tardi.",
    };
  } finally {
    await cleanTemporaryDirectory(directory);
  }
}