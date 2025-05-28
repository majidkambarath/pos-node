@echo off
title POS Backend Status Checker
color 0A

echo ====================================
echo  POS Backend Status Monitor
echo ====================================
echo.

:menu
echo 1. Check if POS Backend is Running
echo 2. Test API Connection
echo 3. View Live Logs
echo 4. Show Task Manager Processes
echo 5. Check Startup Task Status
echo 6. Check Port Usage
echo 7. Start POS Backend (if not running)
echo 8. Stop POS Backend
echo 9. EMERGENCY STOP - Kill All Related Processes
echo 10. Refresh Status
echo 0. Exit
echo.
set /p choice="Enter your choice (0-10): "
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
if "%choice%"=="10" goto refresh
if "%choice%"=="0" goto exit
goto menu

:check_process
echo ====================================
echo  PROCESS STATUS CHECK
echo ====================================
echo.
echo Checking for POS Backend processes...
echo.

tasklist /fi "imagename eq pos_backend.exe" /fo table 2>nul | find /i "pos_backend.exe" >nul
if %errorLevel% == 0 (
    echo [OK] POS Backend EXE is RUNNING
    tasklist /fi "imagename eq pos_backend.exe" /fo table
) else (
    echo [X] POS Backend EXE is NOT RUNNING
)
echo.

tasklist /fi "imagename eq wscript.exe" /fo table 2>nul | find /i "wscript.exe" >nul
if %errorLevel% == 0 (
    echo [OK] Background Script (wscript.exe) is RUNNING
    tasklist /fi "imagename eq wscript.exe" /fo table | findstr /v "Image Name"
) else (
    echo [X] Background Script is NOT RUNNING
)
echo.

tasklist /fi "imagename eq cmd.exe" /fo table 2>nul | find /i "service_wrapper" >nul
if %errorLevel% == 0 (
    echo [OK] Service Wrapper is RUNNING
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
powershell -Command "try { $response = Invoke-WebRequest -Uri 'http://localhost:4444/health' -TimeoutSec 5; Write-Host '[✓] API Health Check: SUCCESS'; Write-Host 'Response:' $response.Content } catch { Write-Host '[✗] API Health Check: FAILED'; Write-Host 'Error:' $_.Exception.Message }"
echo.

echo Testing: http://localhost:4444/api/
powershell -Command "try { $response = Invoke-WebRequest -Uri 'http://localhost:4444/api/' -TimeoutSec 5; Write-Host '[✓] API Root: SUCCESS' } catch { Write-Host '[✗] API Root: FAILED'; Write-Host 'Error:' $_.Exception.Message }"
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
    powershell -Command "Get-Content 'C:\POS_Backend\service.log' -Tail 20"
    echo ----------------------------------------
) else (
    echo [✗] No service.log found
)
echo.

if exist "C:\POS_Backend\service_error.log" (
    echo [✓] Error log found - Showing last 10 lines:
    echo ----------------------------------------
    powershell -Command "Get-Content 'C:\POS_Backend\service_error.log' -Tail 10"
    echo ----------------------------------------
) else (
    echo [✗] No service_error.log found
)
echo.

echo Press any key to continue, or Ctrl+C to exit...
pause
goto menu

:task_manager
echo ====================================
echo  PROCESS DETAILS
echo ====================================
echo.
echo All POS Backend related processes:
echo.
tasklist /fi "imagename eq pos_backend.exe" /fo table /v 2>nul
echo.
tasklist /fi "imagename eq wscript.exe" /fo table /v 2>nul
echo.
tasklist /fi "imagename eq cmd.exe" /fo table /v 2>nul | findstr /i "service_wrapper"
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

schtasks /query /tn "POS Backend Startup" /fo table 2>nul
if %errorLevel% == 0 (
    echo [✓] Startup task EXISTS and is configured
    echo.
    echo Task Details:
    schtasks /query /tn "POS Backend Startup" /fo list /v 2>nul
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
echo  PORT USAGE CHECK
echo ====================================
echo.
echo Checking if port 4444 is in use...
echo.

netstat -an | findstr :4444
if %errorLevel% == 0 (
    echo [✓] Port 4444 is ACTIVE - Something is listening
    echo.
    echo Detailed port information:
    netstat -ano | findstr :4444
    echo.
    echo Process using port 4444:
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :4444') do (
        tasklist /fi "pid eq %%a" /fo table 2>nul
    )
) else (
    echo [✗] Port 4444 is NOT in use - POS Backend may not be running
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
tasklist /fi "imagename eq pos_backend.exe" /fo table 2>nul | find /i "pos_backend.exe" >nul
if %errorLevel% == 0 (
    echo [!] POS Backend is already running!
    tasklist /fi "imagename eq pos_backend.exe" /fo table
    echo.
    echo If you want to restart, use option 8 to stop first.
) else (
    echo Attempting to start POS Backend in background...
    echo.
    
    if exist "C:\POS_Backend\run_silent.vbs" (
        echo Starting via silent VBS script...
        cscript //nologo "C:\POS_Backend\run_silent.vbs"
        echo.
        echo Waiting 5 seconds for startup...
        timeout /t 5 /nobreak >nul
        echo.
        echo Checking if started successfully...
        tasklist /fi "imagename eq pos_backend.exe" /fo table 2>nul | find /i "pos_backend.exe" >nul
        if %errorLevel% == 0 (
            echo [✓] POS Backend started successfully!
            tasklist /fi "imagename eq pos_backend.exe" /fo table
        ) else (
            echo [✗] Failed to start POS Backend
            echo Check C:\POS_Backend\ for error logs
        )
    ) else (
        echo [✗] Silent runner script not found
        echo Please run the installer first
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

REM Step 1: Display current processes
echo Step 1: Current POS Backend processes:
echo ----------------------------------------
tasklist | findstr /i "pos_backend wscript cmd" 2>nul
if %errorLevel% neq 0 (
    echo [!] No POS Backend processes found running
    echo.
    goto stop_cleanup
)
echo.

REM Step 2: Stop scheduled task first
echo Step 2: Stopping scheduled task...
schtasks /end /tn "POS Backend Startup" 2>nul >nul
if %errorLevel% == 0 (
    echo [OK] Startup task stopped
) else (
    echo [!] No startup task found or already stopped
)
echo.

REM Step 3: Graceful shutdown attempt
echo Step 3: Attempting graceful shutdown...
taskkill /im pos_backend.exe 2>nul
if %errorLevel__ == 0 (
    echo [OK] Graceful shutdown signal sent to pos_backend.exe
    timeout /t 3 /nobreak >nul
) else (
    echo [!] No pos_backend.exe process found for graceful shutdown
)

REM Step 4: Check and force kill main process
echo Step 4: Checking main process status...
tasklist /fi "imagename eq pos_backend.exe" /fo table 2>nul | find /i "pos_backend.exe" >nul
if %errorLevel% == 0 (
    echo [!] Process still running, using force termination...
    
    REM Get all PIDs for pos_backend.exe
    for /f "tokens=2" %%a in ('tasklist /fi "imagename eq pos_backend.exe" /fo csv /nh 2^>nul ^| findstr pos_backend') do (
        set "pid=%%~a"
        if defined pid (
            echo Terminating PID: !pid!
            taskkill /f /pid !pid! /t 2>nul
            if !errorLevel! == 0 (
                echo [OK] Successfully terminated PID !pid!
            ) else (
                echo [X] Failed to terminate PID !pid!
            )
        )
    )
    
    REM Backup force kill by image name
    taskkill /f /im pos_backend.exe /t 2>nul
    echo [OK] Force kill command executed
) else (
    echo [OK] Main process stopped successfully
)
echo.

REM Step 5: Stop background scripts
echo Step 5: Stopping background scripts...
tasklist /fi "imagename eq wscript.exe" /fo table 2>nul | find /i "wscript.exe" >nul
if %errorLevel% == 0 (
    echo [!] Found wscript.exe processes, terminating...
    taskkill /f /im wscript.exe /t 2>nul
    if %errorLevel% == 0 (
        echo [OK] Background scripts terminated
    ) else (
        echo [X] Failed to terminate some background scripts
    )
) else (
    echo [OK] No background scripts found
)
echo.

REM Step 6: Stop service wrapper processes
echo Step 6: Stopping service wrapper processes...
set "wrapper_found=0"
for /f "tokens=2,9" %%a in ('tasklist /fi "imagename eq cmd.exe" /fo csv /nh 2^>nul') do (
    echo %%b | findstr /i "service_wrapper" >nul 2>&1
    if !errorLevel! == 0 (
        set "wrapper_found=1"
        set "pid=%%~a"
        echo Terminating service wrapper PID: !pid!
        taskkill /f /pid !pid! /t 2>nul
        if !errorLevel! == 0 (
            echo [OK] Service wrapper PID !pid! terminated
        ) else (
            echo [X] Failed to terminate service wrapper PID !pid!
        )
    )
)
if "%wrapper_found%"=="0" (
    echo [OK] No service wrapper processes found
)
echo.

REM Step 7: Check port usage and kill process using port 4444
echo Step 7: Checking port 4444 usage...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :4444 ^| findstr LISTENING') do (
    set "port_pid=%%a"
    if defined port_pid (
        echo [!] Process using port 4444 (PID: !port_pid!)
        taslist /fi "pid eq !port_pid!" /fo table 2>nul
        echo Terminating process using port 4444...
        taskkill /f /pid !port_pid! 2>nul
        if !errorLevel! == 0 (
            echo [OK] Process using port 4444 terminated
        ) else (
            echo [X] Failed to terminate process using port 4444
        )
    )
)
echo.

:stop_cleanup
REM Step 8: Final verification
echo Step 8: Final verification and cleanup...
echo ========================================
timeout /t 2 /nobreak >nul

echo Checking remaining processes...
set "remaining_processes=0"

tasklist /fi "imagename eq pos_backend.exe" /fo table 2>nul | find /i "pos_backend.exe" >nul
if %errorLevel% == 0 (
    echo [X] WARNING: pos_backend.exe still running
    tasklist /fi "imagename eq pos_backend.exe" /fo table
    set "remaining_processes=1"
)

tasklist /fi "imagename eq wscript.exe" /fo table 2>nul | find /i "wscript.exe" >nul
if %errorLevel% == 0 (
    echo [!] WARNING: wscript.exe still running (may be unrelated)
    set "remaining_processes=1"
)

netstat -an | findstr :4444 >nul 2>&1
if %errorLevel% == 0 (
    echo [X] WARNING: Port 4444 still in use
    netstat -ano | findstr :4444
    set "remaining_processes=1"
)

if "%remaining_processes%"=="1" (
    echo.
    echo ====================================
    echo  TROUBLESHOOTING RECOMMENDATIONS
    echo ====================================
    echo 1. Try running this script as Administrator
    echo 2. Use option 9 for EMERGENCY STOP
    echo 3. Manually check Task Manager
    echo 4. Restart computer if necessary
    echo 5. Check if any files are locked in C:\POS_Backend\
) else (
    echo.
    echo ====================================
    echo  SUCCESS - ALL PROCESSES STOPPED
    echo ====================================
    echo [✓] POS Backend completely terminated
    echo [✓] All related processes stopped
    echo [✓] Port 4444 released
    echo [✓] System is clean
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
echo [WARNING] This may affect other applications using similar processes
echo.
set /p confirm="Are you sure? Type YES to continue: "
if /i not "%confirm%"=="YES" (
    echo Operation cancelled.
    goto menu
)
echo.

echo Executing emergency stop procedures...
echo.

REM Kill all possible related processes
echo Terminating all pos_backend processes...
taskkill /f /im pos_backend.exe /t 2>nul
taskkill /f /im wscript.exe /t 2>nul
taskkill /f /im node.exe /t 2>nul
taskkill /f /im python.exe /t 2>nul

REM Kill processes using port 4444
echo Terminating processes using port 4444...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :4444') do (
    taskkill /f /pid %%a 2>nul >nul
)

REM Stop all scheduled tasks that might be related
echo Stopping scheduled tasks...
schtasks /end /tn "POS Backend Startup" 2>nul >nul
schtasks /end /tn "POS Backend Service" 2>nul >nul

REM Kill any remaining CMD processes that might be service wrappers
echo Checking for service wrapper processes...
for /f "tokens=2,9" %%a in ('tasklist /fi "imagename eq cmd.exe" /fo csv /nh 2^>nul') do (
    echo %%b | findstr /i "service\|wrapper\|pos\|backend" >nul 2>&1
    if !errorLevel! == 0 (
        taskkill /f /pid %%~a 2>nul >nul
    )
)

echo.
echo Emergency stop completed!
echo.
echo Final verification:
timeout /t 3 /nobreak >nul

tasklist | findstr /i "pos_backend" 2>nul
if %errorLevel% neq 0 (
    echo [✓] No pos_backend processes found
) else (
    echo [!] Some processes may still exist:
    tasklist | findstr /i "pos_backend"
)

netstat -an | findstr :4444 >nul 2>&1
if %errorLevel% neq 0 (
    echo [✓] Port 4444 is free
) else (
    echo [!] Port 4444 still in use:
    netstat -ano | findstr :4444
)

echo.
echo Emergency stop procedure completed.
echo If processes still remain, try restarting your computer.
echo.
pause
goto menu

:refresh
cls
echo Refreshing status...
timeout /t 1 /nobreak >nul
goto menu

:exit
echo.
echo Thank you for using POS Backend Status Checker
echo.
exit

:error
echo An error occurred. Please try again.
pause
goto menu