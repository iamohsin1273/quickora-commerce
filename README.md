# QUICKORA

QUICKORA is an original, responsive quick-commerce demo for Chennai, built as a TypeScript monorepo. It includes a React storefront, an Express REST API, PostgreSQL persistence through Prisma, customer/admin/delivery roles, seeded Indian grocery data, and Docker Compose deployment.

## What is included

- Responsive category-led storefront with all 12 seeded categories available in the header and fallback browsing when the category API is unavailable; refreshed QUICKORA brand mark, live API-backed search and catalog filters, product pages, persistent guest basket, checkout, coupons, saved addresses, order history and status tracking.
- Server-side cart, coupon, serviceability, price and stock validation; order creation and inventory decrement run in a serializable database transaction.
- Admin dashboard with persisted metrics, product CRUD/activation, stock adjustments with movement history, order transitions, customer listing and coupon activation.
- Delivery partner status and task interfaces with ownership enforcement.
- HTTP-only JWT cookie authentication, bcrypt password hashes, validation, role middleware, request IDs, security headers, login/registration rate limits and an OpenAPI/Swagger UI.
- Deterministic seed: 12 categories, 90 grocery and household products from familiar Indian brands, three demo coupon codes and customer/admin/rider accounts.

## Technology and structure

- `apps/web`: React 18, TypeScript, Vite, Tailwind CSS, React Router, TanStack Query, Zustand, React Hook Form/Zod, Lucide and Recharts.
- `apps/api`: Node.js 22, Express, TypeScript, Prisma 7 with the PostgreSQL driver adapter, PostgreSQL, Zod, bcrypt and JWT.
- `packages/shared`: shared role/order types and INR formatting.
- `docs`: architecture, API, database, security, testing, deployment and user guidance.

## Requirements

- Node.js 22 and npm 10+ for local development.
- Docker Desktop with Compose for the container workflow.
- PostgreSQL 16 for local development if not using Docker.

## Local development

```powershell
Copy-Item .env.example .env
# Edit DATABASE_URL if your PostgreSQL credentials differ.
npm ci
npm run prisma:generate -w @quickora/api
npm run db:migrate -w @quickora/api
npm run db:seed -w @quickora/api
npm run dev
```

The Vite server runs at <http://localhost:5173>; the API runs at <http://localhost:4000>. Vite calls the API through `VITE_API_BASE_URL`. Configure `.env` before starting the API; `JWT_SECRET` must be at least 32 characters. The API exits on invalid startup configuration.

For a local PostgreSQL instance, the default connection in `.env.example` is:
`postgresql://quickora:quickora_local@localhost:5432/quickora?schema=public`

## Docker Compose

```powershell
docker compose up --build
```

The API container waits for PostgreSQL, applies migrations, runs the idempotent seed and starts the API. Open <http://localhost:5173>. To inspect services use `docker compose ps`; logs use `docker compose logs -f api`, `docker compose logs -f web`, or `docker compose logs -f db`. Restart with `docker compose restart api`; stop with `docker compose down` (the named PostgreSQL volume is retained). `docker compose down -v` deletes local database data.

Ports: web `5173`, API `4000`, PostgreSQL `5432`. Nginx proxies `/api/*`, `/api-docs` and `/health` to the API, so container browsers do not need a container-internal hostname.

## Demo accounts

| Role | Email | Development-only password |
|---|---|---|
| Customer | `customer@quickora.local` | `QuickoraCustomer123!` |
| Administrator | `admin@quickora.local` | `QuickoraAdmin123!` |
| Delivery partner | `rider@quickora.local` | `QuickoraRider123!` |

Set `SEED_CUSTOMER_PASSWORD`, `SEED_ADMIN_PASSWORD` and `SEED_RIDER_PASSWORD` before running the seed to override the local demo passwords. Do not use seed accounts, fallback Compose secrets, or demo credentials in production.

## Useful URLs and commands

- Storefront: <http://localhost:5173>
- API health/readiness: <http://localhost:4000/health> and <http://localhost:4000/ready>
- Swagger UI: <http://localhost:4000/api-docs>
- OpenAPI JSON: <http://localhost:4000/api/v1/openapi.json>

```powershell
npm run dev
npm run db:migrate -w @quickora/api
npm run db:seed -w @quickora/api
npm run lint
npm run typecheck
npm test
npm run build
```

## Checkout and demo behavior

- Orders accept Chennai PINs beginning `600`; other PINs are clearly rejected as not yet serviceable.
- Delivery timing (25–40 minutes) is an estimate, not a guarantee. Order status is persisted and the order page polls every 15 seconds.
- `DEMO` is a sandbox label only and **does not process or claim a real payment**. COD is also supported.
- Coupon codes: `WELCOME10` (10% over ₹299, capped), `QUICK50` (₹50 over ₹499), and `FRESH15` (15% over ₹399, capped); each has expiry, usage and per-customer checks.
- Verified packaged-product photos use Open Food Facts images where a matching catalog entry is available; product cards identify those images, and product details link to the source product and the CC BY-SA 3.0 license. Fresh-produce and remaining illustrative images use Unsplash. Remote images require an internet connection; failed loads use the QUICKORA fallback illustration.
- Product listings use familiar brand and item names for this demo catalog. Prices, stock and product photography are illustrative and do not indicate official brand affiliation or endorsement.
- Map, geocoding, live GPS, external payment, messaging and real-time delivery dispatch are not integrated. Addresses are managed manually, and delivery task assignment is an administrative/demo operation.
- Admin analytics metrics and charts are computed from persisted orders and order items.

## Production notes

The production-oriented AWS/Terraform foundation, staged setup, and operator checklist are documented in [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md). It targets ECS Fargate in Mumbai and uses CloudFront's managed HTTPS hostname, so a custom domain is not required. Terraform has not been applied and no AWS resources have been created by this repository setup. The application still needs real payment, live dispatch/tracking, and operational support integrations before a full commercial launch; local demo credentials, seed orders, and payment behavior are not production features.

## Packaging

Create the clean repository archive (excluding dependencies, build output, secrets and VCS metadata):

```powershell
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = (Get-Location).Path
$archive = Join-Path $root 'QUICKORA.zip'
$files = Get-ChildItem -Path $root -File -Recurse -Force | Where-Object {
  $relative = $_.FullName.Substring($root.Length + 1)
  $parts = $relative -split '\\'
  ($parts -notcontains 'node_modules') -and
    ($parts -notcontains 'dist') -and
    ($parts -notcontains 'coverage') -and
    ($parts -notcontains '.git') -and
    ($parts -notcontains '.vite') -and
    ($parts -notcontains '.cache') -and
    ($_.Name -eq '.env.example' -or $_.Name -notlike '.env*') -and
    ($_.Name -ne 'QUICKORA.zip') -and
    ($_.Extension -ne '.log') -and
    ($_.Extension -ne '.tsbuildinfo')
}
if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive }
$zip = [System.IO.Compression.ZipFile]::Open($archive, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($file in $files) {
    $relative = $file.FullName.Substring($root.Length + 1).Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $zip, $file.FullName, $relative, [System.IO.Compression.CompressionLevel]::Optimal
    ) | Out-Null
  }
} finally {
  $zip.Dispose()
}
```

## License

See [LICENSE](./LICENSE). Product names and branding in this project are original; Open Food Facts images are credited and licensed under [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/), and other external product photography remains subject to its source license and Unsplash terms. See the [Open Food Facts terms](https://world.openfoodfacts.org/terms-of-use) for image reuse conditions.
