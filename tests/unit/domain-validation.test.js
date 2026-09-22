const { schemas } = require('../../src/validators/domain');
const validate = require('../../src/services/domain-validation');
test('procurement rejects negative amounts and invalid dates', () => {
 expect(() => schemas.invoice.parse({ invoiceNumber: 'I', amount: -1, issueDate: 'bad' })).toThrow();
});
test('warranty dates are ordered', async () => {
 await expect(validate({}, 'warranty', { startDate: new Date('2026-02-01'), endDate: new Date('2026-01-01') }, {})).rejects.toThrow('endDate');
});
test('invoice supplier must match linked order', async () => {
 const tx = { supplier: { findUnique: jest.fn().mockResolvedValue({ id: 'a' }) }, purchaseOrder: { findUnique: jest.fn().mockResolvedValue({ supplierId: 'b' }) } };
 await expect(validate(tx, 'invoice', { supplierId: 'a', purchaseOrderId: 'p' }, {})).rejects.toThrow('match');
});
