@echo off
setlocal enabledelayedexpansion

set "ROOT=%~dp0.."
set "SHARED=%ROOT%\shared\templates\mbax"
set "FRONTEND_ASSETS=%ROOT%\frontend\src\assets\templates\mbax"
set "BACKEND_TEMPLATES=%ROOT%\backend\storage\app\templates\mbax"
set "BACKEND_TEMPLATES_ROOT=%ROOT%\backend\storage\app\templates"

if not exist "%SHARED%" (
  mkdir "%SHARED%"
)

if exist "%FRONTEND_ASSETS%" (
  dir /a "%FRONTEND_ASSETS%" | findstr /i "<DIR>" >nul
  if %errorlevel%==0 (
    robocopy "%FRONTEND_ASSETS%" "%SHARED%" /E /MOVE >nul
    rmdir "%FRONTEND_ASSETS%"
  )
)

if not exist "%BACKEND_TEMPLATES_ROOT%" (
  mkdir "%BACKEND_TEMPLATES_ROOT%"
)

if exist "%BACKEND_TEMPLATES%" (
  dir /a "%BACKEND_TEMPLATES%" | findstr /i "<DIR>" >nul
  if %errorlevel%==0 (
    rmdir "%BACKEND_TEMPLATES%" /s /q
  )
)

mklink /J "%FRONTEND_ASSETS%" "%SHARED%" >nul 2>&1
if %errorlevel% neq 0 (
  echo Failed to create junction: "%FRONTEND_ASSETS%" -> "%SHARED%"
  echo Run this script as Administrator.
)

mklink /J "%BACKEND_TEMPLATES%" "%SHARED%" >nul 2>&1
if %errorlevel% neq 0 (
  echo Failed to create junction: "%BACKEND_TEMPLATES%" -> "%SHARED%"
  echo Run this script as Administrator.
)

echo.
echo Templates folder status:
echo - Shared: "%SHARED%"
echo - Frontend: "%FRONTEND_ASSETS%"
echo - Backend: "%BACKEND_TEMPLATES%"
echo.
echo Shared templates:
dir /b "%SHARED%"
