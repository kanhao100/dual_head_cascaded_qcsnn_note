# Publish the standalone pages while preserving their relative links.
# Run from any directory: powershell -File scripts/publish-pages.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$stage = Join-Path $root '.pages-build'
New-Item -ItemType Directory -Force -Path $stage | Out-Null
foreach ($folder in @('walkthrough', 'engineering_guide')) {
    New-Item -ItemType Directory -Force -Path (Join-Path $stage $folder) | Out-Null
}
$files = @('index.html', 'walkthrough/qcsnn_kernel_walkthrough.html',
    'walkthrough/qcsnn_micro_arch.html', 'walkthrough/qcsnn_error_browser.html',
    'engineering_guide/qcsnn_engineering_guide.html')
foreach ($file in $files) {
    Copy-Item -LiteralPath (Join-Path $root $file) -Destination (Join-Path $stage $file)
}
Set-Content -LiteralPath (Join-Path $stage '.nojekyll') -Value ''
function Invoke-Git {
    & git -C $stage @args
    if ($LASTEXITCODE -ne 0) { throw "Git failed: $args" }
}
if (!(Test-Path -LiteralPath (Join-Path $stage '.git'))) {
    Invoke-Git init -b gh-pages
    $remote = & git -C $root remote get-url fork
    if ($LASTEXITCODE -ne 0) { throw 'Missing fork remote' }
    Invoke-Git remote add origin $remote
    & git -C $stage ls-remote --exit-code origin refs/heads/gh-pages
    if ($LASTEXITCODE -eq 0) {
        Invoke-Git fetch origin gh-pages
        Invoke-Git reset --mixed FETCH_HEAD
    } elseif ($LASTEXITCODE -ne 2) { throw 'Cannot check remote gh-pages branch' }
}
Invoke-Git add --all
& git -C $stage diff --cached --quiet
if ($LASTEXITCODE -eq 1) { Invoke-Git commit -m 'Publish QCSNN reading portal and standalone pages' }
elseif ($LASTEXITCODE -ne 0) { throw 'Cannot inspect staged pages' }
Invoke-Git push -u origin gh-pages
