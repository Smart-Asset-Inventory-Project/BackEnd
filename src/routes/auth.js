const r = require('express').Router(), c = require('../controllers/auth'), a = require('../middlewares/auth');
/** @swagger
 * /auth/login:
 *   post:
 *     summary: Authenticate a user and issue tokens
 */
r.post('/login', c.login);
/** @swagger
 * /auth/register:
 *   post:
 *     summary: Register a user
 */
r.post('/register', c.register);
/** @swagger
 * /auth/refresh:
 *   post:
 *     summary: Rotate a refresh token
 */
r.post('/refresh', c.refresh);
/** @swagger
 * /auth/me:
 *   get:
 *     summary: Return the authenticated user
 */
r.get('/me', a, c.me);
module.exports = r;
