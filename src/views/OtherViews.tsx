import { useEffect, useState } from 'react';
import { TIMER_COLOR } from '../activities';
import { BackChip } from '../components/Bits';
import { BatteryIcon, BellIcon, ChevronRightIcon, PowerIcon, SpeakerIcon, TimerIcon } from '../components/Icons';
import type { BatteryFlash } from '../hooks/useBatteryFlash';
import type { IslandAlert, MediaState, PowerState, RecentApp } from '../shared/types';
import { MiniMedia } from './MediaViews';

/** How many recent apps fit in the launcher's row. */
export const RECENT_APPS_SHOWN = 7;
/** Extra launcher height when the Recent apps row is shown. */
export const RECENT_APPS_HEIGHT = 80;

export function AlertView({ alert }: { alert: IslandAlert }) {
  const color = TIMER_COLOR;
  return (
    <div className="row alert">
      <div className="alert-icon shake" style={{ background: `color-mix(in srgb, ${color} 26%, transparent)`, color }}>
        <BellIcon size={20} />
      </div>
      <div className="meta">
        <div className="title">{alert.title}</div>
        {alert.subtitle && <div className="subtitle">{alert.subtitle}</div>}
      </div>
    </div>
  );
}

/**
 * Volume bar. `compact` is the pill shown on a closed island; otherwise it's a small chip
 * floating over an open island. Clicking the speaker mutes or unmutes.
 */
export function VolumeView({ level, muted, onToggleMute, compact }: { level: number; muted: boolean; onToggleMute: () => void; compact: boolean }) {
  return (
    <div className={compact ? 'row compact volume' : 'volume-chip'}>
      <button
        className="volume-speaker"
        title={muted ? 'Unmute' : 'Mute'}
        aria-label={muted ? 'Unmute' : 'Mute'}
        onClick={(e) => {
          e.stopPropagation();
          onToggleMute();
        }}
      >
        <SpeakerIcon level={level} muted={muted} />
      </button>
      <div className="volume-bar">
        <div className="volume-fill" style={{ width: `${muted ? 0 : level}%` }} />
      </div>
      <span className="volume-value">{muted ? 'Muted' : level}</span>
    </div>
  );
}

const BATTERY_GREEN = '#32d74b';
const BATTERY_RED = '#ff453a';

/** The wide pill shown briefly when a charger is plugged in or the battery runs low. */
export function BatteryView({ kind, power }: { kind: BatteryFlash; power: PowerState }) {
  const charging = kind === 'charging';
  const color = charging ? BATTERY_GREEN : BATTERY_RED;
  const label = !charging ? 'Low Battery' : power.charging ? 'Charging' : 'Plugged in';
  return (
    <div className="row compact battery">
      <span className="battery-label" style={{ color: charging ? 'var(--text)' : color }}>{label}</span>
      <span className="battery-level">
        <span style={{ color }}>{power.percent}%</span>
        <BatteryIcon percent={power.percent} color={color} charging={power.charging} />
      </span>
    </div>
  );
}

/** Two-step quit: the first click asks, the second closes the app. Resets after a few seconds. */
function QuitButton() {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const id = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(id);
  }, [confirming]);

  return (
    <button
      className={`quit-chip ${confirming ? 'confirming' : ''}`}
      title="Quit Island"
      aria-label={confirming ? 'Click again to quit Island' : 'Quit Island'}
      onClick={(e) => {
        e.stopPropagation();
        if (confirming) window.island.quit();
        else setConfirming(true);
      }}
    >
      <PowerIcon size={12} />
      {confirming ? 'Quit?' : 'Quit'}
    </button>
  );
}

/**
 * What the island offers: the Timer button and Quit. Shown when you open an empty
 * island, or from any expanded activity via its launcher button (then `onBack` returns to it).
 */
export function LauncherView({
  media,
  apps,
  onBack,
  onOpenTimer,
  onOpenMedia,
  onOpenApp,
}: {
  media?: MediaState;
  apps: RecentApp[];
  onBack?: () => void;
  onOpenTimer: () => void;
  onOpenMedia: () => void;
  onOpenApp: (id: string) => void;
}) {
  return (
    <div className="launcher">
      {media && <MiniMedia media={media} onOpen={onOpenMedia} />}
      <div className="section-row">
        <div className="section-start">
          {onBack && <BackChip onClick={onBack} />}
          <div className="section-label">Island</div>
        </div>
        <QuitButton />
      </div>
      <button
        className="tile timer-tile"
        onClick={(e) => {
          e.stopPropagation();
          onOpenTimer();
        }}
      >
        <TimerIcon size={16} color={TIMER_COLOR} />
        <span>Timer</span>
        <ChevronRightIcon size={14} />
      </button>
      {apps.length > 0 && (
        <>
          <div className="section-label">Recent apps</div>
          <div className="apps-row">
            {apps.slice(0, RECENT_APPS_SHOWN).map((a) => (
              <button
                key={a.id}
                className="app-icon"
                title={a.name}
                aria-label={`Open ${a.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenApp(a.id);
                }}
              >
                {a.icon ? <img src={a.icon} alt="" draggable={false} /> : <span className="app-letter">{a.name.charAt(0)}</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
