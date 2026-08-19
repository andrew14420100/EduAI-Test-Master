import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pipeline } from "node:stream/promises";
import type { File } from "@google-cloud/storage";
import { openai } from "@workspace/integrations-openai-ai-server";
import { isMeaningfulText, normalizeText } from "./contentStudy";
import { MAX_MEDIA_UPLOAD_BYTES } from "./mediaLimits";

const execFileAsync = promisify(execFile);

const MAX_AUDIO_TRANSCRIPTION_BYTES = 24 * 1024 * 1024;
const MAX_MEDIA_DURATION_SECONDS = 75 * 60;

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

async function extractAudio(videoPath: string, audioPath: string) {
  await execFileAsync(
    "ffmpeg",
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      videoPath,
      "-map",
      "0:a:0",
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-b:a",
      "32k",
      audioPath,
    ],
    { maxBuffer: 64 * 1024, timeout: 10 * 60_000, killSignal: "SIGKILL" },
  );
}

async function transcribeFile(filePath: string) {
  const response = await openai.audio.transcriptions.create(
    {
      file: createReadStream(filePath),
      model: "gpt-4o-mini-transcribe",
      language: "it",
      response_format: "text",
    },
    { timeout: 10 * 60_000 },
  );
  // The managed Replit client is configured for response_format="text", whose
  // runtime response is a string even though the upstream SDK narrows it here.
  return response as unknown as string;
}

async function cleanTemporaryDirectory(directory: string) {
  await rm(directory, { recursive: true, force: true }).catch(() => undefined);
}

/**
 * Transcribe private audio or video without buffering the media in Node memory.
 * Audio is sent directly to the transcription provider. Video is first converted
 * to a small mono audio track in a temporary directory.
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
  const extractedAudioPath = join(directory, "speech.mp3");

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

    let fileToTranscribe = sourcePath;
    if (isVideo) {
      if (!(await commandAvailable("ffmpeg"))) {
        return {
          status: "failed",
          text: null,
          error: "Il motore di estrazione audio non è disponibile al momento. Riprova più tardi.",
        };
      }
      await extractAudio(sourcePath, extractedAudioPath);
      const audioInfo = await stat(extractedAudioPath);
      if (audioInfo.size > MAX_AUDIO_TRANSCRIPTION_BYTES) {
        return {
          status: "failed",
          text: null,
          error: "La traccia audio del video è troppo grande per essere trascritta in sicurezza.",
        };
      }
      fileToTranscribe = extractedAudioPath;
    } else if (sourceInfo.size > MAX_AUDIO_TRANSCRIPTION_BYTES) {
      return {
        status: "failed",
        text: null,
        error: "Il file audio supera il limite di 24 MB del servizio di trascrizione.",
      };
    }

    const text = normalizeText(await transcribeFile(fileToTranscribe));
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