const r = require('express').Router(), c = require('../controllers/resources'), a = require('../middlewares/auth'), z = require('../middlewares/authorize');
r.use(a);
/** @swagger
 * /categories:
 *   get:
 *     summary: List asset categories with pagination
 *   post:
 *     summary: Create an asset category
 */
r.get('/', c.list('category')); r.post('/', z('category:manage'), c.create('category'));
r.get('/:id', c.get('category')); r.put('/:id', z('category:manage'), c.update('category')); r.delete('/:id', z('category:manage'), c.remove('category'));
module.exports = r;
