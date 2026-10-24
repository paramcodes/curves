---
name: verify-curves
description: Project verification skill for Curves — run the real surface and capture proof before declaring UI work done. Today it verifies the disposable UI prototype (the only runnable surface); Phase 3 regenerates it for the real Next.js app. Use before any "done" claim on UI work, per PLAN.md definition-of-done rule 2.
---

# Verify Curves

One scripted way to prove the UI works. Run this before claiming UI-facing work is done. A claim of success without this skill's evidence is not accepted.

## Launch

There is no app yet. The runnable surface is the disposable prototype — one static file, no server needed:

```
file:///home/param/Projects/curves/prototype/index.html?variant=L    # variants: L | A | B | C
```

## Doctor (run first; a failure here means blocked, not failed)

1. Prototype JS parses:
   ```
   node -e "const fs=require('fs');const m=fs.readFileSync('prototype/index.html','utf8').match(/<script>([\s\S]*)<\/script>/);fs.writeFileSync('/tmp/curves-proto-check.js',m[1])" && node --check /tmp/curves-proto-check.js
   ```
2. A chromium-family headless browser exists (`chromium` | `chromium-browser` | `google-chrome`). Missing → report **blocked** with the exact install hint; do not guess or skip.

## Drive (current surface — the prototype)

For each variant, render headlessly and count real content (a variant rendering zero matching elements is a failure):

| Variant | Command core | Must match (grep -c -E) | Minimum |
| --- | --- | --- | --- |
| L | `--dump-dom "...?variant=L"` | `class="(row \|card \|tr \|mrow\|vL)` | 6 |
| A | `--dump-dom "...?variant=A"` | `class="row ` | 18 |
| B | `--dump-dom "...?variant=B"` | `class="card ` | 18 |
| C | `--dump-dom "...?variant=C"` | `class="tr ` | 18 |

Full invocation shape (adjust binary name from Doctor):

```
<browser> --headless --disable-gpu --virtual-time-budget=2500 --dump-dom \
  "file:///home/param/Projects/curves/prototype/index.html?variant=X" 2>/dev/null | grep -c -E '<pattern>'
```

## Evidence

Append one block per run to `.agents/skills/verify-curves/evidence/last-run.txt`: ISO timestamp, per-variant counts, doctor results, overall PASS/FAIL/BLOCKED. Evidence survives cleanup — never delete prior runs.

## Cleanup

Headless chromium invocations are one-shot and exit on their own; this skill starts no servers and holds no ports. If a step is changed to start one, kill only the PID this skill started, never by process name.

## Regeneration (Phase 3)

When the real app exists, this file is regenerated via `/create-verification-skill`: launch (dev server), doctor, drive with real selectors through agent-browser (accessibility snapshots, not pixel greps), evidence capture, cleanup — executed end-to-end once as part of generation. Then `/maintain-verification-skill` at every phase exit, because verification instructions drift. Until then, this file is the honest check of what exists.
