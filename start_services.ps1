param([switch]$Setup, [switch]$OpenBrowser, [switch]$UseWSL)
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$mlDir = Join-Path $projectRoot 'ml-service'
$frontDir = Join-Path $projectRoot 'frontend'
$goDir = Join-Path $projectRoot 'backend-gateway'
$mlHost = '127.0.0.1'
$gatewayBase = 'http://127.0.0.1:3101'
if ($UseWSL) {
    $defaultRoute = & wsl.exe --distribution Ubuntu --exec /bin/sh -c 'ip -4 route show default'
    if ($LASTEXITCODE -ne 0 -or ($defaultRoute -join ' ') -notmatch 'via\s+(\d+\.\d+\.\d+\.\d+)') {
        throw 'Could not resolve the Windows host address from Ubuntu WSL.'
    }
    $mlHost = $Matches[1]
    $linuxAddress = ((& wsl.exe --distribution Ubuntu --exec hostname -I | Out-String).Trim() -split '\s+')[0]
    if ($linuxAddress -notmatch '^\d+\.\d+\.\d+\.\d+$') { throw 'Could not resolve the Ubuntu WSL address.' }
    $gatewayBase = "http://${linuxAddress}:3101"
}
$logDir = Join-Path $projectRoot '.logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Run-Checked([string]$Program, [string[]]$Arguments) {
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program failed with exit code $LASTEXITCODE" }
}
function Wait-Ready([string]$Url, [bool]$NeedsModel = $false) {
    for ($attempt = 0; $attempt -lt 90; $attempt++) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -eq 200) {
                if (-not $NeedsModel -or ($response.Content | ConvertFrom-Json).model_loaded) { return }
            }
        } catch { }
        Start-Sleep -Seconds 1
    }
    throw "Service did not become ready at $Url. See $logDir."
}

foreach ($port in @(3100,3101,8100)) {
    $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($listener) { throw "Port $port is already in use. Stop its service or run stop_services.ps1 if InkLab owns it." }
}
$pythonExe = Join-Path $mlDir '.venv/Scripts/python.exe'
Push-Location $mlDir
try {
    if (-not (Test-Path -LiteralPath $pythonExe)) { Run-Checked 'python' @('-m','venv','.venv'); $Setup = $true }
    if ($Setup) {
        Run-Checked $pythonExe @('-m','pip','install','torch==2.7.1','--index-url','https://download.pytorch.org/whl/cpu')
        Run-Checked $pythonExe @('-m','pip','install','-r','requirements.txt')
    }
    if (-not (Test-Path -LiteralPath (Join-Path $mlDir 'saved_models/model.pt'))) { Run-Checked $pythonExe @('train.py') }
} finally { Pop-Location }
Push-Location $frontDir
try { if ($Setup -or -not (Test-Path -LiteralPath 'node_modules')) { Run-Checked 'npm.cmd' @('ci') } } finally { Pop-Location }
Push-Location $goDir
try {
    if ($UseWSL) {
        $previousGOOS = $env:GOOS
        $previousGOARCH = $env:GOARCH
        $previousCGO = $env:CGO_ENABLED
        try {
            $env:GOOS = 'linux'; $env:GOARCH = 'amd64'; $env:CGO_ENABLED = '0'
            Run-Checked 'go' @('build','-o','gateway-linux','.')
        } finally {
            $env:GOOS = $previousGOOS; $env:GOARCH = $previousGOARCH; $env:CGO_ENABLED = $previousCGO
        }
    } else { Run-Checked 'go' @('build','-o','gateway.exe','.') }
} finally { Pop-Location }

$owned = @()
try {
    $mlProcess = Start-Process -FilePath $pythonExe -ArgumentList @('-m','uvicorn','app.main:app','--host',$mlHost,'--port','8100') -WorkingDirectory $mlDir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'ml.out.log') -RedirectStandardError (Join-Path $logDir 'ml.err.log') -PassThru
    $owned += $mlProcess
    Wait-Ready "http://${mlHost}:8100/health" $true
    if ($UseWSL) {
        $gateway = Start-Process -FilePath 'wsl.exe' -ArgumentList @('--distribution','Ubuntu','--cd',('"' + $goDir + '"'),'--exec','/usr/bin/env',"ML_SERVICE_URL=http://${mlHost}:8100",'GATEWAY_ADDR=0.0.0.0:3101','/bin/sh','-c','"echo $$ > .gateway-wsl.pid; exec ./gateway-linux"') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'gateway.out.log') -RedirectStandardError (Join-Path $logDir 'gateway.err.log') -PassThru
    } else {
        $gateway = Start-Process -FilePath (Join-Path $goDir 'gateway.exe') -WorkingDirectory $goDir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'gateway.out.log') -RedirectStandardError (Join-Path $logDir 'gateway.err.log') -PassThru
    }
    $owned += $gateway
    Wait-Ready "$gatewayBase/api/health" $true
    $nextBin = Join-Path $frontDir 'node_modules/next/dist/bin/next'
    $previousGatewayURL = $env:GATEWAY_URL
    try {
        $env:GATEWAY_URL = $gatewayBase
        $frontend = Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList @(('"' + $nextBin + '"'),'dev','--hostname','127.0.0.1','-p','3100') -WorkingDirectory $frontDir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'frontend.out.log') -RedirectStandardError (Join-Path $logDir 'frontend.err.log') -PassThru
    } finally { $env:GATEWAY_URL = $previousGatewayURL }
    $owned += $frontend
    Wait-Ready 'http://127.0.0.1:3100'
    $processState = @($owned | ForEach-Object { [PSCustomObject]@{ id = $_.Id; started = $_.StartTime.ToUniversalTime().Ticks; name = $_.ProcessName } })
    [System.IO.File]::WriteAllText((Join-Path $logDir 'services.json'), (ConvertTo-Json -InputObject $processState), [System.Text.Encoding]::UTF8)
    Write-Host 'InkLab is ready: http://127.0.0.1:3100' -ForegroundColor Green
    Write-Host "FastAPI docs: http://${mlHost}:8100/docs | Stop: .\stop_services.ps1"
    if ($OpenBrowser) { Start-Process 'http://127.0.0.1:3100' }
} catch {
    foreach ($process in $owned) {
        if (-not $process.HasExited) { & taskkill.exe /PID $process.Id /T /F | Out-Null }
    }
    if ($UseWSL) { & (Join-Path $projectRoot 'stop_services.ps1') }
    throw
}
