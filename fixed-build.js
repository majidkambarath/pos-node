// fixed-build.js - Simplified and Fixed Build Script
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

console.log('🚀 Starting POS Backend Build Process...');

// Step 1: Check prerequisites
console.log('📋 Checking prerequisites...');

const requiredFiles = ['app.js', 'package.json'];
const missingFiles = requiredFiles.filter(file => !fs.existsSync(file));

if (missingFiles.length > 0) {
  console.error('❌ Missing required files:', missingFiles.join(', '));
  process.exit(1);
}

// Step 2: Create persistent-app.js if it doesn't exist
if (!fs.existsSync('persistent-app.js')) {
  console.log('📝 Creating persistent-app.js...');
  
  const persistentAppContent = `// persistent-app.js - Auto-generated persistent wrapper
const path = require('path');
const fs = require('fs');

console.log('🏪 POS Backend Server Starting...');
console.log('=====================================');

// Prevent easy termination
process.on('SIGINT', () => {
  console.log('\\n⚠️  To stop the server, close this window or use Task Manager');
  console.log('   Server will continue running...');
});

process.on('SIGTERM', () => {
  console.log('⚠️  Server continues running. Use window close button to exit.');
});

// Start the main application
try {
  console.log('🔄 Loading main application...');
  require('./app.js');
  console.log('✅ POS Backend Server is running');
  console.log('📍 To stop: Close this window or use Task Manager');
  
  // Keep alive with periodic status
  setInterval(() => {
    console.log(\`💚 Server running - Uptime: \${Math.floor(process.uptime() / 60)} minutes\`);
  }, 300000); // Every 5 minutes
  
} catch (error) {
  console.error('❌ Failed to start server:', error.message);
  console.log('🔧 Please check your app.js file');
  process.exit(1);
}
`;

  fs.writeFileSync('persistent-app.js', persistentAppContent);
  console.log('✅ Created persistent-app.js');
}

// Step 3: Create directories
const createDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 Created directory: ${dir}`);
  }
};

createDir('dist');
createDir('public');

// Step 4: Generate unique build ID
const buildId = crypto.randomBytes(6).toString('hex');
console.log(`🆔 Build ID: ${buildId}`);

// Step 5: Create optimized package.json for building
const originalPackage = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const buildPackage = {
  name: `pos_backend_${buildId}`,
  version: originalPackage.version || '1.0.0',
  description: originalPackage.description || 'POS Backend Server',
  main: 'persistent-app.js',
  bin: 'persistent-app.js',
  dependencies: {
    cors: originalPackage.dependencies?.cors || '^2.8.5',
    dotenv: originalPackage.dependencies?.dotenv || '^16.5.0',
    express: originalPackage.dependencies?.express || '^5.1.0',
    msnodesqlv8: originalPackage.dependencies?.msnodesqlv8 || '^4.5.0',
    mssql: originalPackage.dependencies?.mssql || '^11.0.1'
  },
  pkg: {
    targets: ['node18-win-x64'],
    outputPath: 'dist',
    compress: 'Brotli',
    assets: [
      '.env',
      'config/**/*',
      'public/**/*'
    ],
    scripts: [
      'persistent-app.js',
      'app.js',
      'config/**/*.js',
      'controllers/**/*.js',
      'routers/**/*.js',
      'services/**/*.js',
      'utils/**/*.js'
    ]
  }
};

// Step 6: Write build package.json
fs.writeFileSync('build-package.json', JSON.stringify(buildPackage, null, 2));
console.log('✅ Created build configuration');

// Step 7: Build the executable
console.log('🔨 Building executable...');
const buildCommand = 'pkg build-package.json --compress Brotli';

exec(buildCommand, (error, stdout, stderr) => {
  console.log(stdout);
  
  if (stderr) {
    console.log('Build warnings:', stderr);
  }
  
  if (error) {
    console.error('❌ Build failed:', error.message);
    console.log('🔧 Troubleshooting:');
    console.log('   1. Make sure all your files exist');
    console.log('   2. Check that pkg is installed: npm install -g pkg');
    console.log('   3. Try running: npm install');
    return;
  }

  console.log('✅ Build completed successfully!');
  
  // Step 8: Post-build setup
  try {
    const exeName = `${buildPackage.name}.exe`;
    const exePath = path.join('dist', exeName);
    
    if (fs.existsSync(exePath)) {
      console.log(`📦 Executable created: ${exeName}`);
    } else {
      console.log('⚠️  Executable not found, checking for alternative names...');
      const files = fs.readdirSync('dist').filter(f => f.endsWith('.exe'));
      if (files.length > 0) {
        console.log(`📦 Found executable: ${files[0]}`);
      }
    }
    
    // Copy .env file if it exists
    if (fs.existsSync('.env')) {
      fs.copyFileSync('.env', path.join('dist', '.env'));
      console.log('✅ Copied .env file');
    }
    
    // Create startup script
    const startScript = `@echo off
title POS Backend Server
echo.
echo ========================================
echo    POS Backend Server
echo ========================================
echo.
echo ⚠️  IMPORTANT: Do not close this window!
echo 📍 To stop the server: Close window or use Task Manager
echo.
echo Starting server...
echo.

REM Find the executable file
for %%f in (*.exe) do (
    if exist "%%f" (
        echo Found executable: %%f
        "%%f"
        goto :found
    )
)

echo ❌ No executable found!
echo Please check the build was successful.
pause
exit

:found
echo.
echo Server has stopped.
pause
`;

    fs.writeFileSync(path.join('dist', 'start-server.bat'), startScript);
    console.log('✅ Created start-server.bat');
    
    // Create setup script for antivirus exclusions
    const setupScript = `@echo off
echo ========================================
echo    POS Backend - Antivirus Setup
echo ========================================
echo.
echo This script will add Windows Defender exclusions
echo for your POS Backend server to prevent false positives.
echo.
echo ⚠️  You need Administrator privileges!
echo.
pause

REM Add Windows Defender exclusions
echo Adding exclusions...
powershell -Command "Add-MpPreference -ExclusionPath '%~dp0' -Force" 2>nul

if %errorLevel% == 0 (
    echo ✅ Successfully added exclusions
) else (
    echo ❌ Failed to add exclusions automatically
    echo Please add this folder to antivirus exclusions manually:
    echo %~dp0
)

echo.
echo Setup complete! You can now run start-server.bat
pause
`;

    fs.writeFileSync(path.join('dist', 'setup-antivirus.bat'), setupScript);
    console.log('✅ Created setup-antivirus.bat');
    
    // Create README
    const readme = `POS Backend Server v${buildPackage.version}
Build ID: ${buildId}
Built: ${new Date().toLocaleString()}

SETUP INSTRUCTIONS:
==================
1. Run setup-antivirus.bat as Administrator (IMPORTANT!)
2. Run start-server.bat to start the server

SECURITY NOTES:
==============
- This is legitimate business software
- It runs a local web server for POS operations
- The server will run persistently until manually stopped
- To stop: Close the window or use Task Manager

TROUBLESHOOTING:
===============
- If antivirus blocks: Add this folder to exclusions
- If won't start: Check .env file and database settings
- If crashes: Check the log files for errors

For support, contact your system administrator.
`;

    fs.writeFileSync(path.join('dist', 'README.txt'), readme);
    console.log('✅ Created README.txt');
    
    // Clean up
    fs.unlinkSync('build-package.json');
    console.log('🧹 Cleaned up temporary files');
    
    console.log('\n🎉 BUILD COMPLETE!');
    console.log('==================');
    console.log('📁 Your files are in the "dist" folder');
    console.log('');
    console.log('🚀 NEXT STEPS:');
    console.log('1. cd dist');
    console.log('2. Run setup-antivirus.bat as Administrator');
    console.log('3. Run start-server.bat');
    console.log('');
    console.log('⚠️  IMPORTANT: Setup antivirus exclusions BEFORE running!');
    
  } catch (postError) {
    console.error('❌ Post-build error:', postError.message);
  }
});