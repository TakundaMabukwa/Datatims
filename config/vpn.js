const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

function env(name, fallback = '') {
  return (process.env[name] || fallback).trim();
}

function getVpnConfig() {
  const required = /^(1|true|yes)$/i.test(env('VPN_REQUIRED', env('vpn_required', 'false')));
  const host = env('VPN_HOST') || env('vpn_host');
  const username = env('VPN_USERNAME') || env('vpn_username');
  const password = env('VPN_PASSWORD') || env('vpn_password');
  const cliPath = env('VPN_CLI_PATH') || env('vpn_cli_path');
  const connectTimeoutMs = parseInt(env('VPN_CONNECT_TIMEOUT_MS', '120000'), 10);
  const settleTimeoutMs = parseInt(env('VPN_SETTLE_TIMEOUT_MS', '30000'), 10);
  const promptTimeoutMs = parseInt(env('VPN_PROMPT_TIMEOUT_MS', '15000'), 10);
  const dbHost = env('DB_HOST');
  const dbPort = parseInt(env('DB_PORT', '0'), 10);

  return {
    required,
    host,
    username,
    password,
    cliPath,
    connectTimeoutMs,
    settleTimeoutMs,
    promptTimeoutMs,
    dbHost,
    dbPort
  };
}

function resolveVpnCliPath(cliPath) {
  const candidates = [
    cliPath,
    'C:\\Program Files (x86)\\Cisco\\Cisco AnyConnect Secure Mobility Client\\vpncli.exe',
    'C:\\Program Files\\Cisco\\Cisco AnyConnect Secure Mobility Client\\vpncli.exe',
    'C:\\Program Files (x86)\\Cisco\\Cisco Secure Client\\vpncli.exe',
    'C:\\Program Files\\Cisco\\Cisco Secure Client\\vpncli.exe'
  ].filter(Boolean);

  return candidates.find(candidate => fs.existsSync(candidate)) || null;
}

function checkPort(host, port, timeoutMs = 5000) {
  return new Promise((resolve) => {
    if (!host || !port) {
      resolve(false);
      return;
    }

    const socket = new net.Socket();
    let finished = false;

    const done = (ok) => {
      if (finished) return;
      finished = true;
      socket.destroy();
      resolve(ok);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });
}

async function waitForReachability(host, port, timeoutMs, intervalMs = 2000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await checkPort(host, port)) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  return false;
}

function statusUsesConnected(output) {
  return /state:\s*connected/i.test(output) || /vpn session established/i.test(output);
}

async function getVpnStatus(config = getVpnConfig()) {
  if (!config.required) {
    return { enabled: false, connected: false, reason: 'VPN_REQUIRED is disabled' };
  }

  const vpncli = resolveVpnCliPath(config.cliPath);
  if (!vpncli) {
    return { enabled: true, connected: false, reason: 'vpncli.exe not found' };
  }

  const result = await runCliCommand(vpncli, ['stats'], { timeoutMs: 15000 });
  return {
    enabled: true,
    connected: statusUsesConnected(result.output),
    reason: result.output.trim() || 'No output from vpncli',
    vpncli
  };
}

function runCliCommand(executable, args, { timeoutMs = 15000, stdinLines = [] } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true });
    let output = '';
    let settled = false;

    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) {
        reject(err);
      } else {
        resolve({ output });
      }
    };

    const timer = setTimeout(() => {
      child.kill();
      finish(new Error(`vpncli timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });

    child.on('error', finish);
    child.on('close', () => finish());

    if (stdinLines.length) {
      for (const line of stdinLines) {
        child.stdin.write(`${line}\n`);
      }
      child.stdin.end();
    }
  });
}

async function connectVpn(config = getVpnConfig()) {
  if (!config.required) {
    return { skipped: true, reason: 'VPN_REQUIRED is disabled' };
  }

  if (config.dbHost && config.dbPort) {
    const alreadyReachable = await checkPort(config.dbHost, config.dbPort);
    if (alreadyReachable) {
      return { connected: true, reused: true, reason: 'DB host already reachable' };
    }
  }

  if (!config.host) {
    throw new Error('VPN_HOST is not configured');
  }

  const vpncli = resolveVpnCliPath(config.cliPath);
  if (!vpncli) {
    throw new Error(
      'Cisco vpncli.exe was not found. Install Cisco AnyConnect / Cisco Secure Client or set VPN_CLI_PATH.'
    );
  }

  const status = await getVpnStatus(config);
  if (status.connected) {
    return { connected: true, reused: true, vpncli };
  }

  await automateVpnConnect(vpncli, config);

  if (config.dbHost && config.dbPort) {
    const reachable = await waitForReachability(
      config.dbHost,
      config.dbPort,
      config.settleTimeoutMs
    );

    if (!reachable) {
      throw new Error(
        `VPN connected but ${config.dbHost}:${config.dbPort} is still unreachable after ${config.settleTimeoutMs}ms`
      );
    }
  }

  return { connected: true, reused: false, vpncli };
}

function automateVpnConnect(vpncli, config) {
  return new Promise((resolve, reject) => {
    const child = spawn(vpncli, [], { windowsHide: true });
    let output = '';
    let settled = false;
    let sentConnect = false;
    let sentUsername = false;
    let sentPassword = false;
    let sentBannerAccept = false;

    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(connectTimer);
      clearTimeout(promptTimer);
      child.kill();
      if (err) {
        err.message = `${err.message}\n\nCisco output:\n${output}`.trim();
        reject(err);
      } else {
        resolve({ output });
      }
    };

    const resetPromptTimer = () => {
      clearTimeout(promptTimer);
      promptTimer = setTimeout(() => {
        finish(new Error(`VPN prompt timed out after ${config.promptTimeoutMs}ms`));
      }, config.promptTimeoutMs);
    };

    const writeLine = (line) => {
      child.stdin.write(`${line}\n`);
      resetPromptTimer();
    };

    const handleOutput = (chunk) => {
      output += chunk.toString();
      const lower = output.toLowerCase();

      if (!sentConnect && /vpn\s*>/i.test(output)) {
        sentConnect = true;
        writeLine(`connect ${config.host}`);
        return;
      }

      if (!sentUsername && /username:/i.test(lower)) {
        sentUsername = true;
        writeLine(config.username);
        return;
      }

      if (!sentPassword && /password:/i.test(lower)) {
        sentPassword = true;
        writeLine(config.password);
        return;
      }

      if (!sentBannerAccept && /accept\?\s*\[y\/n\]/i.test(lower)) {
        sentBannerAccept = true;
        writeLine('y');
        return;
      }

      if (statusUsesConnected(output)) {
        finish();
        return;
      }

      if (/login failed|authentication failed|failed to obtain ip address|connection attempt has failed|untrusted server/i.test(lower)) {
        finish(new Error('VPN connection failed'));
      }
    };

    let promptTimer = null;
    const connectTimer = setTimeout(() => {
      finish(new Error(`VPN connect timed out after ${config.connectTimeoutMs}ms`));
    }, config.connectTimeoutMs);

    child.stdout.on('data', handleOutput);
    child.stderr.on('data', handleOutput);
    child.on('error', finish);
    child.on('close', () => {
      if (!settled && !statusUsesConnected(output)) {
        finish(new Error('vpncli exited before establishing a connection'));
      }
    });

    resetPromptTimer();
  });
}

async function disconnectVpn(config = getVpnConfig()) {
  const vpncli = resolveVpnCliPath(config.cliPath);
  if (!vpncli) {
    throw new Error('Cisco vpncli.exe was not found');
  }

  await runCliCommand(vpncli, ['disconnect'], { timeoutMs: 15000 });
}

module.exports = {
  getVpnConfig,
  getVpnStatus,
  connectVpn,
  disconnectVpn,
  waitForReachability,
  resolveVpnCliPath
};
