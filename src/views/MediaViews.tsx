import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { mediaPositionMs } from '../activities';
import { Art, BackChip, IconButton, LauncherButton, Waveform } from '../components/Bits';
import { ChevronDownIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon } from '../components/Icons';
import { useNow } from '../hooks/useNow';
import { appName, formatClock } from '../lib/format';
import type { MediaState } from '../shared/types';

/** How long to show a seek target before trusting the player's reported position again. */
const SEEK_SETTLE_MS = 1500;

export function CompactMedia({ media, color }: { media: MediaState; color: string }) {
  return (
    <div className="row compact">
      <Art src={media.artDataUrl} size={24} radius={7} />
      <Waveform playing={!!media.playing} color={color} />
    </div>
  );
}

const sourceName = (media: MediaState) => media.appName || appName(media.app) || 'Media';

export function ExpandedMedia({
  media,
  color,
  onOpenLauncher,
  onOpenSources,
}: {
  media: MediaState;
  color: string;
  onOpenLauncher: () => void;
  onOpenSources: () => void;
}) {
  const source = sourceName(media);
  const sources = media.sessions?.length ?? 0;

  return (
    <div className="expanded-media">
      <div className="row">
        <button
          className="art-btn"
          title={`Open ${source}`}
          aria-label={`Open ${source}`}
          onClick={(e) => {
            e.stopPropagation();
            window.island.mediaAction({ type: 'open' });
          }}
        >
          <Art src={media.artDataUrl} size={54} radius={13} />
        </button>
        <div className="meta">
          <div className="title">{media.title || 'Unknown title'}</div>
          <div className="subtitle">{media.artist || 'Unknown artist'}</div>
          {sources > 1 ? (
            <button
              className="source-chip"
              title="Choose what the island controls"
              onClick={(e) => {
                e.stopPropagation();
                onOpenSources();
              }}
            >
              {source} · {sources} apps <ChevronDownIcon size={10} />
            </button>
          ) : (
            <div className="source-label">{source}</div>
          )}
        </div>
        <Waveform playing={!!media.playing} color={color} height={20} />
      </div>

      <SeekBar media={media} color={color} />

      <div className="controls">
        <IconButton label="Previous" disabled={media.canPrev === false} onClick={() => window.island.media('prev')}>
          <PrevIcon size={26} />
        </IconButton>
        <IconButton label={media.playing ? 'Pause' : 'Play'} onClick={() => window.island.media('toggle')}>
          {media.playing ? <PauseIcon size={32} /> : <PlayIcon size={32} />}
        </IconButton>
        <IconButton label="Next" disabled={media.canNext === false} onClick={() => window.island.media('next')}>
          <NextIcon size={26} />
        </IconButton>
        <LauncherButton onClick={onOpenLauncher} />
      </div>
    </div>
  );
}

/**
 * Progress bar. When the player supports it, click or drag to seek: the bar follows the
 * pointer, and after release it shows the target until the player reports the new position.
 */
function SeekBar({ media, color }: { media: MediaState; color: string }) {
  const now = useNow(!!media.playing, 250);
  const bar = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [pending, setPending] = useState<{ ms: number; at: number } | null>(null);
  const duration = media.durationMs ?? 0;

  // Drop the pending seek once the player reports a position near it (an older report can
  // still arrive first), or as soon as the track changes.
  useEffect(() => {
    setPending((p) => (p && Math.abs((media.positionMs ?? 0) - p.ms) < 3000 ? null : p));
  }, [media.positionMs]);
  useEffect(() => setPending(null), [media.trackKey]);
  useEffect(() => {
    if (!pending) return;
    const id = setTimeout(() => setPending(null), SEEK_SETTLE_MS);
    return () => clearTimeout(id);
  }, [pending]);

  if (duration <= 0) return null;
  const canSeek = media.canSeek === true;
  const reported = pending ? pending.ms + (media.playing ? now - pending.at : 0) : mediaPositionMs(media, now);
  const position = drag != null ? drag * duration : Math.min(duration, reported);

  const fraction = (e: PointerEvent) => {
    const r = bar.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  };

  return (
    <div className="progress-row">
      <span className="time">{formatClock(position, false)}</span>
      <div
        ref={bar}
        className={`bar ${canSeek ? 'seekable' : ''} ${drag != null ? 'dragging' : ''}`}
        title={canSeek ? undefined : `${sourceName(media)} doesn't support seeking`}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => {
          if (!canSeek) return;
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag(fraction(e));
        }}
        onPointerMove={(e) => drag != null && setDrag(fraction(e))}
        onPointerUp={(e) => {
          if (drag == null) return;
          const ms = Math.round(fraction(e) * duration);
          setDrag(null);
          setPending({ ms, at: Date.now() });
          window.island.mediaAction({ type: 'seek', positionMs: ms });
        }}
        onPointerCancel={() => setDrag(null)}
      >
        <div className="fill" style={{ width: `${(position / duration) * 100}%`, background: color }} />
        {canSeek && <div className="knob" style={{ left: `${(position / duration) * 100}%` }} />}
      </div>
      <span className="time">-{formatClock(duration - position, false)}</span>
    </div>
  );
}

/** Pick which app the island controls when several are playing. */
export function MediaSources({ media, onBack, onPicked }: { media: MediaState; onBack: () => void; onPicked: () => void }) {
  return (
    <div className="media-sources">
      <div className="section-row">
        <div className="section-start">
          <BackChip onClick={onBack} />
          <div className="section-label">Playing from</div>
        </div>
      </div>
      {(media.sessions ?? []).map((s) => (
        <button
          key={s.app}
          className={`source-row ${s.app === media.app ? 'selected' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            window.island.mediaAction({ type: 'select', app: s.app });
            onPicked();
          }}
        >
          <span className={`source-dot ${s.playing ? 'playing' : ''}`} />
          <span className="source-name">{s.name}</span>
          <span className="source-title">{s.title || (s.playing ? 'Playing' : 'Paused')}</span>
        </button>
      ))}
    </div>
  );
}

/** Height of the source list for `count` sources (header + rows + padding). */
export const mediaSourcesHeight = (count: number) => 32 + 22 + count * 40 + 8;

/** One-line player in the launcher. Clicking it opens the full player; the button plays or pauses. */
export function MiniMedia({ media, onOpen }: { media: MediaState; onOpen: () => void }) {
  return (
    <div
      className="mini-media"
      title="Open player"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
    >
      <Art src={media.artDataUrl} size={38} radius={9} />
      <div className="meta">
        <div className="title small">{media.title || 'Unknown title'}</div>
        <div className="subtitle">{media.artist || sourceName(media)}</div>
      </div>
      <IconButton label={media.playing ? 'Pause' : 'Play'} onClick={() => window.island.media('toggle')}>
        {media.playing ? <PauseIcon size={24} /> : <PlayIcon size={24} />}
      </IconButton>
    </div>
  );
}
