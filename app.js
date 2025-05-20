const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const { pool } = require("./config/db");
const router = require("./routers");
const { errorHandler } = require("./utils/errorHandler");

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const port = process.env.PORT || 4444;

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Initialize database connection
const initializeDatabase = async () => {
  try {
    await pool.connect();
    console.log("Database connection established successfully!");
    // Don't close the connection - keep it open for the app's lifecycle
  } catch (err) {
    console.error("Database connection failed:", err);
    process.exit(1); // Exit if DB connection fails
  }
};

initializeDatabase();

app.use(
  cors({
    origin: (origin, callback) => callback(null, true),
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
  })
);

app.use("/api", router);
app.use(errorHandler);

app.listen(port, () => {
  console.log("Server running successfully!");
  console.log(`http://localhost:${port}`);
});

// Handle application shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  await pool.close();
  process.exit(0);
});