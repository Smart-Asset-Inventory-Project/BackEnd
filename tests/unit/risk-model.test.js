const model = require('../../src/services/risk-model');
const parity = require('../../src/model/risk-model-parity.json');

test('Node predictions match sklearn probabilities and classes for every dataset row', () => {
  expect(parity.cases).toHaveLength(1000);
  expect(model.modelInfo().version).toBe(parity.version);
  for (const sample of parity.cases) {
    const result = model.predict(sample.features);
    expect(result.riskLevel).toBe(sample.riskLevel);
    parity.classes.forEach((label, i) => expect(result.probabilities[label]).toBeCloseTo(sample.probabilities[i], 12));
    expect(Object.values(result.probabilities).reduce((sum, p) => sum + p, 0)).toBeCloseTo(1, 12);
  }
});
test('features are validated and category casing is normalized', () => {
  const sample = parity.cases[0].features;
  expect(model.predict({ ...sample, condition: sample.condition.toUpperCase() }).riskLevel).toBe(parity.cases[0].riskLevel);
  for (const change of [{ useful_life_years: 0 }, { purchase_cost: -1 }, { category: 'Unknown' }, { work_orders_count: 1.5 }, { risk_level: 'High' }]) {
    expect(() => model.predict({ ...sample, ...change })).toThrow();
  }
  expect(() => model.predict({ ...sample, labor_hours: undefined })).toThrow();
  expect(model.predict({ ...sample, work_orders_count: 0, asset_age_years: 0 }).confidence).toBeGreaterThan(0);
  expect(model.predict({ ...sample, purchase_cost: 1e9 }).warnings).toContain('purchase_cost is outside the training range');
});
test('asset data uses explicit labor hours and correct downtime units', () => {
  const asset = { category: { name: 'Laptop' }, condition: 'Good', status: 'Active', usefulLifeYears: 5,
    purchaseCost: '1000', purchaseDate: new Date('2025-01-01'), warranty: { endDate: new Date('2027-01-01') },
    workOrders: [{ status: 'OPEN', priority: 'HIGH', serviceEvents: [{ downtimeHours: 2 }] }] };
  expect(() => model.assetFeatures(asset, {})).toThrow();
  const features = model.assetFeatures(asset, { laborHours: 3 }, new Date('2026-01-01'));
  expect(features.downtime_minutes).toBe(120);
  expect(features.labor_hours).toBe(3);
  expect(features.priority).toBe('HIGH');
  expect(features.days_to_warranty_expiry).toBe(365);
  expect(() => model.assetFeatures({ ...asset, warranty: null }, { laborHours: 3 })).toThrow('warrantyEndDate');
});
