# SITEMAP — index.html Edit Rules

This repo contains a single-file vanilla JS app (`index.html`). Lines are
extremely long (minified). Follow these rules in every session:

## 1 — Never use shell commands to edit index.html
`sed`, `awk`, heredocs, `cat`-with-redirect, PowerShell `.Replace()` scripts —
all are forbidden. Long lines exceed the 965-byte shell parsing ceiling and
silently fail or partially apply even when reported as successful.

## 2 — Always use the file-editing tool
Use exact `old_string` / `new_string` replacement. Keep each pair as short and
surgical as possible — match only the minimum unique substring needed, never
entire very-long lines. Never do a full-file rewrite.

## 3 — Verify every single edit before moving on
After every edit:
- Re-read (Read tool) the actual modified region from disk.
- Visually confirm the new code is present, character for character.
- Only then report the edit as done. If you cannot verify, say so explicitly.

## 4 — One edit per tool call
Do not batch multiple distinct changes into one tool call. One edit → one
verification read → then proceed to the next step. Slower but eliminates
silent-failure patterns.
