# Offline narration: Windows SAPI (no network, no keys).
# Writes assets/audio/<scene>.wav and <scene>.words.json (the engine's own word start times, used to cue the visuals).
param([string]$Voice = 'Microsoft David Desktop', [int]$Rate = 1)
Add-Type -AssemblyName System.Speech
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root 'assets\audio'
New-Item -ItemType Directory -Force $out | Out-Null
$lines = Get-Content (Join-Path $root 'narration.json') -Raw | ConvertFrom-Json
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice($Voice)
$synth.Rate = $Rate
$script:words = New-Object System.Collections.ArrayList
$synth.add_SpeakProgress({
  param($s, $e)
  [void]$script:words.Add([pscustomobject]@{ c = $e.CharacterPosition; n = $e.CharacterCount; t = [math]::Round($e.AudioPosition.TotalSeconds, 3) })
})
foreach ($p in $lines.PSObject.Properties) {
  $script:words.Clear()
  $file = Join-Path $out ($p.Name + '.wav')
  $synth.SetOutputToWaveFile($file)
  $synth.Speak($p.Value)
  $synth.SetOutputToNull()
  ($script:words | ConvertTo-Json -Compress) | Set-Content -Encoding UTF8 (Join-Path $out ($p.Name + '.words.json'))
  Write-Host ("wrote {0} ({1} word events)" -f $file, $script:words.Count)
}
$synth.Dispose()
