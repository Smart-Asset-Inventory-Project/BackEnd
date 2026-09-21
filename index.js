// Compatibility entry point. The application has one canonical server in src/index.js.
const app = require('./src/index');
const port = Number(process.env.PORT || 3000);
if (require.main === module) app.listen(port, '0.0.0.0', () => console.log(`AssetHub API running on http://0.0.0.0:${port}`));
module.exports = app;
