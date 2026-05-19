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
- The helper also supports the repo's existing lowercase keys: `vpn_required`, `vpn_host`, `vpn_username`, `vpn_password`, `vpn_cli_path`.
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

## Supabase sync

This repo can now upsert Datatims data into Supabase using the service role key.

Commands:

```bash
npm run sync:supabase
```

This command now attempts VPN connection first when `VPN_REQUIRED=true` (or `vpn_required=true`).

Dry run without writing to Supabase:

```bash
npm run sync:supabase:dry
```

If the DB is only reachable over VPN on the droplet:

```bash
npm run sync:supabase:live
```

Dry run over VPN on the droplet:

```bash
npm run sync:supabase:live:dry
```

Required env:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Current source to target mapping:
- `epssched.vsl_drmaster` -> `public.eps_client_list` using `client_id`
- `epssched.vsl_tbldrivermaster` -> `public.drivers` using `driver_code`
- `epssched.vsl_tblvehiclemaster` -> `public.vehiclesc` using `registration_number`

Recommended Supabase indexes are in `scripts/supabase-indexes.sql`.

Sync behavior:
- insert when Datatims row is missing in Supabase
- update when Datatims row differs from Supabase
- leave unmatched Supabase rows untouched
- dry run prints counts and sample keys for inserts and updates without writing anything
