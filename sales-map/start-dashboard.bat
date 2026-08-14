@echo off
rem ---------------------------------------------------------------------------
rem  Start the sales dashboard (Windows).
rem
rem  Double-click this file. It serves this folder on localhost and opens the
rem  dashboard in your browser. Served that way the page reads the source
rem  folder by itself, so the months load with nothing to click -- and Chrome
rem  never has to be asked for folder access, which it refuses from a
rem  file:// page.
rem
rem  Keep the black window open while using the dashboard; close it to stop.
rem ---------------------------------------------------------------------------
setlocal
cd /d "%~dp0"
set "PORT=8000"

set "PY="
py -3 -V >nul 2>&1 && set "PY=py -3"
if not defined PY (
  python -V >nul 2>&1 && set "PY=python"
)

if not defined PY (
  echo.
  echo   Python was not found on this PC.
  echo.
  echo   Either install Python from https://www.python.org/downloads/
  echo   ^(tick "Add python.exe to PATH" during setup^), or just open
  echo   index.html directly and load the Excel files with the button.
  echo.
  pause
  exit /b 1
)

echo.
echo   Dashboard: http://localhost:%PORT%/index.html
echo   Keep this window open while you use it. Close it to stop.
echo.
start "" "http://localhost:%PORT%/index.html"
%PY% -m http.server %PORT%
