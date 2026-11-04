import { useEffect, useState, type ReactNode } from 'react';
import type { IslandSettings, SettingsInfo } from '../shared/types';

const IDLE_CHOICES = [5, 10, 30, 60];

/** "Control+Alt+I" -> "Ctrl + Alt + I" */
const shortcutLabel = (s: string) => s.replace('Control', 'Ctrl').split('+').join(' + ');

/** The settings window. Every change applies immediately; there's nothing to save. */
export function SettingsApp() {
  const [info, setInfo] = useState<SettingsInfo | null>(null);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    window.island.getSettingsInfo().then(setInfo);
    return window.island.onSettingsInfo(setInfo);
  }, []);

  if (!info) return null;
  const s = info.settings;
  const set = (patch: Partial<IslandSettings>) => {
    setInfo({ ...info, settings: { ...s, ...patch } }); // so sliders follow the pointer instantly
    window.island.updateSettings(patch);
  };

  return (
    <main className="settings-page">
      <h1>Island Settings</h1>

      <Section title="General">
        <Toggle label="Open at login" hint="Start Island when you sign in to Windows" on={s.openAtLogin} onChange={(openAtLogin) => set({ openAtLogin })} />
        <Toggle label="Screenshot previews" hint="Show a thumbnail after taking a screenshot" on={s.showScreenshots} onChange={(showScreenshots) => set({ showScreenshots })} />
      </Section>

      <Section title="Hiding">
        <Toggle label="Hide when idle" hint="Fade away when nothing is happening" on={s.hideWhenIdle} onChange={(hideWhenIdle) => set({ hideWhenIdle })} />
        <Row label="Hide after" dim={!s.hideWhenIdle}>
          <div className="seg" role="radiogroup" aria-label="Hide after">
            {IDLE_CHOICES.map((sec) => (
              <button
                key={sec}
                role="radio"
                aria-checked={s.idleHideSeconds === sec}
                className={s.idleHideSeconds === sec ? 'on' : ''}
                disabled={!s.hideWhenIdle}
                onClick={() => set({ idleHideSeconds: sec })}
              >
                {sec}s
              </button>
            ))}
          </div>
        </Row>
        <Toggle label="Hide in fullscreen apps" hint="Games and fullscreen videos" on={s.autoHideFullscreen} onChange={(autoHideFullscreen) => set({ autoHideFullscreen })} />
        <Row label="Hide or show instantly">
          <span className="keys">{info.hideShortcut ? shortcutLabel(info.hideShortcut) : 'Not available'}</span>
        </Row>
      </Section>

      <Section title="Position">
        <Slider label="Left / right" value={s.offsetX} min={-400} max={400} step={2} onChange={(offsetX) => set({ offsetX })} />
        <Slider label="Down from the top" value={s.offsetY} min={0} max={40} step={1} onChange={(offsetY) => set({ offsetY })} />
        <div className="row-end">
          <button className="btn" disabled={s.offsetX === 0 && s.offsetY === 0} onClick={() => set({ offsetX: 0, offsetY: 0 })}>
            Reset position
          </button>
        </div>
      </Section>

      <Section title="Recent apps">
        <Row label="Clear the list" hint="Pinned apps stay">
          <button
            className="btn"
            disabled={cleared}
            onClick={() => {
              window.island.settingsAction('clear-recent-apps');
              setCleared(true);
            }}
          >
            {cleared ? 'Cleared' : 'Clear'}
          </button>
        </Row>
      </Section>

      <Section title="About">
        <Row label={`Island ${info.version}`}>
          <button className="btn" onClick={() => window.island.settingsAction('open-repo')}>GitHub page</button>
        </Row>
        <Row label="Having a problem?" hint="Include this log when reporting it">
          <button className="btn" onClick={() => window.island.settingsAction('open-log')}>Open log</button>
        </Row>
        <Row label="Close Island">
          <button className="btn danger" onClick={() => window.island.settingsAction('quit')}>Quit</button>
        </Row>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2>{title}</h2>
      <div className="card">{children}</div>
    </section>
  );
}

function Row({ label, hint, dim, children }: { label: string; hint?: string; dim?: boolean; children: ReactNode }) {
  return (
    <div className={`row-item ${dim ? 'dim' : ''}`}>
      <div className="row-text">
        <div className="row-label">{label}</div>
        {hint && <div className="row-hint">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <Row label={label} hint={hint}>
      <button role="switch" aria-checked={on} aria-label={label} className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)}>
        <span />
      </button>
    </Row>
  );
}

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div className="row-item slider-item">
      <div className="slider-head">
        <span className="row-label">{label}</span>
        <span className="row-hint">{value} px</span>
      </div>
      <input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}
