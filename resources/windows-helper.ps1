# Windows helper for Island. Runs in Windows PowerShell 5.1 and streams JSON lines on stdout:
#   media / art   the current media session (GSMTC)
#   fullscreen    whether a fullscreen app is in front on the primary display
#   power         battery presence, percentage and charging state
#   start-apps / open-apps / foreground   app usage, for "Recent apps"
# Accepts commands on stdin, one per line: toggle | play | pause | next | prev | quit
# Exits when stdin closes, so it never outlives the app.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class Foreground {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint flags);
  [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO mi);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("shell32.dll")] static extern int SHQueryUserNotificationState(out int state);

  static Foreground() { SetProcessDPIAware(); }

  public static bool IsFullscreenOnPrimary() {
    IntPtr h = GetForegroundWindow();
    if (h == IntPtr.Zero) return false;
    var mi = new MONITORINFO(); mi.cbSize = Marshal.SizeOf(mi);
    if (!GetMonitorInfo(MonitorFromWindow(h, 2), ref mi) || (mi.dwFlags & 1) == 0) return false;

    // Exclusive D3D fullscreen (games) and presentation mode.
    int state;
    if (SHQueryUserNotificationState(out state) == 0 && (state == 3 || state == 4)) return true;

    // Borderless fullscreen: the foreground window covers the whole monitor.
    if (IsZoomed(h)) return false;
    var cls = new StringBuilder(64); GetClassName(h, cls, 64);
    string c = cls.ToString();
    if (c == "Progman" || c == "WorkerW" || c == "Shell_TrayWnd") return false;
    RECT r;
    if (!GetWindowRect(h, out r)) return false;
    return r.L <= mi.rcMonitor.L && r.T <= mi.rcMonitor.T && r.R >= mi.rcMonitor.R && r.B >= mi.rcMonitor.B;
  }
}
"@

# Battery state, straight from Windows (desktops report "no system battery").
Add-Type @"
using System.Runtime.InteropServices;
public static class Power {
  [StructLayout(LayoutKind.Sequential)]
  struct SYSTEM_POWER_STATUS { public byte AC; public byte Flag; public byte Percent; public byte Saver; public int Life; public int FullLife; }
  [DllImport("kernel32.dll")] static extern bool GetSystemPowerStatus(out SYSTEM_POWER_STATUS s);

  /** "hasBattery|percent|pluggedIn|charging", or null if Windows can't say. */
  public static string Status() {
    SYSTEM_POWER_STATUS s;
    if (!GetSystemPowerStatus(out s)) return null;
    bool has = (s.Flag & 128) == 0 && s.Flag != 255 && s.Percent <= 100;
    return (has ? "1" : "0") + "|" + (has ? s.Percent : 0) + "|" + (s.AC == 1 ? "1" : "0") + "|" + ((s.Flag & 8) != 0 ? "1" : "0");
  }
}
"@

# Which app owns a window: exe path, AppUserModelID (how Windows identifies Store
# apps), display name. Used for the "Recent apps" list.
Add-Type @"
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

public class AppInfo {
  public string Path;
  public string Aumid;
  public string Name;
}

public static class Apps {
  [StructLayout(LayoutKind.Sequential, Pack = 4)] public struct PROPERTYKEY { public Guid fmtid; public uint pid; }
  [StructLayout(LayoutKind.Sequential)] public struct PROPVARIANT { public ushort vt; ushort r1, r2, r3; public IntPtr p; public IntPtr p2; }

  [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IPropertyStore {
    [PreserveSig] int GetCount(out uint c);
    [PreserveSig] int GetAt(uint i, out PROPERTYKEY key);
    [PreserveSig] int GetValue(ref PROPERTYKEY key, out PROPVARIANT pv);
  }

  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr parent, EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int index);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int attr, out int value, int size);
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr h, int flags, StringBuilder s, ref int size);
  [DllImport("shell32.dll")] static extern int SHGetPropertyStoreForWindow(IntPtr h, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out IPropertyStore store);
  [DllImport("ole32.dll")] static extern int PropVariantClear(ref PROPVARIANT pv);

  // Shell surfaces that aren't apps you'd want to reopen.
  static readonly HashSet<string> SkipClasses = new HashSet<string> {
    "Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd", "NotifyIconOverflowWindow",
    "Windows.UI.Core.CoreWindow", "XamlExplorerHostIslandWindow", "TopLevelWindowForOverflowXamlIsland"
  };
  static readonly HashSet<string> SkipExes = new HashSet<string>(StringComparer.OrdinalIgnoreCase) {
    "SearchHost.exe", "SearchApp.exe", "StartMenuExperienceHost.exe", "ShellExperienceHost.exe",
    "LockApp.exe", "TextInputHost.exe", "ShellHost.exe", "powershell.exe", "conhost.exe", "rundll32.exe"
  };

  static string Text(IntPtr h, bool cls) {
    var sb = new StringBuilder(256);
    if (cls) GetClassName(h, sb, 256); else GetWindowText(h, sb, 256);
    return sb.ToString();
  }

  static string ProcessPath(uint pid) {
    IntPtr hp = OpenProcess(0x1000, false, pid); // PROCESS_QUERY_LIMITED_INFORMATION
    if (hp == IntPtr.Zero) return null;
    try {
      var sb = new StringBuilder(1024); int size = sb.Capacity;
      return QueryFullProcessImageName(hp, 0, sb, ref size) ? sb.ToString() : null;
    } finally { CloseHandle(hp); }
  }

  static string Aumid(IntPtr h) {
    var iid = new Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99");
    IPropertyStore store;
    if (SHGetPropertyStoreForWindow(h, ref iid, out store) != 0 || store == null) return null;
    try {
      var key = new PROPERTYKEY { fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), pid = 5 };
      PROPVARIANT pv;
      if (store.GetValue(ref key, out pv) != 0) return null;
      string id = pv.vt == 31 ? Marshal.PtrToStringUni(pv.p) : null; // VT_LPWSTR
      PropVariantClear(ref pv);
      return id;
    } finally { Marshal.ReleaseComObject(store); }
  }

  /** Describes the app behind a top-level window, or null if it isn't an app window. */
  public static AppInfo Describe(IntPtr h) {
    if (h == IntPtr.Zero || SkipClasses.Contains(Text(h, true))) return null;
    string title = Text(h, false);
    uint pid; GetWindowThreadProcessId(h, out pid);
    string path = ProcessPath(pid);
    if (path == null) return null;
    string exe = System.IO.Path.GetFileName(path);
    if (SkipExes.Contains(exe)) return null;

    // Store apps run inside ApplicationFrameHost; the real app is a child window's process.
    if (exe.Equals("ApplicationFrameHost.exe", StringComparison.OrdinalIgnoreCase)) {
      string inner = null;
      EnumChildWindows(h, (c, l) => {
        uint cpid; GetWindowThreadProcessId(c, out cpid);
        if (cpid != pid) { inner = ProcessPath(cpid); return false; }
        return true;
      }, IntPtr.Zero);
      path = inner;
    }

    var info = new AppInfo { Path = path, Aumid = Aumid(h) };
    if (path == null && info.Aumid == null) return null;
    string desc = null;
    try { if (path != null) desc = FileVersionInfo.GetVersionInfo(path).FileDescription; } catch { }
    // Store apps often have no description, but their window title is the app name.
    if (string.IsNullOrWhiteSpace(desc) || (path != null && path.IndexOf("\\WindowsApps\\", StringComparison.OrdinalIgnoreCase) >= 0 && title.Length > 0 && title.Length < 40))
      desc = string.IsNullOrWhiteSpace(title) ? desc : title;
    info.Name = string.IsNullOrWhiteSpace(desc) ? System.IO.Path.GetFileNameWithoutExtension(path ?? "App") : desc.Trim();
    return info;
  }

  public static AppInfo Foreground() { return Describe(GetForegroundWindow()); }

  [DllImport("shell32.dll")] static extern int SHGetKnownFolderPath(ref Guid id, uint flags, IntPtr token, out IntPtr path);

  /** Start menu app IDs can be "{KnownFolderGUID}\rest\app.exe"; this expands them to a real path. */
  public static string ExpandKnownFolder(string id) {
    if (id == null || id.Length < 39 || id[0] != '{' || id[37] != '}') return id;
    Guid g;
    if (!Guid.TryParse(id.Substring(0, 38), out g)) return id;
    IntPtr p;
    if (SHGetKnownFolderPath(ref g, 0, IntPtr.Zero, out p) != 0) return id;
    string root = Marshal.PtrToStringUni(p);
    Marshal.FreeCoTaskMem(p);
    return root + id.Substring(38);
  }

  /** App windows currently open, front-most first, as a starting point for the list. */
  public static List<AppInfo> OpenWindows() {
    var list = new List<AppInfo>();
    EnumWindows((h, l) => {
      int cloaked;
      if (!IsWindowVisible(h) || GetWindow(h, 4) != IntPtr.Zero) return true;            // GW_OWNER
      if ((GetWindowLong(h, -20) & 0x80) != 0) return true;                              // WS_EX_TOOLWINDOW
      if (DwmGetWindowAttribute(h, 14, out cloaked, 4) == 0 && cloaked != 0) return true; // DWMWA_CLOAKED
      if (Text(h, false).Length == 0) return true;
      var info = Describe(h);
      if (info != null) list.Add(info);
      return true;
    }, IntPtr.Zero);
    return list;
  }
}
"@

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IInputStream, Windows.Storage.Streams, ContentType = WindowsRuntime]

$asStreamForRead = [System.IO.WindowsRuntimeStreamExtensions].GetMethod(
    'AsStreamForRead', [Type[]]@([Windows.Storage.Streams.IInputStream]))

$asTaskOp = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1

function Await($op, [Type]$resultType, [int]$timeoutMs = 3000) {
    $task = $asTaskOp.MakeGenericMethod($resultType).Invoke($null, @($op))
    if (-not $task.Wait($timeoutMs)) { throw "WinRT operation timed out" }
    return $task.Result
}

function Emit($obj) {
    [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress -Depth 4))
    [Console]::Out.Flush()
}

function Get-ThumbnailBase64($props) {
    if ($null -eq $props.Thumbnail) { return $null }
    try {
        $stream = Await ($props.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
        # PowerShell can't bind the COM object to the overload directly, so invoke via reflection.
        $net = $asStreamForRead.Invoke($null, @($stream))
        $ms = New-Object System.IO.MemoryStream
        $net.CopyTo($ms)
        $net.Dispose()
        $bytes = $ms.ToArray()
        if ($bytes.Length -eq 0) { return $null }
        $type = if ($bytes[0] -eq 0xFF -and $bytes[1] -eq 0xD8) { 'image/jpeg' } else { 'image/png' }
        return "data:$type;base64," + [Convert]::ToBase64String($bytes)
    } catch { return $null }
}

$sessionType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]
$manager = Await ($sessionType::RequestAsync()) $sessionType

$stdin = New-Object System.IO.StreamReader([Console]::OpenStandardInput())
$pendingLine = $stdin.ReadLineAsync()

$lastTrackKey = $null
$lastArt = $null
$lastSent = $null
$lastPoll = [DateTime]::MinValue
$lastFullscreen = $null

Emit @{ type = 'ready' }

function AppJson($a) { @{ path = $a.Path; aumid = $a.Aumid; name = $a.Name } }
$lastForeground = $null
$lastPower = $null

# Start menu apps: display names and the IDs Windows launches them by.
try {
    $startApps = (New-Object -ComObject Shell.Application).NameSpace('shell:AppsFolder').Items() | ForEach-Object {
        $expanded = [Apps]::ExpandKnownFolder($_.Path)
        @{ name = $_.Name; id = $_.Path; path = $(if ($expanded -match '^[A-Za-z]:\\.*\.exe$') { $expanded } else { $null }) }
    }
    Emit @{ type = 'start-apps'; apps = @($startApps) }
} catch { Emit @{ type = 'error'; message = "start apps: $_" } }
try { Emit @{ type = 'open-apps'; apps = @([Apps]::OpenWindows() | ForEach-Object { AppJson $_ }) } } catch { }

while ($true) {
    # Commands from Electron (non-blocking check).
    if ($pendingLine.IsCompleted) {
        $cmd = $pendingLine.Result
        if ($null -eq $cmd -or $cmd -eq 'quit') { break }
        $session = $manager.GetCurrentSession()
        if ($session) {
            try {
                $op = switch ($cmd.Trim()) {
                    'toggle' { $session.TryTogglePlayPauseAsync() }
                    'play'   { $session.TryPlayAsync() }
                    'pause'  { $session.TryPauseAsync() }
                    'next'   { $session.TrySkipNextAsync() }
                    'prev'   { $session.TrySkipPreviousAsync() }
                }
                if ($op) { $null = Await $op ([bool]) }
            } catch { Emit @{ type = 'error'; message = "$_" } }
        }
        $pendingLine = $stdin.ReadLineAsync()
        $lastPoll = [DateTime]::MinValue   # refresh state right after a command
    }

    if (([DateTime]::UtcNow - $lastPoll).TotalMilliseconds -ge 1000) {
        $lastPoll = [DateTime]::UtcNow
        try {
            $fs = [Foreground]::IsFullscreenOnPrimary()
            if ($fs -ne $lastFullscreen) {
                $lastFullscreen = $fs
                Emit @{ type = 'fullscreen'; value = $fs }
            }
        } catch { }
        try {
            $power = [Power]::Status()
            if ($power -and $power -ne $lastPower) {
                $lastPower = $power
                $p = $power.Split('|')
                Emit @{ type = 'power'; hasBattery = ($p[0] -eq '1'); percent = [int]$p[1]; pluggedIn = ($p[2] -eq '1'); charging = ($p[3] -eq '1') }
            }
        } catch { }
        try {
            $fg = [Apps]::Foreground()
            $fgKey = if ($fg) { "$($fg.Aumid)|$($fg.Path)" } else { $null }
            if ($fg -and $fgKey -ne $lastForeground) {
                $lastForeground = $fgKey
                Emit @{ type = 'foreground'; app = (AppJson $fg) }
            }
        } catch { }
        try {
            $session = $manager.GetCurrentSession()
            if ($null -eq $session) {
                $state = @{ type = 'media'; active = $false }
            } else {
                $props = Await ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
                $info = $session.GetPlaybackInfo()
                $tl = $session.GetTimelineProperties()
                $trackKey = "$($session.SourceAppUserModelId)|$($props.Title)|$($props.Artist)"
                if ($trackKey -ne $lastTrackKey) {
                    $lastTrackKey = $trackKey
                    $lastArt = Get-ThumbnailBase64 $props
                }
                $state = @{
                    type        = 'media'
                    active      = $true
                    app         = $session.SourceAppUserModelId
                    title       = $props.Title
                    artist      = $props.Artist
                    album       = $props.AlbumTitle
                    playing     = ($info.PlaybackStatus.ToString() -eq 'Playing')
                    canNext     = $info.Controls.IsNextEnabled
                    canPrev     = $info.Controls.IsPreviousEnabled
                    positionMs  = [long]$tl.Position.TotalMilliseconds
                    durationMs  = [long]($tl.EndTime - $tl.StartTime).TotalMilliseconds
                    updatedAtMs = $tl.LastUpdatedTime.ToUnixTimeMilliseconds()
                    trackKey    = $trackKey
                }
            }
            # Ignore updatedAtMs when diffing: some players bump it every poll while paused.
            $diffKey = ($state.GetEnumerator() | Where-Object { $_.Key -ne 'updatedAtMs' } |
                Sort-Object Key | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join ';'
            if ($diffKey -ne $lastSent) {
                $lastSent = $diffKey
                Emit $state
                # Art is sent separately and only when the track changes.
                if ($state.active -and $lastArtSentKey -ne $lastTrackKey) {
                    $lastArtSentKey = $lastTrackKey
                    Emit @{ type = 'art'; trackKey = $lastTrackKey; dataUrl = $lastArt }
                }
            }
        } catch {
            Emit @{ type = 'error'; message = "$_" }
        }
    }

    Start-Sleep -Milliseconds 100
}
