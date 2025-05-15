import sql from 'mssql';

const config = {
  user: 'sa',
  password: 'Aurify-bullions',
  server: '0.tcp.in.ngrok.io',
  database: 'RESTPOS',
  port: 10181,
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
     integratedSecurity: false
  }
};

// Create a connection pool
const pool = new sql.ConnectionPool(config);

// Connect to the database
const poolConnect = pool.connect()
  .then(() => {
    console.log('Connected to MSSQL database successfully');
    return pool;
  })
  .catch(err => {
    console.error('Database connection failed:', err);
    throw err;
  });

export { pool, poolConnect, sql };