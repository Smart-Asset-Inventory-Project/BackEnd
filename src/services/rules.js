const date = value => (value ? new Date(value) : null);
const number = value => {
  if (value && typeof value.toString === 'function') value = value.toString();
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
};

/**
 * Apply the five documented asset-risk rules.
 *
 * The function deliberately accepts both Prisma records and plain objects so
 * that it can be used by the dashboard, scheduler, and unit tests.
 */
function computeRiskScore(asset, now = new Date()) {
  const today = date(now) || new Date();
  const sevenDays = new Date(today.getTime() + 7 * 86400000);
  const thirtyDays = new Date(today.getTime() + 30 * 86400000);
  let score = 0;
  const reasons = [];
  const add = (points, reason) => { score += points; reasons.push(reason); };

  const dueOrder = (asset.workOrders || []).filter(x => x.dueDate)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0];
  const dueDate = date(asset.nextMaintenanceDue || asset.dueDate || dueOrder && dueOrder.dueDate);
  const dueStatus = String(asset.workOrderStatus || asset.maintenanceStatus ||
    dueOrder && dueOrder.status || '').toUpperCase();
  if (dueDate && dueDate <= sevenDays && !['COMPLETED', 'CANCELLED'].includes(dueStatus)) {
    add(30, 'maintenance-due-within-7-days');
  }

  const warrantyEnd = date(asset.warrantyEndDate || (asset.warranty && asset.warranty.endDate));
  if (warrantyEnd && warrantyEnd >= today && warrantyEnd <= thirtyDays) {
    add(20, 'warranty-expires-within-30-days');
  }

  let metadata = asset.metadata;
  if (typeof metadata === 'string') {
    try { metadata = JSON.parse(metadata); } catch (_) { metadata = {}; }
  }
  const usefulLifeYears = number(asset.usefulLifeYears || metadata && (metadata.usefulLifeYears || metadata.usefulLife));
  const purchaseDate = date(asset.purchaseDate);
  if (usefulLifeYears > 0 && purchaseDate &&
      (today - purchaseDate) / (365.25 * 86400000) > usefulLifeYears * 0.8) {
    add(25, 'age-exceeds-80-percent-useful-life');
  }

  const sixMonthsAgo = new Date(today.getTime() - 183 * 86400000);
  const workOrders = asset.workOrders || [];
  const failures = number(asset.completedWorkOrderFailures || asset.workOrderFailuresLast6Months ||
    asset.failedWorkOrdersLast6Months || asset.failedWorkOrders) ||
    workOrders.filter(order => {
      const completed = String(order.status || '').toUpperCase() === 'COMPLETED';
      const completedAt = date(order.completedAt || order.updatedAt || order.createdAt);
      return completed && completedAt && completedAt >= sixMonthsAgo &&
        (order.failed === true || order.failure === true ||
          /fail(ed|ure)/i.test(String(order.result || order.outcome || order.notes || '')));
    }).length;
  if (failures > 3) add(30, 'more-than-3-completed-work-order-failures');

  const purchaseCost = number(asset.purchaseCost || asset.value);
  const repairCost = number(asset.repairCost) ||
    workOrders.reduce((sum, order) => sum + (order.serviceEvents || [])
      .reduce((subtotal, event) => subtotal + number(event.cost), 0), 0);
  if (purchaseCost > 0 && repairCost > purchaseCost * 0.5) {
    add(25, 'repair-cost-exceeds-50-percent-purchase-cost');
  }
  return { score, reasons };
}

module.exports = { computeRiskScore };
