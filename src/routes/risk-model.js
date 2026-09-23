const router = require('express').Router();
const auth = require('../middlewares/auth');
const authorize = require('../middlewares/authorize');
const prisma = require('../utils/prisma');
const audit = require('../utils/audit');
const { ok } = require('../utils/response');
const { linked, scope } = require('../services/integrity');
const model = require('../services/risk-model');
const training = require('../services/risk-training');
router.use(auth);

router.get('/', authorize('dashboard:read'), (_req, res, next) => {
  try { ok(res, { ...model.modelInfo(), training: training.isTraining() }); } catch (e) { next(e); }
});
router.post('/predict', authorize('dashboard:read'), (req, res, next) => {
  try { ok(res, model.predict(model.featureSchema.parse(req.body))); } catch (e) { next(e); }
});
router.post('/assets/:id/predict', authorize('dashboard:read'), async (req, res, next) => {
  try {
    const existing = await linked(prisma, 'asset', req.params.id);
    scope(req, existing.locationId);
    const asset = await prisma.asset.findUniqueOrThrow({ where: { id: existing.id },
      include: { category: true, warranty: true, workOrders: { include: { serviceEvents: true } } } });
    scope(req, asset.locationId);
    ok(res, { assetId: asset.id, ...model.predict(model.assetFeatures(asset, req.body)),
      source: { workOrders: 'all recorded work orders', downtime: 'sum of service-event downtimeHours multiplied by 60',
        laborHours: 'provided by caller', priority: req.body.priority ? 'caller override' : 'highest active work-order priority, default Low' },
      overrides: Object.keys(req.body).filter(key => key !== 'laborHours') });
  } catch (e) { next(e); }
});
router.post('/train', authorize('riskmodel:train'), async (req, res, next) => {
  try {
    require('zod').z.object({}).strict().parse(req.body || {});
    const result = await training.trainModel();
    await audit('RiskModel', result.version, 'TRAIN', req.user.sub, { accuracy: result.accuracy, datasetSha256: result.datasetSha256 });
    ok(res, result);
  } catch (e) { next(e); }
});
module.exports = router;
