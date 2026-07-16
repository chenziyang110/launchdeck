$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $PSCommandPath
$repoRoot = Resolve-Path (Join-Path $scriptDir "..\..")
$skillRoot = Join-Path $repoRoot ".agents\skills\launchdeck-agent"

$requiredFiles = @(
  "SKILL.md",
  "references\intent-routing.md",
  "references\adoption-flow.md",
  "references\discovery-rules.md",
  "references\command-flows.md",
  "references\recovery-playbooks.md",
  "references\clean-safety.md",
  "references\eval-prompts.md"
)

foreach ($relativePath in $requiredFiles) {
  $path = Join-Path $skillRoot $relativePath
  if (-not (Test-Path $path)) {
    throw "Missing required skill file: $relativePath"
  }
  if ((Get-Item $path).Length -eq 0) {
    throw "Required skill file is empty: $relativePath"
  }
}

$unsafePattern = "(taskkill|kill -9|pkill|Stop-Process|fuser)"
$matches = Get-ChildItem -Path $skillRoot -Recurse -File | Select-String -Pattern $unsafePattern -ErrorAction SilentlyContinue
if ($matches) {
  $formatted = $matches | ForEach-Object { "$($_.Path):$($_.LineNumber): $($_.Line.Trim())" }
  throw "Unsafe raw process command guidance found:`n$($formatted -join "`n")"
}

Write-Output "Launchdeck agent skill validation passed."
Write-Output "Checked $($requiredFiles.Count) required files under $skillRoot."
