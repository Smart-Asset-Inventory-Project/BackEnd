const swaggerJSDoc = require('swagger-jsdoc');
const path = require('path');
const spec = swaggerJSDoc({
  definition: { openapi: '3.0.0', info: { title: 'AssetHub API', version: '1.0.0' }, servers: [{ url: '/' }] },
  apis: [path.join(__dirname, 'routes', '*.js').replace(/\\/g, '/')]
});

const modules = require("../docs/openapi.json");
spec.servers = modules.servers;
spec.components = modules.components;
spec.security = modules.security;
spec.paths = { ...spec.paths, ...modules.paths };

const jsonBody = (schema, example) => ({ required: true, content: { 'application/json': { schema, example } } });
const authResponse = { description: 'Authenticated response', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'object' } } } } } };
const protectedOperation = (summary, method = 'get') => ({ [method]: { summary, security: [{ bearerAuth: [] }], responses: { 200: { description: 'Success' }, 401: { description: 'Authentication required' }, 403: { description: 'Insufficient permission' } } } });

spec.paths = {
  ...spec.paths,
  '/auth/login': { post: { summary: 'Authenticate a user and issue tokens', security: [], requestBody: jsonBody({ type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', minLength: 1 } } }, { email: 'admin@assethub.local', password: 'Admin@123' }), responses: { 200: authResponse, 401: { description: 'Invalid credentials' }, 400: { description: 'Invalid request' } } } },
  '/auth/register': { post: { summary: 'Register a custodian user', security: [], requestBody: jsonBody({ type: 'object', required: ['name', 'email', 'password'], properties: { name: { type: 'string' }, email: { type: 'string', format: 'email' }, password: { type: 'string', minLength: 8 } } }, { name: 'New User', email: 'user@example.com', password: 'Password123' }), responses: { 201: authResponse, 400: { description: 'Invalid request' } } } },
  '/auth/refresh': { post: { summary: 'Rotate a refresh token', security: [], requestBody: jsonBody({ type: 'object', required: ['refreshToken'], properties: { refreshToken: { type: 'string' } } }, { refreshToken: 'your-refresh-token' }), responses: { 200: authResponse, 401: { description: 'Invalid refresh token' } } } },
  '/assets/import': { post: { summary: 'Import assets from a CSV or spreadsheet file', security: [{ bearerAuth: [] }], requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } } } }, responses: { 200: { description: 'Import result' }, 400: { description: 'Invalid file or data' }, 403: { description: 'Insufficient permission' } } } },
  '/assets/{id}/qr': { get: { summary: 'Download an asset QR code', security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'QR code image', content: { 'image/png': { schema: { type: 'string', format: 'binary' } } } }, 404: { description: 'Asset not found' } } } },
  '/attachments': { get: protectedOperation('List asset attachments').get, post: { ...protectedOperation('Upload an asset attachment', 'post').post, requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', required: ['file', 'assetId'], properties: { file: { type: 'string', format: 'binary' }, assetId: { type: 'string' } } } } } } } },
  '/attachments/{id}/presign': { post: { ...protectedOperation('Create a presigned attachment URL', 'post').post, parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }] } },
  '/attachments/{id}/download': { get: { ...protectedOperation('Download an attachment').get, parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }, { in: 'query', name: 'token', schema: { type: 'string' } }] } },
  '/retirements': { get: protectedOperation('List retired assets').get, post: { ...protectedOperation('Retire an asset', 'post').post, requestBody: jsonBody({ type: 'object', required: ['assetId', 'reason'], properties: { assetId: { type: 'string' }, reason: { type: 'string' }, residualValue: { type: 'number', minimum: 0 } } }, { assetId: 'asset-id', reason: 'End of useful life' }) } },
  '/retirements/{id}': { get: { ...protectedOperation('Get a retirement record').get, parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }] } },
  '/stocktake-sessions': { get: protectedOperation('List stocktake sessions').get, post: { ...protectedOperation('Create a stocktake session', 'post').post, requestBody: jsonBody({ type: 'object', required: ['name'], properties: { name: { type: 'string' }, locationId: { type: 'string' } } }, { name: 'Quarterly stocktake' }) } },
  '/stocktake-sessions/{id}/observations': { post: { ...protectedOperation('Record a stocktake observation', 'post').post, parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], requestBody: jsonBody({ type: 'object', required: ['assetId', 'status'], properties: { assetId: { type: 'string' }, status: { type: 'string' }, notes: { type: 'string' } } }, { assetId: 'asset-id', status: 'FOUND', notes: 'Verified' }) } },
  '/stocktake-sessions/{id}/complete': { put: { ...protectedOperation('Complete a stocktake session', 'put').put, parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }] } },
  '/audit-logs': protectedOperation('List audit logs'),
  '/audit-logs/{id}': { get: { ...protectedOperation('Get an audit log').get, parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }] } }
};
module.exports = spec;
