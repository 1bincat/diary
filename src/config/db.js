const mysql = require('mysql2/promise');

const db = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '692579',
  database: 'diary'
});

module.exports = db;