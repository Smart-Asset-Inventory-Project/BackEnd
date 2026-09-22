# Flutter integration with the reviewed backend

Production base URL: `https://assethub-backend.vercel.app/api`.
The code in this branch is not automatically the deployed production version. Apply the additive Prisma migration and deploy the branch through the normal release process before relying on its new behavior.

## Request sequence

1. POST `/auth/login` with `{"email":"admin@assethub.local","password":"Admin@123"}` for the seeded demo account.
2. Read `data.accessToken`, `data.refreshToken`, and `data.user.role.permissions` from the response.
3. Send `Authorization: Bearer <accessToken>` on protected requests. Render UI actions using permissions; the server remains authoritative.
4. On 401, perform one serialized POST `/auth/refresh` with `{"refreshToken":"..."}`, save both returned tokens, and retry once. If refresh fails, clear the session and show login. Do not refresh on 403.
5. Keep access tokens in memory and use OS-backed secure storage if refresh tokens must survive app restarts. Do not log tokens or put them in URLs.

## Response handling

- Successful single-resource responses: `{"data": {...}}`.
- Lists: `{"data": [], "meta": {"page":1,"limit":20,"total":0,"pages":0}}`.
- Errors: `{"error":{"code":"...","message":"..."}}`.
- Read `response.statusCode` before decoding a success model. Expect 201 for creation and 200 for successful reads/updates/deletes.
- Monetary Prisma Decimal values are JSON strings; use `num.parse(value.toString())` for display or a decimal representation for money calculations. Send JSON numbers for monetary input.
- IDs are strings. Optional fields may be null. Dates are ISO strings. Use UTC when sending timestamps.
- Maintenance `tasks` is returned as JSON text when submitted as a checklist array. Asset metadata is also stored as text.
- Build query strings with `Uri` queryParameters so spaces and special characters are encoded correctly.

## Workflow contracts

See [frontend guide](frontend-integration.md) and [endpoint reference](api-reference.md) for all bodies, enums and permissions.

- Change asset locations through POST `/transfers`, not asset PUT. The backend sets source location and actor, preserves custody, and records history atomically.
- Assign through POST `/custody-assignments`; release with PUT `/{id}` and returnedAt. Duplicate active custody returns 409.
- Create supplier, then purchase order, then invoice. Fetch invoice details through `/invoices` with procurement:manage; purchase-order responses do not embed invoices.
- Create an OPEN work order, optionally move to ASSIGNED with assignedToUserId, then IN_PROGRESS, then PUT `/work-orders/{id}/complete`. Completion creates a service event and timestamp. Terminal work orders reject edits.
- Use GET `/assets/{id}/history` to display lifecycle records.

## Local testing

The isolated test API binds to 127.0.0.1:3000 and uses local PostgreSQL on port 55432. Flutter desktop on this machine can use `http://localhost:3000/api`. A physical device cannot reach the PC through its own localhost; use the deployed HTTPS API or deliberately configure a development server/network for device access.

```powershell
Remove-Item Env:TEST_DATABASE_URL -ErrorAction SilentlyContinue
node scripts/local-test-db.js
npm.cmd test
npm.cmd run test:server
```

API schema: `/swagger.json`; Swagger UI: `/docs` or `/swagger`. Postman: [postman.json](postman.json).

## Deployment limits

- Apply migration `20260922_maintenance_trigger` before deploying this code. No production migration is run by tests or this review.
- File attachments still require durable shared storage for reliable Vercel deployment. Local filesystem attachment storage is not durable between serverless invocations. Spreadsheet imports use temporary files and delete them afterward.
- Vercel disables the in-process scheduler; scheduled maintenance generation needs a separately configured scheduled job.
- No Flutter application repository was supplied or changed; this review covers the backend contract.
