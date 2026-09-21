const r = require('express').Router(), c = require('../controllers/resources'), a = require('../middlewares/auth'), z = require('../middlewares/authorize'), upload = require('../utils/upload'), importAssets = require('../controllers/import');
 r.use(a);
/** @swagger
 * /assets:
 *   get:
 *     summary: List assets with pagination and filters
 *   post:
 *     summary: Create an asset
 */
r.get('/', c.list('asset')); r.post('/import', z('asset:write'), upload.single('file'), importAssets);
/** @swagger
 * /assets/{id}/history:
 *   get:
 *     summary: Return the complete asset event history
 */
r.get('/:id/history', require('../controllers/domain').history);
r.get('/:id/qr', c.qr('asset'));
/** @swagger
 * /assets/{id}:
 *   get:
 *     summary: Get an asset
 *   put:
 *     summary: Update an asset
 *   delete:
 *     summary: Delete an asset
 */
r.get('/:id', c.get('asset')); r.post('/', z('asset:write'), c.create('asset'));
r.put('/:id', z('asset:write'), c.update('asset')); r.delete('/:id', z('asset:delete'), c.remove('asset'));
module.exports = r;
