const { transition, eventData } = require('../../src/services/maintenance');
const { schemas } = require('../../src/validators/domain');
test('work orders follow the lifecycle and record completion time', () => {
 expect(transition({ status: 'OPEN' }, { status: 'ASSIGNED' }).status).toBe('ASSIGNED');
 expect(transition({ status: 'ASSIGNED' }, { status: 'IN_PROGRESS' }).status).toBe('IN_PROGRESS');
 expect(transition({ status: 'IN_PROGRESS' }, { status: 'COMPLETED' }).completedAt).toBeInstanceOf(Date);
});
test('invalid transitions and terminal edits are rejected', () => {
 expect(() => transition({ status: 'OPEN' }, { status: 'COMPLETED' })).toThrow('Invalid');
 expect(() => transition({ status: 'COMPLETED' }, { status: 'OPEN' })).toThrow('Terminal');
 expect(() => transition({ status: 'CANCELLED' }, { status: 'COMPLETED' })).toThrow('Terminal');
});
test('service cost uses decimal arithmetic and rejects mismatched totals', () => {
 expect(eventData({ laborCost: 0.1, partsCost: 0.2 }).cost.toString()).toBe('0.3');
 expect(() => eventData({ laborCost: 1, partsCost: 2, cost: 4 })).toThrow('cost');
 for (const field of ['laborCost','partsCost','cost','downtimeHours']) expect(() => schemas.serviceEvent.parse({ workOrderId: 'w', [field]: -1 })).toThrow();
});
