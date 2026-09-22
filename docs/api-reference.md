# AssetHub module API reference

All routes below use `/api`. Send `Authorization: Bearer <accessToken>`. `Authenticated` means any authenticated user, subject to existing location scopes. ADMIN bypasses permission checks. PUT bodies are partial unless noted. Dates accept ISO strings. Monetary input is a JSON number; Prisma Decimal output is a string.

Lists accept integer `page` (default 1) and `limit` (default 20, maximum 100).

## Common errors

- `400`: Invalid body, pagination, hierarchy, dates, costs, or lifecycle transition.
- `401`: Missing, expired or invalid bearer token.
- `403`: Insufficient permission or location outside user scope.
- `404`: Resource or linked record not found.
- `409`: Duplicate identifier, active custody, protected history, referenced deletion, terminal work order, or concurrent write conflict.
- `500`: Unexpected server error.

Error envelope: `{"error":{"code":"VALIDATION_ERROR","message":"..."}}`. Creation returns 201; reads, updates and deletions return 200.

## GET /locations

Permission: `Authenticated`. Queries: page, limit, search, parentId, tree.

Request body: none.

Success `200`:

```json
{
  "data": [
    {
      "id": "example-id",
      "name": "Room 101",
      "code": "ROOM-101",
      "type": "room",
      "parentId": "{{parentLocationId}}",
      "address": "Main campus",
      "description": "Lab"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "pages": 1
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## GET /locations/{id}

Permission: `Authenticated`. Queries: none.

Request body: none.

Success `200`:

```json
{
  "data": {
    "id": "example-id",
    "name": "Room 101",
    "code": "ROOM-101",
    "type": "room",
    "parentId": "{{parentLocationId}}",
    "address": "Main campus",
    "description": "Lab"
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## POST /locations

Permission: `location:manage`. Queries: none.

Request (required: name, code):

```json
{
  "name": "Room 101",
  "code": "ROOM-101",
  "type": "room",
  "parentId": "{{parentLocationId}}",
  "address": "Main campus",
  "description": "Lab"
}
```

Success `201`:

```json
{
  "data": {
    "id": "example-id",
    "name": "Room 101",
    "code": "ROOM-101",
    "type": "room",
    "parentId": "{{parentLocationId}}",
    "address": "Main campus",
    "description": "Lab"
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## PUT /locations/{id}

Permission: `location:manage`. Queries: none.

Request (all fields optional):

```json
{
  "name": "Room 101",
  "code": "ROOM-101",
  "type": "room",
  "parentId": "{{parentLocationId}}",
  "address": "Main campus",
  "description": "Lab"
}
```

Success `200`:

```json
{
  "data": {
    "id": "example-id",
    "name": "Room 101",
    "code": "ROOM-101",
    "type": "room",
    "parentId": "{{parentLocationId}}",
    "address": "Main campus",
    "description": "Lab"
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## DELETE /locations/{id}

Permission: `location:manage`. Queries: none.

Request body: none.

Success `200`:

```json
{
  "data": {
    "deleted": true
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## GET /assets

Permission: `Authenticated`. Queries: page, limit, search, status, condition, categoryId, locationId.

Request body: none.

Success `200`:

```json
{
  "data": [
    {
      "id": "example-id",
      "name": "Laptop",
      "assetTag": "LAP-001",
      "serialNumber": "SN-001",
      "categoryId": "{{categoryId}}",
      "locationId": "{{locationId}}",
      "status": "ACTIVE",
      "condition": "GOOD",
      "purchaseDate": "2026-01-01",
      "purchaseCost": "1000",
      "usefulLifeYears": 5,
      "value": "1000",
      "model": "Model A",
      "metadata": "{\"department\":\"IT\"}"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "pages": 1
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## GET /assets/{id}

Permission: `Authenticated`. Queries: none.

Request body: none.

Success `200`:

```json
{
  "data": {
    "id": "example-id",
    "name": "Laptop",
    "assetTag": "LAP-001",
    "serialNumber": "SN-001",
    "categoryId": "{{categoryId}}",
    "locationId": "{{locationId}}",
    "status": "ACTIVE",
    "condition": "GOOD",
    "purchaseDate": "2026-01-01",
    "purchaseCost": "1000",
    "usefulLifeYears": 5,
    "value": "1000",
    "model": "Model A",
    "metadata": "{\"department\":\"IT\"}"
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## POST /assets

Permission: `asset:write`. Queries: none.

Request (required: name, assetTag, categoryId, locationId):

```json
{
  "name": "Laptop",
  "assetTag": "LAP-001",
  "serialNumber": "SN-001",
  "categoryId": "{{categoryId}}",
  "locationId": "{{locationId}}",
  "status": "ACTIVE",
  "condition": "GOOD",
  "purchaseDate": "2026-01-01",
  "purchaseCost": 1000,
  "usefulLifeYears": 5,
  "value": 1000,
  "model": "Model A",
  "metadata": {
    "department": "IT"
  }
}
```

Success `201`:

```json
{
  "data": {
    "id": "example-id",
    "name": "Laptop",
    "assetTag": "LAP-001",
    "serialNumber": "SN-001",
    "categoryId": "{{categoryId}}",
    "locationId": "{{locationId}}",
    "status": "ACTIVE",
    "condition": "GOOD",
    "purchaseDate": "2026-01-01",
    "purchaseCost": "1000",
    "usefulLifeYears": 5,
    "value": "1000",
    "model": "Model A",
    "metadata": "{\"department\":\"IT\"}"
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## PUT /assets/{id}

Permission: `asset:write`. Queries: none.

Request (all fields optional):

```json
{
  "name": "Laptop",
  "assetTag": "LAP-001",
  "serialNumber": "SN-001",
  "categoryId": "{{categoryId}}",
  "locationId": "{{locationId}}",
  "status": "ACTIVE",
  "condition": "GOOD",
  "purchaseDate": "2026-01-01",
  "purchaseCost": 1000,
  "usefulLifeYears": 5,
  "value": 1000,
  "model": "Model A",
  "metadata": {
    "department": "IT"
  }
}
```

Success `200`:

```json
{
  "data": {
    "id": "example-id",
    "name": "Laptop",
    "assetTag": "LAP-001",
    "serialNumber": "SN-001",
    "categoryId": "{{categoryId}}",
    "locationId": "{{locationId}}",
    "status": "ACTIVE",
    "condition": "GOOD",
    "purchaseDate": "2026-01-01",
    "purchaseCost": "1000",
    "usefulLifeYears": 5,
    "value": "1000",
    "model": "Model A",
    "metadata": "{\"department\":\"IT\"}"
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## DELETE /assets/{id}

Permission: `asset:delete`. Queries: none.

Request body: none.

Success `200`:

```json
{
  "data": {
    "deleted": true
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## GET /suppliers

Permission: `Authenticated`. Queries: page, limit, search.

Request body: none.

Success `200`:

```json
{
  "data": [
    {
      "id": "example-id",
      "name": "Example Supplier",
      "email": "sales@example.com",
      "phone": "+201000000000",
      "address": "Cairo"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "pages": 1
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## GET /suppliers/{id}

Permission: `Authenticated`. Queries: none.

Request body: none.

Success `200`:

```json
{
  "data": {
    "id": "example-id",
    "name": "Example Supplier",
    "email": "sales@example.com",
    "phone": "+201000000000",
    "address": "Cairo"
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## POST /suppliers

Permission: `procurement:manage`. Queries: none.

Request (required: name):

```json
{
  "name": "Example Supplier",
  "email": "sales@example.com",
  "phone": "+201000000000",
  "address": "Cairo"
}
```

Success `201`:

```json
{
  "data": {
    "id": "example-id",
    "name": "Example Supplier",
    "email": "sales@example.com",
    "phone": "+201000000000",
    "address": "Cairo"
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## PUT /suppliers/{id}

Permission: `procurement:manage`. Queries: none.

Request (all fields optional):

```json
{
  "name": "Example Supplier",
  "email": "sales@example.com",
  "phone": "+201000000000",
  "address": "Cairo"
}
```

Success `200`:

```json
{
  "data": {
    "id": "example-id",
    "name": "Example Supplier",
    "email": "sales@example.com",
    "phone": "+201000000000",
    "address": "Cairo"
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## DELETE /suppliers/{id}

Permission: `procurement:manage`. Queries: none.

Request body: none.

Success `200`:

```json
{
  "data": {
    "deleted": true
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## GET /purchase-orders

Permission: `Authenticated`. Queries: page, limit, status.

Request body: none.

Success `200`:

```json
{
  "data": [
    {
      "id": "example-id",
      "orderNumber": "PO-001",
      "supplierId": "{{supplierId}}",
      "assetId": "{{assetId}}",
      "status": "DRAFT",
      "orderDate": "2026-01-01",
      "totalAmount": "1000",
      "metadata": "{}"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "pages": 1
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## GET /purchase-orders/{id}

Permission: `Authenticated`. Queries: none.

Request body: none.

Success `200`:

```json
{
  "data": {
    "id": "example-id",
    "orderNumber": "PO-001",
    "supplierId": "{{supplierId}}",
    "assetId": "{{assetId}}",
    "status": "DRAFT",
    "orderDate": "2026-01-01",
    "totalAmount": "1000",
    "metadata": "{}"
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## POST /purchase-orders

Permission: `procurement:manage`. Queries: none.

Request (required: orderNumber, supplierId):

```json
{
  "orderNumber": "PO-001",
  "supplierId": "{{supplierId}}",
  "assetId": "{{assetId}}",
  "status": "DRAFT",
  "orderDate": "2026-01-01",
  "totalAmount": 1000,
  "metadata": {}
}
```

Success `201`:

```json
{
  "data": {
    "id": "example-id",
    "orderNumber": "PO-001",
    "supplierId": "{{supplierId}}",
    "assetId": "{{assetId}}",
    "status": "DRAFT",
    "orderDate": "2026-01-01",
    "totalAmount": "1000",
    "metadata": "{}"
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## PUT /purchase-orders/{id}

Permission: `procurement:manage`. Queries: none.

Request (all fields optional):

```json
{
  "orderNumber": "PO-001",
  "supplierId": "{{supplierId}}",
  "assetId": "{{assetId}}",
  "status": "DRAFT",
  "orderDate": "2026-01-01",
  "totalAmount": 1000,
  "metadata": {}
}
```

Success `200`:

```json
{
  "data": {
    "id": "example-id",
    "orderNumber": "PO-001",
    "supplierId": "{{supplierId}}",
    "assetId": "{{assetId}}",
    "status": "DRAFT",
    "orderDate": "2026-01-01",
    "totalAmount": "1000",
    "metadata": "{}"
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## DELETE /purchase-orders/{id}

Permission: `procurement:manage`. Queries: none.

Request body: none.

Success `200`:

```json
{
  "data": {
    "deleted": true
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## GET /invoices

Permission: `procurement:manage`. Queries: page, limit, status.

Request body: none.

Success `200`:

```json
{
  "data": [
    {
      "id": "example-id",
      "invoiceNumber": "INV-001",
      "purchaseOrderId": "{{purchaseOrderId}}",
      "supplierId": "{{supplierId}}",
      "amount": "1000",
      "issueDate": "2026-01-01",
      "dueDate": "2026-02-01",
      "status": "UNPAID",
      "metadata": "{}"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "pages": 1
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## GET /invoices/{id}

Permission: `procurement:manage`. Queries: none.

Request body: none.

Success `200`:

```json
{
  "data": {
    "id": "example-id",
    "invoiceNumber": "INV-001",
    "purchaseOrderId": "{{purchaseOrderId}}",
    "supplierId": "{{supplierId}}",
    "amount": "1000",
    "issueDate": "2026-01-01",
    "dueDate": "2026-02-01",
    "status": "UNPAID",
    "metadata": "{}"
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## POST /invoices

Permission: `procurement:manage`. Queries: none.

Request (required: invoiceNumber, amount, issueDate):

```json
{
  "invoiceNumber": "INV-001",
  "purchaseOrderId": "{{purchaseOrderId}}",
  "supplierId": "{{supplierId}}",
  "amount": 1000,
  "issueDate": "2026-01-01",
  "dueDate": "2026-02-01",
  "status": "UNPAID",
  "metadata": {}
}
```

Success `201`:

```json
{
  "data": {
    "id": "example-id",
    "invoiceNumber": "INV-001",
    "purchaseOrderId": "{{purchaseOrderId}}",
    "supplierId": "{{supplierId}}",
    "amount": "1000",
    "issueDate": "2026-01-01",
    "dueDate": "2026-02-01",
    "status": "UNPAID",
    "metadata": "{}"
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## PUT /invoices/{id}

Permission: `procurement:manage`. Queries: none.

Request (all fields optional):

```json
{
  "invoiceNumber": "INV-001",
  "purchaseOrderId": "{{purchaseOrderId}}",
  "supplierId": "{{supplierId}}",
  "amount": 1000,
  "issueDate": "2026-01-01",
  "dueDate": "2026-02-01",
  "status": "UNPAID",
  "metadata": {}
}
```

Success `200`:

```json
{
  "data": {
    "id": "example-id",
    "invoiceNumber": "INV-001",
    "purchaseOrderId": "{{purchaseOrderId}}",
    "supplierId": "{{supplierId}}",
    "amount": "1000",
    "issueDate": "2026-01-01",
    "dueDate": "2026-02-01",
    "status": "UNPAID",
    "metadata": "{}"
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## DELETE /invoices/{id}

Permission: `procurement:manage`. Queries: none.

Request body: none.

Success `200`:

```json
{
  "data": {
    "deleted": true
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## GET /warranties

Permission: `Authenticated`. Queries: page, limit, assetId.

Request body: none.

Success `200`:

```json
{
  "data": [
    {
      "id": "example-id",
      "assetId": "{{assetId}}",
      "provider": "Manufacturer",
      "startDate": "2026-01-01",
      "endDate": "2027-01-01",
      "terms": "Parts and labor"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "pages": 1
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## GET /warranties/{id}

Permission: `Authenticated`. Queries: none.

Request body: none.

Success `200`:

```json
{
  "data": {
    "id": "example-id",
    "assetId": "{{assetId}}",
    "provider": "Manufacturer",
    "startDate": "2026-01-01",
    "endDate": "2027-01-01",
    "terms": "Parts and labor"
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## POST /warranties

Permission: `procurement:manage`. Queries: none.

Request (required: assetId, startDate, endDate):

```json
{
  "assetId": "{{assetId}}",
  "provider": "Manufacturer",
  "startDate": "2026-01-01",
  "endDate": "2027-01-01",
  "terms": "Parts and labor"
}
```

Success `201`:

```json
{
  "data": {
    "id": "example-id",
    "assetId": "{{assetId}}",
    "provider": "Manufacturer",
    "startDate": "2026-01-01",
    "endDate": "2027-01-01",
    "terms": "Parts and labor"
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## PUT /warranties/{id}

Permission: `procurement:manage`. Queries: none.

Request (all fields optional):

```json
{
  "assetId": "{{assetId}}",
  "provider": "Manufacturer",
  "startDate": "2026-01-01",
  "endDate": "2027-01-01",
  "terms": "Parts and labor"
}
```

Success `200`:

```json
{
  "data": {
    "id": "example-id",
    "assetId": "{{assetId}}",
    "provider": "Manufacturer",
    "startDate": "2026-01-01",
    "endDate": "2027-01-01",
    "terms": "Parts and labor"
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## DELETE /warranties/{id}

Permission: `procurement:manage`. Queries: none.

Request body: none.

Success `200`:

```json
{
  "data": {
    "deleted": true
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## GET /custody-assignments

Permission: `Authenticated`. Queries: page, limit, assetId, active.

Request body: none.

Success `200`:

```json
{
  "data": [
    {
      "id": "example-id",
      "assetId": "{{assetId}}",
      "userId": "{{userId}}",
      "assignedAt": "2026-01-01T00:00:00Z",
      "notes": "Issued to user"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "pages": 1
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## GET /custody-assignments/{id}

Permission: `Authenticated`. Queries: none.

Request body: none.

Success `200`:

```json
{
  "data": {
    "id": "example-id",
    "assetId": "{{assetId}}",
    "userId": "{{userId}}",
    "assignedAt": "2026-01-01T00:00:00Z",
    "notes": "Issued to user"
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## POST /custody-assignments

Permission: `custody:manage`. Queries: none.

Request (required: assetId, userId):

```json
{
  "assetId": "{{assetId}}",
  "userId": "{{userId}}",
  "assignedAt": "2026-01-01T00:00:00Z",
  "notes": "Issued to user"
}
```

Success `201`:

```json
{
  "data": {
    "id": "example-id",
    "assetId": "{{assetId}}",
    "userId": "{{userId}}",
    "assignedAt": "2026-01-01T00:00:00Z",
    "notes": "Issued to user"
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## PUT /custody-assignments/{id}

Permission: `custody:manage`. Queries: none.

Request (required: returnedAt):

```json
{
  "returnedAt": "2026-09-22T09:00:00Z",
  "notes": "Returned"
}
```

Success `200`:

```json
{
  "data": {
    "id": "example-id",
    "assetId": "{{assetId}}",
    "userId": "{{userId}}",
    "assignedAt": "2026-01-01T00:00:00Z",
    "notes": "Issued to user"
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## GET /transfers

Permission: `Authenticated`. Queries: page, limit, assetId.

Request body: none.

Success `200`:

```json
{
  "data": [
    {
      "id": "example-id",
      "assetId": "{{assetId}}",
      "toLocationId": "{{destinationLocationId}}",
      "reason": "Move to lab"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "pages": 1
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## GET /transfers/{id}

Permission: `Authenticated`. Queries: none.

Request body: none.

Success `200`:

```json
{
  "data": {
    "id": "example-id",
    "assetId": "{{assetId}}",
    "toLocationId": "{{destinationLocationId}}",
    "reason": "Move to lab"
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## POST /transfers

Permission: `transfer:manage`. Queries: none.

Request (required: assetId, toLocationId):

```json
{
  "assetId": "{{assetId}}",
  "toLocationId": "{{destinationLocationId}}",
  "reason": "Move to lab"
}
```

Success `201`:

```json
{
  "data": {
    "id": "example-id",
    "assetId": "{{assetId}}",
    "toLocationId": "{{destinationLocationId}}",
    "reason": "Move to lab"
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## GET /maintenance-templates

Permission: `Authenticated`. Queries: page, limit.

Request body: none.

Success `200`:

```json
{
  "data": [
    {
      "id": "example-id",
      "name": "Monthly inspection",
      "categoryId": "{{categoryId}}",
      "triggerType": "TIME_BASED",
      "frequencyDays": 30,
      "tasks": "[\"Inspect cables\",\"Check operation\"]",
      "description": "Monthly checks"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "pages": 1
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## GET /maintenance-templates/{id}

Permission: `Authenticated`. Queries: none.

Request body: none.

Success `200`:

```json
{
  "data": {
    "id": "example-id",
    "name": "Monthly inspection",
    "categoryId": "{{categoryId}}",
    "triggerType": "TIME_BASED",
    "frequencyDays": 30,
    "tasks": "[\"Inspect cables\",\"Check operation\"]",
    "description": "Monthly checks"
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## POST /maintenance-templates

Permission: `maintenance:manage`. Queries: none.

Request (required: name):

```json
{
  "name": "Monthly inspection",
  "categoryId": "{{categoryId}}",
  "triggerType": "TIME_BASED",
  "frequencyDays": 30,
  "tasks": [
    "Inspect cables",
    "Check operation"
  ],
  "description": "Monthly checks"
}
```

Success `201`:

```json
{
  "data": {
    "id": "example-id",
    "name": "Monthly inspection",
    "categoryId": "{{categoryId}}",
    "triggerType": "TIME_BASED",
    "frequencyDays": 30,
    "tasks": "[\"Inspect cables\",\"Check operation\"]",
    "description": "Monthly checks"
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## PUT /maintenance-templates/{id}

Permission: `maintenance:manage`. Queries: none.

Request (all fields optional):

```json
{
  "name": "Monthly inspection",
  "categoryId": "{{categoryId}}",
  "triggerType": "TIME_BASED",
  "frequencyDays": 30,
  "tasks": [
    "Inspect cables",
    "Check operation"
  ],
  "description": "Monthly checks"
}
```

Success `200`:

```json
{
  "data": {
    "id": "example-id",
    "name": "Monthly inspection",
    "categoryId": "{{categoryId}}",
    "triggerType": "TIME_BASED",
    "frequencyDays": 30,
    "tasks": "[\"Inspect cables\",\"Check operation\"]",
    "description": "Monthly checks"
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## DELETE /maintenance-templates/{id}

Permission: `maintenance:manage`. Queries: none.

Request body: none.

Success `200`:

```json
{
  "data": {
    "deleted": true
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## GET /work-orders

Permission: `Authenticated`. Queries: page, limit, status, priority, assetId, assignedToUserId, scheduledFrom, scheduledTo.

Request body: none.

Success `200`:

```json
{
  "data": [
    {
      "id": "example-id",
      "assetId": "{{assetId}}",
      "templateId": "{{templateId}}",
      "assignedToUserId": "{{userId}}",
      "title": "Inspect laptop",
      "description": "Check connections",
      "priority": "MEDIUM",
      "status": "OPEN",
      "dueDate": "2026-10-01T09:00:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "pages": 1
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## GET /work-orders/{id}

Permission: `Authenticated`. Queries: none.

Request body: none.

Success `200`:

```json
{
  "data": {
    "id": "example-id",
    "assetId": "{{assetId}}",
    "templateId": "{{templateId}}",
    "assignedToUserId": "{{userId}}",
    "title": "Inspect laptop",
    "description": "Check connections",
    "priority": "MEDIUM",
    "status": "OPEN",
    "dueDate": "2026-10-01T09:00:00Z"
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## POST /work-orders

Permission: `workorder:manage`. Queries: none.

Request (required: assetId, title):

```json
{
  "assetId": "{{assetId}}",
  "templateId": "{{templateId}}",
  "assignedToUserId": "{{userId}}",
  "title": "Inspect laptop",
  "description": "Check connections",
  "priority": "MEDIUM",
  "status": "OPEN",
  "dueDate": "2026-10-01T09:00:00Z"
}
```

Success `201`:

```json
{
  "data": {
    "id": "example-id",
    "assetId": "{{assetId}}",
    "templateId": "{{templateId}}",
    "assignedToUserId": "{{userId}}",
    "title": "Inspect laptop",
    "description": "Check connections",
    "priority": "MEDIUM",
    "status": "OPEN",
    "dueDate": "2026-10-01T09:00:00Z"
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## PUT /work-orders/{id}

Permission: `workorder:manage`. Queries: none.

Request (all fields optional):

```json
{
  "status": "IN_PROGRESS"
}
```

Success `200`:

```json
{
  "data": {
    "id": "example-id",
    "assetId": "{{assetId}}",
    "templateId": "{{templateId}}",
    "assignedToUserId": "{{userId}}",
    "title": "Inspect laptop",
    "description": "Check connections",
    "priority": "MEDIUM",
    "status": "OPEN",
    "dueDate": "2026-10-01T09:00:00Z"
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## GET /locations/tree

Permission: `Authenticated`. Queries: none.

Request body: none.

Success `200`:

```json
{
  "data": []
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## GET /assets/{id}/history

Permission: `Authenticated`. Queries: none.

Request body: none.

Success `200`:

```json
{
  "data": [
    {
      "type": "transfer",
      "action": "TRANSFERRED",
      "at": "2026-09-22T09:00:00Z",
      "data": {
        "assetId": "asset-id",
        "fromLocationId": "old-id",
        "toLocationId": "new-id"
      }
    }
  ]
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## GET /warranties/expiring

Permission: `Authenticated`. Queries: page, limit, days.

Request body: none.

Success `200`:

```json
{
  "data": [
    {
      "id": "example-id",
      "assetId": "{{assetId}}",
      "provider": "Manufacturer",
      "startDate": "2026-01-01",
      "endDate": "2027-01-01",
      "terms": "Parts and labor"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "pages": 1
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## GET /work-orders/due

Permission: `Authenticated`. Queries: page, limit.

Request body: none.

Success `200`:

```json
{
  "data": [
    {
      "id": "example-id",
      "assetId": "{{assetId}}",
      "templateId": "{{templateId}}",
      "assignedToUserId": "{{userId}}",
      "title": "Inspect laptop",
      "description": "Check connections",
      "priority": "MEDIUM",
      "status": "OPEN",
      "dueDate": "2026-10-01T09:00:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "pages": 1
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## PUT /work-orders/{id}/complete

Permission: `workorder:manage`. Queries: none.

Request (all fields optional):

```json
{
  "laborCost": 100,
  "partsCost": 50,
  "downtimeHours": 2,
  "outcome": "Fixed",
  "notes": "Replaced cable"
}
```

Success `200`:

```json
{
  "data": {
    "id": "work-order-id",
    "status": "COMPLETED",
    "completedAt": "2026-09-22T09:00:00Z",
    "serviceEvents": [
      {
        "workOrderId": "{{workOrderId}}",
        "laborCost": "100",
        "partsCost": "50",
        "downtimeHours": 2,
        "outcome": "Fixed",
        "notes": "Replaced cable",
        "cost": "150"
      }
    ]
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## GET /service-events

Permission: `Authenticated`. Queries: page, limit, workOrderId.

Request body: none.

Success `200`:

```json
{
  "data": [
    {
      "id": "example-id",
      "workOrderId": "{{workOrderId}}",
      "laborCost": "100",
      "partsCost": "50",
      "downtimeHours": 2,
      "outcome": "Fixed",
      "notes": "Replaced cable",
      "cost": "150"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "pages": 1
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.

## POST /service-events

Permission: `workorder:manage`. Queries: none.

Request (required: workOrderId):

```json
{
  "workOrderId": "{{workOrderId}}",
  "laborCost": 100,
  "partsCost": 50,
  "downtimeHours": 2,
  "outcome": "Fixed",
  "notes": "Replaced cable"
}
```

Success `201`:

```json
{
  "data": {
    "id": "example-id",
    "workOrderId": "{{workOrderId}}",
    "laborCost": "100",
    "partsCost": "50",
    "downtimeHours": 2,
    "outcome": "Fixed",
    "notes": "Replaced cable",
    "cost": "150"
  }
}
```

Errors: `400`, `401`, `403`, `404`, `409`, `500` as defined above.
