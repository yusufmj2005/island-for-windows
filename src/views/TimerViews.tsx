import { useState, type WheelEvent } from 'react';
import { remainingMs, TIMER_COLOR } from '../activities';
import { BackChip, LauncherButton, Ring, RoundButton } from '../components/Bits';
import { BellIcon, CloseIcon, MinusIcon, PauseIcon, PlayIcon, PlusIcon, ResetIcon } from '../components/Icons';
import { useNow } from '../hooks/useNow';
import { formatClock } from '../lib/format';
import type { TimerState } from '../shared/types';

const color = TIMER_COLOR;
const tint = `color-mix(in srgb, ${TIMER_COLOR} 28%, transparent)`;

export function CompactTimer({ timer }: { timer: TimerState }) {
  const now = useNow(timer.status === 'running', 250);
  if (timer.status === 'completed') {
    return (
      <div className="row compact">
        <span className="ring-slot shake"><BellIcon size={18} color={color} /></span>
        <span className="clock pulse" style={{ color }}>Done</span>
      </div>
    );
  }
  const left = remainingMs(timer, now);
  return (
    <div className="row compact">
      <span className="ring-slot"><Ring progress={left / timer.durationMs} color={color} /></span>
      <span className="clock" style={{ color, opacity: timer.status === 'paused' ? 0.6 : 1 }}>
        {formatClock(left)}
      </span>
    </div>
  );
}

export function ExpandedTimer({ timer, onOpenLauncher }: { timer: TimerState; onOpenLauncher: () => void }) {
  const now = useNow(timer.status === 'running', 250);
  const id = timer.id;

  if (timer.status === 'completed') {
    return (
      <div className="row expanded-timer">
        <div className="buttons">
          <RoundButton label="Restart" bg={tint} color={color} onClick={() => window.island.timer({ type: 'restart', id })}>
            <ResetIcon size={20} />
          </RoundButton>
          <RoundButton label="Dismiss" onClick={() => window.island.timer({ type: 'dismiss', id })}>
            <CloseIcon />
          </RoundButton>
          <LauncherButton round onClick={onOpenLauncher} />
        </div>
        <div className="timer-text">
          <div className="label" style={{ color }}>{timer.label}</div>
          <div className="big pulse" style={{ color }}>Done</div>
        </div>
      </div>
    );
  }

  const running = timer.status === 'running';
  return (
    <div className="row expanded-timer">
      <div className="buttons">
        <RoundButton
          label={running ? 'Pause' : 'Resume'}
          bg={tint}
          color={color}
          onClick={() => window.island.timer({ type: running ? 'pause' : 'resume', id })}
        >
          {running ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
        </RoundButton>
        <RoundButton label="Cancel" onClick={() => window.island.timer({ type: 'cancel', id })}>
          <CloseIcon />
        </RoundButton>
        <LauncherButton round onClick={onOpenLauncher} />
      </div>
      <div className="timer-text">
        <div className="label" style={{ color }}>
          {timer.label}
          <button
            className="chip"
            onClick={(e) => {
              e.stopPropagation();
              window.island.timer({ type: 'add', id, ms: 60_000 });
            }}
          >
            <PlusIcon size={10} /> 1 min
          </button>
        </div>
        <div className="big" style={{ color, opacity: running ? 1 : 0.6 }}>{formatClock(remainingMs(timer, now))}</div>
      </div>
    </div>
  );
}

const PRESET_MINUTES = [1, 5, 10, 15, 30, 60];
const MIN_MINUTES = 1;
const MAX_MINUTES = 180;
/** Remembered for the next time the panel opens, until the app restarts. */
let lastMinutes = 5;

/** Pick a duration and start a timer. Opened from the launcher's Timer button. */
export function TimerSetup({ onBack, onStarted }: { onBack: () => void; onStarted: () => void }) {
  const [minutes, setMinutesState] = useState(lastMinutes);
  // Functional updates, so quick clicks or fast wheel scrolling never read a stale value.
  const update = (next: (m: number) => number) =>
    setMinutesState((m) => (lastMinutes = Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, next(m)))));
  const setMinutes = (m: number) => update(() => m);
  const step = (delta: number) => update((m) => m + delta);
  const onWheel = (e: WheelEvent) => {
    e.stopPropagation(); // scrolling here sets the timer, not the volume
    step(e.deltaY < 0 ? 1 : -1);
  };

  return (
    <div className="timer-setup">
      <div className="section-row">
        <div className="section-start">
          <BackChip onClick={onBack} />
          <div className="section-label">New timer</div>
        </div>
      </div>

      <div className="setup-main">
        <RoundButton label="1 minute less" size={40} onClick={() => step(-1)}>
          <MinusIcon size={16} />
        </RoundButton>
        <div className="setup-time" style={{ color }} onWheel={onWheel} title="Scroll to adjust">
          {formatClock(minutes * 60_000)}
        </div>
        <RoundButton label="1 minute more" size={40} onClick={() => step(1)}>
          <PlusIcon size={16} />
        </RoundButton>
        <button
          className="start-btn"
          onClick={(e) => {
            e.stopPropagation();
            window.island.timer({ type: 'start', durationMs: minutes * 60_000 });
            onStarted();
          }}
        >
          <PlayIcon size={14} /> Start
        </button>
      </div>

      <div className="chips">
        {PRESET_MINUTES.map((m) => (
          <button
            key={m}
            className={`preset ${m === minutes ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setMinutes(m);
            }}
          >
            {m === 60 ? '1 hr' : `${m} min`}
          </button>
        ))}
      </div>
    </div>
  );
}
