require('dotenv').config();
const express = require('express');
const { getPool } = require('./config/db');
const authenticate = require('./middleware/auth');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

/**
 * Apply authentication middleware to all /api routes
 */
app.use('/api', authenticate, apiRoutes);

/**
 * Centralized error handling middleware
 * Catches SQL errors and returns clean JSON responses
 */
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  
  const statusCode = err.code === 'ETIMEOUT' ? 504 : 500;
  const message = err.code === 'ETIMEOUT' 
    ? 'Database request timeout' 
    : 'Internal server error';
  
  res.status(statusCode).json({ 
    error: message,
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

/**
 * Initialize database connection and start server
 */
async function start() {
  try {
    await getPool();
    console.log('Database connected successfully');
    
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
}

start();
