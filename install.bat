@echo off
title POS Backend Service Installer v2.0
color 0A

echo ====================================
echo  POS Backend Service Installation
echo ====================================
echo.

:: Check for Administrator rights
echo Step 1: Checking Administrator Rights...
net session >nul 2>&1
if %errorLevel% == 0 (
    echo [OK] Running as Administrator
) else (
    echo [ERROR] Please run as Administrator
    echo.
    echo Instructions:
    echo 1. Right-click on install.bat
    echo 2. Select "Run as administrator"
    echo 3. Click "Yes" when prompted
    echo.
    pause
    exit /b 1
)

echo.
echo Step 2: Locating Application Files...
set CURRENT_DIR=%~dp0
set EXE_FILE=""
set ENV_FILE=""

:: Check current directory first
if exist "%CURRENT_DIR%pos_backend.exe" (
    set EXE_FILE=%CURRENT_DIR%pos_backend.exe
    echo [OK] Found pos_backend.exe in current directory
) else if exist "%CURRENT_DIR%dist\pos_backend.exe" (
    set EXE_FILE=%CURRENT_DIR%dist\pos_backend.exe
    echo [OK] Found pos_backend.exe in dist directory
    set CURRENT_DIR=%CURRENT_DIR%dist\
) else (
    echo [ERROR] pos_backend.exe not found!
    echo.
    echo Searched in:
    echo - %CURRENT_DIR%
    echo - %CURRENT_DIR%dist\
    echo.
    pause
    exit /b 1
)

:: Check for .env file
if exist "%CURRENT_DIR%.env" (
    set ENV_FILE=%CURRENT_DIR%.env
    echo [OK] Found .env configuration file
) else (
    echo [WARNING] .env file not found - you may need to configure manually
)

echo.
echo Step 3: Creating Application Directory...
set INSTALL_DIR=C:\POS_Backend
if not exist "%INSTALL_DIR%" (
    mkdir "%INSTALL_DIR%"
    if %errorLevel% == 0 (
        echo [OK] Created %INSTALL_DIR%
    ) else (
        echo [ERROR] Failed to create directory. Check permissions.
        pause
        exit /b 1
    )
) else (
    echo [OK] Directory already exists
)

echo.
echo Step 4: Adding Windows Defender Exclusion...
powershell -Command "try { Add-MpPreference -ExclusionPath '%INSTALL_DIR%' -Force; Write-Host '[OK] Windows Defender exclusion added' } catch { Write-Host '[WARNING] Could not add exclusion automatically' }"

echo.
echo Step 5: Copying Application Files...
copy "%EXE_FILE%" "%INSTALL_DIR%\" >nul
if %errorLevel% == 0 (
    echo [OK] Copied pos_backend.exe
) else (
    echo [ERROR] Failed to copy executable
    pause
    exit /b 1
)

if not "%ENV_FILE%"=="" (
    copy "%ENV_FILE%" "%INSTALL_DIR%\" >nul
    if %errorLevel% == 0 (
        echo [OK] Copied .env configuration
    ) else (
        echo [WARNING] Failed to copy .env file
    )
)

echo.
echo Step 6: Creating Service Wrapper Scripts...

:: Create the service wrapper script
echo @echo off > "%INSTALL_DIR%\service_wrapper.bat"
echo cd /d "%INSTALL_DIR%" >> "%INSTALL_DIR%\service_wrapper.bat"
echo :loop >> "%INSTALL_DIR%\service_wrapper.bat"
echo echo Starting POS Backend at %%time%% >> "%INSTALL_DIR%\service_wrapper.bat"
echo pos_backend.exe >> "%INSTALL_DIR%\service_wrapper.bat"
echo echo POS Backend stopped at %%time%% - Restarting in 5 seconds... >> "%INSTALL_DIR%\service_wrapper.bat"
echo timeout /t 5 /nobreak ^>nul >> "%INSTALL_DIR%\service_wrapper.bat"
echo goto loop >> "%INSTALL_DIR%\service_wrapper.bat"

echo [OK] Service wrapper created

echo.
echo Step 7: Creating Silent Background Runner...

:: Create silent background runner (VBScript)
echo Set WshShell = CreateObject("WScript.Shell") > "%INSTALL_DIR%\run_silent.vbs"
echo WshShell.Run chr(34) ^& "%INSTALL_DIR%\service_wrapper.bat" ^& chr(34), 0 >> "%INSTALL_DIR%\run_silent.vbs"
echo Set WshShell = Nothing >> "%INSTALL_DIR%\run_silent.vbs"

echo [OK] Silent runner created

echo.
echo Step 8: Creating Startup Task...

:: Create startup task script
echo @echo off > "%INSTALL_DIR%\setup_startup_task.bat"
echo title POS Backend Startup Task >> "%INSTALL_DIR%\setup_startup_task.bat"
echo echo Creating Windows Startup Task... >> "%INSTALL_DIR%\setup_startup_task.bat"
echo echo. >> "%INSTALL_DIR%\setup_startup_task.bat"
echo schtasks /delete /tn "POS Backend Startup" /f ^>nul 2^>^&1 >> "%INSTALL_DIR%\setup_startup_task.bat"
echo schtasks /create /tn "POS Backend Startup" /tr "%INSTALL_DIR%\run_silent.vbs" /sc onstart /ru SYSTEM /rl HIGHEST /f >> "%INSTALL_DIR%\setup_startup_task.bat"
echo echo. >> "%INSTALL_DIR%\setup_startup_task.bat"
echo if %%errorLevel%% == 0 ( >> "%INSTALL_DIR%\setup_startup_task.bat"
echo     echo [OK] Startup task created successfully! >> "%INSTALL_DIR%\setup_startup_task.bat"
echo     echo POS Backend will now start automatically when Windows boots. >> "%INSTALL_DIR%\setup_startup_task.bat"
echo     echo It will run silently in the background without showing any windows. >> "%INSTALL_DIR%\setup_startup_task.bat"
echo ^) else ( >> "%INSTALL_DIR%\setup_startup_task.bat"
echo     echo [ERROR] Failed to create startup task. >> "%INSTALL_DIR%\setup_startup_task.bat"
echo ^) >> "%INSTALL_DIR%\setup_startup_task.bat"
echo echo. >> "%INSTALL_DIR%\setup_startup_task.bat"
echo echo Starting POS Backend now... >> "%INSTALL_DIR%\setup_startup_task.bat"
echo cscript //nologo "%INSTALL_DIR%\run_silent.vbs" >> "%INSTALL_DIR%\setup_startup_task.bat"
echo echo. >> "%INSTALL_DIR%\setup_startup_task.bat"
echo echo [OK] POS Backend is now running in the background! >> "%INSTALL_DIR%\setup_startup_task.bat"
echo echo. >> "%INSTALL_DIR%\setup_startup_task.bat"
echo pause >> "%INSTALL_DIR%\setup_startup_task.bat"

echo [OK] Startup task script created

echo.
echo Step 9: Setting up Windows Firewall...
netsh advfirewall firewall delete rule name="POS Backend Server" >nul 2>&1
netsh advfirewall firewall add rule name="POS Backend Server" dir=in action=allow program="%INSTALL_DIR%\pos_backend.exe" enable=yes >nul 2>&1
if %errorLevel% == 0 (
    echo [OK] Firewall rule added
) else (
    echo [WARNING] Could not add firewall rule
)

echo.
echo Step 10: Creating Management Scripts...

:: Create stop all script
echo @echo off > "%INSTALL_DIR%\stop_all.bat"
echo title Stop POS Backend >> "%INSTALL_DIR%\stop_all.bat"
echo echo Stopping all POS Backend processes... >> "%INSTALL_DIR%\stop_all.bat"
echo taskkill /f /im pos_backend.exe /t 2^>nul >> "%INSTALL_DIR%\stop_all.bat"
echo taskkill /f /im wscript.exe /t 2^>nul >> "%INSTALL_DIR%\stop_all.bat"
echo schtasks /end /tn "POS Backend Startup" 2^>nul >> "%INSTALL_DIR%\stop_all.bat"
echo echo All POS Backend processes stopped. >> "%INSTALL_DIR%\stop_all.bat"
echo pause >> "%INSTALL_DIR%\stop_all.bat"

:: Create start script
echo @echo off > "%INSTALL_DIR%\start_background.bat"
echo title Start POS Backend Background >> "%INSTALL_DIR%\start_background.bat"
echo echo Starting POS Backend in background... >> "%INSTALL_DIR%\start_background.bat"
echo cscript //nologo "%INSTALL_DIR%\run_silent.vbs" >> "%INSTALL_DIR%\start_background.bat"
echo echo POS Backend started in background. >> "%INSTALL_DIR%\start_background.bat"
echo pause >> "%INSTALL_DIR%\start_background.bat"

:: Create uninstaller
echo @echo off > "%INSTALL_DIR%\uninstall.bat"
echo title POS Backend Uninstaller >> "%INSTALL_DIR%\uninstall.bat"
echo echo Removing POS Backend... >> "%INSTALL_DIR%\uninstall.bat"
echo taskkill /f /im pos_backend.exe 2^>nul >> "%INSTALL_DIR%\uninstall.bat"
echo taskkill /f /im wscript.exe /t 2^>nul >> "%INSTALL_DIR%\uninstall.bat"
echo schtasks /delete /tn "POS Backend Startup" /f 2^>nul >> "%INSTALL_DIR%\uninstall.bat"
echo timeout /t 2 /nobreak ^>nul >> "%INSTALL_DIR%\uninstall.bat"
echo cd \ >> "%INSTALL_DIR%\uninstall.bat"
echo rmdir /s /q "%INSTALL_DIR%" >> "%INSTALL_DIR%\uninstall.bat"
echo netsh advfirewall firewall delete rule name="POS Backend Server" ^>nul 2^>^&1 >> "%INSTALL_DIR%\uninstall.bat"
echo powershell -Command "Remove-MpPreference -ExclusionPath '%INSTALL_DIR%' -Force" 2^>nul >> "%INSTALL_DIR%\uninstall.bat"
echo echo POS Backend has been removed. >> "%INSTALL_DIR%\uninstall.bat"
echo pause >> "%INSTALL_DIR%\uninstall.bat"

echo [OK] Management scripts created

echo.
echo ====================================
echo  INSTALLATION COMPLETED SUCCESSFULLY!
echo ====================================
echo.
echo Installation Directory: %INSTALL_DIR%
echo.
echo BACKGROUND SERVICE SETUP:
echo.
echo To run POS Backend automatically in background:
echo 1. Run: %INSTALL_DIR%\setup_startup_task.bat (as Administrator)
echo.
echo MANUAL CONTROL:
echo - Start Background: %INSTALL_DIR%\start_background.bat
echo - Stop All: %INSTALL_DIR%\stop_all.bat
echo - Uninstall: %INSTALL_DIR%\uninstall.bat
echo.

set /p AUTO_SETUP="Would you like to set up automatic startup now? (Y/N): "
if /i "%AUTO_SETUP%"=="Y" (
    echo.
    echo Setting up automatic startup...
    cd /d "%INSTALL_DIR%"
    call setup_startup_task.bat
) else (
    echo.
    echo You can set up automatic startup later by running:
    echo %INSTALL_DIR%\setup_startup_task.bat
    echo.
    echo To start POS Backend now in background:
    echo %INSTALL_DIR%\start_background.bat
)

echo.
echo ====================================
echo Thank you for installing POS Backend!
echo ====================================
pause