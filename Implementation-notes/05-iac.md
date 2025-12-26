# Infrastructure as Code (IaC) Notes

## 🏗️ Terraform Setup
We use **Terraform** to provision our AWS infrastructure. This ensures our environment is reproducible and documented in code (`terraform/main.tf`).

## ☁️ Resources Provisioned

### 1. Networking & Security
*   **VPC**: Uses `aws_default_vpc` (simplifies setup for this scale).
*   **Security Groups**:
    *   `app_sg`:
        *   **Ingress**: Ports 22 (SSH), 80 (HTTP), 443 (HTTPS), 3000 (App Direct - dev use).
        *   **Egress**: All traffic allowed.
    *   **db_sg**:
        *   **Ingress**: Port 5432 (Postgres) allowed **ONLY** from `app_sg`.
        *   *Security*: The database is effectively firewalled from the internet.

### 2. Compute (EC2)
*   **Resource**: `aws_instance` ("Nesh-Knowledge-Service-App").
*   **AMI**: Ubuntu 22.04 LTS (Jammy).
*   **Size**: `t3.micro` (Free tier eligible, sufficient for Node.js app).
*   **User Data Script**:
    *   Automatically installs `docker.io` and `docker-compose-v2` on first boot.
    *   Creates the default app user/directories.
    *   *Benefit*: The server comes up "ready to deploy".

### 3. Database (RDS)
*   **Resource**: `aws_db_instance`.
*   **Engine**: Postgres 16.6.
*   **Access**: `publicly_accessible = false`. The DB resides in private subnets or is restricted by SG.
*   **Extensions**: We manually enabled `pgvector` on this instance after creation (or via a custom db parameter group if advanced).

### 4. Storage (S3)
*   **Resource**: `aws_s3_bucket` (`rag-knowledge-docs-*`).
*   **Purpose**: Stores the raw PDF files.
*   **Lifecycle**: `force_destroy = true` allowed for dev environments to clean up easily.

## 🔑 Variable Management
We use `variables.tf` (implied in single file) to handle sensitive inputs like `db_password`. In a real pipeline, these are passed via `terraform.tfvars` or environment variables (`TF_VAR_db_password`).
