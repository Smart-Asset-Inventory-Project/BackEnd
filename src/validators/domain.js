const { z } = require('zod');
const id = z.string().min(1);
const text = z.string().optional().nullable();
const date = z.union([z.string().min(1), z.date()]).pipe(z.coerce.date());
const money = z.number().finite().nonnegative();
const metadata = z.union([z.string(), z.record(z.unknown())]).transform(x => typeof x === 'string' ? x : JSON.stringify(x)).optional().nullable();
const schemas = {
  maintenanceTemplate: z.object({ name: id, description: text, categoryId: id.optional().nullable(), triggerType: z.enum(['TIME_BASED','MANUAL']).optional(), frequencyDays: z.number().int().positive().optional().nullable(), tasks: z.union([z.string(), z.array(z.string())]).transform(x => typeof x === 'string' ? x : JSON.stringify(x)).optional().nullable() }),
  workOrder: z.object({ assetId: id, templateId: id.optional().nullable(), assignedToUserId: id.optional().nullable(), title: id, description: text, priority: z.enum(['LOW','MEDIUM','HIGH','CRITICAL']).optional(), status: z.enum(['OPEN','ASSIGNED','IN_PROGRESS','COMPLETED','CANCELLED']).optional(), dueDate: date.optional().nullable() }),
  serviceEvent: z.object({ workOrderId: id, eventDate: date.optional(), technician: text, notes: text, cost: money.optional(), laborCost: money.optional(), partsCost: money.optional(), downtimeHours: money.optional(), outcome: id.optional() }),
  supplier: z.object({ name: z.string().min(1), email: z.string().email().optional().nullable(), phone: text, address: text }),
  purchaseOrder: z.object({ orderNumber: id, supplierId: id, assetId: id.optional().nullable(), status: z.enum(['DRAFT','APPROVED','ORDERED','RECEIVED','CANCELLED']).optional(), orderDate: date.optional(), totalAmount: money.optional().nullable(), metadata }),
  invoice: z.object({ invoiceNumber: id, purchaseOrderId: id.optional().nullable(), supplierId: id.optional().nullable(), amount: money, issueDate: date, dueDate: date.optional().nullable(), status: z.enum(['UNPAID','PAID','OVERDUE','CANCELLED']).optional(), metadata }),
  warranty: z.object({ assetId: id, provider: text, startDate: date, endDate: date, terms: text }),
  custodyAssignment: z.object({ assetId: id, userId: id, assignedAt: date.optional(), notes: text }),
  transfer: z.object({ assetId: id, toLocationId: id, reason: text, fromLocationId: id.optional(), transferredById: id.optional(), transferredByUserId: id.optional(), toUserId: id.optional().nullable() })
};
module.exports = { schemas, id, text, date, money };
