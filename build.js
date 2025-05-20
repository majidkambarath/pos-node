// build.js - Custom Build Script
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Create necessary directories
if (!fs.existsSync('public')) {
  fs.mkdirSync('public');
  console.log('Created missing public directory');
}

if (!fs.existsSync('dist')) {
  fs.mkdirSync('dist');
  console.log('Created dist directory');
}

// Create a temporary package.json with limited dependencies
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
    targets: ["node18-win-x64"],
    outputPath: "dist",
    assets: [
      "node_modules/**/*",
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
    ]
  }
};

// Write temporary package.json
fs.writeFileSync('temp-package.json', JSON.stringify(tempPackageJson, null, 2));
console.log('Created temporary package.json for building');

// Run pkg with the temporary package.json
const buildCommand = 'pkg temp-package.json';
console.log(`Running build command: ${buildCommand}`);

exec(buildCommand, (error, stdout, stderr) => {
  console.log(stdout);
  
  if (error) {
    console.error(`Build error: ${error.message}`);
    console.error(stderr);
  } else {
    console.log('Build completed successfully');
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
  } catch (err) {
    console.error('Error copying files:', err);
  }
});