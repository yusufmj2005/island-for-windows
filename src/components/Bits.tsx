// Small shared visual pieces used by several views.
import type { CSSProperties, ReactNode } from 'react';
import { ChevronLeftIcon, GridIcon, NoteIcon } from './Icons';

export function Art({ src, size, radius }: { src?: string | null; size: number; radius: number }) {
  return (
    <div className="art" style={{ width: size, height: size, borderRadius: radius }}>
      {src ? <img src={src} alt="" draggable={false} /> : <NoteIcon size={size * 0.5} color="#8e8e93" />}
    </div>
  );
}

/** Opens the launcher (timer, quit) from an expanded activity. */
export function LauncherButton({ onClick, round }: { onClick: () => void; round?: boolean }) {
  return round ? (
    <RoundButton label="More: timer, quit" size={36} onClick={onClick}>
      <GridIcon size={15} />
    </RoundButton>
  ) : (
    <IconButton label="More: timer, quit" className="corner" onClick={onClick}>
      <GridIcon size={18} />
    </IconButton>
  );
}

export function BackChip({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="back-chip"
      aria-label="Back"
      title="Back"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <ChevronLeftIcon size={12} /> Back
    </button>
  );
}

/** Animated audio bars, tinted with the artwork colour. */
export function Waveform({ playing, color, height = 16 }: { playing: boolean; color: string; height?: number }) {
  return (
    <div className={`wave ${playing ? 'playing' : ''}`} style={{ height, '--wave': color } as CSSProperties}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} style={{ animationDelay: `${i * -0.23}s`, animationDuration: `${0.7 + (i % 3) * 0.18}s` }} />
      ))}
    </div>
  );
}

/** Circular countdown ring. */
export function Ring({ progress, color, size = 20, stroke = 3 }: { progress: number; color: string; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeOpacity={0.25} strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.max(0, Math.min(1, progress)))}
      />
    </svg>
  );
}

/** Round icon button; stops the click from reaching the island underneath. */
export function RoundButton({
  onClick,
  children,
  size = 44,
  bg = 'rgba(255,255,255,0.14)',
  color = '#fff',
  label,
}: {
  onClick: () => void;
  children: ReactNode;
  size?: number;
  bg?: string;
  color?: string;
  label: string;
}) {
  return (
    <button
      className="round-btn"
      aria-label={label}
      title={label}
      style={{ width: size, height: size, background: bg, color }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

export function IconButton({
  onClick,
  children,
  label,
  disabled,
  className,
}: {
  onClick: () => void;
  children: ReactNode;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      className={className ? `icon-btn ${className}` : 'icon-btn'}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}
