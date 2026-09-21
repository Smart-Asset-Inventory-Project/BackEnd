const XLSX = require('xlsx');

function parseWorkbook(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { raw: false, defval: null });
}

function normalizeAssetRow(row = {}) {
  const pick = (keys) => {
    for (const key of keys) {
      const value = row[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return value;
      }
    }
    return null;
  };

  return {
    name: pick(['name', 'assetName', 'asset_name']),
    assetTag: pick(['assetTag', 'asset_tag', 'tag', 'assetId', 'asset_id']),
    serialNumber: pick(['serialNumber', 'serial_number', 'serial']),
    model: pick(['model', 'assetModel', 'asset_model']),
    status: pick(['status', 'assetStatus', 'asset_status']) || 'ACTIVE',
    condition: pick(['condition', 'assetCondition', 'asset_condition']),
    purchaseDate: pick(['purchaseDate', 'purchase_date']),
    warrantyExpiry: pick(['warrantyExpiry', 'warranty_expiry']),
    value: pick(['value', 'purchaseValue', 'purchase_value']) || 0,
    categoryCode: pick(['categoryCode', 'category_code', 'category']),
    locationCode: pick(['locationCode', 'location_code', 'location']),
    assignedEmail: pick(['assignedEmail', 'assigned_email', 'assignedTo', 'assigned_to']),
  };
}

module.exports = { parseWorkbook, normalizeAssetRow };
