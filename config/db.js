// config/db.js - Enhanced Database Configuration with Better Error Handling
const dotenv = require("dotenv");
const sql = require("mssql");

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

// Validate environment variables
const validateEnvVars = () => {
  const integratedSecurity = process.env.DB_INTEGRATED_SECURITY === "true";
  
  const required = ['DB_SERVER', 'DB_NAME'];
  
  if (!integratedSecurity) {
    required.push('DB_USER', 'DB_PASSWORD');
  }
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error("❌ Missing required environment variables:", missing.join(', '));
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
};

// Get server options to try
const getServerOptions = (originalServer) => {
  const options = [];
  const server = originalServer.trim();
  
  options.push(server);
  
  if (server.includes('\\')) {
    const parts = server.split('\\');
    const instanceName = parts[1];
    
    if (!server.toLowerCase().startsWith('localhost')) {
      options.unshift(`localhost\\${instanceName}`);
    }
    
    options.push(`(local)\\${instanceName}`);
    options.push(`.\\${instanceName}`);
    options.push(`127.0.0.1\\${instanceName}`);
  }
  
  return [...new Set(options)];
};

// Create database configuration
const createConfig = () => {
  validateEnvVars();
  
  const integratedSecurity = process.env.DB_INTEGRATED_SECURITY === "true";
  
  let config = {
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT || "1433"),
    options: {
      encrypt: process.env.DB_ENCRYPT === "true",
      trustServerCertificate: process.env.DB_TRUST_CERT !== "false", // Default to true
      enableArithAbort: true,
      integratedSecurity: integratedSecurity,
      connectTimeout: 30000,
      requestTimeout: 30000,
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  };
  
  if (!integratedSecurity) {
    const encryptedPassword = process.env.DB_PASSWORD;
    const decryptedPassword = decryptSecret(encryptedPassword);
    
    if (!decryptedPassword) {
      throw new Error("Failed to decrypt database password");
    }
    
    config.user = process.env.DB_USER;
    config.password = decryptedPassword;
  }
  
  return config;
};

// Connection state management
class DatabaseManager {
  constructor() {
    this.pool = null;
    this.isConnecting = false;
    this.connectionPromise = null;
    this.config = null;
  }

  async initialize() {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = this._connect();
    return this.connectionPromise;
  }

  async _connect() {
    if (this.isConnecting) {
      throw new Error("Connection already in progress");
    }

    this.isConnecting = true;

    try {
      this.config = createConfig();
      console.log("🔗 Attempting database connection...");
      console.log(`   Server: ${this.config.server}`);
      console.log(`   Database: ${this.config.database}`);
      console.log(`   Auth: ${this.config.options.integratedSecurity ? 'Windows' : 'SQL Server'}`);

      const serverOptions = getServerOptions(this.config.server);
      let lastError;

      for (const serverName of serverOptions) {
        try {
          console.log(`🔄 Trying server: ${serverName}`);
          
          const config = { ...this.config, server: serverName };
          const pool = new sql.ConnectionPool(config);

          // Add event listeners
          pool.on('connect', () => {
            console.log(`✅ Database connected: ${serverName}`);
          });

          pool.on('error', (err) => {
            console.error('❌ Pool error:', err.message);
          });

          await pool.connect();
          
          // Test connection
          await pool.request().query('SELECT 1 as test');
          console.log("✅ Database connection verified");

          this.pool = pool;
          this.isConnecting = false;
          return pool;

        } catch (error) {
          lastError = error;
          console.error(`❌ Failed to connect to ${serverName}:`, error.message);
        }
      }

      throw lastError || new Error("All connection attempts failed");

    } catch (error) {
      this.isConnecting = false;
      this.connectionPromise = null;
      console.error("💥 Database connection failed:", error.message);
      
      // Provide troubleshooting hints
      this._logTroubleshootingTips(error);
      
      throw error;
    }
  }

  _logTroubleshootingTips(error) {
    console.error("\n🔧 TROUBLESHOOTING TIPS:");
    
    if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
      console.error("   1. Check if SQL Server is running");
      console.error("   2. Verify server name in .env file");
      console.error("   3. Try: DB_SERVER=localhost\\SQLEXPRESS");
    }
    
    if (error.message.includes('Login failed')) {
      console.error("   1. Check username/password");
      console.error("   2. Try Windows Authentication: DB_INTEGRATED_SECURITY=true");
    }
    
    if (error.message.includes('Cannot open database')) {
      console.error("   1. Verify database name exists");
      console.error("   2. Check user permissions");
    }
    
    console.error("\n   Quick test: Try connecting with SSMS using same credentials");
  }

  async getPool() {
    if (this.pool && this.pool.connected) {
      return this.pool;
    }

    if (!this.connectionPromise) {
      await this.initialize();
    }

    return this.connectionPromise;
  }

  isConnected() {
    return this.pool && this.pool.connected;
  }

  getConnectionInfo() {
    if (!this.pool || !this.config) return null;
    
    return {
      server: this.config.server,
      database: this.config.database,
      user: this.config.user || 'Windows Authentication',
      port: this.config.port,
      connected: this.pool.connected,
      integratedSecurity: this.config.options?.integratedSecurity || false
    };
  }

  async close() {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
    }
    this.connectionPromise = null;
    this.isConnecting = false;
  }
}

// Create singleton instance
const dbManager = new DatabaseManager();

// Initialize connection on module load
const poolConnect = dbManager.initialize().catch((error) => {
  console.error("💥 Failed to initialize database connection:", error.message);
  return Promise.reject(error);
});

// Export interface
module.exports = {
  get pool() {
    return dbManager.pool;
  },
  poolConnect,
  sql,
  isConnected: () => dbManager.isConnected(),
  getConnectionInfo: () => dbManager.getConnectionInfo(),
  getPool: () => dbManager.getPool(),
  close: () => dbManager.close()
};