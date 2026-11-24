param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[0-9a-fA-F]{40}$')]
  [string]$CommitSha
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$destination = [System.IO.Path]::GetFullPath((Join-Path $tempRoot "PomaH5Perf06Subject-$CommitSha"))
$leaf = Split-Path -Leaf $destination
if (-not $destination.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase) -or $leaf -ne "PomaH5Perf06Subject-$CommitSha") {
  throw 'SUBJECT_TEMP_PATH_INVALID'
}
if (Test-Path -LiteralPath $destination) { throw 'BASELINE_TEMP_PATH_ALREADY_EXISTS' }

git -C $repoRoot cat-file -e "$CommitSha^{commit}"
if ($LASTEXITCODE -ne 0) { throw 'SUBJECT_COMMIT_UNAVAILABLE' }
  $archive = Join-Path $tempRoot "PomaH5Perf06Subject-$CommitSha.tar"
try {
  if (Test-Path -LiteralPath $archive) { throw 'SUBJECT_ARCHIVE_ALREADY_EXISTS' }
  git -C $repoRoot archive --format=tar --output=$archive $CommitSha
  if ($LASTEXITCODE -ne 0) { throw 'SUBJECT_ARCHIVE_FAILED' }
  New-Item -ItemType Directory -Path $destination | Out-Null
  tar -xf $archive -C $destination
  if ($LASTEXITCODE -ne 0) { throw 'BASELINE_EXTRACTION_FAILED' }
  [System.IO.File]::WriteAllText((Join-Path $destination '.h5-subject-sha'), "$CommitSha`n", [System.Text.UTF8Encoding]::new($false))
  Push-Location $destination
  try {
    npm ci --no-audit --no-fund --loglevel=error *> $null
    if ($LASTEXITCODE -ne 0) { throw 'BASELINE_LOCKFILE_INSTALL_FAILED' }
  } finally {
    Pop-Location
  }
  Write-Output $destination
} catch {
  $resolved = [System.IO.Path]::GetFullPath($destination)
  if ((Test-Path -LiteralPath $resolved) -and $resolved.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase) -and (Split-Path -Leaf $resolved) -eq "PomaH5Perf06Subject-$CommitSha") {
    Remove-Item -LiteralPath $resolved -Recurse -Force
  }
  throw
} finally {
  if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
}
