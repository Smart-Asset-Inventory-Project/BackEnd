const QRCode = require('qrcode');

exports.generateAssetQR = assetTag => QRCode.toDataURL(assetTag);
