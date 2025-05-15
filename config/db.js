import sql from 'mssql';

const config = {
  user: 'sa',
  password: 'password',
  server: 'MAJID',
  database: 'RESTPOS',
  port: 1433,
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
     integratedSecurity: false
  }
};

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
