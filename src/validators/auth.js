const { z } = require('zod');
exports.login = z.object({ email: z.string().email(), password: z.string().min(1) });
exports.register = z.object({ name: z.string().min(1), email: z.string().email(), password: z.string().min(8), roleId: z.string().uuid().optional() });
