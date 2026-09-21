const r = require('express').Router(), c = require('../controllers/resources'), a = require('../middlewares/auth'), z = require('../middlewares/authorize');
const upload = require('../utils/upload');
r.use(a);
/** @swagger
 * /locations:
 *   get:
 *     summary: List locations with pagination
 */
r.get('/', c.list('location'));
/** @swagger
 * /locations/tree:
 *   get:
 *     summary: Return the location hierarchy
 */
r.get('/tree', c.tree);
r.post('/', z('location:manage'), c.create('location'));
r.get('/:id', c.get('location')); r.put('/:id', z('location:manage'), c.update('location')); r.delete('/:id', z('location:manage'), c.remove('location'));
module.exports = r;
