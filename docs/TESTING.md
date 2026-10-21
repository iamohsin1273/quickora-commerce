# Testing and quality

Run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` from the repository root. Backend smoke tests exercise health, API documentation, anonymous route protection and unknown-route behavior; client tests exercise persistent cart quantity behavior. Set `RUN_DB_TESTS=true` to run the PostgreSQL integration journeys for sign-in, search, brand filtering and pagination, cart, coupons, transactional checkout/cancellation, roles, admin stock and delivery. GitHub Actions provisions PostgreSQL and runs those database-backed checks after migration and seeding.

For a local browser smoke test, start the compose stack, browse the home page's categories and brand chips, verify catalog pagination, then sign in with each demo role and inspect API responses.
