const prisma = require('../utils/prisma');
const { parseWorkbook, normalizeAssetRow } = require('../utils/excelImport');
const { ok, fail } = require('../utils/response');
const audit = require('../utils/audit');
const { generateAssetQR } = require('../services/qrcode');
module.exports = async (req, res, next) => {
  try {
    if (!req.file) return fail(res, 'VALIDATION_ERROR', 'An .xlsx file is required', 400);
    const rows = parseWorkbook(req.file.path), results = [];
    for (let i = 0; i < rows.length; i++) {
      const row = normalizeAssetRow(rows[i]);
      try {
        if (!row.name || !row.assetTag || !row.categoryCode || !row.locationCode) throw new Error('name, assetTag, categoryCode and locationCode are required');
        const category = await prisma.assetCategory.findUnique({ where: { code: String(row.categoryCode) } });
        const location = await prisma.location.findUnique({ where: { code: String(row.locationCode) } });
        if (!category || !location) throw new Error('categoryCode or locationCode not found');
        const data = { assetTag: String(row.assetTag), name: String(row.name), serialNumber: row.serialNumber ? String(row.serialNumber) : null, model: row.model, status: row.status, condition: row.condition, categoryId: category.id, locationId: location.id, value: String(row.value || 0) };
        data.qrCodeUrl = await generateAssetQR(data.assetTag);
        const item = await prisma.asset.create({ data }); await audit('Asset', item.id, 'CREATE_IMPORT', req.user.sub, data);
        results.push({ row: i + 2, status: 'success', id: item.id });
      } catch (e) { results.push({ row: i + 2, status: 'error', message: e.code === 'P2002' ? 'Duplicate asset tag or serial number' : e.message }); }
    }
    ok(res, {
      imported: results.filter(x => x.status === 'success').length,
      errorCount: results.filter(x => x.status === 'error').length,
      success: results.filter(x => x.status === 'success'),
      errors: results.filter(x => x.status === 'error'),
      results
    });
  } catch (e) { next(e); }
};
