import { mediaPositionMs } from '../activities';
import { Art, IconButton, LauncherButton, Waveform } from '../components/Bits';
import { NextIcon, PauseIcon, PlayIcon, PrevIcon } from '../components/Icons';
import { useNow } from '../hooks/useNow';
import { appName, formatClock } from '../lib/format';
import type { MediaState } from '../shared/types';

export function CompactMedia({ media, color }: { media: MediaState; color: string }) {
  return (
    <div className="row compact">
      <Art src={media.artDataUrl} size={24} radius={7} />
      <Waveform playing={!!media.playing} color={color} />
    </div>
  );
}

export function ExpandedMedia({ media, color, onOpenLauncher }: { media: MediaState; color: string; onOpenLauncher: () => void }) {
  const now = useNow(!!media.playing, 250);
  const duration = media.durationMs ?? 0;
  const position = mediaPositionMs(media, now);
  const progress = duration > 0 ? position / duration : 0;
  const source = appName(media.app);

  return (
    <div className="expanded-media">
      <div className="row">
        <Art src={media.artDataUrl} size={54} radius={13} />
        <div className="meta">
          <div className="title">{media.title || 'Unknown title'}</div>
          <div className="subtitle">{media.artist || source || 'Unknown artist'}</div>
        </div>
        <Waveform playing={!!media.playing} color={color} height={20} />
      </div>

      {duration > 0 && (
        <div className="progress-row">
          <span className="time">{formatClock(position, false)}</span>
          <div className="bar">
            <div className="fill" style={{ width: `${progress * 100}%`, background: color }} />
          </div>
          <span className="time">-{formatClock(duration - position, false)}</span>
        </div>
      )}

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
        <div className="subtitle">{media.artist || appName(media.app)}</div>
      </div>
      <IconButton label={media.playing ? 'Pause' : 'Play'} onClick={() => window.island.media('toggle')}>
        {media.playing ? <PauseIcon size={24} /> : <PlayIcon size={24} />}
      </IconButton>
    </div>
  );
}
