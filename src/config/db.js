// src/config/db.js — MySQL connection pool via mysql2

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  port:               Number(process.env.DB_PORT) || 3306,
  database:           process.env.DB_NAME     || 'rsw_portaal',
  user:               process.env.DB_USER     || 'rsw_user',
  password:           process.env.DB_PASSWORD || '',
  waitForConnections: true,
  connectionLimit:    10,
  timezone:           '+00:00',
  charset:            'utf8mb4',
});

// Test verbinding bij opstarten
async function testVerbinding() {
  try {
    const conn = await pool.getConnection();
    conn.release();
    console.log(`Database verbonden: ${process.env.DB_NAME}@${process.env.DB_HOST}`);
  } catch (err) {
    console.error('Database verbinding mislukt:', err.message);
    // Niet crashen in development als DB nog niet draait
    if (process.env.NODE_ENV === 'production') process.exit(1);
  }
}

testVerbinding();

module.exports = pool;
