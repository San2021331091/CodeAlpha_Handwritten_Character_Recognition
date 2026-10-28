$ErrorActionPreference = 'Stop'
$statePath = Join-Path $PSScriptRoot '.logs/services.json'
$wslPidPath = Join-Path $PSScriptRoot 'backend-gateway/.gateway-wsl.pid'
if (Test-Path -LiteralPath $wslPidPath) {
    $linuxProcessId = 0
    if ([int]::TryParse((Get-Content -Raw -LiteralPath $wslPidPath).Trim(), [ref]$linuxProcessId) -and $linuxProcessId -gt 1) {
        $expectedExecutable = (& wsl.exe --distribution Ubuntu --exec wslpath -a (Join-Path $PSScriptRoot 'backend-gateway/gateway-linux') | Out-String).Trim()
        $actualExecutable = (& wsl.exe --distribution Ubuntu --exec readlink "/proc/$linuxProcessId/exe" | Out-String).Trim()
        if ($expectedExecutable -and $actualExecutable -eq $expectedExecutable) {
            & wsl.exe --distribution Ubuntu --exec /bin/kill -TERM $linuxProcessId
        }
    }
    Remove-Item -LiteralPath $wslPidPath
}
if (-not (Test-Path -LiteralPath $statePath)) { Write-Host 'No InkLab launcher processes recorded.'; return }
$entries = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json
foreach ($entry in $entries) {
    $process = Get-Process -Id $entry.id -ErrorAction SilentlyContinue
    if ($process -and $process.StartTime.ToUniversalTime().Ticks -eq [long]$entry.started -and $process.ProcessName -eq $entry.name) {
        # Stop the launcher's exact process tree, including Next.js worker processes.
        & taskkill.exe /PID $process.Id /T /F | Out-Null
    }
}
Remove-Item -LiteralPath $statePath
Write-Host 'InkLab services stopped.'
