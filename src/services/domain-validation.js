const { linked, error, scope } = require('./integrity');
module.exports = async (tx, type, data, req) => {
  if (type === 'maintenanceTemplate') {
    if (data.categoryId) await linked(tx, 'assetCategory', data.categoryId);
    if ((data.triggerType || 'TIME_BASED') === 'TIME_BASED' && !data.frequencyDays) throw error('TIME_BASED templates require frequencyDays');
  }
  if (type === 'workOrder') {
    if (data.assignedToUserId) await linked(tx, 'user', data.assignedToUserId);
    if (data.status === 'ASSIGNED' && !data.assignedToUserId) throw error('ASSIGNED work orders require assignedToUserId');
    if (data.templateId) {
      const template = await linked(tx, 'maintenanceTemplate', data.templateId);
      const asset = await linked(tx, 'asset', data.assetId);
      if (template.categoryId && template.categoryId !== asset.categoryId) throw error('Template category does not match asset');
    }
  }
  if (data.assetId) {
    const asset = await linked(tx, 'asset', data.assetId);
    scope(req, asset.locationId);
  }
  if (type === 'purchaseOrder' || type === 'invoice') {
    if (data.supplierId) await linked(tx, 'supplier', data.supplierId);
    if (data.purchaseOrderId) {
      const order = await linked(tx, 'purchaseOrder', data.purchaseOrderId);
      if (data.supplierId && data.supplierId !== order.supplierId) throw error('Invoice supplier must match purchase order');
    }
    if (type === 'invoice') {
      if (!data.supplierId && !data.purchaseOrderId) throw error('Invoice requires supplierId or purchaseOrderId');
      if (data.dueDate && data.dueDate < data.issueDate) throw error('Invoice dueDate precedes issueDate');
    }
  }
  if (type === 'warranty' && data.endDate <= data.startDate) throw error('Warranty endDate must follow startDate');
};
