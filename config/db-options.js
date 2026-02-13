function parseBoolean(value, defaultValue) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return String(value).toLowerCase() === 'true';
}

function getMysqlSslFromEnv() {
  const sslEnabled = parseBoolean(process.env.DB_SSL, false);
  if (!sslEnabled) return undefined;

  const ssl = {};
  if (process.env.DB_SSL_CA) ssl.ca = process.env.DB_SSL_CA;
  if (process.env.DB_SSL_CERT) ssl.cert = process.env.DB_SSL_CERT;
  if (process.env.DB_SSL_KEY) ssl.key = process.env.DB_SSL_KEY;
  if (process.env.DB_SSL_REJECT_UNAUTHORIZED !== undefined) {
    ssl.rejectUnauthorized = parseBoolean(process.env.DB_SSL_REJECT_UNAUTHORIZED, true);
  }

  return Object.keys(ssl).length ? ssl : {};
}

module.exports = { getMysqlSslFromEnv, parseBoolean };
