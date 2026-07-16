param(
  [switch]$Copy,
  [switch]$Force,
  [string]$SkillName = "launchdeck-agent",
  [string]$HostSkillsPath = ".codex/skills"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $PSCommandPath
$repoRoot = Resolve-Path (Join-Path $scriptDir "..\..")
$sourceRoot = Join-Path $repoRoot ".agents\skills\$SkillName"
$hostRoot = Join-Path $repoRoot $HostSkillsPath
$targetRoot = Join-Path $hostRoot $SkillName

function Resolve-UnderRepo {
  param([string]$Path)

  $resolved = [System.IO.Path]::GetFullPath($Path)
  $repo = [System.IO.Path]::GetFullPath($repoRoot.Path)
  if (-not $resolved.StartsWith($repo, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to write outside repository root: $resolved"
  }
  return $resolved
}

if (-not (Test-Path $sourceRoot)) {
  throw "Missing canonical skill source: $sourceRoot"
}

$targetRoot = Resolve-UnderRepo $targetRoot
$files = Get-ChildItem -Path $sourceRoot -Recurse -File

if (-not $Copy) {
  Write-Output "Check only. Source: $sourceRoot"
  Write-Output "Target: $targetRoot"
  Write-Output "Files: $($files.Count)"
  Write-Output "Run with -Copy to copy missing files. Use -Force to overwrite existing target files."
  exit 0
}

foreach ($file in $files) {
  $relative = [System.IO.Path]::GetRelativePath($sourceRoot, $file.FullName)
  $target = Join-Path $targetRoot $relative
  $target = Resolve-UnderRepo $target
  $targetDir = Split-Path -Parent $target

  if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir | Out-Null
  }

  if ((Test-Path $target) -and -not $Force) {
    Write-Output "Skip existing: $target"
    continue
  }

  Copy-Item -LiteralPath $file.FullName -Destination $target -Force:$Force
  Write-Output "Copied: $relative"
}

Write-Output "Sync complete. No target files were deleted."
