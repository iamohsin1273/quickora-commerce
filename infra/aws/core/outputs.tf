output "storefront_url" {
  description = "HTTPS URL on CloudFront's managed hostname; no custom domain is required."
  value       = "https://${aws_cloudfront_distribution.storefront.domain_name}"
}

output "web_bucket_name" {
  description = "Private S3 bucket used to publish the Vite build."
  value       = aws_s3_bucket.web.bucket
}

output "web_distribution_id" {
  description = "CloudFront distribution ID for storefront invalidations."
  value       = aws_cloudfront_distribution.storefront.id
}

output "api_repository_url" {
  description = "ECR repository for the production API container."
  value       = aws_ecr_repository.api.repository_url
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "database_bootstrap_task_definition" {
  description = "Run once after publishing the API image to create database roles and apply migrations."
  value       = aws_ecs_task_definition.database_bootstrap.arn
}

output "create_admin_task_definition" {
  description = "One-off task definition for creating the first administrator."
  value       = aws_ecs_task_definition.create_admin.arn
}

output "catalog_seed_task_definition" {
  description = "Optional task to initialize the product catalog and explicitly configured delivery PIN prefixes."
  value       = aws_ecs_task_definition.catalog_seed.arn
}

output "private_subnet_ids" {
  description = "Subnets for one-off ECS tasks."
  value       = aws_subnet.app[*].id
}

output "task_security_group_id" {
  description = "Security group for ECS services and controlled one-off tasks."
  value       = aws_security_group.tasks.id
}

output "admin_bootstrap_secret_arn" {
  description = "Secret metadata; add an ephemeral password value only when creating the first administrator."
  value       = aws_secretsmanager_secret.admin_bootstrap.arn
}

output "ecs_service_name" {
  value = aws_ecs_service.api.name
}

output "database_address" {
  value = aws_db_instance.postgres.address
}

output "budget_alert_enabled" {
  value = var.budget_alert_email != "" && var.budget_limit_usd > 0
}
