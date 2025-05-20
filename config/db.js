const dotenv = require("dotenv");
const sql = require("mssql");
const fs = require("fs");
const path = require("path");

// Get the current execution directory
const currentDir = process.cwd();
const execDir = path.dirname(process.execPath);

console.log('Current directory:', currentDir);
console.log('Executable directory:', execDir);

// Try to load environment variables from multiple possible locations
const envPaths = [
  '.env',
  path.join(currentDir, '.env'),
  path.join(__dirname, '.env'),
  path.join(execDir, '.env')
];

// Try to load from a config.json file
const configPaths = [
  'config.json',
  path.join(currentDir, 'config.json'),
  path.join(__dirname, 'config.json'),
  path.join(execDir, 'config.json')
];

console.log('Searching for configuration files...');

let envLoaded = false;

// First try env files
for (const envPath of envPaths) {
  try {
    console.log(`Checking for .env at: ${envPath}`);
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
      console.log(`✓ Successfully loaded environment variables from ${envPath}`);
      envLoaded = true;
      break;
    }
  } catch (err) {
    console.error(`Error checking .env at ${envPath}:`, err.message);
  }
}

// Then try config files
if (!envLoaded) {
  console.log("Could not find .env file. Checking for config.json...");
  
  for (const configPath of configPaths) {
    try {
      console.log(`Checking for config.json at: ${configPath}`);
      if (fs.existsSync(configPath)) {
        const configData = fs.readFileSync(configPath, 'utf8');
        console.log(`Found config file at ${configPath}`);
        
        try {
          const config = JSON.parse(configData);
          console.log('Parsed JSON configuration successfully');
          
          // Set environment variables from config
          Object.keys(config).forEach(key => {
            process.env[key] = config[key];
          });
          
          console.log(`✓ Successfully loaded configuration from ${configPath}`);
          envLoaded = true;
          break;
        } catch (parseErr) {
          console.error(`Error parsing JSON from ${configPath}:`, parseErr.message);
          console.log('First 100 characters of file:', configData.substring(0, 100));
        }
      }
    } catch (err) {
      console.error(`Error accessing config.json at ${configPath}:`, err.message);
    }
  }
}

// If no config was loaded, set some hardcoded defaults for testing
if (!envLoaded) {
  console.warn("⚠️ NO CONFIGURATION FILES FOUND! Setting hardcoded database configuration...");
  
  // Hardcode the configuration directly in code as a last resort
  process.env.DB_USER = "sa";
  process.env.DB_PASSWORD = "113a213635200c3630213c263c3120";
  process.env.DB_SERVER = "MAJID\\SQLEXPRESS";
  process.env.DB_NAME = "RESTPOS";
  process.env.DB_PORT = "1433";
  process.env.DB_ENCRYPT = "false";
  process.env.DB_TRUST_CERT = "true";
  process.env.DB_INTEGRATED_SECURITY = "true";
  process.env.PORT = "4444";
  
  console.log("✓ Using hardcoded database configuration");
}

const decryptSecret = (encrypted, salt = "POS_SYSTEM") => {
  try {
    // Check if encrypted value exists
    if (!encrypted) {
      console.error("No encrypted password provided");
      return "";
    }

    const saltChars = salt.split("").map((char) => char.charCodeAt(0));
    const hexPairs = [];
    for (let i = 0; i < encrypted.length; i += 2) {
      if (i + 1 < encrypted.length) {
        hexPairs.push(encrypted.substring(i, i + 2));
      }
    }
    const decrypted = hexPairs.map((hex, index) => {
      const charCode = parseInt(hex, 16);
      const saltChar = saltChars[index % saltChars.length];
      return String.fromCharCode(charCode ^ saltChar);
    });
    
    return decrypted.join("");
  } catch (error) {
    console.error("Decryption error:", error);
    return "";
  }
};

// Log environment variables for debugging (remove in production)
console.log("Environment variables loaded:", {
  DB_USER: process.env.DB_USER ? "defined" : "undefined",
  DB_PASSWORD: process.env.DB_PASSWORD ? "defined" : "undefined",
  DB_SERVER: process.env.DB_SERVER ? "defined" : "undefined",
  DB_NAME: process.env.DB_NAME ? "defined" : "undefined",
  DB_PORT: process.env.DB_PORT || "1433",
});

// Get and decrypt password
const encryptedPassword = process.env.DB_PASSWORD || "";
const decryptedPassword = decryptSecret(encryptedPassword);

// Check required connection parameters before creating config
if (!process.env.DB_SERVER) {
  console.error("ERROR: DB_SERVER environment variable is not defined");
}

if (!process.env.DB_USER) {
  console.error("ERROR: DB_USER environment variable is not defined");
}

if (!process.env.DB_NAME) {
  console.error("ERROR: DB_NAME environment variable is not defined");
}

// Create database configuration
const config = {
  user: process.env.DB_USER || "",
  password: decryptedPassword,
  server: process.env.DB_SERVER || "",
  database: process.env.DB_NAME || "",
  port: parseInt(process.env.DB_PORT || "1433"),
  options: {
    encrypt: process.env.DB_ENCRYPT === "true",
    trustServerCertificate: process.env.DB_TRUST_CERT === "true",
    enableArithAbort: true,
    integratedSecurity: process.env.DB_INTEGRATED_SECURITY === "true",
  },
};

// Only attempt to connect if we have the required parameters
const connectToDatabase = async () => {
  // Validate required config properties
  if (!config.server || !config.user || !config.database) {
    throw new Error(
      "Missing required database configuration. Check your environment variables."
    );
  }

  const pool = new sql.ConnectionPool(config);
  try {
    await pool.connect();
    console.log("Connected to MSSQL database successfully");
    return pool;
  } catch (err) {
    console.error("Database connection failed:", err);
    throw err;
  }
};

// Create pool but delay connection attempt
const pool = new sql.ConnectionPool(config);
const poolConnect = connectToDatabase()
  .then(() => pool)
  .catch((err) => {
    console.error("Failed to initialize database pool:", err.message);
    // Return pool anyway to avoid breaking imports, but connections will fail
    return pool;
  });

module.exports = { pool, poolConnect, sql };