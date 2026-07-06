@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"

echo.
echo ========================================
echo  PocketPiano ERP - Google Apps Script
echo  Windows deploy helper
echo ========================================
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Git is not installed or is not available in PATH.
  echo Install Git for Windows and open a new terminal.
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or is not available in PATH.
  echo Install Node.js LTS from https://nodejs.org/ and open a new terminal.
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm is not installed or is not available in PATH.
  echo Reinstall Node.js LTS and make sure npm is selected.
  exit /b 1
)

if not exist package.json (
  echo [ERROR] package.json was not found.
  echo Run this script from the PocketPiano-ERP repository folder.
  exit /b 1
)

if not exist .clasp.json (
  if exist .clasp.json.example (
    echo [INFO] Creating .clasp.json from .clasp.json.example...
    copy .clasp.json.example .clasp.json >nul
  ) else (
    echo [ERROR] .clasp.json is missing and .clasp.json.example was not found.
    exit /b 1
  )
)

where clasp >nul 2>nul
if errorlevel 1 (
  echo [INFO] clasp is not installed globally. Installing it now...
  call npm install -g @google/clasp
  if errorlevel 1 (
    echo [ERROR] Could not install clasp.
    exit /b 1
  )
)

echo [INFO] Updating repository...
git pull
if errorlevel 1 (
  echo [ERROR] git pull failed.
  exit /b 1
)

echo [INFO] Installing local npm dependencies...
call npm install
if errorlevel 1 (
  echo [ERROR] npm install failed.
  exit /b 1
)

echo [INFO] Checking clasp connection...
call clasp status
if errorlevel 1 (
  echo.
  echo [ERROR] clasp is not logged in or .clasp.json is not valid.
  echo Run: clasp login
  echo Then run deploy.bat again.
  exit /b 1
)

echo [INFO] Pushing code to Google Apps Script...
call clasp push
if errorlevel 1 (
  echo [ERROR] clasp push failed.
  exit /b 1
)

echo.
echo ========================================
echo  Deploy completed.
echo ========================================
echo.
echo Next steps:
echo  1. Open Google Apps Script.
echo  2. Run install().
echo  3. Authorize permissions if Google asks.
echo  4. Reload the Google Sheet.
echo  5. Open PocketPiano ERP from the sheet menu.
echo.
pause
endlocal
