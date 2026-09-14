# Pixel crops from the supplied ZIP mockups. No redrawing or generated artwork.
Add-Type -AssemblyName System.Drawing
$akizRoot = Split-Path $PSScriptRoot -Parent
$akizSource = Join-Path $akizRoot 'assets\images\references\akiz-current'
$akizOutput = Join-Path $akizRoot 'assets\images\current'
New-Item -ItemType Directory -Path $akizOutput -Force | Out-Null
function Export-AkizCrop($File, $Name, $X, $Y, $Width, $Height) {
  $source = [Drawing.Bitmap]::FromFile((Join-Path $akizSource "$File.png"))
  $crop = $source.Clone([Drawing.Rectangle]::new($X, $Y, $Width, $Height), [Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $crop.Save((Join-Path $akizOutput "$Name.png"), [Drawing.Imaging.ImageFormat]::Png)
  $crop.Dispose(); $source.Dispose()
}
Export-AkizCrop 9 'logo' 164 37 142 49
Export-AkizCrop 1 'hero-scene' 610 96 756 672
Export-AkizCrop 1 'hero-mountains' 0 700 516 68
Export-AkizCrop 1 'hero-cloud' 592 394 180 86
Export-AkizCrop 1 'hero-edge' 0 106 99 207
Export-AkizCrop 9 'application-landscape' 901 365 465 335
Export-AkizCrop 9 'application-mountains' 0 214 463 496
Export-AkizCrop 9 'application-sakura' 768 137 130 147
Export-AkizCrop 9 'form-name' 516 263 25 27
Export-AkizCrop 9 'form-phone' 516 332 25 27
Export-AkizCrop 9 'form-email' 516 401 25 27
Export-AkizCrop 9 'form-telegram' 516 469 25 27
Export-AkizCrop 11 'test-sakura' 866 144 207 153
Export-AkizCrop 6 'reviews-landscape' 751 0 615 401
Export-AkizCrop 6 'reviews-divider' 85 199 485 51
Export-AkizCrop 6 'reviews-card' 51 501 418 275
Export-AkizCrop 6 'reviews-waves' 0 772 418 86
Export-AkizCrop 7 'cta-landscape' 0 272 667 194
Export-AkizCrop 42 'result-flower' 1028 228 48 51
Export-AkizCrop 42 'result-cloud-left' 169 535 134 182
Export-AkizCrop 42 'result-cloud-right' 1096 542 110 176
Export-AkizCrop 8 'footer-ip' 356 241 38 36
Export-AkizCrop 8 'footer-inn' 575 241 38 36
Export-AkizCrop 8 'footer-ogrnip' 794 241 38 36
# Interior of each supplied dial; the browser clips the bitmap numerals and draws
# accessible N/15 and the mathematically exact arc separately (DOCX takes priority).
$dials = @(
  @(413, 395, 168), @(406, 397, 168), @(414, 393, 170), @(411, 410, 175),
  @(424, 406, 166), @(403, 417, 166), @(421, 397, 163), @(415, 411, 166),
  @(421, 409, 165), @(410, 398, 162), @(409, 407, 168), @(397, 397, 164),
  @(411, 400, 164), @(425, 405, 166), @(405, 402, 168), @(415, 398, 168)
)
for ($score = 0; $score -le 15; $score++) {
  $dial = $dials[$score]; $radius = $dial[2]
  Export-AkizCrop ($score + 27) "dial-$score" ($dial[0] - $radius) ($dial[1] - $radius) ($radius * 2) ($radius * 2)
}
