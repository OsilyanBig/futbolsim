import fixWebmDuration from "fix-webm-duration";

/**
 * Canvas + ses akışını MediaRecorder ile kaydeder.
 * Tarayıcının desteklediği en iyi formatı seçer (MP4/H.264 → WebM/VP9 → WebM/VP8).
 */

export interface RecorderSupport {
  supported: boolean;
  mimeType: string | null;
  extension: "mp4" | "webm" | null;
  label: string;
  reason?: string;
}

const CANDIDATES: { mime: string; ext: "mp4" | "webm"; label: string }[] = [
  { mime: "video/mp4;codecs=avc1.42E01F,mp4a.40.2", ext: "mp4", label: "MP4 (H.264 + AAC)" },
  { mime: "video/mp4;codecs=avc1,mp4a.40.2", ext: "mp4", label: "MP4 (H.264 + AAC)" },
  { mime: "video/webm;codecs=vp9,opus", ext: "webm", label: "WebM (VP9 + Opus)" },
  { mime: "video/webm;codecs=vp8,opus", ext: "webm", label: "WebM (VP8 + Opus)" },
  { mime: "video/webm", ext: "webm", label: "WebM" },
  { mime: "video/mp4", ext: "mp4", label: "MP4" },
];

export function detectRecorderSupport(): RecorderSupport {
  if (typeof window === "undefined") {
    return { supported: false, mimeType: null, extension: null, label: "—" };
  }
  if (typeof MediaRecorder === "undefined") {
    return {
      supported: false,
      mimeType: null,
      extension: null,
      label: "Desteklenmiyor",
      reason: "Bu tarayıcıda MediaRecorder API yok. Güncel Chrome, Edge, Firefox veya Safari 14.1+ kullanın.",
    };
  }
  const canvas = document.createElement("canvas");
  if (typeof (canvas as HTMLCanvasElement).captureStream !== "function") {
    return {
      supported: false,
      mimeType: null,
      extension: null,
      label: "Desteklenmiyor",
      reason: "Bu tarayıcı canvas.captureStream() desteklemiyor.",
    };
  }
  const isSupported = typeof MediaRecorder.isTypeSupported === "function" ? MediaRecorder.isTypeSupported.bind(MediaRecorder) : () => false;
  for (const c of CANDIDATES) {
    if (isSupported(c.mime)) return { supported: true, mimeType: c.mime, extension: c.ext, label: c.label };
  }
  // isTypeSupported yoksa varsayılan formata güven
  return { supported: true, mimeType: null, extension: "webm", label: "Tarayıcı varsayılanı" };
}

export class VideoRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private stopPromise: Promise<Blob> | null = null;
  private support: RecorderSupport;
  startedAt = 0;

  constructor() {
    this.support = detectRecorderSupport();
  }

  get isRecording() {
    return this.recorder?.state === "recording";
  }

  get extension() {
    return this.support.extension ?? "webm";
  }

  start(canvas: HTMLCanvasElement, audio: MediaStream | null, fps = 60) {
    if (!this.support.supported) throw new Error(this.support.reason ?? "Video kaydı desteklenmiyor.");
    if (this.isRecording) return;

    const video = canvas.captureStream(fps);
    const tracks = [...video.getVideoTracks(), ...(audio ? audio.getAudioTracks() : [])];
    this.stream = new MediaStream(tracks);
    this.chunks = [];

    const options: MediaRecorderOptions = {
      videoBitsPerSecond: 10_000_000,
      audioBitsPerSecond: 160_000,
    };
    if (this.support.mimeType) options.mimeType = this.support.mimeType;

    const rec = new MediaRecorder(this.stream, options);
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    this.stopPromise = new Promise<Blob>((resolve) => {
      rec.onstop = () => {
        const type = rec.mimeType || this.support.mimeType || "video/webm";
        resolve(new Blob(this.chunks, { type: type.split(";")[0] }));
        // Yalnızca video izini durdur; ses akışı ses motoruna ait, tekrar kullanılacak
        video.getTracks().forEach((t) => t.stop());
      };
    });
    rec.start(250);
    this.recorder = rec;
    this.startedAt = performance.now();
  }

  async stop(): Promise<Blob | null> {
    if (!this.recorder || !this.stopPromise) return null;
    if (this.recorder.state !== "inactive") this.recorder.stop();
    const raw = await this.stopPromise;
    const durationMs = performance.now() - this.startedAt;
    this.recorder = null;
    this.stopPromise = null;
    // Chrome'un MediaRecorder çıktısında WebM süre bilgisi yok → oynatıcılarda ileri sarma bozulur. Düzelt.
    if (raw.type.includes("webm")) {
      try {
        return await fixWebmDuration(raw, durationMs, { logger: false });
      } catch {
        return raw;
      }
    }
    return raw;
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function safeFileName(s: string) {
  return (
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/ı/g, "i")
      .replace(/İ/g, "I")
      .replace(/[^a-zA-Z0-9-_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "mac"
  );
}
