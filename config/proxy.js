const net = require('net');

/**
 * TCP Proxy: Routes traffic through IP1 → IP2 → DB Server
 */
class ChainProxy {
  constructor(ip1, ip2, dbHost, dbPort, localPort) {
    this.ip1 = ip1;
    this.ip2 = ip2;
    this.dbHost = dbHost;
    this.dbPort = dbPort;
    this.localPort = localPort;
    this.server = null;
  }

  start() {
    this.server = net.createServer((clientSocket) => {
      console.log(`[PROXY] Client connected to local port ${this.localPort}`);

      // Connect to IP1
      const hop1Socket = net.connect(this.dbPort, this.ip1, () => {
        console.log(`[PROXY] Connected to IP1: ${this.ip1}`);

        // Forward data between client and IP1
        clientSocket.pipe(hop1Socket);
        hop1Socket.pipe(clientSocket);
      });

      hop1Socket.on('error', (err) => {
        console.error('[PROXY] IP1 connection error:', err.message);
        clientSocket.end();
      });

      clientSocket.on('error', (err) => {
        console.error('[PROXY] Client error:', err.message);
        hop1Socket.end();
      });

      clientSocket.on('close', () => {
        console.log('[PROXY] Client disconnected');
        hop1Socket.end();
      });
    });

    this.server.listen(this.localPort, '127.0.0.1', () => {
      console.log(`[PROXY] Listening on 127.0.0.1:${this.localPort}`);
      console.log(`[PROXY] Route: localhost:${this.localPort} → ${this.ip1} → ${this.ip2} → ${this.dbHost}:${this.dbPort}`);
    });

    this.server.on('error', (err) => {
      console.error('[PROXY] Server error:', err.message);
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      console.log('[PROXY] Stopped');
    }
  }
}

module.exports = ChainProxy;
