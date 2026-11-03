// Small inline icons, drawn for this app.
type P = { size?: number; color?: string };

export const PlayIcon = ({ size = 22, color = 'currentColor' }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M7 4.8v14.4c0 .8.9 1.3 1.6.9l11.3-7.2a1 1 0 0 0 0-1.8L8.6 3.9C7.9 3.5 7 4 7 4.8Z" />
  </svg>
);

export const PauseIcon = ({ size = 22, color = 'currentColor' }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <rect x="5.5" y="4" width="4.6" height="16" rx="1.4" />
    <rect x="13.9" y="4" width="4.6" height="16" rx="1.4" />
  </svg>
);

export const NextIcon = ({ size = 22, color = 'currentColor' }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M2.5 6.2v11.6c0 .7.8 1.1 1.4.7l8.4-5.8a.9.9 0 0 0 0-1.4L3.9 5.5c-.6-.4-1.4 0-1.4.7Z" />
    <path d="M11.5 6.2v11.6c0 .7.8 1.1 1.4.7l8.4-5.8a.9.9 0 0 0 0-1.4l-8.4-5.8c-.6-.4-1.4 0-1.4.7Z" />
  </svg>
);

export const PrevIcon = ({ size = 22, color = 'currentColor' }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ transform: 'scaleX(-1)' }}>
    <path d="M2.5 6.2v11.6c0 .7.8 1.1 1.4.7l8.4-5.8a.9.9 0 0 0 0-1.4L3.9 5.5c-.6-.4-1.4 0-1.4.7Z" />
    <path d="M11.5 6.2v11.6c0 .7.8 1.1 1.4.7l8.4-5.8a.9.9 0 0 0 0-1.4l-8.4-5.8c-.6-.4-1.4 0-1.4.7Z" />
  </svg>
);

export const CloseIcon = ({ size = 18, color = 'currentColor' }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round">
    <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
  </svg>
);

export const ResetIcon = ({ size = 18, color = 'currentColor' }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
    <path d="M4.5 4.5v4h4" />
  </svg>
);

export const TimerIcon = ({ size = 16, color = 'currentColor' }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round">
    <circle cx="12" cy="13.5" r="7.5" />
    <path d="M12 13.5V9.5M10 2.8h4" />
  </svg>
);

export const BellIcon = ({ size = 18, color = 'currentColor' }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M12 2.5a6.5 6.5 0 0 0-6.5 6.5v3.6L3.8 15.4c-.5.8.1 1.8 1 1.8h14.4c.9 0 1.5-1 1-1.8l-1.7-2.8V9A6.5 6.5 0 0 0 12 2.5Z" />
    <path d="M9.2 18.6a2.9 2.9 0 0 0 5.6 0Z" />
  </svg>
);

export const NoteIcon = ({ size = 16, color = 'currentColor' }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M19 3.4v11.2a3.4 3.4 0 1 1-2-3.1V7.2l-8 1.8v7.6a3.4 3.4 0 1 1-2-3.1V6.1c0-.5.3-.9.8-1l10-2.2c.6-.1 1.2.3 1.2 1Z" />
  </svg>
);

export const GridIcon = ({ size = 18, color = 'currentColor' }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
  </svg>
);

export const ChevronLeftIcon = ({ size = 14, color = 'currentColor' }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 5l-7 7 7 7" />
  </svg>
);

export const ChevronRightIcon = ({ size = 14, color = 'currentColor' }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 5l7 7-7 7" />
  </svg>
);

export const PowerIcon = ({ size = 14, color = 'currentColor' }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round">
    <path d="M12 3.5v8" />
    <path d="M7.2 6.6a7.5 7.5 0 1 0 9.6 0" />
  </svg>
);

export const PlusIcon = ({ size = 14, color = 'currentColor' }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.8" strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const MinusIcon = ({ size = 14, color = 'currentColor' }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.8" strokeLinecap="round">
    <path d="M5 12h14" />
  </svg>
);
