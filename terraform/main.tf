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
    cidr_blocks = ["0.0.0.0/0"] # WARNING: In production, restrict to your IP
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
