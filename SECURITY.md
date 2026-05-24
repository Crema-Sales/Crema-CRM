# Security Policy

## Reporting a vulnerability

If you find a security issue in Crema, please **don't open a public issue**. Email **security@cremasales.com** instead, and we'll respond as soon as we can.

Please include:

- A description of the issue and the affected component (`frontend/`, `backend/`, `extension/`, `shared/`, etc.).
- Steps to reproduce, or a proof-of-concept.
- Your assessment of impact.

We don't currently run a bug-bounty program, but we'll credit you in the release notes for the fix (with your permission) once the issue is resolved.

## Scope

In scope:

- The CRM web app under `frontend/` (auth, server-fns, public ingest endpoint, outbound webhooks).
- The Cloudflare Worker agent under `backend/`.
- The Chrome extension under `extension/`.
- The shared protocol/schemas under `shared/`.

Out of scope:

- Third-party services we integrate with (Cloudflare, OpenRouter, Resend, Tavily).
- Demo/seed data in `backend/migrations/0002_seed.sql` — all values use the RFC-reserved `@cremasales.example` domain.

## Disclosed issues

See `extension/TODO.md` for the current security-hardening backlog. Items marked `TODO(sec)` in the source represent known loosening that's been deferred for demo purposes and is tracked for re-tightening before any non-dev install.
