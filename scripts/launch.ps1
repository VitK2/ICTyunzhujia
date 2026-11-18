param([switch]$NoOpen, [int]$Port = 5174)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1') -ErrorAction Stop
$appRoot = Split-Path -Parent $PSScriptRoot
$stateDir = Join-Path $appRoot '.local'
New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
if (-not (Test-Path -LiteralPath (Join-Path $appRoot 'dist\index.html'))) { throw 'dist/index.html is missing. Run pnpm build first.' }

function Get-AppHealth([int]$CandidatePort) {
    try { return Invoke-RestMethod -Uri "http://127.0.0.1:$CandidatePort/health" -TimeoutSec 2 } catch { return $null }
}
function Is-PortAvailable([int]$CandidatePort) {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $CandidatePort)
    try { $listener.Start(); return $true } catch { return $false } finally { $listener.Stop() }
}
$nodeCandidates = @()
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if ($nodeCommand) { $nodeCandidates += $nodeCommand.Source }
$nodeCandidates += (Join-Path $env:ProgramFiles 'nodejs\node.exe')
$nodeCandidates += (Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe')
try { Get-AppxPackage -Name 'OpenAI.CodexPrimaryRuntime*' -ErrorAction SilentlyContinue | Sort-Object Version -Descending | ForEach-Object { $nodeCandidates += (Join-Path $_.InstallLocation 'dependencies\node\bin\node.exe') } } catch {}
$nodePath = $null
foreach ($candidateNode in ($nodeCandidates | Select-Object -Unique)) {
    if (-not $candidateNode -or -not (Test-Path -LiteralPath $candidateNode)) { continue }
    try { $nodeVersion = [version]((& $candidateNode --version).TrimStart('v')); if ($nodeVersion -ge [version]'22.18.0') { $nodePath = $candidateNode; break } } catch {}
}
if (-not $nodePath) { throw 'Node.js 22.18 or later was not found. Install it, then launch again.' }
$expectedBuild = & $nodePath (Join-Path $PSScriptRoot 'fingerprint.mjs')
if ($LASTEXITCODE -ne 0 -or -not $expectedBuild) { throw 'Cannot calculate the application build fingerprint.' }
$expectedBuild = $expectedBuild.Trim()
$chosen = $null
$processId = $null
for ($candidate = $Port; $candidate -lt ($Port + 12); $candidate++) {
    $health = Get-AppHealth $candidate
    if ($health -and $health.app -eq 'yunzhujia' -and $health.buildId -eq $expectedBuild -and $health.agentApi -eq 1) { $chosen = $candidate; break }
    if (Is-PortAvailable $candidate) {
        if (-not $nodePath) { throw 'Node.js was not found. Install Node.js 22 or later, then launch again.' }
        $outLog = Join-Path $stateDir "server-$candidate.log"
        $errLog = Join-Path $stateDir "server-$candidate.error.log"
        $serveScript = Join-Path $PSScriptRoot 'serve.mjs'
        $server = Start-Process -FilePath $nodePath -ArgumentList @(('"' + $serveScript + '"'), "$candidate") -WorkingDirectory $appRoot -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru
        $processId = $server.Id
        for ($attempt=0; $attempt -lt 40; $attempt++) {
            Start-Sleep -Milliseconds 250
            $health = Get-AppHealth $candidate
            if ($health -and $health.app -eq 'yunzhujia' -and $health.buildId -eq $expectedBuild -and $health.agentApi -eq 1) { $chosen = $candidate; break }
            if ($server.HasExited) { break }
        }
        if ($chosen) { break }
        $detail = if (Test-Path -LiteralPath $errLog) { Get-Content -LiteralPath $errLog -Raw } else { '' }
        throw "The local server failed to start. $detail"
    }
}
if (-not $chosen) { throw 'No free local preview port was found.' }
$url = "http://127.0.0.1:$chosen/"
$state = @{ url=$url; port=$chosen; processId=$processId; buildId=$expectedBuild; startedAt=(Get-Date).ToString('o') }
$state | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stateDir 'launch.json') -Encoding UTF8
$shortcut = Join-Path $appRoot 'Open-YunZhuJia.url'
"[InternetShortcut]`r`nURL=$url`r`n" | Set-Content -LiteralPath $shortcut -Encoding ASCII
Write-Output "YunZhuJia is ready: $url"
if (-not $NoOpen) { Start-Process $url }
