import sql from "mssql";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT || "1433"),
  options: {
    encrypt: process.env.DB_ENCRYPT === "true" ? true : false,
    trustServerCertificate: process.env.DB_TRUST_CERT === "true" ? true : false,
    enableArithAbort: true,
    integratedSecurity:
      process.env.DB_INTEGRATED_SECURITY === "true" ? true : false,
  },
};

const pool = new sql.ConnectionPool(config);

// Connect to the database
const poolConnect = pool
  .connect()
  .then(() => {
    console.log("Connected to MSSQL database successfully");
    return pool;
  })
  .catch((err) => {
    console.error("Database connection failed:", err);
    throw err;
  });

export { pool, poolConnect, sql };
