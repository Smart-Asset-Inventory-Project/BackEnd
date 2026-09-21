const express = require('express');
const auth = require('../middlewares/auth');
const authorize = require('../middlewares/authorize');
const controller = require('../controllers/attachments');

const router = express.Router();
router.post('/', auth, authorize('asset:write'), controller.upload);
router.get('/', auth, controller.list);
router.post('/:id/presign', auth, controller.presign);
router.get('/:id/download', (req, res, next) => {
  if (req.query.token) return controller.download(req, res, next);
  return auth(req, res, () => controller.download(req, res, next));
});
module.exports = router;
