@echo off
title POS Backend Status Checker v2.1
color 0A

:: Check if running in MINGW64 and warn user
if defined MSYSTEM (
    echo ====================================
    echo  WARNING: MINGW64 DETECTED
    echo ====================================
    echo.
    echo This script works best in Windows Command Prompt.
    echo For best results, please:
    echo 1. Press Win+R
    echo 2. Type: cmd
    echo 3. Navigate to: %cd%
    echo 4. Run: check_status.bat
    echo.
    echo Press any key to continue anyway, or Ctrl+C to exit...
    pause
    echo.
)

echo ====================================
echo  POS Backend Status Monitor v2.1
echo ====================================
echo.

:menu
echo 1. Check if POS Backend is Running
echo 2. Test API Connection  
echo 3. View Live Logs
echo 4. Show Task Manager Processes
echo 5. Check Startup Task Status
echo 6. Check Port Usage (4444)
echo 7. Start POS Backend (if not running)
echo 8. Stop POS Backend (Enhanced)
echo 9. EMERGENCY STOP - Kill All Related Processes
echo 10. Fix Installation Issues
echo 11. Refresh Status
echo 0. Exit
echo.
set /p choice="Enter your choice (0-11): "
echo.

if "%choice%"=="1" goto check_process
if "%choice%"=="2" goto test_api  
if "%choice%"=="3" goto view_logs
if "%choice%"=="4" goto task_manager
if "%choice%"=="5" goto check_task
if "%choice%"=="6" goto check_port
if "%choice%"=="7" goto start_service
if "%choice%"=="8" goto stop_service
if "%choice%"=="9" goto emergency_stop
if "%choice%"=="10" goto fix_installation
if "%choice%"=="11" goto refresh
if "%choice%"=="0" goto exit
goto menu

:check_process
echo ====================================
echo  PROCESS STATUS CHECK
echo ====================================
echo.
echo Checking for POS Backend processes...
echo.

:: Use Windows-compatible process checking
tasklist 2>nul | findstr /i "pos_backend.exe" >nul 2>&1
if %errorLevel% == 0 (
    echo [OK] POS Backend EXE is RUNNING
    tasklist | findstr /i "pos_backend.exe"
) else (
    echo [X] POS Backend EXE is NOT RUNNING
)
echo.

tasklist 2>nul | findstr /i "wscript.exe" >nul 2>&1
if %errorLevel% == 0 (
    echo [OK] Background Script (wscript.exe) is RUNNING
    tasklist | findstr /i "wscript.exe"
) else (
    echo [X] Background Script is NOT RUNNING
)
echo.

:: Check for service wrapper
wmic process where "commandline like '%%service_wrapper%%'" get processid,commandline 2>nul | findstr "service_wrapper" >nul 2>&1
if %errorLevel% == 0 (
    echo [OK] Service Wrapper is RUNNING
    wmic process where "commandline like '%%service_wrapper%%'" get processid,commandline 2>nul
) else (
    echo [X] Service Wrapper is NOT RUNNING
)
echo.
pause
goto menu

:test_api
echo ====================================
echo  API CONNECTION TEST
echo ====================================
echo.
echo Testing API endpoints...
echo.

echo Testing: http://localhost:4444/health
curl -s -w "HTTP Status: %%{http_code}\n" http://localhost:4444/health --connect-timeout 5 --max-time 10 2>nul
if %errorLevel% == 0 (
    echo [✓] API Health Check: SUCCESS
) else (
    echo [✗] API Health Check: FAILED
    echo Trying with PowerShell...
    powershell -Command "try { $response = Invoke-WebRequest -Uri 'http://localhost:4444/health' -TimeoutSec 5; Write-Host '[✓] API Health Check: SUCCESS'; Write-Host 'Response:' $response.Content } catch { Write-Host '[✗] API Health Check: FAILED'; Write-Host 'Error:' $_.Exception.Message }" 2>nul
)
echo.

echo Testing: http://localhost:4444/api/
curl -s -w "HTTP Status: %%{http_code}\n" http://localhost:4444/api/ --connect-timeout 5 --max-time 10 2>nul
if %errorLevel% == 0 (
    echo [✓] API Root: SUCCESS
) else (
    echo [✗] API Root: FAILED - This might be normal if endpoint doesn't exist
)
echo.
pause
goto menu

:view_logs
echo ====================================
echo  LIVE LOG VIEWER
echo ====================================
echo.
echo Checking for log files in C:\POS_Backend\...
echo.

if exist "C:\POS_Backend\service.log" (
    echo [✓] Service log found - Showing last 20 lines:
    echo ----------------------------------------
    powershell -Command "Get-Content 'C:\POS_Backend\service.log' -Tail 20 -ErrorAction SilentlyContinue" 2>nul
    echo ----------------------------------------
) else (
    echo [✗] No service.log found
)
echo.

if exist "C:\POS_Backend\service_error.log" (
    echo [✓] Error log found - Showing last 10 lines:
    echo ----------------------------------------
    powershell -Command "Get-Content 'C:\POS_Backend\service_error.log' -Tail 10 -ErrorAction SilentlyContinue" 2>nul
    echo ----------------------------------------
) else (
    echo [✗] No service_error.log found
)
echo.

:: Check for any other log files
echo Checking for other log files...
if exist "C:\POS_Backend\*.log" (
    echo Found log files:
    dir "C:\POS_Backend\*.log" /b 2>nul
) else (
    echo No log files found in C:\POS_Backend\
)
echo.

echo Press any key to continue...
pause
goto menu

:task_manager
echo ====================================
echo  PROCESS DETAILS
echo ====================================
echo.
echo All POS Backend related processes:
echo.

echo POS Backend executable processes:
tasklist | findstr /i "pos_backend" 2>nul
if %errorLevel% neq 0 echo No pos_backend.exe processes found
echo.

echo Background script processes:
tasklist | findstr /i "wscript" 2>nul
if %errorLevel% neq 0 echo No wscript.exe processes found
echo.

echo Service wrapper processes:
wmic process where "commandline like '%%service_wrapper%%'" get processid,parentprocessid,commandline 2>nul
echo.

echo Processes using port 4444:
netstat -ano | findstr :4444 2>nul
if %errorLevel% neq 0 echo No processes using port 4444
echo.

pause
goto menu

:check_task
echo ====================================
echo  STARTUP TASK STATUS  
echo ====================================
echo.
echo Checking Windows Scheduled Task...
echo.

schtasks /query /tn "POS Backend Startup" 2>nul >nul
if %errorLevel% == 0 (
    echo [✓] Startup task EXISTS and is configured
    echo.
    echo Task Details:
    schtasks /query /tn "POS Backend Startup" /fo list 2>nul
) else (
    echo [✗] Startup task NOT FOUND
    echo.
    echo To create the startup task, run:
    echo C:\POS_Backend\setup_startup_task.bat
)
echo.
pause
goto menu

:check_port
echo ====================================
echo  PORT USAGE CHECK (Port 4444)
echo ====================================
echo.
echo Checking if port 4444 is in use...
echo.

netstat -an | findstr :4444 2>nul
if %errorLevel% == 0 (
    echo [✓] Port 4444 is ACTIVE - Something is listening
    echo.
    echo Detailed port information:
    netstat -ano | findstr :4444 2>nul
    echo.
    echo Process using port 4444:
    for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr :4444') do (
        if "%%a" neq "" (
            echo PID: %%a
            tasklist | findstr "%%a" 2>nul
        )
    )
) else (
    echo [✗] Port 4444 is NOT in use - POS Backend may not be running
    echo.
    echo Other common ports check:
    echo Port 3000: 
    netstat -an | findstr :3000 2>nul
    echo Port 8080:
    netstat -an | findstr :8080 2>nul
)
echo.
pause
goto menu

:start_service
echo ====================================
echo  STARTING POS BACKEND
echo ====================================
echo.
echo Checking if already running...
tasklist | findstr /i "pos_backend.exe" >nul 2>&1
if %errorLevel__ == 0 (
    echo [!] POS Backend is already running!
    tasklist | findstr /i "pos_backend.exe"
    echo.
    echo If you want to restart, use option 8 to stop first.
) else (
    echo Attempting to start POS Backend in background...
    echo.
    
    if exist "C:\POS_Backend\run_silent.vbs" (
        echo Starting via silent VBS script...
        cscript //nologo "C:\POS_Backend\run_silent.vbs" 2>nul
        echo.
        echo Waiting 5 seconds for startup...
        ping 127.0.0.1 -n 6 >nul 2>&1
        echo.
        echo Checking if started successfully...
        tasklist | findstr /i "pos_backend.exe" >nul 2>&1
        if %errorLevel__ == 0 (
            echo [✓] POS Backend started successfully!
            tasklist | findstr /i "pos_backend.exe"
        ) else (
            echo [✗] Failed to start POS Backend
            echo Check C:\POS_Backend\ for error logs
            echo.
            echo Alternative startup methods:
            echo 1. Try running: C:\POS_Backend\start_background.bat
            echo 2. Try manual start: C:\POS_Backend\pos_backend.exe
        )
    ) else (
        echo [✗] Silent runner script not found
        echo.
        echo Trying direct executable...
        if exist "C:\POS_Backend\pos_backend.exe" (
            echo Starting POS Backend directly...
            start "" "C:\POS_Backend\pos_backend.exe"
            ping 127.0.0.1 -n 3 >nul 2>&1
            echo Check if started successfully...
        ) else (
            echo [✗] POS Backend executable not found in C:\POS_Backend\
            echo Please run the installer first
        )
    )
)
echo.
pause
goto menu

:stop_service
echo ====================================
echo  ENHANCED STOP POS BACKEND
echo ====================================
echo.
echo Starting comprehensive shutdown process...
echo.

echo Step 1: Current POS Backend processes:
echo ----------------------------------------
tasklist | findstr /i "pos_backend\|wscript" 2>nul
if %errorLevel__ neq 0 (
    echo [!] No POS Backend processes found running
    goto stop_cleanup
)
echo.

echo Step 2: Stopping scheduled task...
schtasks /end /tn "POS Backend Startup" 2>nul >nul
echo Task stop attempted
echo.

echo Step 3: Graceful shutdown attempt...
taskkill /im pos_backend.exe 2>nul >nul
if %errorLevel__ == 0 (
    echo [OK] Graceful shutdown signal sent
    ping 127.0.0.1 -n 4 >nul 2>&1
) else (
    echo [!] No pos_backend.exe process found for graceful shutdown
)

echo Step 4: Force termination if needed...
tasklist | findstr /i "pos_backend.exe" >nul 2>&1
if %errorLevel__ == 0 (
    echo [!] Process still running, using force termination...
    taskkill /f /im pos_backend.exe /t 2>nul
    echo [OK] Force kill command executed
) else (
    echo [OK] Main process stopped successfully
)
echo.

echo Step 5: Stopping background scripts...
tasklist | findstr /i "wscript.exe" >nul 2>&1
if %errorLevel__ == 0 (
    echo [!] Found wscript.exe processes, checking if related...
    wmic process where "commandline like '%%POS_Backend%%' or commandline like '%%run_silent%%'" get processid 2>nul | findstr /v "ProcessId" > temp_pids.txt 2>nul
    for /f %%a in (temp_pids.txt) do (
        if "%%a" neq "" (
            echo Terminating related wscript PID: %%a
            taskkill /f /pid %%a 2>nul >nul
        )
    )
    del temp_pids.txt 2>nul
    echo [OK] Related background scripts terminated
) else (
    echo [OK] No background scripts found
)
echo.

:stop_cleanup
echo Step 6: Final verification...
ping 127.0.0.1 -n 3 >nul 2>&1

tasklist | findstr /i "pos_backend.exe" >nul 2>&1
if %errorLevel__ neq 0 (
    echo [✓] POS Backend completely terminated
    
    netstat -an | findstr :4444 >nul 2>&1
    if %errorLevel__ neq 0 (
        echo [✓] Port 4444 released
        echo [✓] System is clean
    ) else (
        echo [!] Port 4444 still in use by another process
    )
) else (
    echo [X] WARNING: Some POS Backend processes still running
    tasklist | findstr /i "pos_backend"
)

echo.
pause
goto menu

:emergency_stop
echo ====================================
echo  EMERGENCY STOP - NUCLEAR OPTION
echo ====================================
echo.
echo [WARNING] This will forcefully terminate ALL related processes
echo.
set /p confirm="Are you sure? Type YES to continue: "
if /i not "%confirm%"=="YES" (
    echo Operation cancelled.
    goto menu
)
echo.

echo Executing emergency stop procedures...
echo.

taskkill /f /im pos_backend.exe /t 2>nul >nul
taskkill /f /im wscript.exe /t 2>nul >nul
taskkill /f /im node.exe /t 2>nul >nul

echo Terminating processes using port 4444...
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr :4444') do (
    if "%%a" neq "" (
        taskkill /f /pid %%a 2>nul >nul
    )
)

schtasks /end /tn "POS Backend Startup" 2>nul >nul

echo.
echo Emergency stop completed!
echo.
ping 127.0.0.1 -n 4 >nul 2>&1

echo Final verification:
tasklist | findstr /i "pos_backend" 2>nul
if %errorLevel__ neq 0 (
    echo [✓] No pos_backend processes found
) else (
    echo [!] Some processes may still exist
)

netstat -an | findstr :4444 >nul 2>&1
if %errorLevel__ neq 0 (
    echo [✓] Port 4444 is free
) else (
    echo [!] Port 4444 still in use
)

echo.
pause
goto menu

:fix_installation
echo ====================================
echo  FIX INSTALLATION ISSUES
echo ====================================
echo.
echo This will help fix common installation problems...
echo.

echo 1. Checking for file locks...
echo Stopping all processes first...
taskkill /f /im pos_backend.exe 2>nul >nul
ping 127.0.0.1 -n 3 >nul 2>&1

echo.
echo 2. Checking installation directory...
if exist "C:\POS_Backend\" (
    echo [✓] Installation directory exists
    dir "C:\POS_Backend\" /b
) else (
    echo [X] Installation directory missing - run install.bat first
)

echo.
echo 3. Checking for executable in dist...
if exist "dist\pos_backend.exe" (
    echo [✓] Found pos_backend.exe in dist folder
    echo File size: 
    dir "dist\pos_backend.exe" | findstr pos_backend
) else (
    echo [X] pos_backend.exe not found in dist folder
    echo You need to build it first:
    echo   1. node build.js
    echo   2. pkg . --target node18-win-x64 --output dist/pos_backend.exe
)

echo.
echo 4. Trying to fix installation...
if exist "dist\pos_backend.exe" (
    echo Copying executable to installation directory...
    copy "dist\pos_backend.exe" "C:\POS_Backend\" 2>nul
    if %errorLevel__ == 0 (
        echo [✓] Successfully copied executable
    ) else (
        echo [X] Failed to copy - file may be in use
        echo Try running this script as Administrator
    )
)

echo.
pause
goto menu

:refresh
cls
echo Refreshing status...
ping 127.0.0.1 -n 2 >nul 2>&1
goto menu

:exit
echo.
echo Thank you for using POS Backend Status Checker v2.1
echo.
exit /b 0