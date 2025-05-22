// Enhanced build.js - Antivirus-friendly Build Script
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Create necessary directories
if (!fs.existsSync('public')) {
  fs.mkdirSync('public');
  console.log('Created missing public directory');
}
if (!fs.existsSync('dist')) {
  fs.mkdirSync('dist');
  console.log('Created dist directory');
}

// Create a temporary package.json with optimized configuration
const packageJson = require('./package.json');
const tempPackageJson = {
  name: packageJson.name,
  version: packageJson.version,
  description: packageJson.description,
  main: packageJson.main,
  bin: packageJson.main,
  dependencies: {
    cors: packageJson.dependencies.cors,
    dotenv: packageJson.dependencies.dotenv,
    express: packageJson.dependencies.express,
    msnodesqlv8: packageJson.dependencies.msnodesqlv8,
    mssql: packageJson.dependencies.mssql
  },
  pkg: {
    // Use stable Node.js version that pkg supports
    targets: ["node18-win-x64"],
    outputPath: "dist",
    // More specific asset selection to reduce file size
    assets: [
      "config/**/*",
      "public/**/*",
      ".env",
      "node_modules/mssql/**/*",
      "node_modules/msnodesqlv8/**/*"
    ],
    scripts: [
      "app.js",
      "config/**/*.js", 
      "controllers/**/*.js",
      "routers/**/*.js",
      "services/**/*.js",
      "utils/**/*.js"
    ],
    // Enhanced ignore list for cleaner build
    ignores: [
      "node_modules/open/**",
      "node_modules/default-browser/**",
      "node_modules/define-lazy-prop/**",
      "node_modules/is-inside-container/**",
      "node_modules/is-wsl/**",
      "node_modules/bundle-name/**",
      "node_modules/default-browser-id/**",
      "node_modules/is-docker/**",
      "node_modules/run-applescript/**",
      "node_modules/.bin/**",
      "node_modules/**/test/**",
      "node_modules/**/tests/**",
      "node_modules/**/*.md",
      "node_modules/**/LICENSE*",
      "node_modules/**/CHANGELOG*"
    ],
    // Compression settings for better compatibility
    compress: false,
    options: [
      "--max-old-space-size=4096"
    ]
  }
};

// Write temporary package.json
fs.writeFileSync('temp-package.json', JSON.stringify(tempPackageJson, null, 2));
console.log('Created temporary package.json for building');

// Create a version info file for the executable
const versionInfo = {
  CompanyName: "Your Company Name",
  FileDescription: "POS Backend Application",
  FileVersion: packageJson.version,
  InternalName: "pos_backend",
  LegalCopyright: "Copyright (C) 2024 Your Company",
  OriginalFilename: "pos_backend.exe",
  ProductName: "POS Backend",
  ProductVersion: packageJson.version
};

// Run pkg with the temporary package.json
const buildCommand = 'pkg temp-package.json --compress GZip';
console.log(`Running build command: ${buildCommand}`);

exec(buildCommand, (error, stdout, stderr) => {
  console.log(stdout);
  
  if (error) {
    console.error(`Build error: ${error.message}`);
    console.error(stderr);
  } else {
    console.log('Build completed successfully');
    
    // Generate checksum for the executable
    const exePath = path.join('dist', 'pos_backend.exe');
    if (fs.existsSync(exePath)) {
      const fileBuffer = fs.readFileSync(exePath);
      const hashSum = crypto.createHash('sha256');
      hashSum.update(fileBuffer);
      const hex = hashSum.digest('hex');
      
      fs.writeFileSync(path.join('dist', 'checksum.txt'), 
        `SHA256: ${hex}\nFile: pos_backend.exe\nDate: ${new Date().toISOString()}`);
      console.log('Generated checksum file');
    }
  }
  
  // Clean up temporary file
  fs.unlinkSync('temp-package.json');
  console.log('Removed temporary package.json');
  
  // Copy necessary files to dist directory
  try {
    if (fs.existsSync('.env')) {
      fs.copyFileSync('.env', path.join('dist', '.env'));
      console.log('Copied .env file to dist directory');
    } else {
      console.log('Warning: .env file not found');
    }
    
    // Create installer batch file
    const installerBatch = `@echo off
echo Installing POS Backend...
echo.
echo This application requires administrator privileges to run properly.
echo Please ensure Windows Defender exclusions are set if needed.
echo.
echo Starting POS Backend...
pos_backend.exe
pause`;
    
    fs.writeFileSync(path.join('dist', 'install.bat'), installerBatch);
    console.log('Created installer batch file');
    
  } catch (err) {
    console.error('Error copying files:', err);
  }
});

// Create a README for distribution
const readmeContent = `# POS Backend Application

## Installation Instructions

1. Extract all files to a folder (e.g., C:\\POS_Backend)
2. Right-click on install.bat and "Run as Administrator"
3. If Windows Defender flags the file, add the folder to exclusions

## Antivirus Exclusion Steps

### Windows Defender:
1. Open Windows Security
2. Go to Virus & threat protection
3. Click "Manage settings" under Virus & threat protection settings
4. Scroll down to Exclusions and click "Add or remove exclusions"
5. Click "Add an exclusion" and select "Folder"
6. Select the folder containing pos_backend.exe

### Other Antivirus Software:
- Add the installation folder to your antivirus exclusions
- Whitelist the pos_backend.exe file

## System Requirements
- Windows 10/11 (64-bit)
- Administrator privileges for first run
- Network access for database connections

## Troubleshooting
- If the application is deleted by antivirus, restore from quarantine and add exclusions
- Ensure .env file is in the same directory as the executable
- Check Windows Event Viewer for detailed error logs

## Support
Contact your system administrator for additional support.
`;

fs.writeFileSync(path.join('dist', 'README.txt'), readmeContent);
console.log('Created README file for distribution');