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
   `DATABASE_URL_UNPOOLED`, `JWT_SECRET`, and `JWT_REFRESH_SECRET`.
3. `npx prisma migrate deploy` against the intended PostgreSQL database.
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
- GET/POST /api/custody-assignments; GET/PUT /api/custody-assignments/:id (release)
- GET/POST /api/transfers; GET /api/transfers/:id (immutable history)
- CRUD /api/maintenance-templates
- GET/POST /api/work-orders; GET/PUT /api/work-orders/:id
- PUT /api/work-orders/:id/complete
- POST /api/retirements
- GET/POST /api/stocktake-sessions
- POST /api/stocktake-sessions/:id/observations
- PUT /api/stocktake-sessions/:id/complete
- GET/POST /api/service-events
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

Open `/swagger` (or `/docs`) for the Swagger UI. The generated OpenAPI document
is available at `/swagger.json`. Run `npm run swagger` to start the API and open
the Swagger UI automatically. An importable Postman collection is available at
`docs/postman.json`.

## Module contracts and verification

See [frontend integration](docs/frontend-integration.md), [endpoint reference](docs/api-reference.md), [OpenAPI](docs/openapi.json), and [PowerShell workflows](docs/test-workflows.ps1). Postman requests default to the local `/api` base and capture the login token automatically.

Integration tests require `TEST_DATABASE_URL`, a disposable PostgreSQL database with `test` in its name; there is no SQLite or production fallback. Every suite gets a random isolated schema, cleaned up afterward. The acceptance seed is destructive only within that isolated test schema. Configure the variable in your shell or an untracked `.env.test`, then run `npx.cmd prisma validate`, `npx.cmd prisma generate`, and `npm.cmd test`. On PowerShell with scripts disabled, use the `.cmd` executables.

Migration `20260922_maintenance_trigger` adds maintenance trigger type; apply it through the normal deployment process before deploying this code. The change has not been deployed or applied to production. Module mutations and audit records commit together. Historical transfers/custody/work orders cannot be deleted; referenced assets must be retired.

For manual API workflow testing, set a real `TEST_DATABASE_URL` and run `npm.cmd run test:server`. It prepares an isolated test schema and demo accounts, then listens on port 3000 until Ctrl+C. Run the PowerShell workflow script in a second terminal. `TEST_USER`/`TEST_PASSWORD` in earlier examples were placeholders, not working credentials.

### Configured local test database

An isolated PostgreSQL cluster is available on 127.0.0.1:55432. Its generated credentials are saved in ignored `.env.test`; data is in ignored `.test-postgres/`. Run `node scripts/local-test-db.js` to start it after a reboot. Remove any old shell override using `Remove-Item Env:TEST_DATABASE_URL -ErrorAction SilentlyContinue`, then run `npm.cmd test`. The full local suite passed: 35 tests across 11 suites. Manual PowerShell workflows also passed.

## Flutter backend review

See [Flutter integration](docs/flutter-integration.md) for token handling, response parsing, workflow order, local API access, and deployment prerequisites. The review fixes malformed-auth responses, deleted-user token access, invoice exposure through purchase-order reads, scoped imports/stocktakes, and Vercel temporary import files. Production deployment still requires the additive migration; durable attachment storage and an external maintenance scheduler remain deployment work.

## Trained risk model

See the [risk model Flutter guide](docs/risk-model-flutter-guide.md) for all four endpoints, request/response examples, permissions, Flutter code, training commands, and Vercel deployment steps. Import [risk model OpenAPI](docs/risk-model.openapi.json) or the updated Postman collection. This feature is separate from the existing rule-based dashboard risk queue.

The supplied 1,000-row CSV trains a random forest locally with Python. Its bundled JSON model runs predictions in Node.js on Vercel without Python. Retrain with `npm.cmd run model:train`, regenerate examples with `node scripts/generate-risk-docs.js`, test, and redeploy to update the hosted model. Hosted training is disabled. Local evaluation achieved 90% accuracy on 200 held-out rows; this does not establish real-world failure prediction accuracy. Asset prediction requires caller-provided labor hours because the database does not store them.
