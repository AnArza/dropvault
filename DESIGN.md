# DropVault — technical design

## MVP boundaries

- Anonymous, single-file uploads; one share token per upload
- Files limited to 20 MiB each; 1/24/168-hour expiry choices
- Positive download limits or unlimited downloads
- Optional password protection; passwords are never returned by APIs
- Anonymous share links with no required user accounts
- Local deployment by default; public hosting needs additional hardening

## Data model

One PostgreSQL table, `vault_sharedfile`:

| Column | Type / role |
|---|---|
| `id` | BigAutoField primary key |
| `public_token` | Unique random URL-safe public share identifier |
| `manage_key_hash` | SHA-256 of a separate high-entropy management secret |
| `original_name` | Sanitized display/download filename |
| `file_size` | Size in bytes |
| `stored_file` | Relative path in persistent Docker volume |
| `password_hash` | Optional Django-generated password hash |
| `created_at`, `expires_at` | UTC timestamp metadata |
| `max_downloads` | Positive integer or NULL = unlimited |
| `download_count` | Integer number of download starts |
| `deleted_at` | Null until storage blob is removed |

`public_token` goes in the share URL; the separate raw `manage_key` is **only returned on upload** and cached in the creator's browser for the private statistics endpoint. Management keys do not belong in shared URLs.

## API contracts

- `POST /api/files/` (multipart): fields `file`, `expires_in_hours`, optional `max_downloads`, optional `password`. Response HTTP 201: file metadata, `share_path`, raw `manage_key`.
- `GET /api/shares/{token}/`: public file metadata, `active` Boolean, `inactive_reason`, `remaining_downloads` (null = unlimited), `password_required` Boolean.
- `POST /api/shares/{token}/download/` (JSON): optional `password`. Response HTTP 200 streamed `application/octet-stream` download, 403 invalid password, 404 unknown token, or 410 expired/exhausted/deleted file.
- `GET /api/files/{token}/stats/`: send `X-Manage-Key` header; response HTTP 200 metadata + `download_count`, `file_deleted`; 403 if key wrong.
- `GET /api/health/`: health check for Compose.

## Download concurrency

Backend verifies the optional password and then acquires a PostgreSQL row lock using `select_for_update()` in a transaction. It **rechecks** expiry/download limits after taking the lock, opens the file, increments `download_count`, commits, and returns the response. This avoids exceeding `max_downloads` under concurrent requests. Download counts reflect **starts**, not confirmed completed transfers.

## Cleanup

`python manage.py cleanup_expired --loop --interval 60` runs in a separate container from the same backend image. Every minute it finds expired or fully consumed links, locks each row, deletes the file from the shared volume, and sets `deleted_at` while retaining statistics. Since Nginx does not expose the upload directory, downloads always go through Django access rules.

## Deployment

- **nginx**: multi-stage Node 22 build; Nginx serves assets and proxies `/api/` to `backend:8000`.
- **backend**: Gunicorn + Django/DRF; receives uploads, enforces download controls, connects to PostgreSQL, stores bytes in `uploaded_files` volume.
- **db**: PostgreSQL 16 with `postgres_data` volume.
- **cleanup**: same backend image and environment, with the same upload volume, periodic cleanup command.

The only host-exposed port is `127.0.0.1:8091` by default. Compose runs migrations automatically before launching Gunicorn. Backend/cleanup share the image and uploaded-file volume.

## Security limitations

Rate limiting is based on Django's in-memory cache by default; with multiple Gunicorn workers, this is not a strong distributed protection. Public internet deployments should add a shared rate-limit backend, TLS, malware scanning, quotas, and an account/admin policy. The system deliberately does not claim end-to-end encryption, multi-region resilience, or production-level abuse resistance.
