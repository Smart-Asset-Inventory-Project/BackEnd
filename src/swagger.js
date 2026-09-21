const swaggerJSDoc = require('swagger-jsdoc');
const path = require('path');
module.exports = swaggerJSDoc({
  definition: { openapi: '3.0.0', info: { title: 'AssetHub API', version: '1.0.0' }, servers: [{ url: '/' }] },
  apis: [path.join(__dirname, 'routes', '*.js').replace(/\\/g, '/')]
});
