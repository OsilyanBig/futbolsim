"use client";

import { useRef, useState } from "react";
import { loadImageFromFile, loadImageFromUrl } from "@/lib/logo";
import type { Team } from "@/lib/sim/types";

interface Props {
  index: number;
  team: Team;
  disabled?: boolean;
  onChange: (t: Team) => void;
}

export default function TeamEditor({ index, team, disabled, onChange }: Props) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setLoading(true);
    try {
      onChange({ ...team, logo: await loadImageFromFile(file) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleUrl() {
    if (!url.trim()) return;
    setError(null);
    setLoading(true);
    try {
      onChange({ ...team, logo: await loadImageFromUrl(url) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <fieldset disabled={disabled} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <legend className="px-2 text-xs font-bold uppercase tracking-widest text-slate-400">Takım {index + 1}</legend>
      <div className="flex items-center gap-3">
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white/70 text-lg font-black"
          style={{ background: team.color }}
        >
          {team.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={team.logo.src} alt="" className="h-full w-full object-cover" />
          ) : (
            <span>{team.name.trim().slice(0, 2).toLocaleUpperCase("tr-TR") || "?"}</span>
          )}
        </div>
        <div className="flex-1 space-y-2">
          <input
            value={team.name}
            maxLength={28}
            onChange={(e) => onChange({ ...team, name: e.target.value })}
            placeholder={`Takım ${index + 1} adı`}
            className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm font-semibold text-white outline-none focus:border-cyan-400"
          />
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <input
              type="color"
              value={team.color}
              onChange={(e) => onChange({ ...team, color: e.target.value })}
              className="h-7 w-7 cursor-pointer"
              aria-label="Takım rengi"
            />
            <span>Renk</span>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="ml-auto rounded-md bg-white/10 px-2.5 py-1.5 font-semibold text-white hover:bg-white/20"
            >
              Logo yükle
            </button>
            {team.logo && (
              <button
                type="button"
                onClick={() => onChange({ ...team, logo: null })}
                className="rounded-md bg-rose-500/20 px-2.5 py-1.5 font-semibold text-rose-200 hover:bg-rose-500/30"
              >
                Kaldır
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => handleFile(e.target.files?.[0])} />
          </div>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleUrl()}
          placeholder="veya logo URL'si (https://...)"
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white outline-none focus:border-cyan-400"
        />
        <button
          type="button"
          onClick={handleUrl}
          disabled={loading || !url.trim()}
          className="rounded-lg bg-cyan-500/20 px-3 text-xs font-bold text-cyan-200 hover:bg-cyan-500/30 disabled:opacity-40"
        >
          {loading ? "…" : "Yükle"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
    </fieldset>
  );
}
