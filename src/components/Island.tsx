import { AnimatePresence, motion, type Transition } from 'framer-motion';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { BUBBLE_SIZE, rankActivities, remainingMs, SHAPES, TIMER_COLOR, type Activity, type View } from '../activities';
import { useArtColor } from '../hooks/useArtColor';
import { useBatteryFlash } from '../hooks/useBatteryFlash';
import { useIsland } from '../hooks/useIsland';
import { useNow } from '../hooks/useNow';
import { useVolumeControl } from '../hooks/useVolumeControl';
import { playChime } from '../lib/chime';
import type { MediaState, RecentApp, TimerState } from '../shared/types';
import { CompactMedia, ExpandedMedia } from '../views/MediaViews';
import {
  AlertView,
  BatteryView,
  LauncherView,
  privacyLabel,
  RECENT_APPS_HEIGHT,
  ScreenshotView,
  VolumeView,
} from '../views/OtherViews';
import { CompactTimer, ExpandedTimer, TimerSetup } from '../views/TimerViews';
import { Art, Ring } from './Bits';

/**
 * What an expanded island shows on top of its activity:
 * none = the activity itself (or the launcher when nothing is running);
 * media = the full music player, opened from the launcher's mini player.
 */
type Panel = 'none' | 'launcher' | 'timer-setup' | 'media';

const islandSpring: Transition = { type: 'spring', stiffness: 350, damping: 30, mass: 0.8 };
/** Collapse an expanded island this long after the cursor leaves it. */
const COLLAPSE_DELAY_MS = 450;
/** Keep showing paused music this long before falling back to idle. */
const PAUSED_MEDIA_MS = 60_000;
const BUBBLE_GAP = 6;
const HIT_PADDING = 6;
/** With nothing happening, the island fades away after this long. */
const IDLE_HIDE_MS = 10_000;
/** Where the cursor brings a hidden island back: a band at the top centre of the screen. */
const WAKE_ZONE = { width: 240, height: 44 };
/** How long a screenshot preview stays after the cursor leaves it. */
const SCREENSHOT_MS = 6000;
/** Same colours as the iPhone's indicators. */
const PRIVACY_CAMERA = '#32d74b';
const PRIVACY_MIC = '#ff9f0a';

export function Island() {
  const { snapshot, pointerInside, alert, recentApps, screenshot, dismissAlert, dismissScreenshot } = useIsland();
  const { flash, dismissFlash } = useBatteryFlash(snapshot.power);
  const vol = useVolumeControl(snapshot.volume);
  const mediaVisible = useMediaVisible(snapshot.media);
  const artColor = useArtColor(snapshot.media.artDataUrl);
  const [expanded, setExpanded] = useState(false);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>('none');

  // Rank activities. A bubble the user clicked stays in front until it ends,
  // except that a finished timer always takes the front.
  const ranked = rankActivities(snapshot, mediaVisible);
  const urgent = ranked.find((a) => a.kind === 'timer' && a.timer.status === 'completed');
  const front = urgent ?? ranked.find((a) => a.id === pinnedId);
  const ordered = front ? [front, ...ranked.filter((a) => a !== front)] : ranked;

  const primary = ordered[0] ?? null;
  // Alerts take the whole island for a moment, so no bubble while one shows.
  const secondary = alert ? null : (ordered[1] ?? null);
  const launcherMedia = snapshot.media.active ? snapshot.media : undefined;

  let view: View;
  if (alert) view = 'alert';
  else if (screenshot && !expanded) view = 'screenshot';
  // Charging / low battery shows briefly, but never interrupts an open island.
  else if (flash && snapshot.power && !expanded) view = 'battery';
  // Scrolling on a closed island shows the volume bar; on an open one, a chip floats over it.
  else if (vol.showing && !expanded) view = 'volume';
  else if (expanded && panel === 'timer-setup') view = 'timer-setup';
  else if (expanded && panel === 'media' && launcherMedia) view = 'expanded-media';
  else if (expanded && primary && panel === 'none') view = `expanded-${primary.kind}` as View;
  else if (expanded) view = launcherMedia ? 'launcher-media' : 'launcher';
  else if (primary) view = `compact-${primary.kind}` as View;
  else view = pointerInside ? 'idle-hover' : 'idle';
  const isLauncher = view === 'launcher' || view === 'launcher-media';
  const shape =
    isLauncher && recentApps.length > 0 ? { ...SHAPES[view], height: SHAPES[view].height + RECENT_APPS_HEIGHT } : SHAPES[view];
  const showBubble = !!secondary && !expanded;
  // 'idle' means nothing to show and the cursor isn't on it; 'idle-hover' wakes it.
  const { mic, camera } = snapshot.privacy;
  const privacyActive = mic.length + camera.length > 0;
  const privacyColor = camera.length > 0 ? PRIVACY_CAMERA : PRIVACY_MIC;
  // Never hide while the mic or camera is in use: that dot is the point.
  const hidden = useIdleHidden(snapshot.hideWhenIdle && view === 'idle' && !privacyActive);
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;

  // A screenshot preview stays while the cursor is on it, then leaves on its own.
  useEffect(() => {
    if (!screenshot || pointerInside) return;
    const id = setTimeout(dismissScreenshot, SCREENSHOT_MS);
    return () => clearTimeout(id);
  }, [screenshot, pointerInside, dismissScreenshot]);

  // Chime when an alert arrives.
  useEffect(() => {
    if (alert) playChime();
  }, [alert]);

  // The next expansion starts from the activity again, not a panel.
  useEffect(() => {
    if (!expanded) setPanel('none');
  }, [expanded]);

  // Collapse shortly after the cursor leaves.
  useEffect(() => {
    if (pointerInside || !expanded) return;
    const id = setTimeout(() => setExpanded(false), COLLAPSE_DELAY_MS);
    return () => clearTimeout(id);
  }, [pointerInside, expanded]);

  // Report the island's on-screen area so the main process can toggle click-through.
  const pillRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const privacyRef = useRef<HTMLDivElement>(null);
  const lastRect = useRef('');
  const reportHitRect = useCallback(() => {
    if (hiddenRef.current) {
      // Hidden: only watch for the cursor near the top centre; clicks pass through.
      const x = Math.round((document.documentElement.clientWidth - WAKE_ZONE.width) / 2);
      const key = `wake:${x}`;
      if (key === lastRect.current) return;
      lastRect.current = key;
      window.island.setHitRect({ x, y: 0, ...WAKE_ZONE, passive: true });
      return;
    }
    const rects = [pillRef.current, bubbleRef.current, privacyRef.current]
      .filter((el): el is HTMLDivElement => !!el)
      .map((el) => el.getBoundingClientRect());
    if (rects.length === 0) return;
    const x = Math.floor(Math.min(...rects.map((r) => r.left)) - HIT_PADDING);
    const y = Math.floor(Math.min(...rects.map((r) => r.top)) - HIT_PADDING);
    const right = Math.ceil(Math.max(...rects.map((r) => r.right)) + HIT_PADDING);
    const bottom = Math.ceil(Math.max(...rects.map((r) => r.bottom)) + HIT_PADDING);
    const rect = { x, y, width: right - x, height: bottom - y };
    const key = `${rect.x},${rect.y},${rect.width},${rect.height}`;
    if (key === lastRect.current) return;
    lastRect.current = key;
    window.island.setHitRect(rect);
  }, []);
  useLayoutEffect(reportHitRect, [reportHitRect, view, showBubble, hidden, privacyActive]);

  const onPillClick = () => {
    if (alert) {
      dismissAlert();
      return;
    }
    if (view === 'screenshot') {
      dismissScreenshot();
      return;
    }
    // Clicking only ever opens the island; it closes when the cursor leaves. Clicking an
    // open island to close it looked like "the island won't open" to a real user.
    dismissFlash();
    setExpanded(true);
  };

  return (
    <div className="stage" onContextMenu={(e) => (e.preventDefault(), window.island.showMenu())}>
      <div className="anchor">
        <motion.div
          ref={pillRef}
          className="pill"
          initial={false}
          animate={{
            width: shape.width,
            height: shape.height,
            borderRadius: shape.radius,
            opacity: hidden ? 0 : 1,
            scale: hidden ? 0.5 : 1,
            y: hidden ? -12 : 0,
          }}
          transition={{ ...islandSpring, opacity: { duration: hidden ? 0.4 : 0.2 } }}
          onUpdate={reportHitRect}
          onAnimationComplete={reportHitRect}
          onClick={onPillClick}
          onWheel={vol.onWheel}
          // Middle-click mutes. Preventing mousedown stops Chromium's autoscroll cursor.
          onMouseDown={(e) => e.button === 1 && e.preventDefault()}
          onAuxClick={(e) => e.button === 1 && vol.toggleMute()}
        >
          <AnimatePresence>
            {expanded && vol.showing && (
              <motion.div
                key="volume-chip"
                className="volume-chip-wrap"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.15 }}
              >
                <VolumeView level={vol.level} muted={vol.muted} onToggleMute={vol.toggleMute} compact={false} />
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence initial={false}>
            <motion.div
              key={`${view}:${primary?.id ?? ''}:${alert?.id ?? ''}`}
              className="content"
              style={{ width: shape.width, height: shape.height, marginLeft: -shape.width / 2 }}
              initial={{ opacity: 0, scale: 0.94, filter: 'blur(6px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)', transition: { duration: 0.22, delay: 0.06 } }}
              exit={{ opacity: 0, scale: 0.94, filter: 'blur(6px)', transition: { duration: 0.14 } }}
            >
              {renderView(view, primary, {
                alertView: alert ? <AlertView alert={alert} /> : null,
                batteryView: flash && snapshot.power ? <BatteryView kind={flash} power={snapshot.power} /> : null,
                volumeView: <VolumeView level={vol.level} muted={vol.muted} onToggleMute={vol.toggleMute} compact />,
                screenshotView: screenshot ? <ScreenshotView shot={screenshot} /> : null,
                artColor,
                launcherMedia,
                recentApps,
                onOpenApp: (id) => {
                  window.island.openApp(id);
                  setExpanded(false);
                },
                // The launcher's back button only makes sense when there is an activity to return to.
                onLauncherBack: primary ? () => setPanel('none') : undefined,
                onOpenLauncher: () => setPanel('launcher'),
                onOpenTimer: () => setPanel('timer-setup'),
                onOpenMedia: () => setPanel('media'),
                onTimerBack: () => setPanel('launcher'),
                // The new timer becomes the front activity, so show it.
                onTimerStarted: () => setPanel('none'),
              })}
            </motion.div>
          </AnimatePresence>
        </motion.div>

        <AnimatePresence onExitComplete={reportHitRect}>
          {showBubble && secondary && (
            <motion.div
              ref={bubbleRef}
              key="bubble"
              className="bubble"
              style={{ width: BUBBLE_SIZE, height: BUBBLE_SIZE, left: `calc(100% + ${BUBBLE_GAP}px)` }}
              initial={{ opacity: 0, scale: 0.3, x: -BUBBLE_SIZE }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.3, x: -BUBBLE_SIZE }}
              transition={islandSpring}
              onUpdate={reportHitRect}
              onAnimationComplete={reportHitRect}
              onClick={() => setPinnedId(secondary.id)}
            >
              <BubbleContent activity={secondary} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mic / camera in use: a dot left of the island; hover for which app. */}
        <AnimatePresence onExitComplete={reportHitRect}>
          {privacyActive && (
            <motion.div
              ref={privacyRef}
              key="privacy"
              className="privacy"
              style={{ right: `calc(100% + ${BUBBLE_GAP}px)` }}
              initial={{ opacity: 0, scale: 0.3, x: BUBBLE_SIZE }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.3, x: BUBBLE_SIZE }}
              transition={islandSpring}
              onUpdate={reportHitRect}
              onAnimationComplete={reportHitRect}
            >
              <span className="privacy-dot" style={{ background: privacyColor, color: privacyColor }} />
              <span className="privacy-label">{privacyLabel(snapshot.privacy)}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

interface ViewOptions {
  alertView: ReactNode;
  batteryView: ReactNode;
  volumeView: ReactNode;
  screenshotView: ReactNode;
  artColor: string;
  launcherMedia?: MediaState;
  recentApps: RecentApp[];
  onOpenApp: (id: string) => void;
  onLauncherBack?: () => void;
  onOpenLauncher: () => void;
  onOpenTimer: () => void;
  onOpenMedia: () => void;
  onTimerBack: () => void;
  onTimerStarted: () => void;
}

function renderView(view: View, primary: Activity | null, o: ViewOptions) {
  if (view === 'alert') return o.alertView;
  if (view === 'battery') return o.batteryView;
  if (view === 'volume') return o.volumeView;
  if (view === 'screenshot') return o.screenshotView;
  if (view === 'launcher' || view === 'launcher-media') {
    return (
      <LauncherView
        media={o.launcherMedia}
        apps={o.recentApps}
        onBack={o.onLauncherBack}
        onOpenTimer={o.onOpenTimer}
        onOpenMedia={o.onOpenMedia}
        onOpenApp={o.onOpenApp}
      />
    );
  }
  if (view === 'timer-setup') return <TimerSetup onBack={o.onTimerBack} onStarted={o.onTimerStarted} />;
  // The full player can be opened from the launcher even when music isn't the front activity.
  if (view === 'expanded-media' && o.launcherMedia) {
    return <ExpandedMedia media={o.launcherMedia} color={o.artColor} onOpenLauncher={o.onOpenLauncher} />;
  }
  if (!primary) return null;
  const expanded = view.startsWith('expanded');
  switch (primary.kind) {
    case 'media':
      return expanded ? (
        <ExpandedMedia media={primary.media} color={o.artColor} onOpenLauncher={o.onOpenLauncher} />
      ) : (
        <CompactMedia media={primary.media} color={o.artColor} />
      );
    case 'timer':
      return expanded ? <ExpandedTimer timer={primary.timer} onOpenLauncher={o.onOpenLauncher} /> : <CompactTimer timer={primary.timer} />;
  }
}

function BubbleContent({ activity }: { activity: Activity }) {
  switch (activity.kind) {
    case 'media':
      return <Art src={activity.media.artDataUrl} size={24} radius={12} />;
    case 'timer':
      return <BubbleTimer timer={activity.timer} />;
  }
}

function BubbleTimer({ timer }: { timer: TimerState }) {
  const now = useNow(timer.status === 'running', 1000);
  return <Ring progress={remainingMs(timer, now) / timer.durationMs} color={TIMER_COLOR} size={22} />;
}

/** True once `idle` has held for IDLE_HIDE_MS; false again the moment it stops. */
function useIdleHidden(idle: boolean) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (!idle) {
      setHidden(false);
      return;
    }
    const id = setTimeout(() => setHidden(true), IDLE_HIDE_MS);
    return () => clearTimeout(id);
  }, [idle]);
  return hidden;
}

/** Music stays on the island while playing and for a minute after pausing. */
function useMediaVisible(media: MediaState) {
  const [visible, setVisible] = useState(false);
  const playing = media.active && !!media.playing;
  useEffect(() => {
    if (playing) {
      setVisible(true);
      return;
    }
    if (!media.active) {
      setVisible(false);
      return;
    }
    const id = setTimeout(() => setVisible(false), PAUSED_MEDIA_MS);
    return () => clearTimeout(id);
  }, [playing, media.active]);
  return visible;
}
