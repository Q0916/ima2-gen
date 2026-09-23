param(
  [int]$Port = 3340,
  [int]$OAuthProxyPort = 10531,
  [string]$RuntimeDir = ''
)
$ErrorActionPreference = 'Stop'
$sourceRoot = Split-Path -Parent $PSScriptRoot
if (-not $RuntimeDir) { $RuntimeDir = Join-Path $sourceRoot '.ima2/md-runtime' }
$RuntimeDir = [IO.Path]::GetFullPath($RuntimeDir)
$baseUrl = "http://127.0.0.1:$Port"
function Get-AttachmentCapability {
  param([string]$Url)
  try { return (Invoke-RestMethod "$Url/api/prompt-files" -TimeoutSec 2).transport -eq 'input_file' }
  catch { return $false }
}
if (Get-AttachmentCapability $baseUrl) {
  [pscustomobject]@{ Status='READY'; Server=$baseUrl; Cli=(Join-Path $sourceRoot 'bin/ima2.js') }
  return
}
if (-not (Test-Path (Join-Path $sourceRoot 'bin/ima2.js'))) {
  throw 'Build this source first: npm ci; npm run build:server; npm run build:cli'
}
# Reuse the user's authenticated proxy. Never restart the production server or proxy.
try { Invoke-RestMethod "http://127.0.0.1:$OAuthProxyPort/v1/models" -TimeoutSec 3 | Out-Null }
catch { throw 'The existing OAuth proxy is unavailable. Start the normal ima2 runtime/login first.' }
New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
$env:IMA2_CONFIG_DIR = $RuntimeDir
$env:IMA2_PORT = [string]$Port
$env:IMA2_NO_OAUTH_PROXY = '1'
$env:IMA2_OAUTH_PROXY_PORT = [string]$OAuthProxyPort
$env:IMA2_GENERATED_DIR = Join-Path $RuntimeDir 'generated'
$env:IMA2_ADVERTISE_FILE = Join-Path $RuntimeDir 'server.json'
$process = Start-Process -FilePath (Get-Command node).Source -ArgumentList 'server.js' `
  -WorkingDirectory $sourceRoot -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput (Join-Path $RuntimeDir 'server.stdout.log') `
  -RedirectStandardError (Join-Path $RuntimeDir 'server.stderr.log')
for ($attempt=0; $attempt -lt 20; $attempt++) {
  Start-Sleep -Milliseconds 500
  if ($process.HasExited) { throw "Attachment server exited; see $RuntimeDir/server.stderr.log" }
  # ima2 may choose another port if the requested port is occupied.
  $advertise = Join-Path $RuntimeDir 'server.json'
  if (Test-Path $advertise) {
    $serverRecord = Get-Content $advertise -Raw | ConvertFrom-Json
    if ($serverRecord.pid -eq $process.Id -and $serverRecord.url) { $baseUrl = $serverRecord.url }
  }
  if (Get-AttachmentCapability $baseUrl) {
    [pscustomobject]@{ Status='READY'; Server=$baseUrl; Cli=(Join-Path $sourceRoot 'bin/ima2.js'); Pid=$process.Id }
    return
  }
}
throw "Server readiness was not confirmed; inspect $RuntimeDir/server.stdout.log before retrying."
