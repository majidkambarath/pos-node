const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const { poolConnect } = require("./config/db"); // Import poolConnect instead of pool
const router = require("./routers");
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

// Initialize database connection with proper error handling
const initializeDatabase = async () => {
  try {
    console.log("🔄 Initializing database connection...");
    await poolConnect; // Wait for the connection to be established
    console.log("✅ Database connection established successfully!");
    return true;
  } catch (err) {
    console.error("❌ Database connection failed:", err.message);
    console.error("\n⚠️  Server will continue running but database operations will fail");
    console.error("🔧 Please fix the database connection and restart the server");
    return false;
  }
};

// Routes and middleware
app.use("/api", router);
app.use(errorHandler);

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const { isConnected, getConnectionInfo } = require("./config/db");
    const dbStatus = isConnected();
    const connectionInfo = getConnectionInfo();
    
    res.json({
      status: 'Server is running',
      database: {
        connected: dbStatus,
        info: connectionInfo
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'Server is running',
      database: {
        connected: false,
        error: 'Database connection failed'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// Start server
const startServer = async () => {
  try {
    // Try to initialize database connection
    const dbConnected = await initializeDatabase();
    
    // Start the server regardless of database connection status
    const server = app.listen(port, () => {
      console.log("\n🚀 Server running successfully!");
      console.log(`🌐 URL: http://localhost:${port}`);
      console.log(`🏥 Health check: http://localhost:${port}/health`);
      
      if (dbConnected) {
        console.log("✅ Database: Connected and ready");
      } else {
        console.log("⚠️  Database: Not connected - check configuration");
      }
      
      console.log("\n📋 Available endpoints:");
      console.log("   GET  /health           - Server health check");
      console.log("   *    /api/*           - API routes");
      console.log("\n⏹️  Press Ctrl+C to stop the server");
    });

    // Handle server shutdown gracefully
    const gracefulShutdown = async (signal) => {
      console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
      
      server.close(async () => {
        console.log('🔌 HTTP server closed');
        
        try {
          const { pool } = require("./config/db");
          if (pool && pool.connected) {
            await pool.close();
            console.log('🔌 Database connection closed');
          }
        } catch (err) {
          console.error('❌ Error closing database connection:', err.message);
        }
        
        console.log('👋 Server shutdown complete');
        process.exit(0);
      });
      
      // Force close after 10 seconds
      setTimeout(() => {
        console.error('⚠️  Forced shutdown');
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