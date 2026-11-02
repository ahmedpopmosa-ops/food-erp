# ADR-0006 — Money as NUMERIC + decimal library; no floats anywhere

**Status:** Proposed

## Decision
- PostgreSQL: amounts `NUMERIC(19,4)` (unit prices, costs, intermediate values); document totals and journal
  line amounts are rounded to the currency's minor unit (EGP: 2) and stored as `NUMERIC(19,4)` with a CHECK
  that the scale is respected (`amount = round(amount, minor_units)` for totals). Quantities `NUMERIC(19,6)`.
  Rates/percentages `NUMERIC(9,6)`.
- Every money column has an explicit `currency_code char(3)` on the document header (lines inherit).
- TypeScript: `decimal.js` wrapped in a `Money` / `Qty` value type in `packages/domain`; JSON transports
  decimals as **strings**. ESLint forbids arithmetic on money-typed values outside the domain package.
- Rust (POS core) stores and passes decimals as strings; it does not perform tax math (see architecture §4).
  SQLite stores them as TEXT.
- Rounding: half-up at line level for tax by default; method (`line` vs `document`) is a tax-template
  setting. Rounding residue goes to a configured rounding account.

## Consequences
- No binary floating-point error in totals, taxes or ledgers.
- Slight verbosity in code; enforced by types and lint.
