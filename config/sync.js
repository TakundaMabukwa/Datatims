const fs = require('fs').promises;
const path = require('path');
const {
  getDrivers,
  getDriverMaster,
  getVehicles,
  getLogDrivers,
  getLogDriverMaster,
  getLogVehicles
} = require('./db');

const DATA_DIR = path.join(__dirname, '../data');
const SYNC_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Daily Database Sync Service
 * Pulls data once per day and stores in JSON files
 */
class SyncService {
  constructor() {
    this.lastSync = null;
    this.syncing = false;
  }

  async init() {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await this.sync();
    setInterval(() => this.sync(), SYNC_INTERVAL);
  }

  async sync() {
    if (this.syncing) return;
    
    this.syncing = true;
    console.log('[SYNC] Starting daily data pull...');

    try {
      const [drivers, driverMaster, vehicles, logDrivers, logDriverMaster, logVehicles] = await Promise.all([
        getDrivers(),
        getDriverMaster(),
        getVehicles(),
        getLogDrivers(),
        getLogDriverMaster(),
        getLogVehicles()
      ]);

      await Promise.all([
        fs.writeFile(path.join(DATA_DIR, 'drivers.json'), JSON.stringify(drivers, null, 2)),
        fs.writeFile(path.join(DATA_DIR, 'driver-master.json'), JSON.stringify(driverMaster, null, 2)),
        fs.writeFile(path.join(DATA_DIR, 'vehicles.json'), JSON.stringify(vehicles, null, 2)),
        fs.writeFile(path.join(DATA_DIR, 'log-drivers.json'), JSON.stringify(logDrivers, null, 2)),
        fs.writeFile(path.join(DATA_DIR, 'log-driver-master.json'), JSON.stringify(logDriverMaster, null, 2)),
        fs.writeFile(path.join(DATA_DIR, 'log-vehicles.json'), JSON.stringify(logVehicles, null, 2))
      ]);

      this.lastSync = new Date();
      console.log(`[SYNC] ✓ Data synced successfully at ${this.lastSync.toISOString()}`);
      console.log(`[SYNC] Next sync in 24 hours`);
    } catch (err) {
      console.error('[SYNC] Failed:', err.message);
      console.log('[SYNC] Will retry in 1 hour');
      setTimeout(() => this.sync(), 60 * 60 * 1000);
    } finally {
      this.syncing = false;
    }
  }

  async getData(filename) {
    try {
      const data = await fs.readFile(path.join(DATA_DIR, filename), 'utf8');
      return JSON.parse(data);
    } catch (err) {
      throw new Error(`Data not available: ${err.message}`);
    }
  }

  getLastSync() {
    return this.lastSync;
  }
}

module.exports = new SyncService();
