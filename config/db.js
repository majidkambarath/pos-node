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

// Fix server name - handle SQL Server instance names properly
let serverName = process.env.DB_SERVER || "";
console.log('Original server name from env:', serverName);

// If it's a named instance (contains backslash), format it properly
if (serverName.includes('\\')) {
  // For named instances, we need to use the full server\instance format
  console.log('Detected SQL Server named instance:', serverName);
} else if (serverName.includes('/')) {
  // Handle forward slash notation and convert to backslash
  serverName = serverName.replace('/', '\\');
  console.log('Converted forward slash to backslash:', serverName);
}

console.log('Final server name for connection:', serverName);

// Create database configuration
const config = {
  user: process.env.DB_USER || "",
  password: decryptedPassword,
  server: serverName,
  database: process.env.DB_NAME || "",
  port: parseInt(process.env.DB_PORT || "1433"),
  options: {
    encrypt: process.env.DB_ENCRYPT === "true",
    trustServerCertificate: process.env.DB_TRUST_CERT === "true",
    enableArithAbort: true,
    integratedSecurity: process.env.DB_INTEGRATED_SECURITY === "true",
    // Add instanceName for named instances
    instanceName: serverName.includes('\\') ? serverName.split('\\')[1] : undefined,
  },
};

// For named instances, we might need to use just the server name without instance in the server field
if (serverName.includes('\\')) {
  const parts = serverName.split('\\');
  config.server = parts[0]; // Just the server name
  config.options.instanceName = parts[1]; // The instance name
  console.log('Using server:', config.server, 'with instance:', config.options.instanceName);
}

console.log('Database configuration:', {
  server: config.server,
  database: config.database,
  user: config.user,
  port: config.port,
  instanceName: config.options.instanceName,
  integratedSecurity: config.options.integratedSecurity
});

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
    console.log('Attempting to connect to database...');
    await pool.connect();
    console.log("Connected to MSSQL database successfully");
    return pool;
  } catch (err) {
    console.error("Database connection failed:", err);
    
    // Try alternative connection approaches for SQL Server Express
    if (err.code === 'EINSTLOOKUP' || err.code === 'ENOTFOUND') {
      console.log('Trying alternative connection methods for SQL Server Express...');
      
      // Try with localhost instead of machine name
      const alternativeConfigs = [
        {
          ...config,
          server: 'localhost',
          options: {
            ...config.options,
            instanceName: 'SQLEXPRESS'
          }
        },
        {
          ...config,
          server: '127.0.0.1',
          options: {
            ...config.options,
            instanceName: 'SQLEXPRESS'
          }
        },
        {
          ...config,
          server: 'localhost\\SQLEXPRESS',
          options: {
            ...config.options,
            instanceName: undefined
          }
        },
        {
          ...config,
          server: '(local)\\SQLEXPRESS',
          options: {
            ...config.options,
            instanceName: undefined
          }
        }
      ];
      
      for (const altConfig of alternativeConfigs) {
        try {
          console.log(`Trying alternative config: server=${altConfig.server}, instance=${altConfig.options.instanceName || 'none'}`);
          const altPool = new sql.ConnectionPool(altConfig);
          await altPool.connect();
          console.log("✓ Connected with alternative configuration!");
          return altPool;
        } catch (altErr) {
          console.log(`Alternative config failed: ${altErr.message}`);
          if (altPool) {
            try {
              await altPool.close();
            } catch (closeErr) {
              // Ignore close errors
            }
          }
        }
      }
    }
    
    throw err;
  }
};

// Create pool but delay connection attempt
const pool = new sql.ConnectionPool(config);
const poolConnect = connectToDatabase()
  .then((connectedPool) => connectedPool)
  .catch((err) => {
    console.error("Failed to initialize database pool:", err.message);
    console.log("\n🔧 TROUBLESHOOTING TIPS:");
    console.log("1. Make sure SQL Server Express is running");
    console.log("2. Check if SQL Server Browser service is running");
    console.log("3. Verify SQL Server is configured to accept TCP/IP connections");
    console.log("4. Try using 'localhost\\SQLEXPRESS' or '(local)\\SQLEXPRESS' in your .env file");
    console.log("5. Check Windows Firewall settings for SQL Server");
    
    // Return pool anyway to avoid breaking imports, but connections will fail
    return pool;
  });

module.exports = { pool, poolConnect, sql };