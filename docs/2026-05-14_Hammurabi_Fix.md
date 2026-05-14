# Hammurabi / authoritative preview — known conflicts and local mitigations

**Date:** 2026-05-14  
**Scope:** Local development preview (`sdk-commands start`, Creator Hub preview) with **auth-server** SDK and `@dcl/hammurabi-server`.

**Future sessions:** If preview / Multiplayer Server breaks after SDK, Creator Hub, or `hammurabi-test` updates, point the assistant at **this file** and paste the console error. Re-apply steps are under *Files / locations touched*, *Maintenance*, and *Operational checklist*.

## Summary

Local authoritative multiplayer preview failed with:

- `secp256k1.getPublicKey is not a function`
- On Windows, `spawn EINVAL` when starting the multiplayer server via `npx` without a shell

Root cause was **not** “Node 22 is incompatible with crypto in general”. The failure came from a **version skew inside `@dcl/hammurabi-server`**: compiled code expected `ethereum-cryptography` v1-style exports, while the resolved dependency was v2-style (`{ secp256k1 }` namespace).

## Technical details

### 1) `ethereum-cryptography` v1 vs v2 API mismatch

`@dcl/hammurabi-server` (as resolved at the time of investigation) contained logic equivalent to:

- `const secp256k1 = require('ethereum-cryptography/secp256k1')`
- `secp256k1.getPublicKey(...)` (v1-style top-level `getPublicKey`)

With `ethereum-cryptography@2.x`, the module exports **`secp256k1`** as an object; `getPublicKey` lives on **`secp256k1`**, not on the module root. That yields `getPublicKey is not a function` at runtime.

**Mitigation applied (local only):** patch `dist/lib/decentraland/identity/login.js` inside the installed `@dcl/hammurabi-server` copy under `hammurabi-test/node_modules/`:

- Resolve the curve object: `const secp256k1 = mod.secp256k1 || mod`
- Use uncompressed public keys where the rest of the stack expects the legacy 64-byte key material (strip the `0x04` prefix): `getPublicKey(privateKey, false).slice(1)`

### 2) Windows: `npx` / `.cmd` and `spawn({ shell: false })`

On Windows, spawning `npx.cmd` without a shell can fail with **`EINVAL`**.

**Mitigation:** when falling back to `npx`, spawn with `shell: true` (as implemented in the patched `@dcl/sdk-commands` launcher).

### 3) Creator Hub (Electron): wrong Node binary for child processes

Creator Hub runs tooling inside Electron. `process.execPath` may point at the **Electron** binary, not a standalone Node.js runtime. Spawning Hammurabi with that binary can break native/crypto-dependent tooling.

**Mitigation:** when running the local CLI, prefer **`node.exe` / `node` found on `PATH`** if `isElectronEnvironment()` is true.

## Files / locations touched in this repo

| Location | Purpose |
|----------|---------|
| `hammurabi-test/package.json` | Pins a local `@dcl/hammurabi-server` install used for preview |
| `hammurabi-test/node_modules/@dcl/hammurabi-server/dist/lib/decentraland/identity/login.js` | Patched guest/ephemeral identity crypto usage |
| `node_modules/@dcl/sdk-commands/dist/commands/start/hammurabi-server.js` | Patched launcher: prefer local CLI + correct Node on Electron + Windows-friendly `npx` fallback |

> **Important:** edits under `node_modules/` are **not committed** by default and are **wiped** on `npm install` / SDK upgrades unless you automate re-application (see “Maintenance” below).

## Maintenance / durability of these patches

- **`npm install`**, **`npm ci`**, or upgrading `@dcl/sdk` / `@dcl/sdk-commands` will typically **overwrite** `node_modules/@dcl/sdk-commands/.../hammurabi-server.js`. Expect to **re-apply** the launcher patch or adopt **`patch-package`** (or an equivalent vendored fork) if you want it to survive installs.
- **`hammurabi-test/node_modules`** will be recreated when you reinstall that subtree; keep **`hammurabi-test/package.json`** in git and re-run install + re-apply the `login.js` patch unless you automate it.
- **Upstream fix:** once Decentraland ships a fixed `@dcl/hammurabi-server` (and/or `sdk-commands` defaults), you should be able to **remove** local patches and rely on `npx @dcl/hammurabi-server@<pinned version>` again.

### Team choice: no automated re-patching

This project **does not** use `patch-package` / `postinstall` hooks to re-apply fixes automatically. After any of the events below, **manually** run preview once and confirm Hammurabi reaches **`Server running`** (or ask in chat if logs show `secp256k1`, `EINVAL`, or Multiplayer Server exit).

**Re-check after:** `npm install` / `npm ci`, Creator Hub update, `@dcl/sdk` / `@dcl/js-runtime` upgrade, reinstalling `hammurabi-test`, or bumping `@dcl/hammurabi-server` in `hammurabi-test/package.json`.

## Operational checklist (local preview)

1. Use **auth-server** SDK lines in the root `package.json` (`@dcl/sdk` / `@dcl/js-runtime` on the `auth-server` dist-tag or equivalent), so `@dcl/sdk/server` and multiplayer preview wiring match your scene.
2. Ensure **`hammurabi-test/`** exists with a working `@dcl/hammurabi-server` install and the **`login.js` patch** applied after installs.
3. On Windows + Creator Hub: ensure a **standalone Node.js** is on **`PATH`** so Electron can spawn it for Hammurabi.

## Production / Worlds — do these patches matter?

**No, not in the way you run preview locally.**

- **Hammurabi + `sdk-commands` patches** only affect **how your machine starts the local authoritative server** during preview. They are **not** part of the scene bundle you deploy.
- When you publish to a **World** (or Genesis), players connect to Decentraland’s **hosted** runtime / infrastructure for that deployment mode. Your scene code and configured networking flow apply there; you do **not** ship this repo’s `node_modules` patches to end users.
- **Implication:** fixing local Hammurabi does **not** by itself prove or disprove production behaviour. Always validate **deployed** Worlds against the current platform behaviour (and any official “auth server / worlds” guidance from the Decentraland team).

## Creator Hub updates

- Creator Hub updates can **replace** bundled tooling (including the `sdk-commands` copy it uses). Any manual edit under **`node_modules/`** can disappear without warning.
- This repo relies on **manual** re-application of patches after installs (see “Team choice: no automated re-patching” above). Optional hardening (`patch-package`, vendored fork) remains available if the team changes its mind.

## Related symptoms (not fixed by Hammurabi)

- Preview `404` loading audio from `bafkrei...` URLs via `127.0.0.1:8000/content/...` is often **wearable/emote catalog noise** in preview, not your scene’s local `AudioSource` files.
