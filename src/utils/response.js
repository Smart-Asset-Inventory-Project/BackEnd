exports.ok = (res, data, status = 200, meta) => res.status(status).json(meta ? { data, meta } : { data });
exports.fail = (res, code, message, status = 400, details) =>
  res.status(status).json({ error: { code, message, ...(details === undefined ? {} : { details }) } });
