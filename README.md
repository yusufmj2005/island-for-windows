# Island — a Dynamic Island-style pill for Windows

A black, animated pill at the top centre of your screen that shows what's going on: music and timers. Hover to see it react, click to expand, right-click for options.

Built with Electron, React, TypeScript and Framer Motion. v0.1.

## Run it

```bash
npm install
npm start          # build, then launch
npm run dev        # hot-reloading dev mode
npm run typecheck
```

Requires Windows 10/11 and Node 22+. No .NET SDK or admin rights needed.

**Installer:** `npm run dist` builds `release/Island Setup 0.1.0.exe`, a per-user installer (no admin rights) with Desktop and Start menu shortcuts and an uninstaller. It isn't code-signed, so Windows SmartScreen asks for confirmation the first time ("More info" → "Run anyway").

To get **Island** shortcuts on the Desktop and in the Start menu (after `npm run build`):

```bash
powershell -ExecutionPolicy Bypass -File scripts/create-shortcuts.ps1
```

The shortcuts run the last build, so run `npm run build` after changing code. Re-run the script if you move the project folder.

To close Island: the tray icon's menu → **Quit Island**, or click the idle island → **Quit** (twice).

## What it does

| State | What you see |
| --- | --- |
| Idle | A small pill that grows slightly on hover. After 10 s with nothing happening it fades away; it returns when music or a timer starts, or when you move the cursor to the top centre (right-click → **Hide when idle (10 s)** to turn this off) |
| Click (idle) | Launcher: mini player for paused music, a **Timer** button, **Recent apps** and Quit |
| Recent apps | The apps you last brought to the front, newest first; click an icon to open the app. Right-click an icon to **pin** it to the front (blue dot) or **remove** it. The list stays on this PC (`island-state.json`) |
| Timer button | Setup panel: pick a duration with − / + (or scroll), presets from 1 min to 1 hr, then **Start** |
| Grid button (any expanded view) | Opens the launcher on top of the current activity; **Back** returns to it |
| Music playing | Album art + waveform tinted from the artwork; click for title, progress and controls |
| Timer | Countdown ring + time; click for pause, cancel, +1 min |
| Two activities | The second one splits off into a bubble; click it to swap |
| Volume | Scroll on the island to change the system volume (2% per notch); a volume bar shows on the closed island, or a chip over the open one. Click the speaker or **middle-click** the island to mute |
| Mic / camera in use | A small dot left of the island while an app records from the microphone (orange) or camera (green); hover it for which app. The island never auto-hides while it shows |
| Screenshot preview | Copying a screenshot (Win+Shift+S, Print Screen) shows a thumbnail: **drag** it into any app, or **Save** it to Pictures › Screenshots. Turn off in the right-click menu |
| Battery (laptops) | Plugging in the charger briefly shows **Charging 48%** with a green battery; dropping to 20% or 10% on battery shows a red **Low Battery** warning. Desktops without a battery never show it |
| Timer finished | Alert with a chime, then "Done" until dismissed (auto-clears after a minute) |

Right-click the island for a quick 5 min timer, position nudges (for off-centre webcams), hide-when-idle, hide-in-fullscreen, open-at-login and Quit.

**Ctrl+Alt+Space** hides or restores the island instantly (timers and music keep running). If another app owns that shortcut, Island falls back to Ctrl+Alt+I, then Ctrl+Shift+Alt+H; the right-click menu shows which one is active. It also hides itself while a fullscreen app or game is in front.

## How it works

- **One fixed transparent window** (460×260, always on top). The pill morphs *inside* it; the window never resizes, which avoids flicker.
- **Click-through**: the window ignores the mouse except over the pill. The main process polls the cursor every 40 ms against the pill's area (reported by the renderer), so a missed mouse event can never leave it blocking clicks.
- **Music** comes from the Windows media session API (GSMTC) via `resources/windows-helper.ps1`, a Windows PowerShell 5.1 script (which also detects fullscreen apps) that streams JSON lines. It's behind a `MediaProvider` interface so it can be swapped for a native helper later. Works with apps that integrate with Windows media controls (Spotify, most browsers, etc.).
- **Timers** are wall-clock timestamps owned by the main process, re-checked after sleep and persisted to `%APPDATA%\Island\island-state.json`.

```
electron/main/        main process: window, click-through, IPC validation
  TimerService.ts     timers
  WindowsHelper.ts    runs the PowerShell helper (MediaProvider + fullscreen)
  media/              MediaProvider interface, MediaService
electron/preload/     typed, minimal bridge (contextIsolation, sandbox)
src/                  React UI
  activities.ts       ranking, view selection, shapes
  components/Island   the morphing pill and bubble
  views/              compact/expanded views per activity
resources/windows-helper.ps1   media session + fullscreen detection
```

## Not in v0.1 yet

Multi-monitor choice, downloads, notifications, brightness, calendar, weather/sports, plugins. Camera detection relies on a Windows usage log that some recent Windows builds no longer write; the microphone uses the audio engine directly and works everywhere.
