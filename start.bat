@echo off
set "VENV_PATH=c:\Users\User\OneDrive\Desktop\Projects\common_env"
echo ===============================================
echo    Competition Tracker - Starting Up...
echo ===============================================
echo.

if not exist "%VENV_PATH%" (
    echo Error: Shared environment not found at %VENV_PATH%
    pause
    exit /b
)

echo Starting server at http://localhost:8000
echo Press Ctrl+C in this window to stop.
echo.
echo If you ever see missing-module errors, run once:
echo   "%VENV_PATH%\Scripts\pip.exe" install -r "%~dp0backend\requirements.txt"
echo.

start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:8000/"

"%VENV_PATH%\Scripts\python.exe" -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload --app-dir "%~dp0backend"

