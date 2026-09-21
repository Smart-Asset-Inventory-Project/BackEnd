require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const prisma = require('./utils/prisma');
const errorHandler = require('./middlewares/error');

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (_req, res) => res.json({ data: { status: 'ok' } }));
app.get('/health/db', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ data: { status: 'ok' } });
  } catch (_error) {
    res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Database unavailable' } });
  }
});

const domain = require('./routes/domain');
const workflows = require('./routes/workflows');
const generic = require('./routes/generic');
const routers = {
  auth: require('./routes/auth'),
  locations: require('./routes/locations'),
  categories: require('./routes/categories'),
  assets: require('./routes/assets'),
  attachments: require('./routes/attachments'),
  warranties: domain.warranties,
  'custody-assignments': domain.custody,
  transfers: domain.transfers,
  'maintenance-templates': domain.templates,
  'work-orders': domain.workOrders,
  retirements: workflows.retirements,
  'stocktake-sessions': workflows.stocktakes,
  'service-events': workflows.serviceEvents,
  suppliers: generic('suppliers'),
  'purchase-orders': generic('purchase-orders'),
  invoices: generic('invoices'),
  'audit-logs': generic('audit-logs'),
  dashboard: require('./routes/dashboard')
};

for (const [path, router] of Object.entries(routers)) {
  app.use(`/${path}`, router);
  app.use(`/api/${path}`, router);
}

try {
  const swaggerUi = require('swagger-ui-express');
  const swaggerSpec = require('./swagger');
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
} catch (_error) {
  app.get('/docs', (_req, res) => res.type('html').send('<h1>AssetHub API</h1>'));
}

app.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }));
app.use(errorHandler);

if (process.env.NODE_ENV !== 'test') require('./jobs/scheduler').startScheduler();
const port = Number(process.env.PORT || 3000);
if (require.main === module) app.listen(port, '0.0.0.0', () => console.log(`AssetHub API running on http://0.0.0.0:${port}`));

module.exports = app;
