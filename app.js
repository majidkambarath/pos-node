import express from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();
import { pool } from "./config/db.js";
import router from "./routers/index.js";
import { errorHandler } from "./utils/errorHandler.js";
const app = express();
const port = process.env.PORT || 4444;

app.use(express.static("public"));
app.use(express.json({ limit: "50mb" })); // Increase JSON payload limit
app.use(express.urlencoded({ limit: "50mb", extended: true })); // Increase URL-encoded payload limit

const testConnection = async () => {
  try {
    await pool.connect();
    console.log("Connection succeeded!");
    pool.close();
  } catch (err) {
    console.error("Connection failed:", err);
  }
};

testConnection();

// CORS configuration
app.use(
  cors({
    origin: (origin, callback) => {
      callback(null, true); // Allow any origin
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
  })
);
app.use("/api", router);

app.use(errorHandler);

app.listen(port, () => {
  console.log("server running !!!!!");
  console.log(`http://localhost:${port}`);
});
