# Phase 6 — Collaboration & Realtime

Goal: multiple humans in one workspace — comments, mentions, reactions, activity feeds, notifications, inbox, and live updates across sessions.

## Scope

- **In:** comments, @mentions, reactions, activity timeline, notification subscriptions, inbox UI, SSE realtime pipeline.
- **Out:** email/web push digests (non-goal v1), presence (stretch only).

## Tasks

1. **Comments**: issue comments (markdown) and project updates; `@` mention autocomplete resolving to users; reactions with an emoji picker.
2. **Activities**: event taxonomy from the Phase 1 table; issue timeline interleaving activity + comments; project activity feed. Every verb has a formatter with a snapshot test — no ad-hoc strings in components.
3. **Notifications**: subscriptions (assignee, creator, mention, explicit follow), unread counts, per-type preferences.
4. **Inbox**: notification list grouped by issue; mark read/unread, snooze; click-through with context preservation; keyboard triage (`e`, `shift+u`).
5. **Realtime pipeline**: Postgres LISTEN/NOTIFY → in-process bus → authenticated SSE endpoint → targeted tRPC cache invalidation per subscribed user; reconnect with backoff + missed-events resync (an `updated_at` watermark query, not event replay).
6. **Presence** (stretch): who's viewing an issue.

## Acceptance criteria

- Two-session check (standalone CDP script, no framework; Chromium — Lightpanda deferred until SSE is verified upstream): user A comments, edits properties, reassigns → user B sees the comment, the property change, and the inbox badge within 2 seconds without reload; ordering is correct after a forced reconnect.
- Activity catalog test: every activity verb produced by Phases 4–5 renders a correct human-readable delta.
- Inbox unread state stays consistent across sessions via realtime.
- Local load sanity: 50 concurrent SSE sessions hold without error.

## Agent notes

Delivery guarantee is at-least-once *invalidations* — queries refetch idempotently, so exactly-once machinery is forbidden complexity. Keep the transport behind one seam (the bus) so a future WebSocket swap is one adapter; build the second adapter only when a real need exists, not speculatively.
