# CI/CD: Automated Deployment Strategy

## 🤖 The Pipeline
We use **GitHub Actions** to automate the delivery of code from the repository to the Production EC2 server.
*   **Workflow File**: `.github/workflows/deploy.yml`
*   **Trigger**: Push to `main` branch.

## 🔄 Workflow Steps

### 1. Build Phase (CI)
Run on `ubuntu-latest` runner.
1.  **Checkout Code**: Pulls the latest code.
2.  **Docker Login**: Authenticates with Docker Hub using secrets.
3.  **Build & Push**:
    *   Builds the Docker image from the root `Dockerfile`.
    *   Tags it as `nesh-knowledge-service:latest`.
    *   Pushes to Docker Registry.
    *   *Why?* This ensures the artifact deployed is immutable. We don't build on the server; we ship the binary (image).

### 2. Deployment Phase (CD)
We use `ssh-action` to connect to the EC2 instance and orchestrate the update.

1.  **Prepare Server**:
    *   Ensures `/home/ubuntu/app` directory exists.
    *   Fixes permissions.
2.  **Copy Configs**:
    *   It copies `docker-compose.prod.yml`, `nginx/` folder, and `init-letsencrypt.sh` to the server using `scp-action`.
    *   *Note*: The code itself is NOT copied. Only the config to run the Docker image is needed.
3.  **Inject Secrets**:
    *   The workflow dynamically creates a `.env` file on the server.
    *   It populates it with GitHub Secrets (`GEMINI_API_KEY`, `DB_PASSWORD`, etc.).
    *   *Security Benefit*: Secrets are never committed to git, and they exist on the server only as long as they are needed (or persisted in the file for the app to read).
4.  **Restart Services**:
    *   `docker compose pull`: Downloads the new image we just built.
    *   `docker compose up -d`: Replaces the running container with the new one.
    *   `docker image prune`: Cleans up old disk space.

## 🐳 Docker Deployment Strategy
We use `docker-compose.prod.yml` for production.
*   **Restart Policy**: `always` (Containers auto-start on boot).
*   **Networking**: Defines an internal bridge network so Nginx can talk to the App, but the App isn't exposed directly.
