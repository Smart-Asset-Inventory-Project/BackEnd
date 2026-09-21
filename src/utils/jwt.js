const jwt = require('jsonwebtoken');
exports.signAccess = (payload, expiresIn) => jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: expiresIn || process.env.JWT_EXPIRES_IN || '15m' });
exports.signRefresh = payload => jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn: '30d' });
exports.verifyAccess = token => jwt.verify(token, process.env.JWT_SECRET);
exports.verifyRefresh = token => jwt.verify(token, process.env.JWT_REFRESH_SECRET);
