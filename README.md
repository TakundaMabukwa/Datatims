# Datatims

## VPN flow

This repo connects directly to MySQL, so if the database only exists behind the Cisco VPN you need the VPN tunnel up before sync runs.

1. Install Cisco AnyConnect or Cisco Secure Client with `vpncli.exe`.
2. Set these environment variables:
   - `VPN_REQUIRED=true`
   - `VPN_HOST=...`
   - `VPN_USERNAME=...`
   - `VPN_PASSWORD=...`
   - Optional: `VPN_CLI_PATH=C:\Path\To\vpncli.exe`
3. Run `npm run vpn:connect` to establish the tunnel manually.
4. Run `npm start` or any DB test script. The sync service now calls the VPN helper first and waits for `DB_HOST:DB_PORT` to become reachable.

Notes:
- The helper also supports the repo's existing lowercase keys: `vpn_host`, `vpn_username`, `vpn_password`.
- If `VPN_REQUIRED` is not `true`, the app behaves exactly like before.
- If your Cisco gateway uses MFA or extra prompts beyond username/password/banner accept, the helper may need one more prompt handler.

## OpenConnect via Git Bash

If Cisco Secure Client is not installed locally, you can use `openconnect` from Git Bash if it is available on the machine.

Commands:
- `npm.cmd run vpn:connect:bash`
- `npm.cmd run vpn:test-fetch:bash`

Behavior:
- `scripts/connect-vpn.sh` loads `.env`, reads `VPN_PASSWORD` or `vpn_password`, and passes it to `openconnect` with `--passwd-on-stdin`.
- `scripts/test-db-fetch.sh` starts the VPN in background mode, waits briefly, then runs the existing Node fetch script.

## Linux one-shot pull

On the droplet, use:

```bash
bash ./scripts/pull-live.sh
```

Optional arguments:

```bash
bash ./scripts/pull-live.sh epssched.vsl_drmaster 25
```

What it does:
- Loads `.env`
- Reads `VPN_HOST` or `vpn_host`
- Reads `VPN_USERNAME` or `vpn_username`
- Reads `VPN_PASSWORD` or `vpn_password`
- Optionally reads `SUDO_PASSWORD` or `sudo_password` for non-interactive `sudo`
- Connects `openconnect` in background mode
- Waits for `DB_HOST:DB_PORT`
- Runs `node scripts/fetch-view.js`

If the server already runs as root or `sudo` is passwordless, you do not need `SUDO_PASSWORD`.
