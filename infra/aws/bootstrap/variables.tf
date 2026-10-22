variable "aws_region" {
  description = "AWS region for the Terraform state bucket."
  type        = string
  default     = "ap-south-1"
}

variable "environment" {
  description = "Environment label used for resource tags."
  type        = string
  default     = "production"
}
