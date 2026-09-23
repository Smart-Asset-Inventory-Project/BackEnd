const { z } = require('zod');
const { error } = require('./integrity');

const number = z.number().finite().nonnegative();
const featureSchema = z.object({
  category: z.string().min(1), condition: z.string().min(1), status: z.string().min(1), priority: z.string().min(1),
  useful_life_years: number.positive(), purchase_cost: number, work_orders_count: number.int(),
  downtime_minutes: number, labor_hours: number, asset_age_years: number,
  days_to_warranty_expiry: z.number().finite()
}).strict();
const normalize = value => value.trim().toLowerCase().replace(/[\s_-]+/g, '');
let model;
function getModel() {
  if (!model) {
    // Static require ensures Vercel bundles the trained artifact with the function.
    model = require('../model/risk-model.json');
    if (model.formatVersion !== 1 || !model.trees?.length) throw new Error('Unsupported risk model artifact');
  }
  return model;
}
function reloadModel() {
  delete require.cache[require.resolve('../model/risk-model.json')];
  model = null;
  return getModel();
}
function modelInfo() {
  const m = getModel();
  return { status: 'ready', ...m.metadata, classes: m.classes, acceptedCategories: m.categories,
    requiredFeatures: Object.keys(featureSchema.shape), numericTrainingRanges: m.numericRanges,
    trainingMode: process.env.VERCEL ? 'offline-and-redeploy' : 'local-admin',
    probabilityMeaning: 'Uncalibrated model class probability, not probability of asset failure.' };
}
function predict(raw) {
  const m = getModel();
  const input = featureSchema.parse(raw);
  for (const key of m.categoricalFeatures) {
    const canonical = m.categories[key].find(value => normalize(value) === normalize(input[key]));
    if (!canonical) throw error(`${key} must be one of: ${m.categories[key].join(', ')}`);
    input[key] = canonical;
  }
  const features = { ...input,
    useful_life_consumed_ratio: input.asset_age_years / input.useful_life_years,
    is_warranty_expired: input.days_to_warranty_expiry < 0 ? 1 : 0,
    avg_downtime_per_wo: input.work_orders_count ? input.downtime_minutes / input.work_orders_count : 0,
    avg_labor_per_wo: input.work_orders_count ? input.labor_hours / input.work_orders_count : 0,
    annual_maintenance_frequency: input.asset_age_years ? input.work_orders_count / input.asset_age_years : 0
  };
  const vector = [...m.categoricalFeatures.flatMap(key => m.categories[key].map(value => value === features[key] ? 1 : 0)),
    ...m.numericFeatures.map(key => Math.fround(features[key]))];
  if (vector.some(value => !Number.isFinite(value))) throw error('Feature values exceed the supported numeric range');
  const probabilities = m.classes.map(() => 0);
  for (const tree of m.trees) {
    let node = 0;
    while (tree.left[node] !== -1) node = vector[tree.feature[node]] <= tree.threshold[node] ? tree.left[node] : tree.right[node];
    tree.probabilities[node].forEach((p, i) => { probabilities[i] += p / m.trees.length; });
  }
  const selected = probabilities.indexOf(Math.max(...probabilities));
  const warnings = Object.entries(m.numericRanges).filter(([key, range]) => input[key] < range.min || input[key] > range.max)
    .map(([key]) => `${key} is outside the training range`);
  return { riskLevel: m.classes[selected], confidence: probabilities[selected],
    probabilities: Object.fromEntries(m.classes.map((label, i) => [label, probabilities[i]])),
    modelVersion: m.metadata.version, features: input, warnings,
    probabilityMeaning: 'Uncalibrated model class probability, not probability of asset failure.' };
}
const assetOptionsSchema = z.object({
  laborHours: number,
  category: z.string().min(1).optional(), condition: z.string().min(1).optional(), status: z.string().min(1).optional(),
  priority: z.string().min(1).optional(), usefulLifeYears: number.positive().optional(), purchaseCost: number.optional(),
  purchaseDate: z.string().datetime({ offset: true }).optional(), warrantyEndDate: z.string().datetime({ offset: true }).optional()
}).strict();
function assetFeatures(asset, raw, now = new Date()) {
  const options = assetOptionsSchema.parse(raw);
  const purchaseDate = options.purchaseDate ? new Date(options.purchaseDate) : asset.purchaseDate;
  const expiry = options.warrantyEndDate ? new Date(options.warrantyEndDate) : asset.warranty?.endDate;
  if (!purchaseDate || !expiry) throw error('Prediction requires purchaseDate and warrantyEndDate; supply missing values as overrides');
  if (purchaseDate > now) throw error('purchaseDate cannot be in the future');
  const priorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  const orders = asset.workOrders || [];
  const open = orders.filter(order => !['COMPLETED', 'CANCELLED'].includes(order.status));
  const highest = open.reduce((p, order) => Math.max(p, priorities.indexOf(order.priority)), 0);
  const usefulLife = options.usefulLifeYears ?? asset.usefulLifeYears;
  const cost = options.purchaseCost ?? asset.purchaseCost;
  if (usefulLife == null || cost == null) throw error('Prediction requires usefulLifeYears and purchaseCost; supply missing values as overrides');
  return { category: options.category ?? asset.category.name, condition: options.condition ?? asset.condition,
    status: options.status ?? asset.status, priority: options.priority ?? priorities[highest],
    useful_life_years: usefulLife, purchase_cost: Number(cost), work_orders_count: orders.length,
    downtime_minutes: orders.reduce((sum, order) => sum + order.serviceEvents.reduce((total, event) => total + event.downtimeHours * 60, 0), 0),
    labor_hours: options.laborHours, asset_age_years: (now - purchaseDate) / (365.25 * 86400000),
    days_to_warranty_expiry: Math.floor((expiry - now) / 86400000) };
}
module.exports = { predict, getModel, modelInfo, reloadModel, featureSchema, assetOptionsSchema, assetFeatures };
