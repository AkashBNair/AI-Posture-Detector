param(
  [int]$Port = 8000
)

$ErrorActionPreference = "Stop"

# Always run from the project root so `backend.server` can be imported.
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$python = Join-Path $root ".venv\Scripts\python.exe"
if (!(Test-Path $python)) {
  throw "Python not found at: $python"
}

& $python -m flask --app backend.server run --host 0.0.0.0 --port $Port --debug

