require('dotenv').config();
const { neon } = require('@neondatabase/serverless');

if (!process.env.DATABASE_URL) {
  let warned = false;
  const sql = async () => {
    if (!warned) {
      warned = true;
      console.warn('DATABASE_URL is not configured; database-backed routes are running in degraded mode.');
    }
    throw new Error('DATABASE_URL is not configured');
  };
  sql.isConfigured = false;
  module.exports = sql;
  return;
}

const sql = neon(process.env.DATABASE_URL);
sql.isConfigured = true;

module.exports = sql;
