"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SoundEngine } from "@/lib/audio/soundEngine";
import { detectRecorderSupport, downloadBlob, safeFileName, VideoRecorder, type RecorderSupport } from "@/lib/recorder/videoRecorder";
import { H, W } from "@/lib/sim/constants";
import { MatchEngine, type EngineStatus } from "@/lib/sim/engine";
import type { MatchConfig, MatchResult, Team } from "@/lib/sim/types";
import TeamEditor from "./TeamEditor";
import Toggle from "./Toggle";

type RecState = "idle" | "recording" | "processing" | "ready";

interface VideoFile {
  blob: Blob;
  url: string;
  name: string;
}

const DEFAULT_TEAMS: [Team, Team] = [
  { name: "Aslanlar", color: "#e11d48", logo: null },
  { name: "Kartallar", color: "#2563eb", logo: null },
];

export default function Simulator() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<MatchEngine | null>(null);
  const soundRef = useRef<SoundEngine | null>(null);
  const recorderRef = useRef<VideoRecorder | null>(null);

  const [teams, setTeams] = useState<[Team, Team]>(DEFAULT_TEAMS);
  const [title, setTitle] = useState("DÖNEN KALE KUPASI · FİNAL");
  const [caption, setCaption] = useState("Sence kim kazanır? 👇");
  const [extraTime, setExtraTime] = useState(true);
  const [goldenGoal, setGoldenGoal] = useState(false);
  const [goalSpeed, setGoalSpeed] = useState(1);
  const [muted, setMuted] = useState(false);
  const [recordOnStart, setRecordOnStart] = useState(true);
  const [autoDownload, setAutoDownload] = useState(false);

  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [recState, setRecState] = useState<RecState>("idle");
  const [recSeconds, setRecSeconds] = useState(0);
  const [video, setVideo] = useState<VideoFile | null>(null);
  const [support, setSupport] = useState<RecorderSupport | null>(null);
  const [message, setMessage] = useState<{ type: "info" | "error" | "success"; text: string } | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);

  const config: MatchConfig = useMemo(
    () => ({ title, caption, teams, extraTime, goldenGoal, goalSpeed }),
    [title, caption, teams, extraTime, goldenGoal, goalSpeed],
  );

  // En güncel değerlere callback'lerden erişmek için
  const latest = useRef({ config, autoDownload, video });
  latest.current = { config, autoDownload, video };

  const fileName = useCallback((ext: string, score?: [number, number]) => {
    const [a, b] = latest.current.config.teams;
    const s = score ? `-${score[0]}-${score[1]}` : "";
    return `${safeFileName(a.name)}-vs-${safeFileName(b.name)}${s}-9x16.${ext}`;
  }, []);

  const finalizeRecording = useCallback(
    async (download: boolean, score?: [number, number]) => {
      const rec = recorderRef.current;
      if (!rec || !rec.isRecording) return null;
      setRecState("processing");
      const blob = await rec.stop();
      if (!blob || blob.size === 0) {
        setRecState("idle");
        setMessage({ type: "error", text: "Kayıt boş döndü. Sekme arka planda kalmış olabilir; tekrar deneyin." });
        return null;
      }
      if (latest.current.video) URL.revokeObjectURL(latest.current.video.url);
      const file: VideoFile = { blob, url: URL.createObjectURL(blob), name: fileName(rec.extension, score) };
      setVideo(file);
      setRecState("ready");
      setMessage({ type: "success", text: `Video hazır (${(blob.size / 1024 / 1024).toFixed(1)} MB).` });
      if (download) downloadBlob(blob, file.name);
      return file;
    },
    [fileName],
  );

  // Motor kurulumu
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSupport(detectRecorderSupport());
    soundRef.current = new SoundEngine();
    recorderRef.current = new VideoRecorder();
    const engine = new MatchEngine(canvas, soundRef.current, latest.current.config, {
      onStatus: setStatus,
      onFinished: (r) => {
        setResult(r);
        // Son kareler de kayda girsin
        window.setTimeout(() => {
          void finalizeRecording(latest.current.autoDownload, r.score);
        }, 600);
      },
    });
    engineRef.current = engine;
    return () => {
      engine.destroy();
      void recorderRef.current?.stop();
    };
  }, [finalizeRecording]);

  useEffect(() => {
    engineRef.current?.setConfig(config);
  }, [config]);

  useEffect(() => {
    soundRef.current?.setMuted(muted);
  }, [muted]);

  useEffect(() => {
    if (recState !== "recording") return;
    const id = window.setInterval(() => {
      const r = recorderRef.current;
      if (r) setRecSeconds(Math.floor((performance.now() - r.startedAt) / 1000));
    }, 250);
    return () => window.clearInterval(id);
  }, [recState]);

  const running = status?.running ?? false;

  async function handleStart() {
    const engine = engineRef.current;
    const sound = soundRef.current;
    const canvas = canvasRef.current;
    if (!engine || !sound || !canvas) return;
    setMessage(null);
    setResult(null);

    await sound.init();
    sound.setMuted(muted);

    // Önceki kayıt varsa iptal et
    if (recorderRef.current?.isRecording) await recorderRef.current.stop();
    if (video) {
      URL.revokeObjectURL(video.url);
      setVideo(null);
    }
    setRecState("idle");

    if (recordOnStart) {
      if (support?.supported) {
        try {
          recorderRef.current?.start(canvas, sound.getStream());
          setRecSeconds(0);
          setRecState("recording");
        } catch (e) {
          setMessage({ type: "error", text: `Kayıt başlatılamadı: ${(e as Error).message}` });
        }
      } else {
        setMessage({ type: "error", text: support?.reason ?? "Bu tarayıcı video kaydını desteklemiyor; simülasyon kayıtsız oynatılıyor." });
      }
    }
    engine.start();
  }

  async function handleReset() {
    engineRef.current?.reset();
    if (recorderRef.current?.isRecording) await recorderRef.current.stop();
    setRecState(video ? "ready" : "idle");
    setResult(null);
    setMessage(null);
  }

  async function handleDownload() {
    if (recState === "recording") {
      await finalizeRecording(true, status?.score);
      return;
    }
    if (video) {
      downloadBlob(video.blob, video.name);
      return;
    }
    if (!support?.supported) {
      setMessage({ type: "error", text: support?.reason ?? "Video kaydı desteklenmiyor." });
      return;
    }
    setMessage({
      type: "info",
      text: recordOnStart
        ? "Önce “Başlat” ile maçı başlatın; kayıt otomatik başlar."
        : "“Başlatınca kaydet” seçeneğini açıp maçı başlatın.",
    });
  }

  const setTeam = (i: 0 | 1) => (t: Team) => setTeams((prev) => (i === 0 ? [t, prev[1]] : [prev[0], t]));

  const downloadLabel =
    recState === "recording"
      ? "Kaydı Bitir ve İndir (9:16)"
      : recState === "processing"
        ? "Video hazırlanıyor…"
        : "Videoyu İndir (9:16)";

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-4 py-6 lg:flex-row lg:items-start lg:gap-10 lg:py-10">
      {/* Kontrol paneli */}
      <section className="order-2 w-full space-y-5 lg:order-1 lg:sticky lg:top-8 lg:max-w-md">
        <header>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-cyan-400">Shorts Stüdyosu</p>
          <h1 className="mt-1 text-3xl font-black text-white">
            Dönen Kale <span className="bg-gradient-to-r from-rose-400 to-amber-300 bg-clip-text text-transparent">Futbol Sim</span>
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            45 saniyelik maç · her saniye 2 dakika · 9:16 ({W}×{H}) video çıktısı
          </p>
        </header>

        <div className="grid gap-4">
          <TeamEditor index={0} team={teams[0]} onChange={setTeam(0)} disabled={running} />
          <TeamEditor index={1} team={teams[1]} onChange={setTeam(1)} disabled={running} />
        </div>

        <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Üst başlık</span>
            <input
              value={title}
              maxLength={40}
              disabled={running}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Alt yazı</span>
            <input
              value={caption}
              maxLength={44}
              disabled={running}
              onChange={(e) => setCaption(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
            />
          </label>
          <label className="block">
            <span className="flex justify-between text-xs font-bold uppercase tracking-widest text-slate-400">
              <span>Kale dönüş hızı</span>
              <span className="text-white">{goalSpeed.toFixed(1)}×</span>
            </span>
            <input
              type="range"
              min={0.4}
              max={2.5}
              step={0.1}
              value={goalSpeed}
              disabled={running}
              onChange={(e) => setGoalSpeed(Number(e.target.value))}
              className="mt-2 w-full accent-cyan-400"
            />
          </label>
          <div className="divide-y divide-white/5">
            <Toggle
              checked={extraTime}
              onChange={setExtraTime}
              disabled={running}
              label={`Uzatmalar ${extraTime ? "Açık" : "Kapalı"}`}
              hint="Eleme / Şampiyonlar Ligi modu: 90' berabere biterse 120'ye kadar uzatma, yine berabere ise altın gol."
            />
            <Toggle
              checked={goldenGoal}
              onChange={setGoldenGoal}
              disabled={running || !extraTime}
              label="Uzatmada altın gol"
              hint="Uzatmalarda ilk gol maçı bitirir."
            />
            <Toggle checked={!muted} onChange={(v) => setMuted(!v)} label={`Ses ${muted ? "Kapalı" : "Açık"}`} hint="Yalnızca hoparlörü etkiler; video sesli kaydedilir." />
            <Toggle
              checked={recordOnStart}
              onChange={setRecordOnStart}
              disabled={running}
              label="Başlatınca kaydet"
              hint="Maç başladığı anda 9:16 video kaydı başlar."
            />
            <Toggle checked={autoDownload} onChange={setAutoDownload} label="Maç bitince otomatik indir" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={handleStart}
            className="rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-4 text-lg font-black text-white shadow-lg shadow-emerald-500/20 transition hover:brightness-110 active:scale-[0.98]"
          >
            {running ? "↻ Yeniden Başlat" : "▶ Başlat"}
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="rounded-2xl border border-white/15 bg-white/5 px-4 py-4 text-lg font-bold text-white transition hover:bg-white/10"
          >
            ■ Sıfırla
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={recState === "processing"}
            className="col-span-2 rounded-2xl bg-gradient-to-r from-rose-500 to-orange-500 px-4 py-4 text-lg font-black text-white shadow-lg shadow-rose-500/20 transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
          >
            ⬇ {downloadLabel}
          </button>
        </div>

        {message && (
          <p
            className={`rounded-xl px-4 py-3 text-sm ${
              message.type === "error"
                ? "bg-rose-500/15 text-rose-200"
                : message.type === "success"
                  ? "bg-emerald-500/15 text-emerald-200"
                  : "bg-cyan-500/15 text-cyan-100"
            }`}
          >
            {message.text}
          </p>
        )}

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-xs text-slate-400">
          <p className="mb-1 font-bold uppercase tracking-widest text-slate-300">Tarayıcı uyumluluğu</p>
          {support === null ? (
            <p>Kontrol ediliyor…</p>
          ) : support.supported ? (
            <p>
              ✅ Video kaydı destekleniyor · Format: <span className="font-semibold text-white">{support.label}</span>
              {support.extension === "webm" && (
                <span className="block pt-1">
                  WebM dosyaları YouTube&apos;a doğrudan yüklenebilir. iPhone galerisi için MP4 gerekiyorsa Safari kullanın veya dönüştürün.
                </span>
              )}
            </p>
          ) : (
            <p className="text-rose-300">❌ {support.reason}</p>
          )}
          <p className="pt-1">Kayıt sırasında sekmeyi açık ve önde tutun; arka plandaki sekmelerde tarayıcı çizimi durdurur.</p>
        </div>

        {video && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-300">Son kayıt</p>
            <video src={video.url} controls playsInline className="mx-auto max-h-80 rounded-xl" />
            <p className="mt-2 truncate text-xs text-slate-400">{video.name}</p>
          </div>
        )}
      </section>

      {/* 9:16 önizleme */}
      <section className="order-1 flex flex-1 flex-col items-center lg:order-2">
        <div className="relative">
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            className="block aspect-[9/16] h-auto w-[min(100%,calc(80vh*9/16))] max-w-full rounded-[28px] border border-white/10 shadow-2xl shadow-cyan-500/10 lg:w-[calc(88vh*9/16)]"
          />
          {recState === "recording" && (
            <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-xs font-bold text-white">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" /> REC {recSeconds}s
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-sm text-slate-400">
          <span className="rounded-full bg-white/5 px-3 py-1">{status?.phaseLabel ?? "HAZIR"}</span>
          <span className="rounded-full bg-white/5 px-3 py-1 font-mono">{status?.clockLabel ?? "0'"}</span>
          <span className="rounded-full bg-white/5 px-3 py-1 font-bold text-white">
            {status ? `${status.score[0]} - ${status.score[1]}` : "0 - 0"}
          </span>
          {result && (
            <span className="rounded-full bg-emerald-500/15 px-3 py-1 font-semibold text-emerald-200">
              {result.winner === null ? "Berabere" : `Kazanan: ${teams[result.winner].name}`}
              {result.extraTimePlayed && " (uzatmalarda)"}
            </span>
          )}
        </div>
      </section>
    </main>
  );
}
