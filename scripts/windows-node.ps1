param([string]$PreferredPath)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$candidates = @()
if ($PreferredPath) { $candidates += $PreferredPath }
$command = Get-Command node.exe -ErrorAction SilentlyContinue
if ($command) { $candidates += $command.Source }
if ($env:ProgramFiles) { $candidates += Join-Path $env:ProgramFiles 'nodejs/node.exe' }
$nvmRoots = @($env:NVM_HOME)
if ($env:LOCALAPPDATA) { $nvmRoots += Join-Path $env:LOCALAPPDATA 'Author Software/nvm' }
foreach ($root in $nvmRoots | Where-Object { $_ }) {
  foreach ($directory in @($root, (Join-Path $root 'installs'))) {
    if (!(Test-Path -LiteralPath $directory)) { continue }
    $versions = Get-ChildItem -LiteralPath $directory -Directory -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -match '^v?\d+\.\d+\.\d+$' } |
      Sort-Object { [version]($_.Name -replace '^v', '') } -Descending
    foreach ($version in $versions) { $candidates += Join-Path $version.FullName 'node.exe' }
  }
}
foreach ($candidate in $candidates | Select-Object -Unique) {
  if (!(Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
  try {
    $versionText = & $candidate --version 2>$null
    if ($LASTEXITCODE -ne 0 -or $versionText -notmatch '^v(\d+)\.(\d+)\.\d+$') { continue }
    $major = [int]$Matches[1]
    $minor = [int]$Matches[2]
    if (($major -eq 20 -and $minor -ge 19) -or ($major -eq 22 -and $minor -ge 12) -or $major -ge 24) {
      Write-Output (Get-Item -LiteralPath $candidate).FullName
      exit 0
    }
  } catch { continue }
}
Write-Error 'Node.js do Windows nao encontrado. Configure uma versao LTS no Windows ou informe VILLAGE_WINDOWS_NODE em .env.local.'
exit 1
