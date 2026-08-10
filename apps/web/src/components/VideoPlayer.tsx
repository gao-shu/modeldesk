"use client";

import { useEffect, useRef, useState } from "react";

type VideoPlayerProps = {
  src: string;
  className?: string;
  /** Extra classes on the outer wrapper (height constraints etc.). */
  wrapperClassName?: string;
  /** Default metadata — full preload stalls gallery with many videos. */
  preload?: "none" | "metadata" | "auto";
};

/**
 * Native video + explicit volume slider.
 * Browser chrome often hides volume on narrow players; this keeps volume adjustable.
 */
export function VideoPlayer({
  src,
  className = "max-h-full w-full rounded-md object-contain",
  wrapperClassName = "flex h-full w-full flex-col gap-2 bg-zinc-50/80 p-2",
  preload = "metadata",
}: VideoPlayerProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const [volume, setVolume] = useState(0.85);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.volume = volume;
    el.muted = muted;
  }, [volume, muted, src]);

  return (
    <div className={wrapperClassName}>
      <video
        key={src}
        ref={ref}
        controls
        playsInline
        preload={preload}
        src={src}
        className={`min-h-0 flex-1 ${className}`}
        onVolumeChange={(e) => {
          const el = e.currentTarget;
          setVolume(el.volume);
          setMuted(el.muted);
        }}
      />
      <div className="flex shrink-0 items-center gap-2 px-0.5">
        <button
          type="button"
          className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
          onClick={() => setMuted((m) => !m)}
          title={muted ? "取消静音" : "静音"}
        >
          {muted || volume === 0 ? "静音" : "音量"}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={muted ? 0 : volume}
          aria-label="音量"
          className="h-1.5 flex-1 cursor-pointer accent-zinc-700"
          onChange={(e) => {
            const v = Number(e.target.value);
            setVolume(v);
            setMuted(v === 0);
          }}
        />
        <span className="w-8 text-right font-mono text-[10px] text-zinc-500">
          {Math.round((muted ? 0 : volume) * 100)}
        </span>
      </div>
    </div>
  );
}
