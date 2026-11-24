param(
  [Parameter(Mandatory = $true)] [ValidatePattern('^[0-9a-fA-F]{40}$')] [string]$BaselineSha,
  [Parameter(Mandatory = $true)] [ValidatePattern('^[0-9a-fA-F]{40}$')] [string]$CandidateSha,
  [Parameter(Mandatory = $true)] [string]$StorageStateDirectory,
  [Parameter(Mandatory = $true)] [string]$IdentityIndex,
  [Parameter(Mandatory = $true)] [string]$ApiOrigin,
  [Parameter(Mandatory = $true)] [string]$ReportRoot,
  [Parameter(Mandatory = $true)] [ValidateSet('service-cache-reset-verified', 'service-cache-not-used')] [string]$ColdOracle
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$harnessSha = (git -C $repoRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw 'HARNESS_HEAD_UNAVAILABLE' }
$harnessStatus = git -C $repoRoot status --porcelain --untracked-files=all
if ($LASTEXITCODE -ne 0 -or $harnessStatus) { throw 'HARNESS_WORKTREE_MUST_BE_CLEAN' }
git -C $repoRoot cat-file -e "$BaselineSha^{commit}"
if ($LASTEXITCODE -ne 0) { throw 'BASELINE_COMMIT_UNAVAILABLE' }
git -C $repoRoot cat-file -e "$CandidateSha^{commit}"
if ($LASTEXITCODE -ne 0) { throw 'CANDIDATE_COMMIT_UNAVAILABLE' }
$api = [System.Uri]$ApiOrigin
if (-not $api.IsLoopback -or $api.Scheme -ne 'http') { throw 'API_ORIGIN_MUST_BE_LOCAL_LOOPBACK_HTTP' }
$storageRoot = [System.IO.Path]::GetFullPath($StorageStateDirectory)
$identityIndexPath = [System.IO.Path]::GetFullPath($IdentityIndex)
$artifactRoot = [System.IO.Path]::GetFullPath($ReportRoot)
$datasetSha = (Get-FileHash -Algorithm SHA256 (Join-Path $repoRoot 'tests/fixtures/h5/catalog/manifest.json')).Hash.ToLowerInvariant()
$baselineRoot = $null
$candidateRoot = $null

try {
  $baselineRoot = & (Join-Path $PSScriptRoot 'prepare-h5-perf06-subject.ps1') -CommitSha $BaselineSha
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $baselineRoot)) { throw 'BASELINE_SUBJECT_PREPARATION_FAILED' }
  if ($CandidateSha -eq $BaselineSha) {
    $candidateRoot = $baselineRoot
  } else {
    $candidateRoot = & (Join-Path $PSScriptRoot 'prepare-h5-perf06-subject.ps1') -CommitSha $CandidateSha
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $candidateRoot)) { throw 'CANDIDATE_SUBJECT_PREPARATION_FAILED' }
  }
  Push-Location $repoRoot
  try {
    foreach ($subject in @(
      @{ role = 'baseline'; sha = $BaselineSha; root = $baselineRoot },
      @{ role = 'candidate'; sha = $CandidateSha; root = $candidateRoot }
    )) {
      foreach ($profile in @('1', '5', '20')) {
        foreach ($cache in @('cold', 'warm')) {
          foreach ($repetition in @(1, 2, 3)) {
            $env:G6_H5_PERF06_ISOLATED_HARNESS = '1'
            $env:G6_H5_PERF06_APP_ROOT = $subject.root
            $env:G6_H5_PERF06_STORAGE_STATE_DIR = $storageRoot
            $env:G6_H5_PERF06_IDENTITY_INDEX = $identityIndexPath
            $env:G6_H5_PERF06_API_ORIGIN = $api.Origin
            $env:G6_H5_PERF06_READ_ONLY_ATTESTATION = '1'
            $env:G6_H5_PERF06_IDENTITY_LABEL = 'POMA_H5_SYNTHETIC_READONLY'
            $env:G6_H5_PERF06_NETWORK_PROFILE = 'LOCAL_LOOPBACK'
            $env:G6_H5_PERF06_SUBJECT_ROLE = $subject.role
            $env:G6_H5_PERF06_SUBJECT_SHA = $subject.sha
            $env:G6_H5_PERF06_HARNESS_SHA = $harnessSha
            $env:G6_H5_PERF06_DATASET_SHA = $datasetSha
            $env:G6_H5_PERF06_PROFILE = $profile
            $env:G6_H5_PERF06_REPETITION = "$repetition"
            $env:G6_H5_PERF06_CACHE_MODE = $cache
            $env:G6_H5_PERF06_COLD_ORACLE = if ($cache -eq 'cold') { $ColdOracle } else { '' }
            $env:VITE_GATEWAY_ORIGIN = $api.Origin
            $env:VITE_DATA_MODE = 'api'
            $env:VITE_G6_ADMIN_API_ENABLED = 'true'
            node (Join-Path $repoRoot 'scripts/run-h5-perf06.mjs')
            if ($LASTEXITCODE -ne 0) {
              if ($LASTEXITCODE -eq 2) { throw 'PERF06_BLOCKED_DEPENDENCY' }
              throw 'PERF06_MEASUREMENT_FAILED'
            }
          }
          $profileDirectory = Join-Path (Join-Path (Join-Path $artifactRoot $subject.role) $profile) $cache
          node (Join-Path $repoRoot 'scripts/aggregate-h5-perf06.mjs') $profile $subject.role $subject.sha $cache $profileDirectory
          if ($LASTEXITCODE -ne 0) { throw 'PERF06_AGGREGATION_INCOMPLETE' }
        }
      }
    }
    foreach ($profile in @('1', '5', '20')) {
      foreach ($cache in @('cold', 'warm')) {
        $baseReport = Join-Path (Join-Path (Join-Path (Join-Path $artifactRoot 'baseline') $profile) $cache) 'admin-browser-performance.json'
        $candidateReport = Join-Path (Join-Path (Join-Path (Join-Path $artifactRoot 'candidate') $profile) $cache) 'admin-browser-performance.json'
        $comparison = Join-Path (Join-Path $artifactRoot 'comparisons') "$profile-$cache.json"
        node (Join-Path $repoRoot 'scripts/compare-h5-perf06.mjs') $baseReport $candidateReport $comparison $repoRoot
        $comparisonExit = $LASTEXITCODE
        if ($comparisonExit -notin @(0, 1, 2) -or -not (Test-Path -LiteralPath $comparison)) { throw 'PERF06_COMPARISON_FAILED' }
        $comparisonResult = Get-Content -LiteralPath $comparison -Raw | ConvertFrom-Json
        if ($comparisonResult.status -notin @('PASS', 'FAIL', 'INCONCLUSIVE')) { throw 'PERF06_COMPARISON_STATUS_INVALID' }
      }
    }
    node (Join-Path $repoRoot 'scripts/index-h5-perf06-comparisons.mjs') (Join-Path $artifactRoot 'comparisons')
    if ($LASTEXITCODE -ne 0) { throw 'PERF06_COMPARISON_EVIDENCE_INDEX_FAILED' }
  } finally {
    Pop-Location
  }
} finally {
  $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
  foreach ($preparedRoot in @(@{ root = $baselineRoot; sha = $BaselineSha }, @{ root = $candidateRoot; sha = $CandidateSha })) {
    if (-not $preparedRoot.root) { continue }
    $resolved = [System.IO.Path]::GetFullPath($preparedRoot.root)
    if ($resolved -ne [System.IO.Path]::GetFullPath($baselineRoot) -or $preparedRoot.sha -eq $BaselineSha) {
      if ((Test-Path -LiteralPath $resolved) -and $resolved.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase) -and (Split-Path -Leaf $resolved) -eq "PomaH5Perf06Subject-$($preparedRoot.sha)") {
      Remove-Item -LiteralPath $resolved -Recurse -Force
      }
    }
  }
}
