@echo off
REM ---------------------------------------------------------------------------
REM  Double-click this. It does the two things the Cowork session could not,
REM  because that session's shell has no outbound network:
REM
REM    1. pushes the commits on main to GitHub
REM    2. runs the topography go/no-go in docs/TOPOGRAPHY.md
REM
REM  Everything it prints also lands in spike-log.txt next to this file, which
REM  Claude can read directly. You do not have to read it or copy anything.
REM
REM  It downloads about 300 MB of LiDAR the first time. Safe to run twice: the
REM  download skips tiles it already has.
REM ---------------------------------------------------------------------------
setlocal
cd /d "%~dp0"
set LOG=%~dp0spike-log.txt

REM Find a python. The PC spelling is `py -3` or `python`, never `python3`.
set PY=
py -3 --version >nul 2>&1 && set PY=py -3
if not defined PY (python --version >nul 2>&1 && set PY=python)
if not defined PY (
  echo Could not find python on this PC. Install it from python.org, tick
  echo "Add python.exe to PATH", then run this again.
  pause
  exit /b 1
)

(
  echo ===== Aylmer Madness: push + topography spike =====
  echo date: %DATE% %TIME%
  echo python: %PY%
  echo.

  echo ----- 1/4  git push -----
  if exist ".git\index.lock" del ".git\index.lock"
  git push origin main
  echo exit=%ERRORLEVEL%
  echo.

  echo ----- 2/4  build the LiDAR venv -----
  %PY% tools\fetch_lidar.py --venv
  echo exit=%ERRORLEVEL%
  echo.

  echo ----- 3/4  download the 4 core tiles ^(~300 MB^) -----
  %PY% tools\fetch_lidar.py --core
  echo exit=%ERRORLEVEL%
  echo.

  echo ----- 4/4  the ground field, and the verdict -----
  data\raw\venv\Scripts\python.exe tools\lidar_roof.py --ground-only
  echo exit=%ERRORLEVEL%
  echo.
  echo ===== done =====
) > "%LOG%" 2>&1

type "%LOG%"
echo.
echo -------------------------------------------------------------------
echo  Saved to spike-log.txt. Tell Claude it is done and it will read it.
echo -------------------------------------------------------------------
pause
