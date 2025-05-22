@echo off
title POS Backend Installer v1.0
color 0A

echo ====================================
echo  POS Backend Installation Wizard
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
    echo SOLUTIONS:
    echo 1. Make sure you've built the application first: npm run build
    echo 2. Copy pos_backend.exe to the same folder as install.bat
    echo 3. Or run install.bat from the dist folder
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
echo This prevents antivirus from deleting the application...
powershell -Command "try { Add-MpPreference -ExclusionPath '%INSTALL_DIR%' -Force; Write-Host '[OK] Windows Defender exclusion added' } catch { Write-Host '[WARNING] Could not add exclusion automatically - please add manually' }"

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

:: Copy additional files if they exist
if exist "%CURRENT_DIR%README.txt" (
    copy "%CURRENT_DIR%README.txt" "%INSTALL_DIR%\" >nul
    echo [OK] Copied documentation
)

if exist "%CURRENT_DIR%checksum.txt" (
    copy "%CURRENT_DIR%checksum.txt" "%INSTALL_DIR%\" >nul
    echo [OK] Copied checksum file
)

echo.
echo Step 6: Creating Desktop Shortcut...
powershell -Command "try { $WshShell = New-Object -comObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%USERPROFILE%\Desktop\POS Backend.lnk'); $Shortcut.TargetPath = '%INSTALL_DIR%\pos_backend.exe'; $Shortcut.WorkingDirectory = '%INSTALL_DIR%'; $Shortcut.Description = 'POS Backend Server'; $Shortcut.Save(); Write-Host '[OK] Desktop shortcut created' } catch { Write-Host '[WARNING] Could not create desktop shortcut' }"

echo.
echo Step 7: Setting up Windows Firewall...
echo Adding firewall rules for the application...
netsh advfirewall firewall delete rule name="POS Backend Server" >nul 2>&1
netsh advfirewall firewall add rule name="POS Backend Server" dir=in action=allow program="%INSTALL_DIR%\pos_backend.exe" enable=yes >nul 2>&1
if %errorLevel% == 0 (
    echo [OK] Firewall rule added
) else (
    echo [WARNING] Could not add firewall rule - you may need to configure manually
)

echo.
echo Step 8: Final Configuration...
cd /d "%INSTALL_DIR%"

:: Create a startup batch file
(
echo @echo off
echo title POS Backend Server
echo color 0A
echo cd /d "%INSTALL_DIR%"
echo echo ====================================
echo echo  POS Backend Server
echo echo ====================================
echo echo.
echo echo Server Location: %INSTALL_DIR%
echo echo Starting server... Please wait...
echo echo.
echo echo Press Ctrl+C to stop the server
echo echo Close this window to stop the server
echo echo.
echo pos_backend.exe
echo echo.
echo echo Server has stopped.
echo pause
) > start_pos.bat

echo [OK] Startup script created

:: Create uninstaller
(
echo @echo off
echo title POS Backend Uninstaller
echo echo Removing POS Backend...
echo taskkill /f /im pos_backend.exe 2^>nul
echo timeout /t 2 /nobreak ^>nul
echo rmdir /s /q "%INSTALL_DIR%"
echo del "%USERPROFILE%\Desktop\POS Backend.lnk" 2^>nul
echo netsh advfirewall firewall delete rule name="POS Backend Server" ^>nul 2^>^&1
echo powershell -Command "Remove-MpPreference -ExclusionPath '%INSTALL_DIR%' -Force" 2^>nul
echo echo POS Backend has been removed.
echo pause
) > uninstall.bat

echo [OK] Uninstaller created

echo.
echo ====================================
echo  INSTALLATION COMPLETED SUCCESSFULLY!
echo ====================================
echo.
echo Installation Directory: %INSTALL_DIR%
echo Desktop Shortcut: Created
echo Firewall Rule: Added
echo Antivirus Exclusion: Added (Windows Defender)
echo Startup Script: start_pos.bat
echo Uninstaller: uninstall.bat
echo.
echo IMPORTANT NOTES:
echo 1. If you have other antivirus software (not Windows Defender),
echo    you need to add %INSTALL_DIR% to exclusions manually
echo 2. Configure your .env file if needed
echo.
echo TO START THE APPLICATION:
echo - Double-click "POS Backend" shortcut on your desktop
echo - OR run: %INSTALL_DIR%\pos_backend.exe
echo - OR run: %INSTALL_DIR%\start_pos.bat
echo.

set /p START_NOW="Would you like to start the application now? (Y/N): "
if /i "%START_NOW%"=="Y" (
    echo.
    echo Starting POS Backend Server...
    echo ====================================
    echo.
    start "POS Backend Server" "%INSTALL_DIR%\start_pos.bat"
    echo The server is now starting in a separate window.
    echo Check that window for server status and any error messages.
    echo.
) else (
    echo.
    echo You can start the application later using:
    echo - Desktop shortcut: "POS Backend"
    echo - Or: %INSTALL_DIR%\start_pos.bat
)

echo.
echo TO UNINSTALL: Run %INSTALL_DIR%\uninstall.bat
echo.
echo Thank you for installing POS Backend!
echo For support, check README.txt in the installation directory.
echo.
pause