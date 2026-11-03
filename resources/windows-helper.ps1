# Windows helper for Island. Runs in Windows PowerShell 5.1 and streams JSON lines on stdout:
#   media / art   the current media session (GSMTC)
#   fullscreen    whether a fullscreen app is in front on the primary display
#   power         battery presence, percentage and charging state
#   volume        system volume (percent) and mute state
#   privacy       apps using the microphone or camera right now
#   clipboard     the clipboard changed (Island then checks it for a screenshot)
#   start-apps / open-apps / foreground   app usage, for "Recent apps"
# Accepts commands on stdin, one per line: toggle | play | pause | next | prev |
#   vol-set <0-100> | mute-toggle | quit
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

# Clipboard change counter: cheap to poll, and tells Island when to look for a new screenshot.
Add-Type @"
using System.Runtime.InteropServices;
public static class Clip {
  [DllImport("user32.dll")] public static extern uint GetClipboardSequenceNumber();
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

# System volume of the default output device (Core Audio).
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Volume {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorCom { }

  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator {
    [PreserveSig] int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
    [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
  }

  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice {
    [PreserveSig] int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
  }

  // Methods must stay in vtable order, including the ones that aren't called.
  [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioEndpointVolume {
    [PreserveSig] int RegisterControlChangeNotify(IntPtr notify);
    [PreserveSig] int UnregisterControlChangeNotify(IntPtr notify);
    [PreserveSig] int GetChannelCount(out uint count);
    [PreserveSig] int SetMasterVolumeLevel(float db, ref Guid ctx);
    [PreserveSig] int SetMasterVolumeLevelScalar(float level, ref Guid ctx);
    [PreserveSig] int GetMasterVolumeLevel(out float db);
    [PreserveSig] int GetMasterVolumeLevelScalar(out float level);
    [PreserveSig] int SetChannelVolumeLevel(uint channel, float db, ref Guid ctx);
    [PreserveSig] int SetChannelVolumeLevelScalar(uint channel, float level, ref Guid ctx);
    [PreserveSig] int GetChannelVolumeLevel(uint channel, out float db);
    [PreserveSig] int GetChannelVolumeLevelScalar(uint channel, out float level);
    [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx);
    [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
  }

  // Looked up on every call, so switching to headphones etc. is picked up automatically.
  static IAudioEndpointVolume Endpoint() {
    var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorCom();
    try {
      IMMDevice device;
      if (enumerator.GetDefaultAudioEndpoint(0, 1, out device) != 0 || device == null) return null; // eRender, eMultimedia
      try {
        var iid = new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");
        object o;
        return device.Activate(ref iid, 23, IntPtr.Zero, out o) == 0 ? (IAudioEndpointVolume)o : null; // CLSCTX_ALL
      } finally { Marshal.ReleaseComObject(device); }
    } finally { Marshal.ReleaseComObject(enumerator); }
  }

  /** "percent|muted", or null when there is no output device. */
  public static string Get() {
    var v = Endpoint();
    if (v == null) return null;
    try {
      float level; bool muted;
      v.GetMasterVolumeLevelScalar(out level);
      v.GetMute(out muted);
      return (int)Math.Round(level * 100) + "|" + (muted ? "1" : "0");
    } finally { Marshal.ReleaseComObject(v); }
  }

  /** Sets the volume in percent; turning it up from mute unmutes, like the volume keys do. */
  public static void Set(int percent) {
    var v = Endpoint();
    if (v == null) return;
    try {
      var ctx = Guid.Empty;
      v.SetMasterVolumeLevelScalar(Math.Max(0, Math.Min(100, percent)) / 100f, ref ctx);
      bool muted; v.GetMute(out muted);
      if (muted && percent > 0) v.SetMute(false, ref ctx);
    } finally { Marshal.ReleaseComObject(v); }
  }

  public static void ToggleMute() {
    var v = Endpoint();
    if (v == null) return;
    try {
      var ctx = Guid.Empty;
      bool muted; v.GetMute(out muted);
      v.SetMute(!muted, ref ctx);
    } finally { Marshal.ReleaseComObject(v); }
  }
}
"@

# Which apps are using the microphone / camera right now. Microphone: active capture sessions
# from the audio engine. Camera: Windows logs each use under
# CapabilityAccessManager\ConsentStore; an open session has LastUsedTimeStop = 0.
Add-Type @"
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32;

public class DeviceUser {
  public string Path;    // desktop apps
  public string Family;  // Store apps (package family name)
  public string Name;
}

public static class Privacy {
  const string Root = @"Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\";

  static bool Open(RegistryKey k) {
    if (k == null) return false;
    var start = k.GetValue("LastUsedTimeStart") as long?;
    var stop = k.GetValue("LastUsedTimeStop") as long?;
    return start.HasValue && start.Value != 0 && stop.HasValue && stop.Value == 0;
  }

  static string Describe(string path) {
    if (path.StartsWith(Environment.GetFolderPath(Environment.SpecialFolder.System), StringComparison.OrdinalIgnoreCase)) return "Windows";
    try { var d = FileVersionInfo.GetVersionInfo(path).FileDescription; if (!string.IsNullOrWhiteSpace(d)) return d.Trim(); } catch { }
    return System.IO.Path.GetFileNameWithoutExtension(path);
  }

  // --- Microphone: active capture sessions, straight from the audio engine. ---
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorCom { }

  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator {
    [PreserveSig] int EnumAudioEndpoints(int dataFlow, int stateMask, out IMMDeviceCollection devices);
  }
  [ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceCollection {
    [PreserveSig] int GetCount(out uint count);
    [PreserveSig] int Item(uint index, out IMMDevice device);
  }
  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice {
    [PreserveSig] int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
  }
  // Methods in vtable order, including unused ones.
  [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionManager2 {
    [PreserveSig] int GetAudioSessionControl(IntPtr guid, uint flags, out IntPtr control);
    [PreserveSig] int GetSimpleAudioVolume(IntPtr guid, uint flags, out IntPtr volume);
    [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator sessions);
  }
  [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionEnumerator {
    [PreserveSig] int GetCount(out int count);
    [PreserveSig] int GetSession(int index, out IAudioSessionControl2 session);
  }
  [ComImport, Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionControl2 {
    [PreserveSig] int GetState(out int state);
    [PreserveSig] int GetDisplayName(out IntPtr name);
    [PreserveSig] int SetDisplayName(IntPtr name, IntPtr ctx);
    [PreserveSig] int GetIconPath(out IntPtr path);
    [PreserveSig] int SetIconPath(IntPtr path, IntPtr ctx);
    [PreserveSig] int GetGroupingParam(out Guid param);
    [PreserveSig] int SetGroupingParam(IntPtr param, IntPtr ctx);
    [PreserveSig] int RegisterAudioSessionNotification(IntPtr n);
    [PreserveSig] int UnregisterAudioSessionNotification(IntPtr n);
    [PreserveSig] int GetSessionIdentifier(out IntPtr id);
    [PreserveSig] int GetSessionInstanceIdentifier(out IntPtr id);
    [PreserveSig] int GetProcessId(out uint pid);
    [PreserveSig] int IsSystemSoundsSession();
  }

  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr h, int flags, StringBuilder s, ref int size);

  static string ProcessPath(uint pid) {
    IntPtr hp = OpenProcess(0x1000, false, pid);
    if (hp == IntPtr.Zero) return null;
    try { var sb = new StringBuilder(1024); int n = sb.Capacity; return QueryFullProcessImageName(hp, 0, sb, ref n) ? sb.ToString() : null; }
    finally { CloseHandle(hp); }
  }

  /** Apps with an active recording session on any microphone. */
  public static List<DeviceUser> MicrophoneUsers() {
    var list = new List<DeviceUser>();
    var seen = new HashSet<uint>();
    var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorCom();
    IMMDeviceCollection devices;
    if (enumerator.EnumAudioEndpoints(1, 1, out devices) != 0) return list; // eCapture, DEVICE_STATE_ACTIVE
    uint count; devices.GetCount(out count);
    for (uint i = 0; i < count; i++) {
      IMMDevice device;
      if (devices.Item(i, out device) != 0) continue;
      var iid = new Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F");
      object o;
      if (device.Activate(ref iid, 23, IntPtr.Zero, out o) != 0) continue;
      IAudioSessionEnumerator sessions;
      if (((IAudioSessionManager2)o).GetSessionEnumerator(out sessions) != 0) continue;
      int n; sessions.GetCount(out n);
      for (int s = 0; s < n; s++) {
        IAudioSessionControl2 session;
        if (sessions.GetSession(s, out session) != 0) continue;
        int state; uint pid;
        session.GetState(out state);
        session.GetProcessId(out pid);
        bool system = session.IsSystemSoundsSession() == 0; // S_OK means it is the system session
        if (state != 1 || system || pid == 0 || !seen.Add(pid)) continue; // 1 = AudioSessionStateActive
        string path = ProcessPath(pid);
        if (path != null) list.Add(new DeviceUser { Path = path, Name = Describe(path) });
      }
    }
    return list;
  }

  /** capability: "microphone" or "webcam". The microphone comes from the audio engine; the
      camera from Windows' usage log, which some newer Windows builds no longer write. */
  public static List<DeviceUser> InUse(string capability) {
    if (capability == "microphone") return MicrophoneUsers();
    var list = new List<DeviceUser>();
    using (var store = Registry.CurrentUser.OpenSubKey(Root + capability)) {
      if (store == null) return list;
      foreach (var name in store.GetSubKeyNames()) {
        if (name == "NonPackaged") continue;
        using (var k = store.OpenSubKey(name)) if (Open(k)) list.Add(new DeviceUser { Family = name });
      }
      using (var np = store.OpenSubKey("NonPackaged")) {
        if (np == null) return list;
        foreach (var name in np.GetSubKeyNames()) {
          using (var k = np.OpenSubKey(name)) {
            if (!Open(k)) continue;
            string path = name.Replace('#', '\\');
            // An app that crashed mid-use never writes a stop time; only trust running ones.
            if (Process.GetProcessesByName(System.IO.Path.GetFileNameWithoutExtension(path)).Length == 0) continue;
            list.Add(new DeviceUser { Path = path, Name = Describe(path) });
          }
        }
      }
    }
    return list;
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
$lastVolume = $null
$lastPrivacy = $null
$volumeChanged = $false
$lastClip = [Clip]::GetClipboardSequenceNumber()   # only report changes after startup

function Check-Volume {
    try {
        $v = [Volume]::Get()
        if ($v -and $v -ne $script:lastVolume) {
            $script:lastVolume = $v
            $p = $v.Split('|')
            Emit @{ type = 'volume'; level = [int]$p[0]; muted = ($p[1] -eq '1') }
        }
    } catch { }
}

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
    # Drain every waiting command. Scrolling sends many volume changes; only the last counts.
    $volumeTarget = $null
    $quit = $false
    while ($pendingLine.IsCompleted) {
        $cmd = $pendingLine.Result
        if ($null -eq $cmd -or $cmd -eq 'quit') { $quit = $true; break }
        $cmd = $cmd.Trim()
        $pendingLine = $stdin.ReadLineAsync()
        if ($cmd -match '^vol-set (\d{1,3})$') { $volumeTarget = [int]$Matches[1]; continue }
        if ($cmd -eq 'mute-toggle') { try { [Volume]::ToggleMute() } catch { }; $volumeChanged = $true; continue }
        $session = $manager.GetCurrentSession()
        if ($session) {
            try {
                $op = switch ($cmd) {
                    'toggle' { $session.TryTogglePlayPauseAsync() }
                    'play'   { $session.TryPlayAsync() }
                    'pause'  { $session.TryPauseAsync() }
                    'next'   { $session.TrySkipNextAsync() }
                    'prev'   { $session.TrySkipPreviousAsync() }
                }
                if ($op) { $null = Await $op ([bool]) }
            } catch { Emit @{ type = 'error'; message = "$_" } }
        }
        $lastPoll = [DateTime]::MinValue   # refresh media state right after a media command
    }
    if ($quit) { break }
    if ($null -ne $volumeTarget) { try { [Volume]::Set($volumeTarget) } catch { }; $volumeChanged = $true }
    if ($volumeChanged) { $volumeChanged = $false; Check-Volume }

    if (([DateTime]::UtcNow - $lastPoll).TotalMilliseconds -ge 1000) {
        $lastPoll = [DateTime]::UtcNow
        try {
            $fs = [Foreground]::IsFullscreenOnPrimary()
            if ($fs -ne $lastFullscreen) {
                $lastFullscreen = $fs
                Emit @{ type = 'fullscreen'; value = $fs }
            }
        } catch { }
        Check-Volume   # catches changes made elsewhere, e.g. keyboard volume keys
        try {
            $mic = @([Privacy]::InUse('microphone') | ForEach-Object { @{ path = $_.Path; family = $_.Family; name = $_.Name } })
            $cam = @([Privacy]::InUse('webcam') | ForEach-Object { @{ path = $_.Path; family = $_.Family; name = $_.Name } })
            $privacyKey = (($mic + $cam) | ForEach-Object { "$($_.path)$($_.family)" }) -join '|'
            $privacyKey = "$($mic.Count):$($cam.Count):$privacyKey"
            if ($privacyKey -ne $lastPrivacy) {
                $lastPrivacy = $privacyKey
                Emit @{ type = 'privacy'; mic = $mic; camera = $cam }
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

    # Something new on the clipboard (checked every tick so screenshot previews feel instant).
    $clip = [Clip]::GetClipboardSequenceNumber()
    if ($clip -ne $lastClip) { $lastClip = $clip; Emit @{ type = 'clipboard' } }

    Start-Sleep -Milliseconds 100
}
