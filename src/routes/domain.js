const express = require('express');
const c = require('../controllers/domain');
const auth = require('../middlewares/auth');
const authorize = require('../middlewares/authorize');
function router(type, permission) {
  const r = express.Router(); r.use(auth);
  r.get('/', c.list(type)); r.get('/:id', c.get(type));
  if (type === 'workOrder') r.put('/:id/complete', authorize(permission), c.complete);
  r.post('/', authorize(permission), c.create(type)); r.put('/:id', authorize(permission), c.update(type)); r.delete('/:id', authorize(permission), c.remove(type));
  return r;
}
exports.warranties = router('warranty', 'procurement:manage');
exports.custody = router('custodyAssignment', 'custody:manage');
exports.transfers = router('transfer', 'transfer:manage');
exports.templates = router('maintenanceTemplate', 'maintenance:manage');
exports.workOrders = router('workOrder', 'workorder:manage');
