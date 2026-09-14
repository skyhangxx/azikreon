Add-Type -AssemblyName System.Drawing

$sourcePath = Join-Path $PSScriptRoot '..\assets\images\sakura-branch-watercolor-v2.png'
$targetPath = Join-Path $PSScriptRoot '..\assets\images\sakura-branch-watercolor-transparent.png'
$source = [System.Drawing.Bitmap]::FromFile((Resolve-Path -LiteralPath $sourcePath))
$target = New-Object System.Drawing.Bitmap($source.Width, $source.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($target)
$graphics.DrawImageUnscaled($source, 0, 0)
$graphics.Dispose()
$source.Dispose()

$rect = New-Object System.Drawing.Rectangle(0, 0, $target.Width, $target.Height)
$data = $target.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadWrite, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$bytes = New-Object byte[] ([Math]::Abs($data.Stride) * $target.Height)
[Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)

for ($offset = 0; $offset -lt $bytes.Length; $offset += 4) {
  $blue = [int]$bytes[$offset]
  $green = [int]$bytes[$offset + 1]
  $red = [int]$bytes[$offset + 2]
  $maximum = [Math]::Max($red, [Math]::Max($green, $blue))
  $minimum = [Math]::Min($red, [Math]::Min($green, $blue))
  $chroma = $maximum - $minimum

  if ($minimum -ge 232 -and $chroma -le 12) {
    $bytes[$offset + 3] = 0
  }
  elseif ($minimum -ge 216 -and $chroma -le 20) {
    $edgeAlpha = [Math]::Min(255, [Math]::Max(0, (($chroma - 7) * 13) + ((232 - $minimum) * 8)))
    $bytes[$offset + 3] = [byte]$edgeAlpha
  }
}

[Runtime.InteropServices.Marshal]::Copy($bytes, 0, $data.Scan0, $bytes.Length)
$target.UnlockBits($data)
$target.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
$target.Dispose()
