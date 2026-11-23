# Quickora on Amazon EKS

This is a staged deployment track for the Node.js 22 / Express / Prisma 7 API,
React / Nginx storefront and PostgreSQL 16 database. The existing
[Amazon ECS deployment](DEPLOYMENT.md) has its own Terraform root and state.

## Stage 1 — workload contract

Render with `kubectl kustomize deploy/eks/base`. The base is input for a release
overlay. Before syncing, create the `quickora` namespace, resolve both image
names to registry digests, and configure the dependencies below. Keep the API
deployment and migration job on the same API digest. Run a full Argo CD sync
so the migration hook executes before the deployments roll. Use the existing
database bootstrap procedure to establish the roles and grants before the
first sync. The hook only runs committed Prisma migrations.

After publishing, copy `deploy/eks/argocd/kustomization.yaml.example` to
`deploy/eks/overlays/staging/kustomization.yaml` and fill in the ECR names and
`sha256:…` digests. The Argo CD Application example expects that overlay to
be merged on `main`. Review the rendered overlay and apply the AppProject and
Application only after the target namespace and prerequisites are ready.

| Object in `quickora` | Required values |
| --- | --- |
| ConfigMap `quickora-runtime` | `WEB_ORIGIN` set to the storefront HTTPS origin |
| Secret `quickora-api` | `DATABASE_URL` for the runtime role, `JWT_SECRET` |
| Secret `quickora-migrator` | `DATABASE_URL` for the migrator role |

Use RDS TLS with full hostname verification and the CA bundle already shipped
in the API image. The storefront image expects a same-namespace Service named
`api` at port 4000. Keep that Service and the web Service internal. HTTPS
ingress should preserve the public host and route API requests directly to the
API Service so forwarded headers have a single, controlled proxy boundary.
Verify login cookies and forwarded client IPs before opening public access.
Rate limiting currently uses process-local state, so shared rate limiting or
edge rate limits are a prerequisite for public multi-replica operation.
The current storefront image uses the standard Nginx image on port 80.
A non-root storefront image is needed before enforcing restricted Pod Security
on the namespace.

Verify a first sync against disposable PostgreSQL, a failed migration blocking
rollout, a successful retry, database outage behavior, and HTTPS login and
checkout. A Git revert can restore image digests. Database migrations must stay
compatible with the previous release during rollout and recovery.

## Remaining implementation stages

1. **Terraform**. Create a separate EKS root and state key in Mumbai. Plan
   a private API endpoint with explicit access entries and an operator access
   path, managed EC2 nodes across availability zones, private RDS, and separate
   immutable ECR repositories for both images. Decide whether RDS is new or
   shared before any plan that references existing data. Review IAM, network
   flows and Terraform state access with the plan.
2. **Release and GitOps**. Publish both images from protected GitHub Actions
   jobs using a repository- and environment-scoped AWS OIDC role. Gate
   publishing on CI, image scanning and provenance. Promote image digests by
   pull request. Install pinned Argo CD and AWS Load Balancer Controller,
   configure an ACM certificate and DNS, and restrict the Argo CD project to the
   Quickora namespace and repository. Supply secrets before the first sync
   through a secrets controller using scoped EKS Pod Identity. Keep initial
   sync and pruning manual until rollout and recovery checks pass.
3. **Observability**. Add HTTP request rate, error rate and latency metrics
   with bounded route labels. Scrape metrics privately with Prometheus and
   chart them in Grafana. Collect structured logs keyed by request ID and
   exclude credentials and customer data. Alert on sustained 5xx responses,
   latency, database saturation and failed syncs. Verify alerts with controlled
   staging failures before considering distributed tracing.
4. **Cost controls**. Estimate separate monthly demo and resilient profiles
   before provisioning. Include the control plane, nodes, NAT or endpoints,
   ALB, RDS, registry and telemetry. Configure explicit node pool limits,
   finite log retention, ECR cleanup that preserves rollback images, and
   monthly budget alerts. Budget alerts are advisory. A demo teardown should
   remove ingress and its load balancer before the cluster and verify backups
   and any retained billable resources.

Approval is required before creating paid resources, pushing these changes to
GitHub, enabling automated production sync, or migrating existing data.
