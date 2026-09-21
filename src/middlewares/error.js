module.exports = (err, req, res, next) => {
  console.error(err);
  const prismaStatus = { P2002: 409, P2003: 409, P2025: 404 };
  const status = prismaStatus[err.code] || err.status || (err.name === 'ZodError' ? 400 : 500);
  const code = err.code === 'P2002' ? 'CONFLICT' : err.code === 'P2025' ? 'NOT_FOUND' : err.name === 'ZodError' ? 'VALIDATION_ERROR' : (err.code || 'INTERNAL_ERROR');
  const message = err.code === 'P2002' ? 'A record with this value already exists'
    : err.code === 'P2003' ? 'The record references missing or protected data'
      : err.code === 'P2025' ? 'Resource not found' : (err.message || 'Internal server error');
  res.status(status).json({ error: { code, message } });
};
