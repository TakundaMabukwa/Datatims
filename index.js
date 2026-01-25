require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const ChainProxy = require('./config/proxy');
const syncService = require('./config/sync');
const authenticate = require('./middleware/auth');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('[SERVER] Initializing Datatims API...');
console.log(`[SERVER] Environment: ${process.env.NODE_ENV || 'development'}`);
console.log('[SERVER] Mode: Daily sync with cached data');

/**
 * Initialize TCP proxy for IP chain routing
 */
const proxy = new ChainProxy(
  process.env.IP1,
  process.env.IP2,
  process.env.DB_HOST,
  parseInt(process.env.DB_PORT),
  parseInt(process.env.PROXY_PORT)
);

proxy.start();

/**
 * Security middleware
 */
app.use(helmet());
app.use(express.json());

/**
 * Global authentication for all /api routes
 */
app.use('/api', authenticate, apiRoutes);

/**
 * Centralized error handling middleware
 */
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  
  const statusCode = err.code === 'ETIMEOUT' ? 504 : 
                     err.code === 'ECONNREFUSED' ? 503 : 500;
  const message = err.code === 'ETIMEOUT' ? 'Database request timeout' :
                  err.code === 'ECONNREFUSED' ? 'Database connection refused' :
                  'Internal server error';
  
  res.status(statusCode).json({ 
    error: message,
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

/**
 * Start server and initialize daily sync
 */
async function start() {
  app.listen(PORT, () => {
    console.log(`[SERVER] ✓ Server running on port ${PORT}`);
    console.log('[SERVER] Initializing daily sync service...');
    syncService.init();
  });
}

start();

// Cleanup on exit
process.on('SIGINT', () => {
  proxy.stop();
  process.exit();
});
