module.exports = (err, req, res, next) => {
  const prismaStatus = { P2002: 409, P2003: 409, P2025: 404, P2034: 409 };
  const invalidToken = ['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(err.name);
  const status = invalidToken ? 401 : prismaStatus[err.code] || err.status || (err.name === 'ZodError' ? 400 : 500);
  if (status >= 500) console.error(err);
  const code = invalidToken ? 'UNAUTHENTICATED' : ['P2002','P2034'].includes(err.code) ? 'CONFLICT' : err.code === 'P2025' ? 'NOT_FOUND' : err.name === 'ZodError' ? 'VALIDATION_ERROR' : (err.code || 'INTERNAL_ERROR');
  const message = invalidToken ? 'Invalid or expired token' : err.code === 'P2034' ? 'Concurrent update; refresh the record and retry' : err.code === 'P2002' ? 'A record with this value already exists'
    : err.code === 'P2003' ? 'The record references missing or protected data'
      : err.code === 'P2025' ? 'Resource not found' : (err.message || 'Internal server error');
  res.status(status).json({ error: { code: status >= 500 ? 'INTERNAL_ERROR' : code, message: status >= 500 ? 'Internal server error' : message } });
};
