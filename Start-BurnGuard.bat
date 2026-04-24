@echo off
setlocal EnableExtensions

rem One-click launcher for BurnGuard Design (Windows).
rem Double-click this file to start the backend + frontend dev servers.

cd /d "%~dp0"

title BurnGuard Design

where bun >nul 2>nul
if errorlevel 1 (
    echo.
    echo [BurnGuard] Bun is not installed or not on PATH.
    echo            Install it from https://bun.sh and try again.
    echo.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [BurnGuard] First-time setup: running bun install...
    call bun install
    if errorlevel 1 (
        echo.
        echo [BurnGuard] bun install failed. See log above.
        echo.
        pause
        exit /b 1
    )
)

echo [BurnGuard] Starting dev servers (backend + frontend)...
echo            Close this window to stop the servers.
echo.
call bun run dev

echo.
echo [BurnGuard] Dev servers stopped.
pause
endlocal
