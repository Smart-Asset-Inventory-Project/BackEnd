# AssetHub Backend

A Node.js + Express + Prisma API for asset lifecycle management, location and category management, related asset records, and spreadsheet imports.

## Features
- CommonJS backend setup
- Prisma schema with 21 UUID models and indexes
- JWT auth and middleware
- CRUD for locations, categories, and assets
- Multer + XLSX import flow
- Prisma migration and seed verification
- Standardized paginated list responses (`data` plus `meta.page`, `meta.limit`, `meta.total`, `meta.pages`)
- Protected dashboard analytics and risk queue
- Swagger UI at `/docs` and an importable Postman collection in `docs/postman.json`

## Setup
1. `npm install`
2. Copy `.env` to a deployment-specific environment and set `DATABASE_URL`,
   `JWT_SECRET`, and `JWT_REFRESH_SECRET`.
3. `npx prisma migrate deploy` (or `npx prisma db push` for a local SQLite
   development database).
4. `npx prisma db seed`
5. `npm start`

Every application route is available under the `/api` prefix (for example,
`/api/auth/login`, `/api/transfers`, and `/api/work-orders`). The original
unprefixed routes remain available for backward compatibility.

## Development and tests
* `npm run dev` starts nodemon on port 3000.
* `npm test` runs the unit and integration suites in band.
* `npm run test:cov` runs the same suites with a coverage report.
* `npx prisma studio` opens the local database browser.

## Default seed admin
- Email: admin@assethub.local
- Password: Admin@123

## Routes
- GET /health
- POST /api/auth/register
- POST /api/auth/login
- GET /api/auth/me
- GET /api/locations
- POST /api/locations
- PUT /api/locations/:id
- DELETE /api/locations/:id
- GET /api/categories
- POST /api/categories
- PUT /api/categories/:id
- DELETE /api/categories/:id
- GET /api/assets
- POST /api/assets
- GET /api/assets/:id
- PUT /api/assets/:id
- DELETE /api/assets/:id
- POST /api/assets/import
- CRUD /api/suppliers
- CRUD /api/purchase-orders
- CRUD /api/invoices
- CRUD /api/warranties
- CRUD /api/custody-assignments
- CRUD /api/transfers
- CRUD /api/maintenance-templates
- CRUD /api/work-orders
- PUT /api/work-orders/:id/complete
- POST /api/retirements
- GET/POST /api/stocktake-sessions
- POST /api/stocktake-sessions/:id/observations
- PUT /api/stocktake-sessions/:id/complete
- GET /api/service-events
- GET /api/dashboard/summary (requires `dashboard:read`)
- GET /api/dashboard/counts-by-location
- GET /api/dashboard/counts-by-category
- GET /api/dashboard/warranty-expiry
- GET /api/dashboard/maintenance-due
- GET /api/dashboard/kpis
- GET /api/dashboard/risk-queue
- GET /docs

All list endpoints accept `page` (default 1) and `limit` (default 20,
maximum 100). Their response is `{ "data": [], "meta": { "page", "limit",
"total", "pages" } }`. Dashboard risk scores contain `score` and `reasons`;
the queue is limited to the top 50 active assets.

## Dashboard and risk rules

Dashboard routes require a token whose role has `dashboard:read`. Warranty
expiry is returned as the `expired`, `within7Days`, `within30Days`, and
`within90Days` count buckets. Maintenance due contains open/in-progress work
orders due during the next seven days.

Risk scores add 30 for maintenance due within seven days, 20 for a warranty
expiring within 30 days, 25 when age exceeds 80% of useful life, 30 for more
than three failed completed work orders in the last six months, and 25 when
repair cost exceeds 50% of purchase cost.

## API documentation

Open `/docs` for the Swagger UI. An importable Postman collection is available
at `docs/postman.json`.
