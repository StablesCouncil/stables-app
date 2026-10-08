# Stables Stage 2 virtual work package: build the CAP files and run every harness, writing results/.
#
#   pwsh -File tools/build.ps1                  everything (about 8 minutes; the tear harness and mutants are most of it)
#   pwsh -File tools/build.ps1 -Quick           CAP, source scan, unit tests, relay suite (no tear, no lab node)
#   pwsh -File tools/build.ps1 -NoLabNode       skip the LX16 cross-check against lab peer 9101
#
# Simulator only: no card, no chain writes. The cross-check uses dry runs (runscript, mmrcreate) on lab peer 9101
# (RPC 127.0.0.1:9105) through ../measure/rpc.mjs; start it with dev-up.ps1 -DevNodes 1 if it is not running.
param([switch]$Quick, [switch]$NoLabNode)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$jdk = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.18.8-hotspot'
if (-not (Test-Path (Join-Path $jdk 'bin\javac.exe'))) { throw "JDK 17 not found at $jdk" }
$env:JAVA_HOME = $jdk
$java = Join-Path $jdk 'bin\java.exe'
Push-Location $root
try {
    function Step([string]$name, [scriptblock]$body) {
        Write-Host "== $name"
        & $body
        if ($LASTEXITCODE -ne 0) { throw "$name failed (exit $LASTEXITCODE)" }
    }
    Step 'dependencies (lockfile check)' { node tools/fetch-deps.mjs }
    Step 'CAP files + simulator builds (ant)' { & $java -cp 'lib/ant-launcher-1.10.15.jar;lib/ant-1.10.15.jar' org.apache.tools.ant.Main -q -f build.xml all }
    $caps = Get-ChildItem build/cap/*.cap | ForEach-Object { "| $($_.Name) | $($_.Length) | $((Get-FileHash $_.FullName -Algorithm SHA256).Hash) |" }
    Set-Content -Encoding utf8 results/build-info.md ("# Build`n`nBuilt $(Get-Date -Format s) with JDK 17 ($jdk), ant-javacard v26.05.15, converter jc305u4_kit (reports 3.0.5u3), targetsdk jc304_kit. Hashes are of this build (CAP files carry timestamps, so they differ between builds).`n`n| CAP | Bytes | SHA-256 |`n|---|---|---|`n" + ($caps -join "`n") + "`n")
    Step 'source scan' { node tools/scan-applet.mjs }
    Step 'source scan negative control' { node tools/scan-negative-control.mjs }
    $cpShip = 'build/simshim;lib/jcardsim-3.0.6.0.jar;build/sim-card;build/host'
    $cpTear = 'build/simshim;lib/jcardsim-3.0.6.0.jar;build/sim-tear;build/host'
    Step 'unit tests, shipped build' { & $java -cp $cpShip org.stables.host.Main unit }
    Step 'unit tests, instrumented build' { & $java -cp $cpTear org.stables.host.Main unit }
    Step 'relay suite, shipped build' { & $java -cp $cpShip org.stables.host.Main relay }
    Step 'relay suite, instrumented build' { & $java -cp $cpTear org.stables.host.Main relay }
    if (-not $Quick) {
        Step 'tear harness' { & $java -cp $cpTear org.stables.host.Main tear }
        Step 'tear harness mutants (must all be caught)' { node tools/mutation-check.mjs }
        Step 'benchmark (simulator: not representative)' { & $java -cp $cpShip org.stables.host.Main bench }
        Step 'benchmark over PC/SC (reports no reader until cards exist)' { & $java -cp $cpShip org.stables.host.Main bench --pcsc '' }
        Step 'LX16/P-256 fixtures' { & $java -cp $cpShip org.stables.host.Main fixtures }
        if (-not $NoLabNode) { Step 'LX16 cross-check (ots.mjs + KISS dry runs on lab peer 9101)' { node crosscheck/lx16-crosscheck.mjs } }
    }
    Write-Host 'all steps passed; see results/'
} finally {
    Pop-Location
}
