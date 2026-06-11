Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

Write-Host "Checking Node..."
node --version

Write-Host "Checking npm..."
npm --version

Write-Host "Checking Python..."
python --version

Write-Host "Testing Python data tools..."
python tools/list_files.py --data data
python tools/analyze_data.py --data data --question "Which PM has the most delayed orders?"

Write-Host "If Node modules are installed, compiling extension..."
if (Test-Path "node_modules") {
  npm run compile
} else {
  Write-Host "node_modules not found. Run npm install first."
}
