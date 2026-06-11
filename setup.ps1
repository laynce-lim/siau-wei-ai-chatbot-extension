Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

Write-Host "Installing Node dependencies..."
npm install

Write-Host "Creating Python virtual environment..."
python -m venv .venv

Write-Host "Installing Python dependencies..."
.\.venv\Scripts\python -m pip install --upgrade pip
.\.venv\Scripts\python -m pip install -r requirements.txt

Write-Host "Compiling VS Code extension..."
npm run compile

Write-Host "Done. Press F5 in VS Code to launch the extension development host."
