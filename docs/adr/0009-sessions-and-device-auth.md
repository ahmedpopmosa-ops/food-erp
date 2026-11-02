# ADR-0009 — Opaque sessions for people, rotating tokens + signed license lease for devices

**Status:** Proposed

## Decision
**People (web, admin):** opaque random session token in an httpOnly, Secure, `SameSite=Lax` cookie; only
SHA-256 stored; idle timeout 12 h, absolute 7 d; CSRF double-submit header on writes; instant revocation.
(Proven in Agency OS.)

**Devices (POS):**
1. A manager creates a device in the dashboard → one-time **pairing code** (8 chars, 15 min, single use).
2. POS exchanges the code for a `device_id` + **refresh token** (stored in Windows Credential Manager) and
   obtains short-lived **access tokens** (15 min, opaque, hashed server-side). Refresh tokens rotate on use;
   reuse of an old refresh token revokes the device (theft detection).
3. The server also issues a **license lease**: a compact payload `{tenant_id, branch_id, device_id,
   plan_features, valid_until}` signed with Ed25519. The POS verifies it offline with the embedded public key.
   Default validity 7 days, renewed on every successful sync. Expired lease → no new sales, sync still allowed.

**Employees on POS:** each employee with POS access has a PIN; its Argon2id hash (with per-employee salt and
tuned low-memory params for the POS) is pulled to devices of the employee's branches so login and manager
approvals work offline. PIN attempts are rate-limited locally (5 fails → 5 min lockout) and audited.

## Consequences
- Revoking a device takes effect at its next sync; offline it keeps working until its lease expires — this
  window is a documented limitation and configurable (minimum 1 day).
- PIN hashes on devices are a weaker secret than passwords; PINs only grant POS permissions, never dashboard access.
