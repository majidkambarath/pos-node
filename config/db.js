// config/db.js - Enhanced Database Configuration with Authentication Fix
const dotenv = require("dotenv");
const sql = require("mssql");
const fs = require("fs");
const path = require("path");

// Load environment variables
dotenv.config();

const decryptSecret = (encrypted, salt = "POS_SYSTEM") => {
  try {
    if (!encrypted || encrypted.length === 0) {
      console.error("❌ Error: Empty or undefined encrypted password");
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
    console.error("❌ Decryption error:", error.message);
    return "";
  }
};

// Validate environment variables based on authentication method
const validateEnvVars = () => {
  const integratedSecurity = process.env.DB_INTEGRATED_SECURITY === "true";
  
  // Always required
  const required = ['DB_SERVER', 'DB_NAME'];
  
  // Add authentication-specific requirements
  if (integratedSecurity) {
    console.log("🔐 Using Windows Authentication");
  } else {
    required.push('DB_USER', 'DB_PASSWORD');
    console.log("🔐 Using SQL Server Authentication");
  }
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error("❌ Missing required environment variables:", missing.join(', '));
    console.error("📋 Please check your .env file and ensure these variables are set:");
    missing.forEach(key => console.error(`   - ${key}`));
    
    if (!integratedSecurity) {
      console.error("\n💡 For SQL Server Authentication, you need:");
      console.error("   - DB_USER (e.g., sa)");
      console.error("   - DB_PASSWORD (encrypted password)");
      console.error("   - DB_INTEGRATED_SECURITY=false");
    } else {
      console.error("\n💡 For Windows Authentication, you need:");
      console.error("   - DB_INTEGRATED_SECURITY=true");
      console.error("   - DB_USER and DB_PASSWORD should be empty or not set");
    }
    
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  console.log("✅ All required environment variables found");
};

// Get multiple server name options to try
const getServerOptions = (originalServer) => {
  const options = [];
  const server = originalServer.trim();
  
  // Add original server
  options.push(server);
  
  // If it contains backslashes, try different formats
  if (server.includes('\\')) {
    const parts = server.split('\\');
    const computerName = parts[0];
    const instanceName = parts[1];
    
    // Try localhost format first (most likely to work)
    if (!server.toLowerCase().startsWith('localhost')) {
      options.unshift(`localhost\\${instanceName}`);
    }
    
    // Try (local) format
    options.push(`(local)\\${instanceName}`);
    
    // Try dot notation
    options.push(`.\\${instanceName}`);
    
    // Try IP address
    options.push(`127.0.0.1\\${instanceName}`);
    
    // Try with explicit port
    options.push(`localhost,1433\\${instanceName}`);
    options.push(`${computerName},1433\\${instanceName}`);
  }
  
  // Remove duplicates while preserving order
  const seen = new Set();
  return options.filter(option => {
    if (seen.has(option)) return false;
    seen.add(option);
    return true;
  });
};

// Initialize configuration with proper authentication handling
const initializeConfig = () => {
  try {
    validateEnvVars();

    const integratedSecurity = process.env.DB_INTEGRATED_SECURITY === "true";
    const originalServer = process.env.DB_SERVER;
    const serverOptions = getServerOptions(originalServer);
    
    console.log("🔗 Available server options to try:");
    serverOptions.forEach((option, index) => {
      console.log(`   ${index + 1}. ${option}`);
    });

    let baseConfig = {
      database: process.env.DB_NAME,
      port: parseInt(process.env.DB_PORT || "1433"),
      options: {
        encrypt: process.env.DB_ENCRYPT === "true",
        trustServerCertificate: process.env.DB_TRUST_CERT === "true",
        enableArithAbort: true,
        integratedSecurity: integratedSecurity,
        connectTimeout: 30000,
        requestTimeout: 30000,
        connectionIsolationLevel: sql.ISOLATION_LEVEL.READ_COMMITTED,
        abortTransactionOnError: true,
      },
      pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000,
      },
    };

    // Add authentication details based on method
    if (integratedSecurity) {
      console.log("🔐 Authentication: Windows Authentication (Integrated Security)");
      // For Windows Authentication, don't set user/password
    } else {
      const encryptedPassword = process.env.DB_PASSWORD;
      const decryptedPassword = decryptSecret(encryptedPassword);
      
      if (!decryptedPassword) {
        throw new Error("Failed to decrypt database password");
      }
      
      baseConfig.user = process.env.DB_USER;
      baseConfig.password = decryptedPassword;
      console.log(`🔐 Authentication: SQL Server Authentication (User: ${baseConfig.user})`);
    }

    return { baseConfig, serverOptions };
  } catch (error) {
    console.error("❌ Configuration initialization failed:", error.message);
    throw error;
  }
};

// Create connection pool with multiple server attempts
const createConnectionPool = async (baseConfig, serverOptions, maxRetries = 2) => {
  let lastError;
  
  for (const serverName of serverOptions) {
    console.log(`\n🔄 Trying server: "${serverName}"`);
    
    const config = { ...baseConfig, server: serverName };
    
    // Log connection attempt (without password)
    console.log("📋 Connection details:");
    console.log(`   Server: ${config.server}`);
    console.log(`   Database: ${config.database}`);
    console.log(`   Port: ${config.port}`);
    console.log(`   Encrypt: ${config.options.encrypt}`);
    console.log(`   Trust Certificate: ${config.options.trustServerCertificate}`);
    console.log(`   Integrated Security: ${config.options.integratedSecurity}`);
    if (!config.options.integratedSecurity && config.user) {
      console.log(`   User: ${config.user}`);
    }
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`   Attempt ${attempt}/${maxRetries}...`);
        
        const pool = new sql.ConnectionPool(config);
        
        // Add event listeners
        pool.on('connect', () => {
          console.log(`✅ Database connection established with server: ${serverName}`);
        });
        
        pool.on('error', (err) => {
          console.error('❌ Database pool error:', err.message);
        });

        await pool.connect();
        console.log("🎉 Connected to MSSQL database successfully!");
        
        // Test the connection with a simple query
        const result = await pool.request().query('SELECT @@VERSION as version');
        console.log("✅ Database connection verified with test query");
        
        return pool;
        
      } catch (error) {
        lastError = error;
        console.error(`   ❌ Attempt ${attempt} failed:`, error.message);
        
        // Provide specific error guidance
        if (error.message.includes('ENOTFOUND') || error.message.includes('EINSTLOOKUP')) {
          console.error("   🔍 DNS/Server not found - trying next server option...");
        } else if (error.message.includes('ECONNREFUSED')) {
          console.error("   🔍 Connection refused - SQL Server may not be running");
        } else if (error.message.includes('Login failed')) {
          console.error("   🔍 Authentication failed - check credentials");
        } else if (error.message.includes('Cannot open database')) {
          console.error("   🔍 Database access denied - check database name and permissions");
        }
        
        if (attempt < maxRetries) {
          const delay = 1000;
          console.log(`   ⏳ Waiting ${delay/1000} second before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    console.log(`❌ All attempts failed for server: ${serverName}`);
  }
  
  // Comprehensive troubleshooting guide
  console.error("\n💥 All server options failed. Detailed troubleshooting:");
  
  console.error("\n🔧 STEP 1: Check SQL Server Service");
  console.error("   • Press Win+R, type 'services.msc', press Enter");
  console.error("   • Find 'SQL Server (SQLEXPRESS)' - should be 'Running'");
  console.error("   • Find 'SQL Server Browser' - should be 'Running'");
  console.error("   • If stopped, right-click → Start");
  
  console.error("\n🔧 STEP 2: Enable TCP/IP Protocol");
  console.error("   • Press Win+R, type 'SQLServerManager15.msc' (or 14, 13), press Enter");
  console.error("   • Go to 'SQL Server Network Configuration' → 'Protocols for SQLEXPRESS'");
  console.error("   • Right-click 'TCP/IP' → Enable");
  console.error("   • Double-click 'TCP/IP' → IP Addresses tab");
  console.error("   • Find 'IPAll' section, set 'TCP Port' to 1433");
  console.error("   • Restart SQL Server service");
  
  console.error("\n🔧 STEP 3: Try Different .env Configurations");
  console.error("   # Try these one by one in your .env file:");
  console.error("   DB_SERVER=localhost\\SQLEXPRESS");
  console.error("   DB_SERVER=(local)\\SQLEXPRESS");
  console.error("   DB_SERVER=.\\SQLEXPRESS");
  console.error("   DB_SERVER=127.0.0.1\\SQLEXPRESS");
  
  console.error("\n🔧 STEP 4: Authentication Issues");
  const integratedSecurity = baseConfig.options.integratedSecurity;
  if (integratedSecurity) {
    console.error("   Current: Windows Authentication");
    console.error("   • Make sure the Windows user has SQL Server access");
    console.error("   • Or switch to SQL Authentication:");
    console.error("     DB_INTEGRATED_SECURITY=false");
    console.error("     DB_USER=sa");
    console.error("     DB_PASSWORD=your_encrypted_password");
  } else {
    console.error("   Current: SQL Server Authentication");
    console.error("   • Make sure 'sa' account is enabled");
    console.error("   • Check if password is correct");
    console.error("   • Or try Windows Authentication:");
    console.error("     DB_INTEGRATED_SECURITY=true");
    console.error("     # Remove or comment out DB_USER and DB_PASSWORD");
  }
  
  console.error("\n🔧 STEP 5: Test Connection with SSMS");
  console.error("   • Open SQL Server Management Studio");
  console.error("   • Try connecting with the same server name");
  console.error("   • Use the same authentication method");
  
  throw lastError;
};

// Initialize database connection
let pool;
let poolConnect;

try {
  const { baseConfig, serverOptions } = initializeConfig();
  
  poolConnect = createConnectionPool(baseConfig, serverOptions)
    .then((connectedPool) => {
      pool = connectedPool;
      return pool;
    })
    .catch((err) => {
      console.error("💥 Fatal database connection error:", err.message);
      return Promise.reject(err);
    });

} catch (error) {
  console.error("💥 Database module initialization failed:", error.message);
  poolConnect = Promise.reject(error);
}

// Export with error handling
module.exports = { 
  pool, 
  poolConnect, 
  sql,
  isConnected: () => {
    return pool && pool.connected;
  },
  getConnectionInfo: () => {
    if (!pool || !pool.config) return null;
    return {
      server: pool.config.server,
      database: pool.config.database,
      user: pool.config.user || 'Windows Authentication',
      port: pool.config.port,
      connected: pool.connected,
      integratedSecurity: pool.config.options?.integratedSecurity || false
    };
  }
};