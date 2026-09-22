# Frontend integration

Production API: `https://assethub-backend.vercel.app/api`.
The changes in this checkout require deployment and the maintenance-trigger migration before production exposes the new behavior.

## Login and tokens

```js
const baseUrl = 'https://assethub-backend.vercel.app/api';
const response = await fetch(`${baseUrl}/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@assethub.local', password: 'Admin@123' })
});
const result = await response.json();
if (!response.ok) throw new Error(result.error.message);
let accessToken = result.data.accessToken;
const assets = await fetch(`${baseUrl}/assets?page=1&limit=10`, {
  headers: { Authorization: `Bearer ${accessToken}` }
});
```

Keep the access token in application memory and clear it on logout. Avoid persistent localStorage for bearer tokens. Use the existing `/auth/refresh` API with `{ "refreshToken": "..." }` to rotate tokens, or ask the user to log in again on 401. Never put tokens in URLs. Handle 403 separately from 401.

Responses use `{ "data": {...} }`; lists also contain `meta: { page, limit, total, pages }`. Errors use `{ "error": { "code", "message" } }`. Decimal money values are returned as strings; send nonnegative JSON numbers in requests. Timestamps are ISO strings.

## Endpoints

All paths below are relative to the base URL. Read requests require authentication; invoice reads also require `procurement:manage`. User location scope is enforced on inventory and operational records. ADMIN bypasses permission checks.

| Resource | Methods | Write permission | List filters beyond page/limit |
| --- | --- | --- | --- |
| `/locations` | GET, POST; GET/PUT/DELETE `/{id}` | `location:manage` | search, parentId, tree |
| `/assets` | GET, POST; GET/PUT/DELETE `/{id}` | `asset:write`; delete: `asset:delete` | search, status, condition, categoryId, locationId |
| `/suppliers` | GET, POST; GET/PUT/DELETE `/{id}` | `procurement:manage` | search (name/email/phone) |
| `/purchase-orders` | GET, POST; GET/PUT/DELETE `/{id}` | `procurement:manage` | status |
| `/invoices` | GET, POST; GET/PUT/DELETE `/{id}` | `procurement:manage` | status |
| `/warranties` | GET, POST; GET/PUT/DELETE `/{id}` | `procurement:manage` | assetId |
| `/custody-assignments` | GET, POST; GET/PUT `/{id}` | `custody:manage` | assetId, active=true/false |
| `/transfers` | GET, POST; GET `/{id}` | `transfer:manage` | assetId |
| `/maintenance-templates` | GET, POST; GET/PUT/DELETE `/{id}` | `maintenance:manage` | none |
| `/work-orders` | GET, POST; GET/PUT `/{id}` | `workorder:manage` | status, priority, assetId, assignedToUserId, scheduledFrom, scheduledTo |
| `/service-events` | GET, POST | `workorder:manage` | workOrderId |

Additional reads: `/locations/tree`, `/assets/{id}/history`, `/warranties/expiring?days=30`, `/work-orders/due`. Completion: `PUT /work-orders/{id}/complete` with `workorder:manage`.

See [API reference](api-reference.md) for every request body, success example, permission and error response; [OpenAPI](openapi.json) and [Postman](postman.json) contain the same endpoint contracts. PUT is a partial update. Omit optional links rather than sending placeholder IDs. Service creation also accepts optional `eventDate`, `technician`, and `cost`; supplied cost must equal labor plus parts.

## Values and rules

- Location types, case-insensitive: campus, building, college, floor, room, office, LOCATION (legacy generic type). Named levels follow campus → building → college → floor → room/office; intermediate levels can be omitted. Cycles and reversed levels are rejected. Generic locations retain legacy flexibility.
- Asset status and condition remain free-form strings for existing data compatibility. Seed examples include ACTIVE/RETIRED and GOOD; filters match stored values exactly. Tags and non-null serial numbers are unique. Use null for unknown serial numbers.
- Purchase status: DRAFT, APPROVED, ORDERED, RECEIVED, CANCELLED. `orderNumber` is the reference number; `orderDate` is the stored purchase date.
- Invoice status: UNPAID, PAID, OVERDUE, CANCELLED. Link a supplier or purchase order; when both are supplied, suppliers must match. Due date cannot precede issue date.
- Warranty end date must follow start date. Historical expired warranties are allowed. Compare endDate to the current time for expiry; `/warranties/expiring` returns future expirations within `days`.
- Template triggerType: TIME_BASED or MANUAL. TIME_BASED requires positive integer frequencyDays. Checklist is `tasks` (string or array of strings); arrays are stored and returned as JSON text. Parse that text when rendering checkboxes. Description and categoryId are optional.
- Priority: LOW, MEDIUM, HIGH, CRITICAL. Status: OPEN, ASSIGNED, IN_PROGRESS, COMPLETED, CANCELLED. `assignedToUserId` identifies a technician/responsible user. The existing schema does not restrict assignment to a particular role. `dueDate` is the scheduling field; scheduledFrom/scheduledTo filter it inclusively.
- Service outcome is a nonempty free-form string, default `completed`. Labor, parts, total and downtimeHours cannot be negative. Total is stored in `cost` using decimal arithmetic.
- POST returns 201; GET/PUT/DELETE return 200. Invalid rules return 400, missing links 404, duplicates/protected deletes/terminal edits/concurrent writes 409. On a concurrent-write 409, refresh the record before retrying.

## Workflow order

1. Create category (existing `/categories` API), location, then asset. Asset PUT changes descriptive fields; use the workflows below for location and custodian changes.
2. Transfer: POST `/transfers` with `{ "assetId": "...", "toLocationId": "...", "reason": "Move to lab" }`. The API derives source location and actor and atomically updates inventory. Read the asset and its history afterward. Same-location transfers fail. Transfers preserve custody; their history cannot be edited/deleted.
3. Custody: POST `/custody-assignments` with `{ "assetId": "...", "userId": "...", "notes": "Issued" }`. Duplicate active assignments return 409. Release using PUT `/{id}` with `{ "returnedAt": "<current ISO timestamp>", "notes": "Returned" }`, then assign again if needed. Actor is recorded in the atomic audit log. The schema supports users, not responsible units. Historical assignments cannot be deleted.
4. Procurement: create supplier → purchase order → invoice; link warranty to asset. An invoiced purchase order cannot switch suppliers or be deleted; referenced suppliers cannot be deleted.
5. Maintenance: create template → create OPEN work order → PUT status ASSIGNED (requires assignedToUserId) → IN_PROGRESS → PUT `/complete` with `{ "laborCost": 100, "partsCost": 50, "downtimeHours": 2, "outcome": "Fixed" }`. Completion atomically records service, completion date and audit. OPEN may also move directly to IN_PROGRESS. Any nonterminal status may move to CANCELLED. COMPLETED and CANCELLED are terminal. Generic PUT status COMPLETED also creates a zero-cost service event; use `/complete` to include costs.
6. Add additional service with POST `/service-events` linked to the work order. Cancelled work orders reject service. Work-order deletion is blocked to preserve history. Templates with work orders cannot be deleted.

Locations with references cannot be deleted. Assets with procurement, maintenance, custody, transfer or other related history cannot be deleted; use the existing retirement workflow. Audit records survive deletion of otherwise unreferenced assets.

## Local verification

Use a disposable PostgreSQL database whose name contains `test`. Set TEST_DATABASE_URL locally; never use the production connection. Each integration suite creates a random isolated schema and drops only that schema afterward. The test role needs schema creation/drop privileges. The acceptance seed runs only inside its isolated schema.

```powershell
Set-Location 'D:\2nd Term Subjects\assethub-backend_lasttt\assethub-backend'
$env:TEST_DATABASE_URL = Read-Host 'Enter the real connection URL for your disposable PostgreSQL test database'
npx.cmd prisma validate
npx.cmd prisma generate
npm.cmd test
```

`.cmd` avoids the local PowerShell script execution-policy restriction and runs the same npm/npx commands. Alternatively put TEST_DATABASE_URL in an untracked `.env.test`.

For API workflow checks, start a local server configured against a disposable PostgreSQL database, then run:

```powershell
powershell -ExecutionPolicy Bypass -File .\docs\test-workflows.ps1 -BaseUrl 'http://localhost:3000/api'
```

The script creates records and leaves their history for inspection. It deliberately refuses the production hostname. The additive migration `20260922_maintenance_trigger` must be applied with `npx.cmd prisma migrate deploy` as part of the normal deployment process. No production migration was run for this task.

### Troubleshooting test startup

P1000 with user TEST_USER means the documentation placeholders were used literally. They are not an account created by AssetHub. Obtain real credentials for a separate PostgreSQL database whose name contains test (for example assethub_test). Do not use the production Neon database. Prisma validate/generate do not prove that database credentials work.

After setting a real TEST_DATABASE_URL, run npm.cmd test. Automated tests start Express through Supertest and do not need port 3000.

For manual workflows, run npm.cmd run test:server in the same terminal with TEST_DATABASE_URL set. This command creates a random isolated schema, prepares demo accounts in that schema, and starts Express at http://localhost:3000/api. Wait for the ready message, then run docs/test-workflows.ps1 from a second terminal. Stop with Ctrl+C to clean up the temporary schema. A forced process kill can leave that isolated schema behind. Production is never used as a fallback.
