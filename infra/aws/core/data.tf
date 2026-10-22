resource "aws_db_subnet_group" "database" {
  name       = "${local.name}-database"
  subnet_ids = aws_subnet.database[*].id
}

resource "aws_db_instance" "postgres" {
  identifier                      = "${local.name}-postgres"
  engine                          = "postgres"
  engine_version                  = var.db_engine_version
  instance_class                  = var.db_instance_class
  allocated_storage               = 50
  max_allocated_storage           = 1000
  storage_type                    = "gp3"
  storage_encrypted               = true
  db_name                         = var.database_name
  username                        = "quickora_admin"
  manage_master_user_password     = true
  port                            = 5432
  db_subnet_group_name            = aws_db_subnet_group.database.name
  vpc_security_group_ids          = [aws_security_group.database.id]
  publicly_accessible             = false
  multi_az                        = true
  backup_retention_period         = 14
  backup_window                   = "18:00-19:00"
  maintenance_window              = "sun:19:00-sun:20:00"
  auto_minor_version_upgrade      = true
  deletion_protection             = true
  copy_tags_to_snapshot           = true
  performance_insights_enabled    = true
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
  apply_immediately               = false
  skip_final_snapshot             = false
  final_snapshot_identifier       = "${local.name}-final"

  depends_on = [
    aws_cloudwatch_log_group.database_postgresql,
    aws_cloudwatch_log_group.database_upgrade
  ]
}

resource "aws_cloudwatch_log_group" "database_postgresql" {
  name              = "/aws/rds/instance/${local.name}-postgres/postgresql"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "database_upgrade" {
  name              = "/aws/rds/instance/${local.name}-postgres/upgrade"
  retention_in_days = 30
}

resource "random_password" "app_db" {
  length  = 40
  special = false
}

resource "random_password" "migrator_db" {
  length  = 40
  special = false
}

resource "random_password" "jwt" {
  length  = 64
  special = false
}

resource "random_password" "origin_gate" {
  length  = 64
  special = false
}

resource "aws_secretsmanager_secret" "application" {
  name                    = "${local.name}/application"
  description             = "Quickora runtime and migration credentials."
  recovery_window_in_days = 30
}

resource "aws_secretsmanager_secret_version" "application" {
  secret_id = aws_secretsmanager_secret.application.id
  secret_string = jsonencode({
    DATABASE_URL               = local.app_database_url
    MIGRATOR_DATABASE_URL      = local.migrator_database_url
    APP_DATABASE_PASSWORD      = random_password.app_db.result
    MIGRATOR_DATABASE_PASSWORD = random_password.migrator_db.result
    JWT_SECRET                 = random_password.jwt.result
  })
}

resource "aws_secretsmanager_secret" "admin_bootstrap" {
  name                    = "${local.name}/admin-bootstrap"
  description             = "Short-lived password for the first administrator creation task."
  recovery_window_in_days = 7
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/quickora/${var.environment}/api"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "waf" {
  provider          = aws.us_east_1
  name              = "aws-waf-logs-quickora-${var.environment}"
  retention_in_days = 30
}

resource "aws_sns_topic" "alerts" {
  count = var.budget_alert_email == "" ? 0 : 1
  name  = "${local.name}-alerts"
}

resource "aws_sns_topic_subscription" "alerts_email" {
  count     = var.budget_alert_email == "" ? 0 : 1
  topic_arn = aws_sns_topic.alerts[0].arn
  protocol  = "email"
  endpoint  = var.budget_alert_email
}

resource "aws_cloudwatch_metric_alarm" "api_5xx" {
  count               = var.budget_alert_email == "" ? 0 : 1
  alarm_name          = "${local.name}-api-5xx"
  alarm_description   = "API Gateway is returning elevated server errors."
  namespace           = "AWS/ApiGateway"
  metric_name         = "5xx"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 10
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  dimensions = {
    ApiId = aws_apigatewayv2_api.api.id
    Stage = "$default"
  }
  alarm_actions = [aws_sns_topic.alerts[0].arn]
}

resource "aws_cloudwatch_metric_alarm" "database_cpu" {
  count               = var.budget_alert_email == "" ? 0 : 1
  alarm_name          = "${local.name}-database-cpu"
  alarm_description   = "RDS PostgreSQL CPU is above 80 percent."
  namespace           = "AWS/RDS"
  metric_name         = "CPUUtilization"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  dimensions = {
    DBInstanceIdentifier = aws_db_instance.postgres.identifier
  }
  alarm_actions = [aws_sns_topic.alerts[0].arn]
}

resource "aws_budgets_budget" "monthly" {
  count        = var.budget_alert_email != "" && var.budget_limit_usd > 0 ? 1 : 0
  name         = "${local.name}-monthly-cost"
  budget_type  = "COST"
  limit_amount = tostring(var.budget_limit_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.budget_alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.budget_alert_email]
  }
}
