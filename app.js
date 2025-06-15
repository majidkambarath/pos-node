const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const { poolConnect, getSchemaManager, getConnectionInfo, isConnected } = require("./config/db");
const router = require("./routers/index.js");
const { errorHandler } = require("./utils/errorHandler");

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const port = process.env.PORT || 4444;

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// CORS configuration
app.use(
  cors({
    origin: (origin, callback) => callback(null, true),
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
  })
);

// Enhanced database initialization with schema setup
const initializeDatabase = async () => {
  try {
    console.log("🔄 Initializing database connection...");
    
    // Wait for the connection to be established
    await poolConnect;
    console.log("✅ Database connection established successfully!");

    // Get schema manager and ensure schema is set up
    const schemaManager = getSchemaManager();
    if (schemaManager) {
      console.log("🔧 Setting up database schema...");
      
      // This will automatically create the SeatId column in OrderM table
      const schemaSetupResult = await schemaManager.addSeatIdToOrderM();
      
      if (schemaSetupResult) {
        console.log("✅ Database schema setup completed successfully!");
        
        // Display connection info
        const connectionInfo = getConnectionInfo();
        if (connectionInfo) {
          console.log("📋 Database Connection Details:");
          console.log(`   Server: ${connectionInfo.server}`);
          console.log(`   Database: ${connectionInfo.database}`);
          console.log(`   Authentication: ${connectionInfo.integratedSecurity ? 'Windows' : 'SQL Server'}`);
          console.log(`   Schema Initialized: ${connectionInfo.schemaInitialized ? '✅ Yes' : '❌ No'}`);
        }
      } else {
        console.log("⚠️  Schema setup completed with warnings - check logs above");
      }
    } else {
      console.log("⚠️  Schema manager not available - column creation skipped");
    }

    return true;
  } catch (err) {
    console.error("❌ Database initialization failed:", err.message);
    console.error("\n⚠️  Server will continue running but database operations may fail");
    console.error("🔧 Please fix the database connection and restart the server");
    return false;
  }
};

// Enhanced schema verification endpoint
const verifyDatabaseSchema = async () => {
  try {
    const schemaManager = getSchemaManager();
    if (!schemaManager) {
      return { error: "Schema manager not available" };
    }

    // Check if OrderM table exists
    const orderMExists = await schemaManager.tableExists('tblOrder_M');
    
    // Check if SeatId column exists
    const seatIdExists = await schemaManager.columnExists('tblOrder_M', 'SeatId');
    
    // Check if Seat table exists
    const seatExists = await schemaManager.tableExists('tblSeat');
    
    // Check if foreign key exists
    const foreignKeyExists = await schemaManager.foreignKeyExists('FK_OrderM_Seat');
    
    // Get detailed schema info
    const schemaInfo = await schemaManager.getSchemaInfo();
    
    return {
      tables: {
        orderM: orderMExists,
        seat: seatExists
      },
      columns: {
        seatIdInOrderM: seatIdExists
      },
      constraints: {
        foreignKey: foreignKeyExists
      },
      schemaDetails: schemaInfo
    };
  } catch (error) {
    return { error: error.message };
  }
};

// Routes and middleware
app.use("/api", router);
app.use(errorHandler);

// Enhanced health check endpoint
app.get('/health', async (req, res) => {
  try {
    const dbStatus = isConnected();
    const connectionInfo = getConnectionInfo();
    const schemaInfo = await verifyDatabaseSchema();
    
    res.json({
      status: 'Server is running',
      timestamp: new Date().toISOString(),
      database: {
        connected: dbStatus,
        connectionInfo: connectionInfo,
        schema: schemaInfo
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'Server is running',
      timestamp: new Date().toISOString(),
      database: {
        connected: false,
        error: error.message
      }
    });
  }
});

// New endpoint to manually trigger schema setup
app.post('/api/setup-schema', async (req, res) => {
  try {
    if (!isConnected()) {
      return res.status(503).json({
        success: false,
        message: "Database not connected"
      });
    }

    const schemaManager = getSchemaManager();
    if (!schemaManager) {
      return res.status(503).json({
        success: false,
        message: "Schema manager not available"
      });
    }

    console.log("🔧 Manual schema setup triggered...");
    const result = await schemaManager.addSeatIdToOrderM();
    
    const schemaInfo = await verifyDatabaseSchema();
    
    res.json({
      success: true,
      message: "Schema setup completed",
      result: result,
      schemaInfo: schemaInfo
    });

  } catch (error) {
    console.error("❌ Manual schema setup failed:", error.message);
    res.status(500).json({
      success: false,
      message: "Schema setup failed",
      error: error.message
    });
  }
});

// New endpoint to check schema status
app.get('/api/schema-status', async (req, res) => {
  try {
    if (!isConnected()) {
      return res.status(503).json({
        connected: false,
        message: "Database not connected"
      });
    }

    const schemaInfo = await verifyDatabaseSchema();
    
    res.json({
      connected: true,
      schema: schemaInfo,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({
      connected: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Start server with enhanced initialization
const startServer = async () => {
  try {
    console.log("🚀 Starting POS System Server...");
    console.log(`📅 Started at: ${new Date().toISOString()}`);
    
    // Initialize database connection and schema
    const dbConnected = await initializeDatabase();
    
    // Start the server
    const server = app.listen(port, () => {
      console.log("\n" + "=".repeat(60));
      console.log("🚀 POS SYSTEM SERVER STARTED SUCCESSFULLY!");
      console.log("=".repeat(60));
      console.log(`🌐 Server URL: http://localhost:${port}`);
      console.log(`🏥 Health Check: http://localhost:${port}/health`);
      console.log(`📊 Schema Status: http://localhost:${port}/api/schema-status`);
      
      if (dbConnected) {
        console.log("✅ Database: Connected and schema initialized");
        console.log("🔧 OrderM SeatId Column: Auto-created if needed");
      } else {
        console.log("⚠️  Database: Connection failed - check configuration");
        console.log("💡 Use: POST /api/setup-schema to retry schema setup");
      }
      
      console.log("\n📋 Available Management Endpoints:");
      console.log("   GET  /health              - Server & DB health check");
      console.log("   GET  /api/schema-status   - Check database schema");
      console.log("   POST /api/setup-schema    - Manual schema setup");
      console.log("   *    /api/*              - Application API routes");
      
      console.log("\n" + "=".repeat(60));
      console.log("⏹️  Press Ctrl+C to stop the server");
      console.log("=".repeat(60) + "\n");
    });

    // Enhanced graceful shutdown
    const gracefulShutdown = async (signal) => {
      console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
      
      server.close(async () => {
        console.log('🔌 HTTP server closed');
        
        try {
          const { close } = require("./config/db");
          await close();
          console.log('🔌 Database connection closed');
        } catch (err) {
          console.error('❌ Error closing database connection:', err.message);
        }
        
        console.log('👋 Server shutdown complete');
        process.exit(0);
      });
      
      // Force close after 10 seconds
      setTimeout(() => {
        console.error('⚠️  Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('💥 Uncaught Exception:', error);
      gracefulShutdown('UNCAUGHT_EXCEPTION');
    });
    
    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
      gracefulShutdown('UNHANDLED_REJECTION');
    });

  } catch (error) {
    console.error("💥 Failed to start server:", error.message);
    process.exit(1);
  }
};

// Start the application
startServer();