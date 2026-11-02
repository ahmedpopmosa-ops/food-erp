# ADR-0013 — POS PINs with PBKDF2 (WebCrypto) and lease keys

**Status:** Accepted (Phase 4a) · **Amends:** ADR-0009

## Context
ADR-0009 specified Argon2id for POS PINs. With the POS core in TypeScript (ADR-0012), the PIN has to be
verified offline inside the webview, where only WebCrypto is available without native modules. The device
also needs the lease verification key before it can trust a lease.

## Decision
- **PIN hashes use PBKDF2-SHA256 via WebCrypto.**
  - Format: `pbkdf2-sha256$<iterations>$<salt>$<hash>`, implemented once in `@ros/domain` (`hashPin`, `verifyPin`).
  - Default 600,000 iterations (`POS_PIN_ITERATIONS`); tests use 1,000.
- **A PIN is still a weak secret.** Mitigations:
  - PINs unlock POS permissions only, never the dashboard.
  - Hashes are pulled only to devices of the employee's branches; removing an assignment sends a deletion.
  - 5 wrong PINs lock that employee out on the device for 5 minutes, and the lock persists across restarts.
  - The dashboard never returns hashes (`hasPin` only).
- **Leases are Ed25519-signed by the API.**
  - The key comes from `LEASE_SIGNING_KEY` (required in production); dev and test generate an ephemeral key per process.
  - The device receives the public key at pairing and stores it (trust on first use). **Production POS builds
    must also embed the public key(s)**, so a hijacked pairing response cannot install a different key.
- **Approvals.** A manager's approval is a record `{id, action, approver, occurredAt}` created after a local PIN
  check. It travels inside the operation it authorises. The server stores every approval and marks it
  `authorised` from its own data; a refund approved by someone no longer entitled raises `permission_outdated`.

## Consequences
- One PIN implementation across server and device; no native crypto dependency in the POS.
- PBKDF2 is less memory-hard than Argon2id. Accepted because a 4–6 digit PIN space is small under any hash,
  and the controls above are what actually protect it.
