# ADR-0003 — Prisma ORM with hand-written SQL for RLS, triggers and checks

**Status:** Proposed

## Context
The brief asks for Prisma or an equivalent. We need RLS policies, deferred constraint triggers
(balanced journals), immutability triggers, partial unique indexes and CHECK constraints — none of which
Prisma's schema language expresses fully.

## Decision
Prisma 6 for the client and migration history. Each migration is generated with `prisma migrate dev
--create-only`, then **edited by hand** to add RLS, grants, triggers, checks and composite FKs.
`schema.prisma` mirrors tables and relations; SQL is the source of truth for constraints.
Decimal columns map to `Prisma.Decimal`; never converted to JS `number`.

A CI check runs `prisma migrate diff` between the migrations and `schema.prisma` and fails on drift.

## Consequences
- Proven in Agency OS; the team already knows the workflow.
- Hand-written SQL must be reviewed carefully; every invariant enforced in SQL has an integration test.
