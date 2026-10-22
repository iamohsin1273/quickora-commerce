provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Application = "quickora"
      ManagedBy   = "terraform"
      Environment = var.environment
    }
  }
}

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Application = "quickora"
      ManagedBy   = "terraform"
      Environment = var.environment
    }
  }
}

provider "random" {}

data "aws_caller_identity" "current" {}
data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  name                  = "quickora-${var.environment}"
  availability_zones    = slice(data.aws_availability_zones.available.names, 0, 2)
  api_image             = "${aws_ecr_repository.api.repository_url}:${var.api_image_tag}"
  web_origin            = "https://${aws_cloudfront_distribution.storefront.domain_name}"
  app_database_url      = "postgresql://quickora_app:${random_password.app_db.result}@${aws_db_instance.postgres.address}:${aws_db_instance.postgres.port}/${var.database_name}?schema=public&sslmode=verify-full&sslrootcert=%2Fetc%2Fssl%2Fcerts%2Frds-global-bundle.pem"
  migrator_database_url = "postgresql://quickora_migrator:${random_password.migrator_db.result}@${aws_db_instance.postgres.address}:${aws_db_instance.postgres.port}/${var.database_name}?schema=public&sslmode=verify-full&sslrootcert=%2Fetc%2Fssl%2Frds-global-bundle.pem"
}
