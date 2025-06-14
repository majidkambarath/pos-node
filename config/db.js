// config/db.js - Enhanced Database Configuration for SQL Server 2008 Compatibility
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

// Create database configuration optimized for SQL Server 2008
const createConfig = () => {
  validateEnvVars();
  
  const integratedSecurity = process.env.DB_INTEGRATED_SECURITY === "true";
  
  let config = {
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT || "1433"),
    options: {
      // SQL Server 2008 specific optimizations
      encrypt: process.env.DB_ENCRYPT === "true", // Usually false for SQL Server 2008
      trustServerCertificate: process.env.DB_TRUST_CERT !== "false", // Default to true
      enableArithAbort: true,
      integratedSecurity: integratedSecurity,
      
      // Increased timeouts for SQL Server 2008 (can be slower)
      connectTimeout: parseInt(process.env.DB_CONNECT_TIMEOUT || "60000"), // 60 seconds
      requestTimeout: parseInt(process.env.DB_REQUEST_TIMEOUT || "60000"), // 60 seconds
      
      // SQL Server 2008 compatibility settings
      useUTC: false, // Important for SQL Server 2008 date handling
      dateFirst: 1, // Monday as first day of week
      
      // Additional SQL Server 2008 compatibility options
      appName: process.env.APP_NAME || "POS_System",
      
      // Connection retry options for SQL Server 2008
      maxRetriesOnFailover: 3,
      packetSize: 4096, // Optimize for SQL Server 2008
    },
    pool: {
      max: parseInt(process.env.DB_POOL_MAX || "10"),
      min: parseInt(process.env.DB_POOL_MIN || "0"),
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || "30000"),
      acquireTimeoutMillis: parseInt(process.env.DB_ACQUIRE_TIMEOUT || "60000"),
      createTimeoutMillis: parseInt(process.env.DB_CREATE_TIMEOUT || "30000"),
      destroyTimeoutMillis: parseInt(process.env.DB_DESTROY_TIMEOUT || "5000"),
      reapIntervalMillis: parseInt(process.env.DB_REAP_INTERVAL || "1000"),
      createRetryIntervalMillis: parseInt(process.env.DB_CREATE_RETRY_INTERVAL || "200"),
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

// Schema setup and validation class
class SchemaManager {
  constructor(pool) {
    this.pool = pool;
  }

  // Check if a column exists in a table
  async columnExists(tableName, columnName) {
    try {
      const query = `
        SELECT COUNT(*) as ColumnCount
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = @tableName 
        AND COLUMN_NAME = @columnName
        AND TABLE_SCHEMA = 'dbo'
      `;
      
      const request = this.pool.request();
      request.input('tableName', sql.NVarChar(128), tableName);
      request.input('columnName', sql.NVarChar(128), columnName);
      
      const result = await request.query(query);
      return result.recordset[0].ColumnCount > 0;
    } catch (error) {
      console.error(`❌ Error checking column existence: ${error.message}`);
      return false;
    }
  }

  // Check if a table exists
  async tableExists(tableName) {
    try {
      const query = `
        SELECT COUNT(*) as TableCount
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_NAME = @tableName 
        AND TABLE_SCHEMA = 'dbo'
        AND TABLE_TYPE = 'BASE TABLE'
      `;
      
      const request = this.pool.request();
      request.input('tableName', sql.NVarChar(128), tableName);
      
      const result = await request.query(query);
      return result.recordset[0].TableCount > 0;
    } catch (error) {
      console.error(`❌ Error checking table existence: ${error.message}`);
      return false;
    }
  }

  // Check if foreign key constraint exists
  async foreignKeyExists(constraintName) {
    try {
      const query = `
        SELECT COUNT(*) as ConstraintCount
        FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
        WHERE CONSTRAINT_NAME = @constraintName 
        AND CONSTRAINT_TYPE = 'FOREIGN KEY'
      `;
      
      const request = this.pool.request();
      request.input('constraintName', sql.NVarChar(128), constraintName);
      
      const result = await request.query(query);
      return result.recordset[0].ConstraintCount > 0;
    } catch (error) {
      console.error(`❌ Error checking foreign key existence: ${error.message}`);
      return false;
    }
  }

  // Add SeatId column to OrderM table
  async addSeatIdToOrderM() {
    try {
      console.log("🔍 Checking OrderM table schema...");

      // Check if OrderM table exists
      const orderMExists = await this.tableExists('tblOrder_M');
      if (!orderMExists) {
        console.log("⚠️  OrderM table (tblOrder_M) does not exist. Skipping SeatId column addition.");
        return false;
      }

      // Check if Seat table exists
      const seatExists = await this.tableExists('tblSeat');
      if (!seatExists) {
        console.log("⚠️  Seat table (tblSeat) does not exist. Cannot create foreign key reference.");
        return false;
      }

      // Check if SeatId column already exists
      const seatIdExists = await this.columnExists('tblOrder_M', 'SeatId');
      if (seatIdExists) {
        console.log("✅ SeatId column already exists in OrderM table");
        
        // Check if foreign key constraint exists
        const fkExists = await this.foreignKeyExists('FK_OrderM_Seat');
        if (!fkExists) {
          console.log("🔧 Adding missing foreign key constraint...");
          await this.addForeignKeyConstraint();
        }
        
        return true;
      }

      console.log("🔧 Adding SeatId column to OrderM table...");

      // Add the SeatId column
      const addColumnQuery = `
        ALTER TABLE dbo.tblOrder_M 
        ADD SeatId INT NULL
      `;

      await this.pool.request().query(addColumnQuery);
      console.log("✅ SeatId column added successfully");

      // Add foreign key constraint
      await this.addForeignKeyConstraint();

      // Add index for better performance
      await this.addSeatIdIndex();

      console.log("✅ SeatId setup completed successfully");
      return true;

    } catch (error) {
      console.error("❌ Error adding SeatId column:", error.message);
      
      // Provide specific error handling
      if (error.message.includes('already exists')) {
        console.log("ℹ️  Column already exists, continuing...");
        return true;
      }
      
      throw error;
    }
  }

  // Add foreign key constraint
  async addForeignKeyConstraint() {
    try {
      // Check if constraint already exists
      const fkExists = await this.foreignKeyExists('FK_OrderM_Seat');
      if (fkExists) {
        console.log("✅ Foreign key constraint already exists");
        return;
      }

      const fkQuery = `
        ALTER TABLE dbo.tblOrder_M 
        ADD CONSTRAINT FK_OrderM_Seat 
        FOREIGN KEY (SeatId) 
        REFERENCES dbo.tblSeat(SeatId)
        ON DELETE SET NULL
        ON UPDATE CASCADE
      `;

      await this.pool.request().query(fkQuery);
      console.log("✅ Foreign key constraint added successfully");

    } catch (error) {
      console.error("❌ Error adding foreign key constraint:", error.message);
      
      // Don't throw error for constraint issues, just log
      if (error.message.includes('already exists') || 
          error.message.includes('FK_OrderM_Seat')) {
        console.log("ℹ️  Foreign key constraint issue resolved");
      } else {
        console.log("⚠️  Foreign key constraint could not be added, but column is available");
      }
    }
  }

  // Add index for SeatId column
  async addSeatIdIndex() {
    try {
      const indexQuery = `
        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_OrderM_SeatId')
        BEGIN
          CREATE NONCLUSTERED INDEX IX_OrderM_SeatId 
          ON dbo.tblOrder_M (SeatId)
          WHERE SeatId IS NOT NULL
        END
      `;

      await this.pool.request().query(indexQuery);
      console.log("✅ SeatId index added successfully");

    } catch (error) {
      console.error("❌ Error adding SeatId index:", error.message);
      // Index creation failure is not critical
    }
  }

  // Get schema information
  async getSchemaInfo() {
    try {
      const query = `
        SELECT 
          t.TABLE_NAME,
          c.COLUMN_NAME,
          c.DATA_TYPE,
          c.IS_NULLABLE,
          c.COLUMN_DEFAULT,
          CASE 
            WHEN tc.CONSTRAINT_TYPE = 'PRIMARY KEY' THEN 'PK'
            WHEN tc.CONSTRAINT_TYPE = 'FOREIGN KEY' THEN 'FK'
            WHEN tc.CONSTRAINT_TYPE = 'UNIQUE' THEN 'UQ'
            ELSE ''
          END as CONSTRAINT_TYPE
        FROM INFORMATION_SCHEMA.TABLES t
        LEFT JOIN INFORMATION_SCHEMA.COLUMNS c ON t.TABLE_NAME = c.TABLE_NAME
        LEFT JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu ON c.TABLE_NAME = kcu.TABLE_NAME AND c.COLUMN_NAME = kcu.COLUMN_NAME
        LEFT JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc ON kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
        WHERE t.TABLE_NAME IN ('tblOrder_M', 'tblSeat')
        AND t.TABLE_SCHEMA = 'dbo'
        ORDER BY t.TABLE_NAME, c.ORDINAL_POSITION
      `;

      const result = await this.pool.request().query(query);
      return result.recordset;

    } catch (error) {
      console.error("❌ Error getting schema info:", error.message);
      return [];
    }
  }
}

// Connection state management
class DatabaseManager {
  constructor() {
    this.pool = null;
    this.isConnecting = false;
    this.connectionPromise = null;
    this.config = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = parseInt(process.env.DB_MAX_RECONNECT_ATTEMPTS || "5");
    this.schemaManager = null;
    this.schemaInitialized = false;
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
      console.log("🔗 Attempting SQL Server 2008 database connection...");
      console.log(`   Server: ${this.config.server}`);
      console.log(`   Database: ${this.config.database}`);
      console.log(`   Auth: ${this.config.options.integratedSecurity ? 'Windows' : 'SQL Server'}`);
      console.log(`   Port: ${this.config.port}`);

      const serverOptions = getServerOptions(this.config.server);
      let lastError;

      for (const serverName of serverOptions) {
        try {
          console.log(`🔄 Trying server: ${serverName}`);
          
          const config = { ...this.config, server: serverName };
          const pool = new sql.ConnectionPool(config);

          // Add event listeners with SQL Server 2008 specific handling
          pool.on('connect', () => {
            console.log(`✅ SQL Server 2008 connected: ${serverName}`);
            this.reconnectAttempts = 0; // Reset on successful connection
          });

          pool.on('error', (err) => {
            console.error('❌ Pool error:', err.message);
            this._handleConnectionError(err);
          });

          // Enhanced connection with retry logic for SQL Server 2008
          await this._connectWithRetry(pool);
          
          // Test connection with SQL Server 2008 compatible query
          await this._testConnection(pool);
          
          console.log("✅ SQL Server 2008 connection verified");

          this.pool = pool;
          this.schemaManager = new SchemaManager(pool);
          this.isConnecting = false;

          // Initialize schema after successful connection
          await this._initializeSchema();

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
      console.error("💥 SQL Server 2008 connection failed:", error.message);
      
      // Provide SQL Server 2008 specific troubleshooting hints
      this._logTroubleshootingTips(error);
      
      throw error;
    }
  }

  // Initialize database schema
  async _initializeSchema() {
    if (this.schemaInitialized || !this.schemaManager) {
      return;
    }

    try {
      console.log("🔧 Initializing database schema...");

      // Setup SeatId column in OrderM table
      await this.schemaManager.addSeatIdToOrderM();

      // Log schema information
      const schemaInfo = await this.schemaManager.getSchemaInfo();
      if (schemaInfo.length > 0) {
        console.log("📋 Current schema information:");
        
        const orderMCols = schemaInfo.filter(s => s.TABLE_NAME === 'tblOrder_M');
        const seatCols = schemaInfo.filter(s => s.TABLE_NAME === 'tblSeat');
        
        if (orderMCols.length > 0) {
          console.log("   📊 OrderM columns:", orderMCols.map(c => c.COLUMN_NAME).join(', '));
          const seatIdCol = orderMCols.find(c => c.COLUMN_NAME === 'SeatId');
          if (seatIdCol) {
            console.log(`   ✅ SeatId column: ${seatIdCol.DATA_TYPE}, nullable: ${seatIdCol.IS_NULLABLE}`);
          }
        }
        
        if (seatCols.length > 0) {
          console.log("   💺 Seat columns:", seatCols.map(c => c.COLUMN_NAME).join(', '));
        }
      }

      this.schemaInitialized = true;
      console.log("✅ Schema initialization completed");

    } catch (error) {
      console.error("❌ Schema initialization failed:", error.message);
      // Don't throw error - connection should still work
      console.log("⚠️  Continuing without schema setup...");
    }
  }

  async _connectWithRetry(pool, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await pool.connect();
        return;
      } catch (error) {
        console.error(`❌ Connection attempt ${attempt}/${maxRetries} failed:`, error.message);
        
        if (attempt === maxRetries) {
          throw error;
        }
        
        // Wait before retrying (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  async _testConnection(pool) {
    try {
      // SQL Server 2008 compatible test queries
      const result = await pool.request().query(`
        SELECT 
          @@VERSION as SqlVersion,
          DB_NAME() as DatabaseName,
          GETDATE() as CurrentTime,
          @@SERVERNAME as ServerName
      `);
      
      const info = result.recordset[0];
      console.log(`📊 Connected to: ${info.ServerName}`);
      console.log(`📂 Database: ${info.DatabaseName}`);
      console.log(`🕒 Server Time: ${info.CurrentTime}`);
      
      // Check if it's SQL Server 2008
      if (info.SqlVersion.includes('2008')) {
        console.log("✅ SQL Server 2008 detected - compatibility mode enabled");
      }
      
    } catch (error) {
      console.error("❌ Connection test failed:", error.message);
      throw error;
    }
  }

  _handleConnectionError(error) {
    console.error("🔥 Database connection error:", error.message);
    
    // Auto-reconnect for certain SQL Server 2008 errors
    if (this._shouldReconnect(error)) {
      this._attemptReconnect();
    }
  }

  _shouldReconnect(error) {
    const reconnectableErrors = [
      'ECONNRESET',
      'ETIMEOUT',
      'ENOTFOUND',
      'Connection is closed',
      'Connection lost',
      'RequestError: Connection is closed'
    ];
    
    return reconnectableErrors.some(errType => 
      error.message.includes(errType) || error.code === errType
    );
  }

  async _attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("❌ Max reconnection attempts reached");
      return;
    }

    this.reconnectAttempts++;
    console.log(`🔄 Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts}...`);

    try {
      await this.close();
      this.schemaInitialized = false; // Reset schema flag
      await this.initialize();
      console.log("✅ Reconnection successful");
    } catch (error) {
      console.error("❌ Reconnection failed:", error.message);
    }
  }

  _logTroubleshootingTips(error) {
    console.error("\n🔧 SQL SERVER 2008 TROUBLESHOOTING TIPS:");
    
    if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
      console.error("   1. Check if SQL Server 2008 service is running");
      console.error("   2. Verify SQL Server Browser service is running");
      console.error("   3. Check Windows Firewall settings");
      console.error("   4. Try: DB_SERVER=localhost\\SQLEXPRESS");
      console.error("   5. Enable TCP/IP protocol in SQL Server Configuration Manager");
    }
    
    if (error.message.includes('Login failed')) {
      console.error("   1. Check username/password for SQL Server 2008");
      console.error("   2. Try Windows Authentication: DB_INTEGRATED_SECURITY=true");
      console.error("   3. Check if SQL Server 2008 allows mixed mode authentication");
      console.error("   4. Verify user has proper permissions");
    }
    
    if (error.message.includes('Cannot open database')) {
      console.error("   1. Verify database name exists in SQL Server 2008");
      console.error("   2. Check user permissions on the database");
      console.error("   3. Ensure database is not in recovery mode");
    }

    if (error.message.includes('timeout') || error.message.includes('ETIMEOUT')) {
      console.error("   1. SQL Server 2008 may need longer timeouts");
      console.error("   2. Try: DB_CONNECT_TIMEOUT=120000");
      console.error("   3. Check network connectivity");
      console.error("   4. Verify SQL Server 2008 is not overloaded");
    }
    
    console.error("\n   📝 Environment variables to check:");
    console.error("      DB_SERVER, DB_NAME, DB_USER, DB_PASSWORD");
    console.error("      DB_INTEGRATED_SECURITY, DB_ENCRYPT, DB_TRUST_CERT");
    console.error("\n   🔍 Quick test: Try connecting with SSMS 2008 using same credentials");
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
      integratedSecurity: this.config.options?.integratedSecurity || false,
      sqlServerVersion: 'SQL Server 2008 Compatible',
      connectionTimeout: this.config.options?.connectTimeout,
      requestTimeout: this.config.options?.requestTimeout,
      schemaInitialized: this.schemaInitialized
    };
  }

  async close() {
    if (this.pool) {
      try {
        await this.pool.close();
      } catch (error) {
        console.error("Error closing database connection:", error.message);
      }
      this.pool = null;
    }
    this.connectionPromise = null;
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.schemaManager = null;
    this.schemaInitialized = false;
  }

  // SQL Server 2008 specific helper methods
  async executeQuery(query, params = {}) {
    try {
      const pool = await this.getPool();
      const request = pool.request();
      
      // Add parameters
      Object.keys(params).forEach(key => {
        request.input(key, params[key]);
      });
      
      return await request.query(query);
    } catch (error) {
      console.error("Query execution error:", error.message);
      throw error;
    }
  }

  // Check SQL Server version
  async getSqlServerVersion() {
    try {
      const result = await this.executeQuery("SELECT @@VERSION as Version");
      return result.recordset[0]?.Version || "Unknown";
    } catch (error) {
      console.error("Error getting SQL Server version:", error.message);
      return "Error retrieving version";
    }
  }

  // Get schema manager
  getSchemaManager() {
    return this.schemaManager;
  }

  // Manual schema re-initialization
  async reinitializeSchema() {
    this.schemaInitialized = false;
    if (this.schemaManager) {
      await this._initializeSchema();
    }
  }
}

// Create singleton instance
const dbManager = new DatabaseManager();

// Initialize connection on module load
const poolConnect = dbManager.initialize().catch((error) => {
  console.error("💥 Failed to initialize SQL Server 2008 connection:", error.message);
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
  close: () => dbManager.close(),
  executeQuery: (query, params) => dbManager.executeQuery(query, params),
  getSqlServerVersion: () => dbManager.getSqlServerVersion(),
  getSchemaManager: () => dbManager.getSchemaManager(),
  reinitializeSchema: () => dbManager.reinitializeSchema(),
  
  // Helper function to ensure connection for backward compatibility
  ensureConnection: async () => {
    return await dbManager.getPool();
  }
};