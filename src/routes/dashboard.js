const express = require('express');
const auth = require('../middlewares/auth');
const authorize = require('../middlewares/authorize');
const c = require('../controllers/dashboard');
const r = express.Router(); r.use(auth, authorize('dashboard:read'));
/** @swagger
 * /dashboard/summary:
 *   get:
 *     summary: Return dashboard totals
 */
r.get('/summary', c.summary);
/** @swagger
 * /dashboard/counts-by-location:
 *   get:
 *     summary: Count active inventory by location name
 */
r.get('/counts-by-location', c.countsByLocation);
/** @swagger
 * /dashboard/counts-by-category:
 *   get:
 *     summary: Count active inventory by category name
 */
r.get('/counts-by-category', c.countsByCategory);
/** @swagger
 * /dashboard/warranty-expiry:
 *   get:
 *     summary: Return warranty expiry buckets
 */
r.get('/warranty-expiry', c.warrantyExpiry);
/** @swagger
 * /dashboard/maintenance-due:
 *   get:
 *     summary: List maintenance due in the next seven days
 */
r.get('/maintenance-due', c.maintenanceDue);
/** @swagger
 * /dashboard/kpis:
 *   get:
 *     summary: Return operational KPIs
 */
r.get('/kpis', c.kpis);
/** @swagger
 * /dashboard/risk-queue:
 *   get:
 *     summary: Return the top 50 active asset risks
 */
r.get('/risk-queue', c.riskQueue);
module.exports = r;
