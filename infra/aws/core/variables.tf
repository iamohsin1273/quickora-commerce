variable "aws_region" {
  description = "Deployment region."
  type        = string
  default     = "ap-south-1"
}

variable "environment" {
  description = "Short environment name used in resource names."
  type        = string
  default     = "production"
  validation {
    condition     = can(regex("^[a-z0-9-]{2,16}$", var.environment))
    error_message = "environment must be 2-16 lowercase letters, digits, or hyphens."
  }
}

variable "vpc_cidr" {
  description = "Private IPv4 address range for the application VPC."
  type        = string
  default     = "10.42.0.0/16"
}

variable "database_name" {
  description = "Initial PostgreSQL database name."
  type        = string
  default     = "quickora"
  validation {
    condition     = can(regex("^[a-z][a-z0-9_]{1,30}$", var.database_name))
    error_message = "database_name must be a lowercase PostgreSQL identifier."
  }
}

variable "delivery_pin_prefixes" {
  description = "Comma-separated PIN prefixes this store serves; set real service areas before catalog initialization."
  type        = string
  default     = ""
}

variable "delivery_zone_city" {
  description = "City recorded for delivery zones created by the optional catalog initialization task."
  type        = string
  default     = ""
}

variable "delivery_zone_state" {
  description = "State recorded for delivery zones created by the optional catalog initialization task."
  type        = string
  default     = ""
}

variable "db_instance_class" {
  description = "RDS PostgreSQL instance class. Multi-AZ is enabled."
  type        = string
  default     = "db.t4g.medium"
}

variable "db_engine_version" {
  description = "PostgreSQL major version supported by the Prisma schema."
  type        = string
  default     = "16"
}

variable "api_image_tag" {
  description = "Immutable API container image tag to deploy after pushing it to ECR."
  type        = string
  default     = "bootstrap"
}

variable "api_desired_count" {
  description = "Minimum API service capacity. Keep at zero until the first image and database migration are ready."
  type        = number
  default     = 0
  validation {
    condition     = var.api_desired_count >= 0 && floor(var.api_desired_count) == var.api_desired_count
    error_message = "api_desired_count must be a non-negative integer."
  }
}

variable "api_cpu" {
  description = "Fargate task CPU units for each API task."
  type        = number
  default     = 512
}

variable "api_memory" {
  description = "Fargate task memory in MiB for each API task."
  type        = number
  default     = 1024
}

variable "budget_limit_usd" {
  description = "Monthly AWS budget alert threshold; set to 0 to disable the budget."
  type        = number
  default     = 300
}

variable "budget_alert_email" {
  description = "Optional email for monthly budget alerts. AWS sends a confirmation email."
  type        = string
  default     = ""
}

variable "cloudfront_rate_limit_per_5m" {
  description = "Maximum requests per source IP in a rolling five-minute CloudFront WAF window."
  type        = number
  default     = 1200
}

variable "auth_rate_limit_per_5m" {
  description = "Maximum login and registration requests per source IP in a rolling five-minute WAF window."
  type        = number
  default     = 80
}
