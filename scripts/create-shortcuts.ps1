# Creates "Island" shortcuts on the Desktop and in the Start menu that launch this
# project's built app with its bundled Electron. Re-run if the project folder moves.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/create-shortcuts.ps1
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$electron = Join-Path $root 'node_modules\electron\dist\electron.exe'
$icon = Join-Path $root 'resources\island.ico'

if (-not (Test-Path $electron)) { throw "Electron not found at $electron. Run 'npm install' first." }
if (-not (Test-Path (Join-Path $root 'dist-electron\main.js'))) { throw "App not built. Run 'npm run build' first." }

$shell = New-Object -ComObject WScript.Shell
$targets = @(
    (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Island.lnk'),
    (Join-Path ([Environment]::GetFolderPath('Programs')) 'Island.lnk')
)
foreach ($path in $targets) {
    $lnk = $shell.CreateShortcut($path)
    $lnk.TargetPath = $electron
    $lnk.Arguments = "`"$root`""
    $lnk.WorkingDirectory = $root
    $lnk.IconLocation = "$icon,0"
    $lnk.Description = 'Island - a Dynamic Island-style pill for Windows'
    $lnk.Save()
    "Created $path"
}
