const prisma = require('./prisma');

async function audit(entityType, entityId, action, userId, details) {
  try {
    await prisma.auditLog.create({
      data: { entityType, entityId, action, userId: userId || null,
        details: details == null ? null : JSON.stringify(details) }
    });
  } catch (error) {
    // Auditing must never make a successful mutation fail.
    console.error('Audit log failed:', error.message);
  }
}
module.exports = audit;
