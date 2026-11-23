# QUICKORA

QUICKORA is an original, responsive quick-commerce demo for Chennai, built as a TypeScript monorepo. It includes a React storefront, an Express REST API, PostgreSQL persistence through Prisma, customer/admin/delivery roles, seeded Indian grocery data, and Docker Compose deployment.

## Architecture

The local demo exercises the same storefront, API, and database schema used by the Kubernetes manifests. Follow a single order from the customer checkout through the admin view to see how the API enforces permissions and persists state.

```mermaid
flowchart LR
    Browser["Customer, admin, or rider browser"] -->|"HTTP :5173"| Web["Nginx serves the React storefront"]
    Web -->|"/api/*"| API["Express REST API"]
    API -->|"Prisma queries and checkout transaction"| DB[("PostgreSQL 16")]
    Init["Compose migration and demo seed job"] -->|"Initialize schema and catalog"| DB
```

The EKS release design uses the workload manifests and Argo CD templates in this repo. The diagram marks future AWS integrations with dashed arrows.

```mermaid
flowchart LR
    Code["Pull request"] --> Checks["GitHub Actions checks"]
    Checks -.-> Registry["Planned ECR image publishing via GitHub OIDC"]
    Registry -.-> Release["Reviewed staging overlay pins image digests"]
    Release --> Argo["Argo CD manual full sync"]
    Argo --> Migration["PreSync Job runs Prisma migrations"]
    Migration -->|"Success gates rollout"| Workloads["EKS storefront and API deployments"]
    Migration -.-> DB[("Planned private RDS PostgreSQL")]
    Workloads -.-> DB
    Ingress["Planned ALB and HTTPS"] -.-> Workloads
    Workloads -.-> Telemetry["Planned Prometheus and Grafana"]
```

## Five-minute project walkthrough

Run these steps from the repository root. The first Docker build may take longer.

1. **Start the local stack.** Run `docker compose up --build -d`, then `docker compose ps -a`. The migration service should exit with code 0, and the API and storefront should become healthy.
2. **Place an order.** Open [the storefront](http://localhost:5173), sign in with the [demo customer account](#demo-accounts), add a product, and check out using a Chennai PIN beginning with `600`. Record the order ID. Switch to the demo administrator and locate the same order in the orders view to see that both roles work against persisted data.
3. **Check API health.** Open [liveness](http://localhost:4000/health) and [database readiness](http://localhost:4000/ready). In the Kubernetes manifests, liveness checks the API process and readiness determines whether the API can receive traffic. You can also inspect the [Swagger UI](http://localhost:4000/api-docs).
4. **Review the rollout.** Run `kubectl kustomize deploy/eks/base`. Find the two Deployments, two Services, and the Prisma migration Job. Check that the Job references the migrator Secret, the API references its own Secret, and the Job has the Argo CD `PreSync` annotation. This review works without an AWS account.
5. **Trace the release checks.** Open the [application CI workflow](./.github/workflows/ci.yml) to see PostgreSQL-backed integration tests. Then open the [EKS checks workflow](./.github/workflows/eks-checks.yml) to see manifest rendering, API and storefront image builds, and the migration CLI check. See the [EKS runbook](./docs/EKS.md) for the staging prerequisites and failure scenarios to validate once a cluster is available.

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
- `infra/aws`: Terraform for the ECS Fargate deployment in Mumbai.
- `deploy/eks`: Kubernetes manifests, a Kustomize base, and Argo CD staging templates.
- `.github/workflows`: application CI with PostgreSQL integration tests and pull-request checks for the EKS manifests and container images.
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

## Deployment

- **Local demo.** Docker Compose starts Nginx, the API, and PostgreSQL. See [Docker Compose](#docker-compose).
- **AWS ECS Fargate.** The Terraform configuration targets Mumbai and uses a CloudFront-managed HTTPS hostname. See the [ECS deployment guide](./docs/DEPLOYMENT.md).
- **AWS EKS and Argo CD.** The Kubernetes foundation includes storefront and API deployments, internal services, health probes, and a Prisma migration Job. Argo CD runs migrations with a separate database role before a full sync rolls out the application. The staging template pins both images by digest and uses manual sync. See the [EKS deployment guide](./docs/EKS.md) for prerequisites and rollout steps.

Render the EKS base locally with `kubectl`. Rendering requires no cluster or AWS credentials.

```sh
kubectl kustomize deploy/eks/base
```

EKS Terraform provisioning, ECR publishing through GitHub OIDC, HTTPS ingress, managed secrets, Prometheus and Grafana, and AWS cost controls are planned stages. The Kubernetes foundation has not been deployed to AWS.

Use the seeded credentials and demo checkout only in local or disposable environments. A commercial launch still requires real payment processing, live dispatch and tracking, and operational support.

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
