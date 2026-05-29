const mysql = require('mysql2/promise');

const db = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '692579',
  database: 'diary',
  timezone: '+09:00'
});

module.exports = db;