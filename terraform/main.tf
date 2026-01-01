provider "aws" {
  region = "us-east-2" # Ohio
}

# --- AMI Lookup ---
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# --- Networking ---
resource "aws_default_vpc" "default" {
  tags = {
    Name = "Default VPC"
  }
}

resource "aws_default_subnet" "default_az1" {
  availability_zone = "us-east-2a"
}

resource "aws_default_subnet" "default_az2" {
  availability_zone = "us-east-2b"
}

# --- Storage (S3) ---
resource "aws_s3_bucket" "knowledge_bucket" {
  bucket_prefix = "rag-knowledge-docs-" # Prefix requires unique generation
  force_destroy = true # Allow terraform destroy to delete even if not empty (for demo/dev)

  tags = {
    Name        = "Knowledge Docs"
    Environment = "Dev"
  }
}

# --- SNS Topic for S3 Events ---
resource "aws_sns_topic" "s3_upload_notifications" {
  name = "s3-upload-notifications"

  tags = {
    Name        = "S3 Upload Notifications"
    Environment = "Dev"
  }
}

# SNS Topic Policy to allow S3 to publish
resource "aws_sns_topic_policy" "s3_upload_policy" {
  arn = aws_sns_topic.s3_upload_notifications.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "s3.amazonaws.com"
        }
        Action   = "SNS:Publish"
        Resource = aws_sns_topic.s3_upload_notifications.arn
        Condition = {
          ArnLike = {
            "aws:SourceArn" = aws_s3_bucket.knowledge_bucket.arn
          }
        }
      }
    ]
  })
}

# S3 Bucket Notification Configuration
resource "aws_s3_bucket_notification" "upload_notifications" {
  bucket = aws_s3_bucket.knowledge_bucket.id

  topic {
    topic_arn = aws_sns_topic.s3_upload_notifications.arn
    events    = ["s3:ObjectCreated:*"]
    filter_prefix = "" # Monitor all folders
    filter_suffix = ".pdf" # Only PDF files
  }

  depends_on = [aws_sns_topic_policy.s3_upload_policy]
}

# SNS Subscription to Webhook Endpoint
# Using domain name to match SSL certificate (Let's Encrypt cert is for domain, not IP)
resource "aws_sns_topic_subscription" "webhook_subscription" {
  topic_arn = aws_sns_topic.s3_upload_notifications.arn
  protocol  = "https"
  endpoint  = "https://${aws_instance.app_server.public_ip}.nip.io/api/webhook/s3-upload"

  # Set this to false to require manual confirmation
  endpoint_auto_confirms = false
}

# --- Security Groups ---
resource "aws_security_group" "app_sg" {
  name        = "rag_app_sg"
  description = "Allow Web and SSH traffic"
  vpc_id      = aws_default_vpc.default.id

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Application"
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "db_sg" {
  name        = "rag_db_sg"
  description = "Allow Postgres traffic from App"
  vpc_id      = aws_default_vpc.default.id

  ingress {
    description     = "Postgres from App"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.app_sg.id]
  }
}

# --- EC2 Instance (App) ---
resource "aws_instance" "app_server" {
  ami           = data.aws_ami.ubuntu.id
  instance_type = "t3.micro"
  key_name      = var.key_name

  subnet_id                   = aws_default_subnet.default_az1.id
  vpc_security_group_ids      = [aws_security_group.app_sg.id]
  associate_public_ip_address = true

  user_data = <<-EOF
              #!/bin/bash
              apt-get update
              apt-get install -y docker.io docker-compose-v2
              usermod -aG docker ubuntu
              mkdir -p /home/ubuntu/app
              chown -R ubuntu:ubuntu /home/ubuntu/app
              EOF

  tags = {
    Name = "Nesh-Knowledge-Service-App"
  }
}

# --- RDS Instance (Database) ---
resource "aws_db_instance" "default" {
  allocated_storage      = 20
  db_name                = "knowledge_db"
  engine                 = "postgres"
  engine_version         = "16.6"
  instance_class         = "db.t3.micro"
  username               = var.db_username
  password               = var.db_password
  parameter_group_name   = "default.postgres16"
  skip_final_snapshot    = true
  publicly_accessible    = false
  vpc_security_group_ids = [aws_security_group.db_sg.id]
}

# --- Variables ---
variable "key_name" {
  description = "Name of the existing SSH key pair in AWS"
  type        = string
}

variable "db_username" {
  description = "Database master username"
  type        = string
  default     = "postgres"
}

variable "db_password" {
  description = "Database master password"
  type        = string
  sensitive   = true
}
