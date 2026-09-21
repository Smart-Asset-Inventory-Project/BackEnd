const { verifyAccess } = require('../utils/jwt');
const { fail } = require('../utils/response');
const { getScopeLocationIds } = require('../utils/scope');
module.exports = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) return fail(res, 'UNAUTHENTICATED', 'Authentication required', 401);
    req.user = verifyAccess(header.slice(7));
    req.scopeIds = await getScopeLocationIds(req.user.sub);
    next();
  } catch (e) {
    if (e.name === 'JsonWebTokenError' || e.name === 'TokenExpiredError') return fail(res, 'UNAUTHENTICATED', 'Invalid or expired token', 401);
    next(e);
  }
};
