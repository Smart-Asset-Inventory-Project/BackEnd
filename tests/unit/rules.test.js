const { computeRiskScore } = require('../../src/services/rules');

describe('asset risk rules', () => {
  test('applies the documented five rules', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const result = computeRiskScore({
      nextMaintenanceDue: '2026-01-03T00:00:00Z',
      warrantyEndDate: '2026-01-20T00:00:00Z',
      purchaseDate: '2023-01-01T00:00:00Z',
      usefulLifeYears: 3,
      completedWorkOrderFailures: 4,
      purchaseCost: 1000,
      repairCost: 501
    }, now);
    expect(result.score).toBe(130);
    expect(result.reasons).toHaveLength(5);
  });

  test('does not score inactive or completed maintenance records by itself', () => {
    const result = computeRiskScore({
      workOrderStatus: 'COMPLETED',
      nextMaintenanceDue: '2026-01-03T00:00:00Z'
    }, new Date('2026-01-01T00:00:00Z'));
    expect(result.score).toBe(0);
  });
});
