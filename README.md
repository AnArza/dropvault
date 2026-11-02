# DropVault

**Self-hosted file sharing with expiring links, optional passwords, and download limits.**

Built with React, TypeScript, Django REST Framework, PostgreSQL, Nginx, and Docker Compose.

## Features

- Drag-and-drop uploads (up to 20 MiB per file)
- Random shareable links, expiring after 1 hour, 24 hours, or 7 days
- Per-link download limits, including one-time and unlimited downloads
- Optional password protection
- Automatic access blocking when a link expires or reaches its limit
- Private download statistics accessible with a separate management key
- Periodic cleanup of expired or exhausted files
- Persistent files and database data across container restarts

## Getting started

Requires Docker and Docker Compose v2 (Docker Desktop works on macOS and Windows).

```bash
cp .env.example .env
# Review .env and change the example secrets before deploying anywhere public.
docker compose up --build -d
docker compose ps -a
```

Open **http://localhost:8091**. Change `DROPVAULT_PORT` in `.env` if that port is already occupied, then run `docker compose up -d` again.

The API is available via Nginx at **http://localhost:8091/api/**. The backend's port 8000 is internal to Docker and is **not** published on your host.

### Services

| Service | Purpose |
|---|---|
| `nginx` | Serves the built React app and proxies `/api/` to Django |
| `backend` | Django REST API running with Gunicorn |
| `db` | PostgreSQL metadata and counters |
| `cleanup` | Periodic removal of expired or exhausted files |

The `nginx` service is built from `frontend/Dockerfile`. That Dockerfile first compiles React with Node.js, then puts the built static assets into an Nginx image. The `cleanup` service runs a separate process from the **same backend image** and shares the upload volume and database.

Files and PostgreSQL data persist in the `uploaded_files` and `postgres_data` Docker volumes. `docker compose down` stops services without deleting these volumes; **do not use `docker compose down -v` unless you intend to erase uploaded files and database data.**

## Usage

1. Upload a file and select link expiration and download limit.
2. Optionally enter a password.
3. Copy the generated share URL and send it to the recipient.
4. Open **My uploads** in the originating browser to see download counts and link status.

Management keys are stored only in the uploading browser's local storage. Clearing its data will lose access to private statistics for previously uploaded files.

Download counts track the start of a file transfer, not confirmation that it finished.

## API

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health/` | Health check |
| `POST` | `/api/files/` | Multipart upload; returns a share token and one-time management key |
| `GET` | `/api/shares/{token}/` | Public metadata and availability |
| `POST` | `/api/shares/{token}/download/` | Download file, with optional JSON password |
| `GET` | `/api/files/{token}/stats/` | Private stats; requires `X-Manage-Key` header |

Upload fields: `file` (required, max 20 MiB), `expires_in_hours` (`1`, `24`, `168`), `max_downloads` (1–100, optional), and `password` (optional, minimum 4 characters).

Example:

```bash
curl -F "file=@README.md" -F "expires_in_hours=1" -F "max_downloads=1" \
  http://localhost:8091/api/files/
```

The response includes the public `token`, `share_path`, and the private `manage_key`.

```bash
curl -X POST -H 'Content-Type: application/json' -d '{}' \
  http://localhost:8091/api/shares/TOKEN/download/ -OJ

curl -H 'X-Manage-Key: MANAGEMENT_KEY' \
  http://localhost:8091/api/files/TOKEN/stats/
```

## Maintenance

The `cleanup` service starts with Docker Compose and runs:

```bash
python manage.py cleanup_expired --loop --interval 60
```

Every 60 seconds it removes file contents that are no longer downloadable while retaining statistics in PostgreSQL. It does not run while Docker is stopped. For a one-time scan:

```bash
docker compose exec backend python manage.py cleanup_expired
```

To check service status and logs:

```bash
docker compose ps -a
docker compose logs --tail=100 nginx backend
docker compose logs --tail=50 cleanup
curl -i http://localhost:8091/api/health/
```

The health endpoint should return HTTP 200 and `{"status":"ok"}`.

### Troubleshooting

**Another application appears at localhost:** Check that you are using `localhost:8091`. A separate service on host port 8000 is not DropVault's backend. View the actual host port bindings with `docker compose ps -a` or `docker ps --format 'table {{.Names}}\t{{.Ports}}'`.

**Port already allocated:** Set a different `DROPVAULT_PORT` in `.env` and run `docker compose up -d`. For example, `8092`.

**500 or 502 from Nginx:** Inspect `docker compose logs --tail=100 nginx backend` and test `curl -i http://localhost:8091/api/health/`. If the API responds but the homepage returns 500, check that `frontend/nginx/default.conf` includes `root /usr/share/nginx/html;` and `index index.html;`, then rebuild the Nginx image with `docker compose up -d --build nginx`. If the API fails, check backend and database startup logs.

**Containers are not running:** `docker compose up --build -d` starts the entire stack. Check `docker compose ps -a` for exited containers and `docker compose logs --tail=100` for startup errors.

## Development and tests

Backend tests can run using a temporary SQLite test database, without starting PostgreSQL:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
USE_SQLITE=1 DJANGO_DEBUG=1 python manage.py test
```

With the Compose stack running:

```bash
docker compose exec backend python manage.py test
```

Build the frontend:

```bash
cd frontend
npm install
npm run build
```

For frontend-only development, `npm run dev` launches Vite; its default `/api` proxy expects DropVault's Nginx at `http://localhost:8091`.

## Docker Hub and GitHub

Create a public GitHub repository and push the project source:

```bash
git init
git add .
git commit -m "Initial DropVault implementation"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/dropvault.git
git push -u origin main
```

For Docker Hub, set `DOCKERHUB_USERNAME` in `.env`, then run:

```bash
docker login
docker compose build
docker compose push backend nginx
```

This publishes two images: `YOUR_USERNAME/dropvault-backend:1.0` and `YOUR_USERNAME/dropvault-frontend:1.0`. The cleanup service reuses the backend image.

## Security notes

DropVault is configured for local access by default (`127.0.0.1:8091`). It is not configured for public hosting out of the box. Before opening it to the internet, add HTTPS, stronger shared rate limiting, storage quotas, file scanning, appropriate retention policies, and operational monitoring. Passwords are hashed and files are only served after Django's access checks; however, stored files are not end-to-end encrypted. Keep `.env` and management keys private.

The project is licensed under MIT. See [LICENSE](LICENSE) and [DESIGN.md](DESIGN.md) for implementation details.
