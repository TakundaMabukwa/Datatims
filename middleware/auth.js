/**
 * Security middleware with request logging
 * Validates x-api-key header and logs access attempts
 */
function authenticate(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  const clientIp = req.ip || req.connection.remoteAddress;
  const requiredApiKey = process.env.API_KEY;
  
  console.log(`[AUTH] ${req.method} ${req.originalUrl} from ${clientIp}`);

  // If no API key is configured, auth is disabled.
  if (!requiredApiKey) {
    return next();
  }
  
  if (!apiKey || apiKey !== requiredApiKey) {
    console.warn(`[AUTH] Unauthorized access attempt from ${clientIp}`);
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing API key' });
  }
  
  console.log(`[AUTH] Access granted to ${clientIp}`);
  next();
}

module.exports = authenticate;
