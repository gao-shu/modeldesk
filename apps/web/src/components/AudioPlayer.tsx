"use client";

import { useEffect, useRef, useState } from "react";

type AudioPlayerProps = {
  src: string;
  className?: string;
  /** Default metadata — gallery lists many clips. */
  preload?: "none" | "metadata" | "auto";
  /** Badge text above the controls (gallery card). */
  badge?: string;
};

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Compact audio/music player: controls + time on row 1, full-width seek on row 2.
 * Avoids native &lt;audio controls&gt; cramming the scrubber into a tiny gap.
 */
export function AudioPlayer({
  src,
  className = "",
  preload = "metadata",
  badge,
}: AudioPlayerProps) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [muted, setMuted] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.volume = volume;
    el.muted = muted;
  }, [volume, muted, src]);

  useEffect(() => {
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
    setLoadError(null);
  }, [src]);

  const togglePlay = () => {
    const el = ref.current;
    if (!el || loadError) return;
    if (el.paused) {
      // Some WebViews report duration=0 until play starts; still attempt playback.
      void el.play().catch(() => {
        setPlaying(false);
        setLoadError("无法播放，请尝试下载后本地打开");
      });
    } else {
      el.pause();
    }
  };

  const seek = (value: number) => {
    const el = ref.current;
    if (!el) return;
    el.currentTime = value;
    setCurrent(value);
  };

  return (
    <div
      className={`flex w-full flex-col justify-center gap-2 ${className}`.trim()}
    >
      {badge ? (
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-xs font-medium text-zinc-500">
          {badge}
        </div>
      ) : null}

      <audio
        key={src}
        ref={ref}
        preload={preload}
        src={src}
        className="hidden"
        onPlay={() => {
          setPlaying(true);
          setLoadError(null);
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          setDuration(Number.isFinite(d) ? d : 0);
          setLoadError(null);
        }}
        onDurationChange={(e) => {
          const d = e.currentTarget.duration;
          setDuration(Number.isFinite(d) ? d : 0);
        }}
        onError={() => {
          setPlaying(false);
          setLoadError("音频加载失败");
        }}
        onVolumeChange={(e) => {
          setVolume(e.currentTarget.volume);
          setMuted(e.currentTarget.muted);
        }}
      />

      <div className="rounded-lg border border-zinc-200 bg-white px-2.5 py-2 shadow-sm">
        {loadError ? (
          <p className="mb-1.5 text-[11px] text-red-600">{loadError}</p>
        ) : null}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={togglePlay}
            disabled={Boolean(loadError)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-40"
            title={playing ? "暂停" : "播放"}
            aria-label={playing ? "暂停" : "播放"}
          >
            {playing ? (
              <span className="flex gap-0.5" aria-hidden>
                <span className="h-3 w-0.5 rounded-sm bg-white" />
                <span className="h-3 w-0.5 rounded-sm bg-white" />
              </span>
            ) : (
              <span
                className="ml-0.5 border-y-[5px] border-l-[8px] border-y-transparent border-l-white"
                aria-hidden
              />
            )}
          </button>

          <span className="min-w-0 flex-1 truncate font-mono text-[11px] tabular-nums text-zinc-600">
            {formatTime(current)} / {formatTime(duration)}
          </span>

          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            className="shrink-0 rounded-md px-1.5 py-1 text-[11px] text-zinc-600 hover:bg-zinc-50"
            title={muted || volume === 0 ? "取消静音" : "静音"}
          >
            {muted || volume === 0 ? "静音" : "音量"}
          </button>
        </div>

        <input
          type="range"
          min={0}
          max={duration > 0 ? duration : Math.max(current, 1)}
          step={0.01}
          value={duration > 0 ? Math.min(current, duration) : current}
          disabled={Boolean(loadError)}
          aria-label="进度"
          className="mt-2 h-1.5 w-full cursor-pointer accent-zinc-800 disabled:cursor-default disabled:opacity-40"
          onChange={(e) => seek(Number(e.target.value))}
        />
      </div>
    </div>
  );
}
