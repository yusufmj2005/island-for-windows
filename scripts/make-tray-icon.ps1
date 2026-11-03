# Draws the island pill icon into resources/:
#   tray.png, tray@2x.png, tray@3x.png   tray icon at 16, 32 and 48 px
#   island.ico                           app icon for shortcuts (16-256 px)
# Run once: powershell -ExecutionPolicy Bypass -File scripts/make-tray-icon.ps1
Add-Type -AssemblyName System.Drawing

function New-PillPng([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $g.Clear([System.Drawing.Color]::Transparent)

    $w = $size * 0.94; $h = $size * 0.5
    $x = ($size - $w) / 2; $y = ($size - $h) / 2
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc($x, $y, $h, $h, 90, 180)
    $path.AddArc($x + $w - $h, $y, $h, $h, 270, 180)
    $path.CloseFigure()

    # Black pill with a light rim so it reads on both light and dark backgrounds.
    $g.FillPath([System.Drawing.Brushes]::Black, $path)
    $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(230, 255, 255, 255)), ([Math]::Max(1, $size / 16))
    $g.DrawPath($pen, $path)

    # A small orange "activity" dot on the right.
    $d = $h * 0.42
    $orange = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 255, 159, 10))
    $g.FillEllipse($orange, $x + $w - $h / 2 - $d / 2, $y + ($h - $d) / 2, $d, $d)

    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
    return , $ms.ToArray()
}

# ICO files can hold PNG-encoded images directly.
function Write-Ico([int[]]$sizes, [string]$out) {
    $images = $sizes | ForEach-Object { , (New-PillPng $_) }
    $fs = [System.IO.File]::Create($out)
    $w = New-Object System.IO.BinaryWriter $fs
    $w.Write([uint16]0); $w.Write([uint16]1); $w.Write([uint16]$sizes.Count)
    $offset = 6 + 16 * $sizes.Count
    for ($i = 0; $i -lt $sizes.Count; $i++) {
        $s = $sizes[$i]; $len = $images[$i].Length
        $w.Write([byte]($s % 256)); $w.Write([byte]($s % 256))   # 256 is stored as 0
        $w.Write([byte]0); $w.Write([byte]0)
        $w.Write([uint16]1); $w.Write([uint16]32)
        $w.Write([uint32]$len); $w.Write([uint32]$offset)
        $offset += $len
    }
    foreach ($img in $images) { $w.Write($img) }
    $w.Close()
}

$dir = Join-Path $PSScriptRoot '..\resources'
[System.IO.File]::WriteAllBytes((Join-Path $dir 'tray.png'), (New-PillPng 16))
[System.IO.File]::WriteAllBytes((Join-Path $dir 'tray@2x.png'), (New-PillPng 32))
[System.IO.File]::WriteAllBytes((Join-Path $dir 'tray@3x.png'), (New-PillPng 48))
Write-Ico @(16, 24, 32, 48, 64, 128, 256) (Join-Path $dir 'island.ico')
