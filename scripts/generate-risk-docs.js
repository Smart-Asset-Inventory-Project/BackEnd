const fs = require('fs');
const path = require('path');
const model = require('../src/services/risk-model');
const root = path.join(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file)));
const write = (file, data) => fs.writeFileSync(path.join(root, file), JSON.stringify(data, null, 2) + '\n');
const features = { category: 'Laptop', condition: 'Good', status: 'Active', priority: 'Critical',
  useful_life_years: 10, purchase_cost: 4650.48, work_orders_count: 20, downtime_minutes: 3573,
  labor_hours: 21.65, asset_age_years: 9.55, days_to_warranty_expiry: -61 };
const prediction = model.predict(features);
const numeric = { type: 'number', minimum: 0 };
const properties = {};
for (const [key, value] of Object.entries(features)) {
  properties[key] = typeof value === 'string' ? { type: 'string', enum: model.getModel().categories[key] }
    : { ...numeric, ...(key === 'work_orders_count' ? { type: 'integer' } : {}) };
}
delete properties.days_to_warranty_expiry.minimum;
properties.useful_life_years.exclusiveMinimum = true;
const featureSchema = { type: 'object', additionalProperties: false, required: Object.keys(features), properties };
const errors = { 400: 'Invalid or missing features, invalid category, missing asset data, or local training configuration error',
  401: 'Authentication required', 403: 'Insufficient permission or out-of-scope asset', 404: 'Asset not found',
  409: 'Training already running, timed out, or disabled on Vercel', 500: 'Unexpected server error' };
function operation(summary, permission, example) {
  const responses = { 200: { description: 'Success', content: { 'application/json': { example: { data: example } } } } };
  for (const [code, description] of Object.entries(errors)) responses[code] = { description };
  return { summary, description: `Required permission: ${permission}. Class probabilities are not calibrated failure probabilities.`,
    security: [{ bearerAuth: [] }], 'x-permission': permission, responses };
}
const requestBody = (schema, example) => ({ required: true, content: { 'application/json': { schema, example } } });
const spec = { openapi: '3.0.3', info: { title: 'AssetHub risk model API', version: '1.0.0' },
  servers: [{ url: 'https://assethub-backend.vercel.app/api' }, { url: 'http://localhost:3000/api' }],
  components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } }, paths: {} };
spec.paths['/risk-model'] = { get: operation('Get model metadata and accepted inputs', 'dashboard:read', { ...model.modelInfo(), training: false }) };
spec.paths['/risk-model/predict'] = { post: { ...operation('Predict risk from supplied features', 'dashboard:read', prediction), requestBody: requestBody(featureSchema, features) } };
spec.paths['/risk-model/assets/{id}/predict'] = { post: {
  ...operation('Predict risk for an existing asset', 'dashboard:read', { assetId: 'asset-uuid', ...prediction }),
  parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
  requestBody: requestBody({ type: 'object', additionalProperties: false, required: ['laborHours'], properties: {
    laborHours: numeric, category: properties.category, condition: properties.condition, status: properties.status,
    priority: properties.priority, usefulLifeYears: { ...numeric, exclusiveMinimum: true }, purchaseCost: numeric,
    purchaseDate: { type: 'string', format: 'date-time' }, warrantyEndDate: { type: 'string', format: 'date-time' }
  } }, { laborHours: 21.65 })
} };
spec.paths['/risk-model/train'] = { post: {
  ...operation('Train locally; disabled on Vercel', 'riskmodel:train (ADMIN bypass)', { status: 'completed', ...model.getModel().metadata }),
  description: 'Local admin operation. Three-minute timeout and one concurrent training process. Uses the server-owned CSV and atomically replaces the JSON model. Vercel returns 409: retrain locally and redeploy.',
  requestBody: requestBody({ type: 'object', additionalProperties: false }, {})
} };
write('docs/risk-model.openapi.json', spec);
const main = read('docs/openapi.json'); Object.assign(main.paths, spec.paths); write('docs/openapi.json', main);
const postman = read('docs/postman.json');
postman.item = postman.item.filter(item => item.name !== 'Risk model');
postman.item.push({ name: 'Risk model', description: 'Predictions run on Vercel; training is local-only.', item: Object.entries(spec.paths).map(([route, methods]) => {
  const [method, op] = Object.entries(methods)[0];
  const request = { method: method.toUpperCase(), url: '{{baseUrl}}' + route.replace('{id}', '{{assetId}}'),
    header: [{ key: 'Authorization', value: 'Bearer {{token}}' }, { key: 'Content-Type', value: 'application/json' }], description: op.description };
  if (op.requestBody) request.body = { mode: 'raw', raw: JSON.stringify(op.requestBody.content['application/json'].example, null, 2) };
  return { name: op.summary, request, response: [{ name: 'Success', code: 200, status: 'OK', originalRequest: request,
    header: [{ key: 'Content-Type', value: 'application/json' }], body: JSON.stringify(op.responses[200].content['application/json'].example, null, 2) }] };
}) });
write('docs/postman.json', postman);
console.log('Risk API OpenAPI and Postman documentation updated.');
