const cron = require('node-cron');
const prisma = require('../utils/prisma');
const { computeRiskScore } = require('../services/rules');

async function createDueWorkOrders() {
  const templates = await prisma.maintenanceTemplate.findMany({ where: { triggerType: 'TIME_BASED' } });
  let created = 0;
  const now = new Date();
  for (const template of templates) {
    const assets = await prisma.asset.findMany({ where: { categoryId: template.categoryId || undefined, status: 'ACTIVE' } });
    for (const asset of assets) {
      const open = await prisma.workOrder.findFirst({ where: { assetId: asset.id, templateId: template.id, status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] } } });
      if (open) continue;
      const last = await prisma.workOrder.findFirst({ where: { assetId: asset.id, templateId: template.id, status: 'COMPLETED' }, orderBy: { completedAt: 'desc' } });
      const interval = (template.frequencyDays || 30) * 86400000;
      if (!last || !last.completedAt || last.completedAt.getTime() + interval <= now.getTime()) {
        await prisma.workOrder.create({ data: { assetId: asset.id, templateId: template.id, title: `Auto: ${template.name}`, priority: 'MEDIUM', status: 'OPEN', dueDate: new Date(now.getTime() + interval) } });
        created++;
      }
    }
  }
  console.log(`Created ${created} work orders`);
  return created;
}

async function logExpiringWarranties() {
  const count = await prisma.warranty.count({ where: { endDate: { gte: new Date(), lte: new Date(Date.now() + 30 * 86400000) } } });
  console.log(`${count} warranties expiring within 30 days`);
  return count;
}

async function logRiskQueue() {
  const assets = await prisma.asset.findMany({ where: { status: 'ACTIVE' }, include: { warranty: true, workOrders: { include: { serviceEvents: true } } } });
  const top = assets.map(asset => ({ asset, ...computeRiskScore(asset) })).sort((a, b) => b.score - a.score).slice(0, 20);
  console.log('Top 20 risk assets', top.map(item => ({ id: item.asset.id, score: item.score })));
  return top;
}

function startScheduler() {
  return [
    cron.schedule('0 0 * * *', createDueWorkOrders), // Daily at midnight: create template maintenance work orders.
    cron.schedule('0 1 * * *', logExpiringWarranties), // Daily at 01:00: log warranties expiring within 30 days.
    cron.schedule('0 2 * * 0', logRiskQueue) // Sundays at 02:00: recompute and log the risk queue.
  ];
}

module.exports = { createDueWorkOrders, logExpiringWarranties, logRiskQueue, startScheduler };
