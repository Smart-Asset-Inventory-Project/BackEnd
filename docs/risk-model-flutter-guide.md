# AssetHub risk prediction — Flutter handoff

## What is implemented

The supplied `smart_asset_final_dataset.csv` trains a random-forest classifier to predict **Low**, **Medium**, or **High** risk. Python trains offline; Express evaluates the exported model directly in Node.js. Flutter needs no Python or model file.

Production base URL: `https://assethub-backend.vercel.app/api`.
Local base URL: `http://localhost:3000/api`.
The new endpoints become available on production only after this code and `src/model/risk-model.json` are deployed. Local implementation and tests do not update Vercel.

The existing dashboard's rule-based score is unchanged. This ML prediction is a separate result, not that numerical score.

## Authentication and permissions

Login through POST `/auth/login` with email/password. Save `data.accessToken` in memory and send:

```http
Authorization: Bearer <accessToken>
Content-Type: application/json
```

Model reads and predictions require `dashboard:read`; the existing ADMIN role bypasses permission checks. Training requires `riskmodel:train`, assigned only to ADMIN by the updated demo seed. Existing production admins already pass via the ADMIN bypass; do not reseed production to add this feature.

## Endpoints

| Method | Route | Body | Permission | Success |
| --- | --- | --- | --- | --- |
| GET | `/risk-model` | None | dashboard:read | 200 model metadata, supported values, evaluation metrics |
| POST | `/risk-model/predict` | All 11 input fields below | dashboard:read | 200 prediction |
| POST | `/risk-model/assets/{id}/predict` | laborHours plus optional overrides | dashboard:read and asset location scope | 200 prediction for stored asset |
| POST | `/risk-model/train` | `{}` | riskmodel:train or ADMIN | 200 after local training; 409 on Vercel |

No query parameters or pagination are used by these four endpoints. Request bodies reject unexpected fields.

### GET /risk-model

Use this when opening the feature to obtain the current model version and supported categories. The response includes:

```json
{
  "data": {
    "status": "ready",
    "version": "26f828a4a80e04b9",
    "algorithm": "RandomForestClassifier",
    "datasetRows": 1000,
    "trainingRows": 800,
    "testRows": 200,
    "accuracy": 0.9,
    "macroF1": 0.8841264253163567,
    "classes": ["High", "Low", "Medium"],
    "trainingMode": "offline-and-redeploy",
    "training": false
  }
}
```

This is an abbreviated example. Actual responses also include acceptedCategories, requiredFeatures, numericTrainingRanges, class counts, confusion matrix, classification report, trainedAt, datasetSha256, and evaluation limitations. `trainingMode` is `local-admin` on a local server and `offline-and-redeploy` on Vercel.

### POST /risk-model/predict

All fields are required. Numeric inputs are JSON numbers, not strings.

```json
{
  "category": "Laptop",
  "condition": "Good",
  "status": "Active",
  "priority": "Critical",
  "useful_life_years": 10,
  "purchase_cost": 4650.48,
  "work_orders_count": 20,
  "downtime_minutes": 3573,
  "labor_hours": 21.65,
  "asset_age_years": 9.55,
  "days_to_warranty_expiry": -61
}
```

| Field | Meaning / validation |
| --- | --- |
| category | Laptop, Server, Network_Switch, Workstation, Projector, Lab_Equipment |
| condition | Good, Fair, Poor, Critical |
| status | Active, Under_Maintenance, Idle |
| priority | Low, Medium, High, Critical |
| useful_life_years | Expected useful life in years; strictly positive |
| purchase_cost | Original cost; nonnegative; use the same currency/unit as the training dataset |
| work_orders_count | Total recorded work orders; nonnegative integer |
| downtime_minutes | Total recorded downtime in minutes; nonnegative |
| labor_hours | Total labor hours; nonnegative; not labor cost |
| asset_age_years | Current age in years; nonnegative |
| days_to_warranty_expiry | Remaining days; negative for an expired warranty |

Categorical values are case-insensitive and normalize spaces, hyphens and underscores. Unsupported categories are rejected instead of silently predicting on unknown categories. Purchase-cost currency was not supplied with the CSV: confirm the dataset's currency before treating production comparisons as valid.

The server computes useful-life ratio, warranty-expired flag, average downtime/labor per work order, and annual maintenance frequency. Do not send these derived fields. When the work-order count or age is zero, the corresponding divided feature is defined as zero. Warnings identify numeric inputs outside training ranges.

Example success (the actual response also echoes all canonical input fields in `features`):

```json
{
  "data": {
    "riskLevel": "High",
    "confidence": 0.9251666666666672,
    "probabilities": {
      "High": 0.9251666666666672,
      "Low": 0,
      "Medium": 0.07483333333333334
    },
    "modelVersion": "26f828a4a80e04b9",
    "warnings": [],
    "probabilityMeaning": "Uncalibrated model class probability, not probability of asset failure."
  }
}
```

Confidence is between 0 and 1. Display the risk label with a model-confidence caption if needed. **Do not label 0.925 as a 92.5% chance of equipment failure.** The model has not been calibrated for that claim. These endpoints do not automatically retire assets, create work orders, or change inventory.

### POST /risk-model/assets/{id}/predict

Preferred for the asset-details screen:

```json
{ "laborHours": 21.65 }
```

The server reads category, condition, status, purchase date/cost, useful life, warranty, work orders and service events from the asset. It derives age using 365.25 days/year, floors warranty days, and converts downtimeHours to minutes. Work-order count includes all recorded statuses. Default priority is the highest active work-order priority, or Low if none exists. Prediction includes `assetId`, `source`, and `overrides` in addition to the normal prediction fields.

**Labor hours are not stored in the current Prisma schema**, so laborHours is always supplied by the caller. Never substitute laborCost or silently assume zero. Other missing data must be filled using these optional overrides:

```json
{
  "laborHours": 21.65,
  "category": "Laptop",
  "condition": "Good",
  "status": "Active",
  "priority": "High",
  "usefulLifeYears": 5,
  "purchaseCost": 1200,
  "purchaseDate": "2025-01-01T00:00:00Z",
  "warrantyEndDate": "2028-01-01T00:00:00Z"
}
```

Overrides affect this prediction only; they do not update the database. For example a database category named `Laptops` must be deliberately mapped to `Laptop`; unknown categories and RETIRED assets do not silently map to a supported category/status. Missing warranty dates return 400 rather than treating “unknown” as “expired.”

### POST /risk-model/train

Local admin operation, not a Flutter end-user action. Send `{}` and wait for completion (up to three minutes). A second concurrent request returns 409. There is no CSV upload parameter or caller-controlled executable/path. Dataset validation failures return 400, and failed training does not replace the active JSON artifact before successful export.

Success is `{ "data": { "status": "completed", "version": "...", "accuracy": 0.9, ...evaluationMetadata } }`. On Vercel, admins receive 409 with instructions to train offline and redeploy; non-admins without riskmodel:train receive 403. The hosted application intentionally never starts Python or writes a model into its filesystem.

## Errors

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "category must be one of: ..." } }
```

| HTTP | Flutter behavior |
| --- | --- |
| 400 | Show input error. Check missing labor hours, dates, category values and numeric types. |
| 401 | Use the existing token-refresh flow or return to login. |
| 403 | Hide/disable unauthorized actions; do not retry token refresh. |
| 404 | Asset no longer exists; refresh inventory. |
| 409 | Training is busy, timed out, or not permitted on the hosted runtime. |
| 500 | Unexpected server issue; show a retryable error without inventing a prediction. |

## Flutter request example

Using your app's existing HTTP client, or the `http` package:

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;

Future<Map<String, dynamic>> predictAssetRisk({
  required String baseUrl,
  required String accessToken,
  required String assetId,
  required double laborHours,
}) async {
  final response = await http.post(
    Uri.parse('$baseUrl/risk-model/assets/${Uri.encodeComponent(assetId)}/predict'),
    headers: {
      'Authorization': 'Bearer $accessToken',
      'Content-Type': 'application/json',
    },
    body: jsonEncode({'laborHours': laborHours}),
  ).timeout(const Duration(seconds: 30));
  final body = jsonDecode(response.body) as Map<String, dynamic>;
  if (response.statusCode != 200) {
    throw Exception('${response.statusCode}: ${body['error']?['message'] ?? 'Prediction failed'}');
  }
  return body['data'] as Map<String, dynamic>;
}
```

Use `riskLevel` for the badge, `(confidence as num).toDouble()` for confidence, and show the warning strings when present. Handle loading, validation, unauthorized and unavailable states. Fetch metadata to display the active model version. The snippet does not implement your app's token refresh, storage or retry policy.

## Hosted architecture and update procedure

```text
CSV -> Python training -> risk-model.json -> Vercel deployment
Flutter -> JWT-authenticated Express endpoint -> Node forest evaluator -> JSON result
```

1. Run training on a trusted development machine with Python 3.12 and pinned requirements. The current project has `.venv-risk` configured.
2. Run the Python validation tests and Node/Python parity tests.
3. Ship `src/model/risk-model.json` with the backend. Node's static require includes it in the Vercel function bundle. The 568 KB artifact contains trees and metadata; Python, virtualenv, raw CSV and pickle are excluded from deployment by `.vercelignore`.
4. Deploy the reviewed backend through your existing Vercel project. This feature itself needs no database migration; earlier pending AssetHub migrations still need the normal release process. Preserve the existing database and JWT environment variables.
5. Login on the deployed API, call GET `/risk-model`, and verify `version` against the trained artifact; then make a known prediction. Do not enable the Flutter UI before these checks pass.
6. To update the model, replace the local CSV, retrain, validate, review and redeploy. The old hosted version remains active until deployment. CLI training requires restarting an already-running local API to refresh its cached model; the local training endpoint reloads its own process automatically. Use one local API process for training.

No Python runtime, extra inference service, model secrets, or model writes are needed on Vercel. Vercel's function filesystem is read-only except temporary scratch storage, so a model trained within a request is not a durable deployment update. See [Vercel filesystem guidance](https://vercel.com/docs/functions/runtimes).

## Local commands

Already configured in this workspace:

```powershell
npm.cmd run model:train
node scripts/generate-risk-docs.js
.venv-risk\Scripts\python.exe -m unittest discover -s tests/python
npm.cmd run test:risk-model
npm.cmd test
```

Fresh Windows setup with Python 3.12 installed:

```powershell
py -3.12 -m venv .venv-risk
.venv-risk\Scripts\python.exe -m pip install -r src/model/requirements.txt
npm.cmd run model:train
```

If using `uv`, install with `uv pip install --python .venv-risk\Scripts\python.exe -r src/model/requirements.txt` (a uv-created venv may not include pip). You can set PYTHON_BIN to an absolute Python executable instead of using `.venv-risk`.

## Evaluation and limitations

Current artifact: 100 trees, random seed 42, maximum depth 12, minimum two samples per leaf. Training uses 800 rows; the untouched stratified holdout has 200. Accuracy is 90%, macro-F1 0.8841, compared with a 40% majority-class baseline. Medium-class precision is approximately 73.5%; its predictions are less reliable than the other classes in this holdout.

Node predictions were compared against sklearn for every input row; this is a runtime parity test, not an additional independent evaluation set. The dataset's provenance, labeling process, currency and real-world failure calibration remain unverified. Validate on real deployment data before using it for consequential maintenance decisions. The service suggests a risk class; it does not claim to predict failure dates.

Standalone OpenAPI: [risk-model.openapi.json](risk-model.openapi.json). Full Swagger UI: `/docs` or `/swagger`. Importable Postman collection: [postman.json](postman.json). Metrics: `src/model/risk-model-metrics.json`.
