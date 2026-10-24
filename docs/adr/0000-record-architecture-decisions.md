# ADR 0000 — Record architecture decisions

**Status:** accepted — 2026-10-24.

## Context

Curves is built agent-first: decisions must be discoverable by an agent that joins mid-project with only the repo. Decisions that live in chat history are lost; decisions that live only in code are rediscovered the hard way.

## Decision

- Durable decisions are recorded in `docs/adr/NNNN-slug.md` — numbered, append-friendly, linked from related docs.
- Each ADR carries **Status**, **Context**, **Decision**, **Consequences**. Keep it short: the reasons and the rejected alternatives are the part that is hard to rediscover; everything else is in the code.
- A decision that reverses an earlier one **supersedes** it by link (see ADR 0002 amending 0001) — history is never rewritten, only marked.
- Pre-implementation (planning-phase) ADRs may be edited for accuracy while no code exists; once code depends on an ADR, changes go through supersede, not edit.
- One row per durable decision also lands in `decisions.tsv` (append-only trail); the ADR is the reasoning, the TSV row is the pointer.

## Consequences

- Agents read `docs/adr/` before changing anything a past decision touches (routed from AGENTS.md and phase docs).
- The rejected alternatives recorded in each ADR are load-bearing: re-adding a rejected choice requires new evidence, not amnesia.
