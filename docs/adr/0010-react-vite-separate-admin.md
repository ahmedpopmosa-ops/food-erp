# ADR-0010 — React + Vite web apps; operator console as a separate app and origin

**Status:** Proposed

## Decision
- `apps/web` (tenant dashboard) and `apps/admin` (operator console) are separate React 19 + Vite SPAs sharing
  `packages/ui`, `packages/i18n` and `packages/contracts`. The POS UI is a third React app inside Tauri.
- The operator console is served from a different hostname, uses a different cookie, a separate login backed
  by `platform_users`, mandatory MFA (TOTP, Phase 7), and IP allow-listing where available.
- Agency OS used Next.js; the RestaurantOS brief mandates Vite. No SSR is required: dashboards are behind
  login and the POS is a desktop app.

## Consequences
- A compromised tenant session has no path to operator endpoints (different origin, cookie, guard).
- Three frontends share components, so the component library must be built and tested first (Phase 2).
