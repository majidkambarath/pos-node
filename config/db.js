import sql from "mssql";
import dotenv from "dotenv";

dotenv.config();

const decryptSecret = (encrypted, salt = "POS_SYSTEM") => {
  try {
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
const encryptedPassword = process.env.DB_PASSWORD;
const decryptedPassword = decryptSecret(encryptedPassword);

const config = {
  user: process.env.DB_USER,
  password: decryptedPassword,
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
