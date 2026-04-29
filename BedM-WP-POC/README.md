# Bed Management Portal POC

Proof-of-concept web portal for daily bed availability updates and SDO/provincial dashboard views. The app intentionally stores bed availability only; it does not store patient identifiers or patient-level data.

## Tech Stack

- Node.js built-in HTTP server
- Vanilla HTML/CSS/JavaScript frontend
- JSON file persistence for the POC: `data/db.json`
- PBKDF2 password hashing
- HMAC-signed JWT-style bearer tokens
- Excel source extraction script for the supplied LTC/PCH workbooks

This is dependency-light so it can run locally without installing packages or provisioning PostgreSQL. A production version should move persistence to PostgreSQL/Prisma or an approved organizational data platform.

## Data Source

The supplied workbook ZIP was extracted to `source-data/`. The generated `data/sourceSites.json` contains the workbook-derived site list:

- 5 SDOs
- 124 LTC/PCH sites
- 9,623 licensed beds

At seed/launch, every generated bed defaults to `OCCUPIED`.

## Setup

```powershell
npm run seed
npm start
```

Open:

```text
http://localhost:3000
```

If port 3000 is already in use:

```powershell
$env:PORT="3001"; npm start
```

## Sample Login Accounts

All sample accounts use:

```text
Password123!
```

- `site.user@example.com`
- `sdo.user@example.com`
- `provincial.user@example.com`
- `admin.user@example.com`

## Routes

- `/login`
- `/beds`
- `/dashboard/sdo`
- `/dashboard/provincial`
- `/admin`

## Environment Variables

Copy `.env.example` as needed for deployment configuration.

```env
DATABASE_URL="json-file://./data/db.json"
JWT_SECRET="replace-with-secure-secret"
JWT_EXPIRES_IN="8h"
APP_ENV="development"
PORT="3000"
```

Do not use the default `JWT_SECRET` outside local POC testing.

## Rebuilding Source Data

If the Excel files in `source-data/` change, regenerate the normalized source file:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\extract-xlsx.ps1 -SourceDir .\source-data | Set-Content -LiteralPath .\data\sourceSites.json -Encoding UTF8
Remove-Item .\data\db.json
npm run seed
```

## Security Notes

- Authentication is required for API data.
- Role and site/SDO authorization checks are enforced on the backend.
- Site users can update only directly assigned sites.
- SDO users can view only assigned SDOs.
- Provincial users can view provincial dashboards but cannot edit beds unless granted site access.
- Bed status changes write audit rows with previous status, new status, user ID, timestamp, and source.
- Passwords are hashed with PBKDF2 for the POC.

## Known POC Limitations

- Final PHIA compliance requires privacy, legal, and security review.
- JSON file persistence is for demonstration only.
- SSO, MFA, HTTPS termination, CSRF strategy, and formal audit review should be added before production.
- Dashboards reflect manually updated bed status.
- Admin create/edit forms are not implemented yet; the admin page provides the required POC overview of users, sites, beds, and audit logs.
- No patient data should be added to this POC.
