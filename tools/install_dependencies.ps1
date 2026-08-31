[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$RequirementsFile,

  [Parameter(Mandatory = $true)]
  [string]$VenvPath
)

$ErrorActionPreference = 'Stop'

function Find-Python {
  $py = Get-Command py.exe -ErrorAction SilentlyContinue
  if ($py) {
    try {
      & $py.Source -3.12 --version *> $null
      if ($LASTEXITCODE -eq 0) {
        return @{ Command = $py.Source; Arguments = @('-3.12') }
      }
    } catch {
      # Try another available Python executable.
    }
  }

  $python = Get-Command python.exe -ErrorAction SilentlyContinue
  if ($python) {
    try {
      & $python.Source --version *> $null
      if ($LASTEXITCODE -eq 0) {
        return @{ Command = $python.Source; Arguments = @() }
      }
    } catch {
      # Try an installed Python executable directly.
    }
  }

  $localPrograms = Join-Path $env:LOCALAPPDATA 'Programs\Python'
  $candidates = @()
  if (Test-Path $localPrograms) {
    $candidates += Get-ChildItem -Path $localPrograms -Filter python.exe -Recurse -ErrorAction SilentlyContinue |
      Sort-Object FullName -Descending |
      ForEach-Object { $_.FullName }
  }

  foreach ($candidate in $candidates) {
    try {
      & $candidate --version *> $null
      if ($LASTEXITCODE -eq 0) {
        return @{ Command = $candidate; Arguments = @() }
      }
    } catch {
      continue
    }
  }

  return $null
}

Write-Host 'Siau Wei AI Chatbot dependency setup'
Write-Host '====================================='

if (-not (Test-Path $RequirementsFile)) {
  throw "Requirements file was not found: $RequirementsFile"
}

$python = Find-Python

if (-not $python) {
  $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
  if (-not $winget) {
    throw 'Python is not installed and winget is unavailable. Install Python 3.11 or later from https://www.python.org/downloads/windows/, then run this command again.'
  }

  Write-Host 'Python was not found. Installing Python 3.12 for the current user...'
  & $winget.Source install --id Python.Python.3.12 --exact --scope user --silent --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -ne 0) {
    throw "winget could not install Python (exit code $LASTEXITCODE). Install Python 3.11 or later, then run this command again."
  }

  $python = Find-Python
  if (-not $python) {
    throw 'Python was installed, but this terminal cannot see it yet. Restart VS Code, then run Siau Wei AI Chatbot: Install Dependencies again.'
  }
}

Write-Host "Using Python: $($python.Command)"

if (-not (Test-Path $VenvPath)) {
  Write-Host 'Creating the extension Python environment...'
  & $python.Command @($python.Arguments) -m venv $VenvPath
  if ($LASTEXITCODE -ne 0) {
    throw "Could not create the Python environment (exit code $LASTEXITCODE)."
  }
}

$venvPython = Join-Path $VenvPath 'Scripts\python.exe'
if (-not (Test-Path $venvPython)) {
  throw "The Python environment did not contain Scripts\python.exe: $VenvPath"
}

Write-Host 'Installing the chatbot data dependencies...'
& $venvPython -m pip install --upgrade pip
& $venvPython -m pip install -r $RequirementsFile
if ($LASTEXITCODE -ne 0) {
  throw "Could not install the Python dependencies (exit code $LASTEXITCODE)."
}

Write-Host ''
Write-Host 'Setup complete.' -ForegroundColor Green
Write-Host "Python for the extension: $venvPython"
