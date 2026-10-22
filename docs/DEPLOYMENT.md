# Deployment

## Local development

Run `docker compose up --build`. Compose starts PostgreSQL, applies development
migrations and demo seed data, then serves the storefront and API. The web
container is available on port 5173, the API on 4000, and PostgreSQL on 5432.
The demo seed and demo payment option are for local development only.

## AWS production foundation

The Terraform configuration in `infra\aws\` describes a production-oriented
AWS deployment in `ap-south-1` (Mumbai). It does not create resources until an
operator authenticates to AWS and explicitly runs `terraform apply`.

The public entry point is CloudFront's managed `*.cloudfront.net` HTTPS hostname;
a custom domain is not required. CloudFront serves the React build from a
private S3 bucket and forwards `/api/*` to an API Gateway HTTP API. A VPC Link
connects that API to an internal ALB and private ECS Fargate tasks. The ALB
rejects requests without CloudFront's origin header, so direct API Gateway
origin requests cannot bypass CloudFront's WAF. PostgreSQL is a private,
encrypted, Multi-AZ RDS instance. ECS tasks have no public IPs and use VPC
endpoints rather than NAT gateways. Secrets Manager, CloudWatch, WAF, ECR image
scanning, autoscaling, and optional email/budget alerts are included.

Terraform uses a separate S3 state-bucket bootstrap and a versioned, encrypted
remote core state with native S3 lockfiles (Terraform 1.10 or later). The core
state includes generated database credentials and secrets; restrict access to
the AWS account, state bucket, Terraform plans, and operator devices. Never
commit state, plan files, credentials, or `.tfvars` files.

### 1. Authenticate and create the state bucket

Configure an AWS IAM Identity Center (SSO) profile with access to the intended
AWS account. Do not use root credentials or commit an access key.

```powershell
aws configure sso --profile quickora-prod
aws sso login --profile quickora-prod
$env:AWS_PROFILE = "quickora-prod"
aws sts get-caller-identity
```

Check that the account ID is the intended production account. The following
bootstrap commands create only the encrypted, versioned Terraform state
bucket; they do not create the application stack:

```powershell
terraform -chdir=infra/aws/bootstrap init
terraform -chdir=infra/aws/bootstrap plan -out bootstrap.tfplan
terraform -chdir=infra/aws/bootstrap apply bootstrap.tfplan
$stateBucket = terraform -chdir=infra/aws/bootstrap output -raw state_bucket
```

Keep the bootstrap directory's local Terraform state in a secure location; it
contains the state-bucket resource metadata. Do not delete that bucket while
the production state is stored in it.

### 2. Configure and review the core stack

Copy the example variable files and edit the core values before planning:

```powershell
Copy-Item infra\aws\bootstrap\terraform.tfvars.example infra\aws\bootstrap\terraform.tfvars
Copy-Item infra\aws\core\terraform.tfvars.example infra\aws\core\terraform.tfvars
```

Set the core file's `budget_alert_email` to an inbox monitored by the
operations team. Configure `delivery_pin_prefixes`, `delivery_zone_city`, and
`delivery_zone_state` with the actual service area before running the optional
catalog initialization task. A sample value such as `600` is only a PIN-prefix
example, not an assertion about your delivery coverage. Review the RDS instance
class, API task size/count, budget, and rate limits for your traffic and cost
requirements. The provided `db.t4g.medium` is Multi-AZ and incurs ongoing
charges.

Initialize Terraform against the bootstrap bucket, then inspect the entire
plan. Terraform initialization and validation do not apply AWS resources.

```powershell
terraform -chdir=infra\aws\core init `
  -backend-config="bucket=$stateBucket" `
  -backend-config="key=quickora/production/terraform.tfstate" `
  -backend-config="region=ap-south-1" `
  -backend-config="encrypt=true" `
  -backend-config="use_lockfile=true"

terraform -chdir=infra\aws\core fmt -check
terraform -chdir=infra\aws\core validate
terraform -chdir=infra\aws\core plan -out production.tfplan
```

Review resource changes, account, region, and estimated charges. An AWS budget
is an alert, **not** a hard spending cap, and only exists when an alert email
and a positive budget limit are configured. CloudFront WAF must be provisioned
in `us-east-1`; the rest of the application stack is in `ap-south-1`.
Proceed with `terraform -chdir=infra\aws\core apply production.tfplan` only
after the account owner approves the plan. No AWS resources have been applied
by this repository setup.

### 3. Build and publish the API image

The first core apply creates ECR and ECS task definitions with the API service
at zero tasks. Build and push the API image with an immutable tag (for example,
the source commit SHA):

```powershell
$region = "ap-south-1"
$tag = git rev-parse --short HEAD
$repository = terraform -chdir=infra\aws\core output -raw api_repository_url
$registry = $repository.Split("/")[0]
aws ecr get-login-password --region $region |
  docker login --username AWS --password-stdin $registry
docker build -f apps\api\Dockerfile --tag "${repository}:$tag" .
docker push "${repository}:$tag"
```

Set `api_image_tag` to that tag in the core `.tfvars`, keep
`api_desired_count = 0`, then create and review a new plan and apply it. The API
image includes the Prisma CLI and the RDS CA bundle for controlled migration
and TLS-verified database connections. The normal API task receives only the
application DB role; RDS's managed master password is injected only into the
database initialization task.

### 4. Initialize the database with one-off ECS tasks

Run the `database_bootstrap_task_definition` once, using the ECS cluster from
Terraform output, Fargate launch type, private application subnets, the
`task_security_group_id`, and **Assign public IP: DISABLED**. The task creates
separate restricted application and schema-migration roles, sets database
privileges, and runs `prisma migrate deploy`. Wait for the task to stop and
confirm exit code `0` in ECS/CloudWatch before continuing. If it fails, inspect
the `database-bootstrap` log stream; do not start the API service against an
unmigrated database. The operation is safe to retry after correcting its
failure.

The schema does not create catalog content. If you have reviewed the supplied
sample catalog's names, prices, image sources, and initial inventory, set the
actual delivery settings in `.tfvars`, apply the updated task definition, then
run the `catalog_seed_task_definition` as a separate one-off task. It creates
the sample catalog and only the configured delivery PIN prefixes; it does not
create demo customer/admin accounts, orders, or promotional coupons. Adjust
stock and prices before accepting orders. Re-running it replaces the active
delivery-prefix set with the configured list. To use a different catalog,
populate it through the admin product tools or a reviewed import instead.

### 5. Create the first administrator and start the API

Create a strong, one-time administrator password in the AWS Secrets Manager
secret whose ARN is the `admin_bootstrap_secret_arn` Terraform output. Do not
put the password in a command-line argument, `.tfvars`, task log, or source
control. Run the `create_admin_task_definition` once in the same private
subnets/security group. Supply `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PHONE`
as ECS task environment overrides. Confirm the task exits successfully, then
replace the bootstrap secret value with a random throwaway value; the API does
not use this secret.

Set `api_desired_count = 2`, keep the approved immutable image tag, review and
apply the plan. This configures the service autoscaling minimum; autoscaling
controls the running count after initial creation. Start the first API tasks:

```powershell
$cluster = terraform -chdir=infra\aws\core output -raw ecs_cluster_name
$service = terraform -chdir=infra\aws\core output -raw ecs_service_name
aws ecs update-service --cluster $cluster --service $service --desired-count 2 --region ap-south-1
aws ecs wait services-stable --cluster $cluster --services $service --region ap-south-1
```

ECS can then scale the API service by CPU. Check the service has two healthy
tasks and `/ready` reports a connected database before proceeding.

### 6. Publish the storefront

Build from the repository root and upload only the generated static site to
the private web bucket:

```powershell
npm ci
npm run build
$bucket = terraform -chdir=infra\aws\core output -raw web_bucket_name
$distribution = terraform -chdir=infra\aws\core output -raw web_distribution_id
aws s3 sync apps\web\dist "s3://$bucket" --delete
aws cloudfront create-invalidation --distribution-id $distribution --paths "/*"
```

Use the `storefront_url` output for the public site. Verify both
`/api/v1/health` and `/api/v1/ready` through that hostname, then test customer
registration, sign-in, address/PIN serviceability, inventory, checkout, and
the admin workflow. CloudFront uses HTTPS and secure session cookies. The
API's demo payment option is hidden in production and rejected by the API;
cash on delivery remains available.

### Application launch requirements

This repository does **not** integrate a real online payment processor. Do not
advertise or enable card/UPI payments until a payment provider, signed webhook
verification, idempotency, refund handling, reconciliation, and production
tests are implemented. Delivery earnings are demo estimates; rider payout,
live delivery tracking, operational support, and production legal/privacy
content also require real integrations and review. The application seed
catalog, Chennai-oriented defaults, and stock counts are sample data, not a
verified live store assortment.

### Operations and removal

- Review CloudWatch API, task, database, and WAF logs; alarms and email alerts
  are created only when `budget_alert_email` is configured. Subscribe to SNS
  and budget confirmation messages.
- Set a backup/restore exercise, RDS retention and restore objectives, image
  release process, access review, incident contact, and alert response before
  public launch.
- VPC endpoints, WAF, API Gateway, CloudFront, ALB, Multi-AZ RDS, Fargate, and
  log retention all incur charges. Compare the full plan with the AWS Pricing
  Calculator; spending varies by region, requests, data transfer, and uptime.
- Do not run `terraform destroy` as routine cleanup. RDS deletion protection
  and final snapshots are enabled. Decommission only with explicit approval,
  verified backups/exports, and a data-retention decision; preserve the remote
  state bucket until the core stack is intentionally retired.
- The AWS deployment is separate from Docker Compose. Compose continues to be
  the local development environment.
