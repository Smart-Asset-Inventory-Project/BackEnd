const { Prisma } = require('@prisma/client');
const { error } = require('./integrity');
const transitions = {
  OPEN: ['ASSIGNED', 'IN_PROGRESS', 'CANCELLED'],
  ASSIGNED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [], CANCELLED: []
};
function transition(old, data) {
  if (data.assetId && data.assetId !== old.assetId) throw error('Work order asset cannot change');
  if (['COMPLETED', 'CANCELLED'].includes(old.status)) throw error('Terminal work orders cannot be edited', 409);
  if (data.status && data.status !== old.status && !transitions[old.status]?.includes(data.status)) throw error('Invalid work order status transition');
  if (data.status === 'COMPLETED') data.completedAt = new Date();
  return data;
}
function eventData(data) {
  const labor = new Prisma.Decimal(data.laborCost || 0);
  const parts = new Prisma.Decimal(data.partsCost || 0);
  const total = labor.plus(parts);
  if (data.cost != null && !total.equals(data.cost)) throw error('cost must equal laborCost plus partsCost');
  return { ...data, laborCost: labor, partsCost: parts, cost: total };
}
module.exports = { transitions, transition, eventData };
