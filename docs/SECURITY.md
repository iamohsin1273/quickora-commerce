# Security notes

- Passwords are hashed with bcrypt cost 12. The session is an HTTP-only JWT cookie with `SameSite=Lax`, a seven-day lifetime and configurable `Secure` flag.
- API startup validates `DATABASE_URL` and a 32-character minimum `JWT_SECRET`; production errors avoid stack traces. Configure `COOKIE_SECURE=true` behind HTTPS.
- Helmet, allowlisted credentialed CORS, bounded JSON bodies, request IDs, rate limits for account creation/login, Zod validation and role checks are enabled.
- Customer account data, addresses and orders are scoped by ownership. Delivery tasks are scoped by partner. Administrative stock and order changes record actor audit/movement data.
- Checkout uses database transactions and rechecks live prices, coupons, address eligibility and available stock. Browser totals are never accepted as payable values.
- No production secret is included. `.env.example` uses placeholders; Compose defaults and seeded accounts are for local demos only.

Before internet exposure, configure TLS, secure cookies, a strong secret manager-backed JWT key, backups, alerting, strict deployment origins, appropriate CSRF policy for the deployment topology, and operational abuse monitoring. Payment processing, account recovery and external identity are not implemented.
