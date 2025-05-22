// build.js - Fixed Build Script with Correct Node Version
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

// Check current Node.js version
const nodeVersion = process.version;
console.log(`Current Node.js version: ${nodeVersion}`);

// Create a temporary package.json with correct Node.js target
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
    // Use Node.js 18 which is widely supported by pkg
    targets: ["node18-win-x64"],
    outputPath: "dist",
    // More specific asset selection to reduce file size
    assets: [
      "config/**/*",
      "public/**/*",
      ".env"
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
      "node_modules/.bin/**",
      "node_modules/**/test/**",
      "node_modules/**/tests/**",
      "node_modules/**/*.md",
      "node_modules/**/LICENSE*",
      "node_modules/**/CHANGELOG*",
      "node_modules/**/example/**",
      "node_modules/**/examples/**",
      "node_modules/**/benchmark/**",
      "node_modules/**/doc/**",
      "node_modules/**/docs/**"
    ]
  }
};

// Write temporary package.json
fs.writeFileSync('temp-package.json', JSON.stringify(tempPackageJson, null, 2));
console.log('Created temporary package.json for building');

// Use simpler pkg command without compression to avoid issues
const buildCommand = 'pkg temp-package.json --target node18-win-x64 --output dist/pos_backend.exe';
console.log(`Running build command: ${buildCommand}`);

exec(buildCommand, (error, stdout, stderr) => {
  console.log(stdout);
  
  if (error) {
    console.error(`Build error: ${error.message}`);
    console.error('Stderr:', stderr);
    
    // Try alternative build method
    console.log('\nTrying alternative build method...');
    const altCommand = 'pkg . --target node18-win-x64 --output dist/pos_backend.exe';
    console.log(`Running: ${altCommand}`);
    
    exec(altCommand, (altError, altStdout, altStderr) => {
      console.log(altStdout);
      if (altError) {
        console.error(`Alternative build also failed: ${altError.message}`);
        console.error('Please try manual build: pkg . --target node18-win-x64 --output dist/pos_backend.exe');
      } else {
        console.log('Alternative build completed successfully');
        generateChecksum();
      }
      cleanup();
    });
  } else {
    console.log('Build completed successfully');
    generateChecksum();
    cleanup();
  }
});

function generateChecksum() {
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

function cleanup() {
  // Clean up temporary file
  if (fs.existsSync('temp-package.json')) {
    fs.unlinkSync('temp-package.json');
    console.log('Removed temporary package.json');
  }
  
  // Copy necessary files to dist directory
  try {
    if (fs.existsSync('.env')) {
      fs.copyFileSync('.env', path.join('dist', '.env'));
      console.log('Copied .env file to dist directory');
    } else {
      console.log('Warning: .env file not found');
    }
    
    // Create README for dist
    const readmeContent = `# POS Backend Application

## Quick Start
1. Ensure .env file is configured with your database settings
2. Run: pos_backend.exe
3. Server will start on the configured port

## Configuration
Edit the .env file to configure:
- Database connection settings
- Server port
- Other application settings

## Files in this directory:
- pos_backend.exe: Main application
- .env: Configuration file
- checksum.txt: File verification
- README.txt: This file

Generated on: ${new Date().toISOString()}
`;
    
    fs.writeFileSync(path.join('dist', 'README.txt'), readmeContent);
    console.log('Created README file for distribution');
    
  } catch (err) {
    console.error('Error copying files:', err);
  }
}