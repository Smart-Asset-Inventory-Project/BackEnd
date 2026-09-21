const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const multer = require('multer');
const prisma = require('../utils/prisma');
const audit = require('../utils/audit');
const { signAccess, verifyAccess } = require('../utils/jwt');
const { ok, fail } = require('../utils/response');
const { applyScopeFilter, getScopeLocationIds } = require('../utils/scope');

const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const uploadDir = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads'));
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE - 1 },
  fileFilter: (_req, file, cb) => cb(null, ALLOWED_MIME.has(file.mimetype))
});

const getAttachment = id => prisma.attachment.findUnique({
  where: { id },
  include: { asset: { select: { id: true, locationId: true } } }
});

const inScope = (attachment, scopeIds) =>
  scopeIds === null || (attachment.asset && scopeIds.includes(attachment.asset.locationId));

const requireAttachmentAccess = async (req, res) => {
  const attachment = await getAttachment(req.params.id);
  if (!attachment) {
    fail(res, 'NOT_FOUND', 'Attachment not found', 404);
    return null;
  }
  if (!inScope(attachment, req.scopeIds)) {
    fail(res, 'FORBIDDEN', 'Out of scope', 403);
    return null;
  }
  return attachment;
};

exports.upload = [upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file || !ALLOWED_MIME.has(req.file.mimetype) || req.file.size >= MAX_SIZE)
      return fail(res, 'INVALID_FILE', 'Only PDF, JPEG, and PNG files smaller than 10 MB are supported', 400);
    const { fileTypeFromBuffer } = await import('file-type');
    const detected = await fileTypeFromBuffer(req.file.buffer);
    if (!detected || !ALLOWED_MIME.has(detected.mime) || detected.mime !== req.file.mimetype)
      return fail(res, 'INVALID_FILE', 'File content does not match an allowed type', 400);
    const entityId = req.body.entityId;
    const asset = await prisma.asset.findUnique({ where: { id: entityId }, select: { id: true, locationId: true } });
    if (!asset) return fail(res, 'NOT_FOUND', 'Asset not found', 404);
    if (req.scopeIds !== null && !req.scopeIds.includes(asset.locationId)) return fail(res, 'FORBIDDEN', 'Out of scope', 403);
    const id = crypto.randomUUID();
    const storedName = `${crypto.randomUUID()}${path.extname(req.file.originalname || '').toLowerCase()}`;
    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(path.join(uploadDir, storedName), req.file.buffer, { flag: 'wx' });
    const attachment = await prisma.attachment.create({
      data: {
        id,
        assetId: asset.id,
        entityType: 'Asset',
        entityId: asset.id,
        fileName: req.file.originalname,
        fileUrl: `/attachments/${id}/download`,
        mimeType: detected.mime,
        metadata: JSON.stringify({ storedName })
      }
    });
    ok(res, attachment, 201);
  } catch (e) { next(e); }
}];

exports.list = async (req, res, next) => {
  try {
    const where = req.scopeIds === null ? {} : { asset: applyScopeFilter(req.scopeIds, {}) };
    const data = await prisma.attachment.findMany({ where, orderBy: { createdAt: 'desc' } });
    ok(res, data);
  } catch (e) { next(e); }
};

exports.presign = async (req, res, next) => {
  try {
    const attachment = await requireAttachmentAccess(req, res);
    if (!attachment) return;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const token = signAccess({ attachmentId: attachment.id, userId: req.user.sub }, '5m');
    ok(res, { url: `/attachments/${attachment.id}/download?token=${encodeURIComponent(token)}`, expiresAt: expiresAt.toISOString() });
  } catch (e) { next(e); }
};

exports.download = async (req, res, next) => {
  try {
    let userId = req.user && req.user.sub;
    if (req.query.token) {
      const token = verifyAccess(req.query.token);
      if (token.attachmentId !== req.params.id || !token.userId) return fail(res, 'UNAUTHORIZED', 'Invalid download token', 401);
      userId = token.userId;
      req.user = { sub: userId };
      req.scopeIds = await getScopeLocationIds(userId);
    } else if (!userId) {
      return fail(res, 'UNAUTHENTICATED', 'Authentication required', 401);
    }
    const attachment = await getAttachment(req.params.id);
    if (!attachment) return fail(res, 'NOT_FOUND', 'Attachment not found', 404);
    if (!inScope(attachment, req.scopeIds)) return fail(res, 'FORBIDDEN', 'Out of scope', 403);
    const metadata = attachment.metadata ? JSON.parse(attachment.metadata) : null;
    if (!metadata || !metadata.storedName) return fail(res, 'NOT_FOUND', 'Attachment file not found', 404);
    const filePath = path.join(uploadDir, metadata.storedName);
    await fs.access(filePath);
    await audit('Attachment', attachment.id, 'ATTACHMENT_DOWNLOAD', userId, null);
    res.type(attachment.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${attachment.fileName.replace(/["\r\n]/g, '')}"`);
    res.sendFile(filePath);
  } catch (e) {
    if (e.code === 'ENOENT') return fail(res, 'NOT_FOUND', 'Attachment file not found', 404);
    if (e.name === 'JsonWebTokenError' || e.name === 'TokenExpiredError') return fail(res, 'UNAUTHORIZED', 'Invalid download token', 401);
    next(e);
  }
}
