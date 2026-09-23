require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { generateAssetQR } = require('../src/services/qrcode');

const permissionCodes = ['asset:read','asset:write','asset:delete','location:manage','category:manage','procurement:manage','custody:manage','transfer:manage','maintenance:manage','workorder:manage','retirement:approve','user:manage','audit:read','dashboard:read','riskmodel:train'];
const daysFromNow = d => new Date(Date.now() + d * 86400000);

async function main() {
  await prisma.rolePermission.deleteMany({ where: { role: { name: { notIn: ['ADMIN', 'PROCUREMENT', 'CUSTODIAN', 'TECHNICIAN', 'AUDITOR'] } } } });
  await prisma.role.deleteMany({ where: { name: { notIn: ['ADMIN', 'PROCUREMENT', 'CUSTODIAN', 'TECHNICIAN', 'AUDITOR'] } } });
  const roles = {};
  for (const name of ['ADMIN','PROCUREMENT','CUSTODIAN','TECHNICIAN','AUDITOR'])
    roles[name] = await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  const permissions = {};
  for (const code of permissionCodes)
    permissions[code] = await prisma.permission.upsert({ where: { code }, update: { name: code }, create: { code, name: code } });
  const mappings = { ADMIN: permissionCodes, PROCUREMENT: ['asset:read','procurement:manage','dashboard:read'], CUSTODIAN: ['asset:read','asset:write','custody:manage','dashboard:read'], TECHNICIAN: ['asset:read','maintenance:manage','workorder:manage','dashboard:read'], AUDITOR: ['asset:read','audit:read','dashboard:read'] };
  for (const [roleName, codes] of Object.entries(mappings)) for (const code of codes)
    await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: roles[roleName].id, permissionId: permissions[code].id } }, update: {}, create: { roleId: roles[roleName].id, permissionId: permissions[code].id } });
  const accounts = [['admin@assethub.local','Admin@123','Admin'],['procurement@assethub.local','Test@123','Procurement'],['custodian@assethub.local','Test@123','Custodian'],['technician@assethub.local','Test@123','Technician'],['auditor@assethub.local','Test@123','Auditor']];
  for (const [email, password, name] of accounts) await prisma.user.upsert({ where: { email }, update: { roleId: roles[name.toUpperCase()].id }, create: { email, name, password: await bcrypt.hash(password, 10), roleId: roles[name.toUpperCase()].id } });

  // Reset only demo/domain data. Roles, permissions and the five documented credentials remain intact.
  for (const model of ['auditLog','stocktakeObservation','stocktakeSession','attachment','retirement','serviceEvent','workOrder','maintenanceTemplate','transfer','custodyAssignment','warranty','invoice','purchaseOrder','asset','assetCategory','location','supplier']) await prisma[model].deleteMany();
  const users = await prisma.user.findMany({ orderBy: { email: 'asc' } });

  const locations = [];
  const createLocation = data => prisma.location.create({ data });
  const campus = await createLocation({ name: 'Cairo University', code: 'CAIRO-UNIVERSITY', type: 'campus' });
  const buildingNames = ['Main Building', 'Science Building'];
  const collegeNames = [['Engineering', 'Science'], ['Arts', 'Commerce']];
  for (let b = 0; b < buildingNames.length; b++) {
    const building = await createLocation({ name: buildingNames[b], code: `BUILDING-${b + 1}`, type: 'building', parentId: campus.id });
    for (let c = 0; c < 2; c++) {
      const college = await createLocation({ name: collegeNames[b][c], code: `COLLEGE-${b + 1}-${c + 1}`, type: 'college', parentId: building.id });
      for (let floorNumber = 1; floorNumber <= 3; floorNumber++) {
        const floor = await createLocation({ name: `Floor ${floorNumber}`, code: `FLOOR-${b + 1}-${c + 1}-${floorNumber}`, type: 'floor', parentId: college.id });
        for (let roomNumber = 1; roomNumber <= 5; roomNumber++) {
          locations.push(await createLocation({ name: `Room ${roomNumber}`, code: `ROOM-${b + 1}-${c + 1}-${floorNumber}-${roomNumber}`, type: 'room', parentId: floor.id }));
        }
      }
    }
  }
  const engineering = await prisma.location.findFirst({ where: { name: 'Engineering' } });
  const science = await prisma.location.findFirst({ where: { name: 'Science' } });
  await prisma.user.update({ where: { email: 'admin@assethub.local' }, data: { scopeLocationId: null } });
  await prisma.user.update({ where: { email: 'procurement@assethub.local' }, data: { scopeLocationId: campus.id } });
  await prisma.user.update({ where: { email: 'auditor@assethub.local' }, data: { scopeLocationId: campus.id } });
  await prisma.user.update({ where: { email: 'custodian@assethub.local' }, data: { scopeLocationId: engineering.id } });
  await prisma.user.update({ where: { email: 'technician@assethub.local' }, data: { scopeLocationId: science.id } });
  const categories = [];
  const categoryNames = ['Laptop', 'Desktop', 'Printer', 'Projector', 'Monitor', 'AC Unit', 'Desk', 'Chair', 'Server', 'Network Switch'];
  for (let i = 0; i < categoryNames.length; i++) categories.push(await prisma.assetCategory.create({ data: { name: categoryNames[i], code: categoryNames[i].toUpperCase().replace(/\s+/g, '-') } }));
  const suppliers = [];
  const supplierNames = ['Dell Egypt', 'HP Egypt', 'Lenovo Egypt', 'Samsung Egypt', 'Local Furniture Co.'];
  for (let i = 0; i < supplierNames.length; i++) suppliers.push(await prisma.supplier.create({ data: { name: supplierNames[i], email: `supplier${i + 1}@example.com` } }));
  const assets = [];
  const assetNames = ['Dell Latitude 5420', 'HP ProDesk 400', 'HP LaserJet Pro', 'Epson Projector', 'Samsung Monitor', 'Carrier AC Unit', 'Office Desk', 'Ergonomic Chair', 'Dell PowerEdge Server', 'Cisco Network Switch'];
  for (let i = 1; i <= 120; i++) {
    const categoryIndex = (i - 1) % 10;
    const status = i <= 100 ? 'ACTIVE' : i <= 110 ? 'MAINTENANCE' : i <= 115 ? 'RETIRED' : 'LOST';
    const assetTag = `AST-${String(i).padStart(4,'0')}`;
    assets.push(await prisma.asset.create({ data: { assetTag, qrCodeUrl: await generateAssetQR(assetTag), name: assetNames[categoryIndex], serialNumber: `SN-${String(i).padStart(5,'0')}`, model: `Model-${(i % 8) + 1}`, status, condition: i % 5 === 0 ? 'FAIR' : 'GOOD', purchaseDate: new Date(2021 + (i % 5), i % 12, (i % 27) + 1), value: String(250 + i * 17.5), metadata: JSON.stringify({ usefulLifeYears: 3 + (i % 8) }), categoryId: categories[categoryIndex].id, locationId: locations[(i - 1) % 60].id, assignedToUserId: i <= 100 ? users[i % users.length].id : null } }));
  }
  for (let i = 0; i < 30; i++) {
    const bucket = i < 10 ? 30 : i < 20 ? 60 : 90;
    await prisma.warranty.create({ data: { assetId: assets[i].id, provider: `Warranty Provider ${(i % 5) + 1}`, startDate: new Date(2025, 0, 1), endDate: daysFromNow(bucket), terms: 'Standard coverage' } });
  }
  for (let i = 0; i < 20; i++) {
    const po = await prisma.purchaseOrder.create({ data: { orderNumber: `PO-${String(i + 1).padStart(4,'0')}`, supplierId: suppliers[i % 5].id, assetId: assets[i].id, status: i % 3 ? 'RECEIVED' : 'APPROVED', totalAmount: String(500 + i * 100) } });
    for (let j = 0; j < (i % 3) + 1; j++) await prisma.invoice.create({ data: { invoiceNumber: `INV-${i + 1}-${j + 1}`, purchaseOrderId: po.id, supplierId: suppliers[i % 5].id, amount: String(500 + i * 100), issueDate: new Date(2025, i % 12, j + 1) } });
  }
  for (let i = 0; i < 100; i++) await prisma.custodyAssignment.create({ data: { assetId: assets[i].id, userId: users[i % users.length].id, assignedAt: new Date(2025, i % 12, (i % 27) + 1), notes: 'Initial assignment' } });
  for (let i = 0; i < 50; i++) await prisma.transfer.create({ data: { assetId: assets[i % 100].id, fromLocationId: locations[4 + (i % 75)].id, toLocationId: locations[4 + ((i + 1) % 75)].id, fromUserId: users[i % users.length].id, toUserId: users[(i + 1) % users.length].id, transferredByUserId: users[0].id, reason: 'Operational move' } });
  const templateNames = ['Laptop 6-month checkup', 'AC quarterly service', 'Printer monthly check', 'Server annual maintenance', 'Projector lamp check'];
  const templateIntervals = [180, 90, 30, 365, 180];
  const templates = [];
  for (let i = 0; i < templateNames.length; i++) templates.push(await prisma.maintenanceTemplate.create({ data: { name: templateNames[i], frequencyDays: templateIntervals[i], tasks: JSON.stringify([`Inspect ${templateNames[i]}`, 'Record results']) } }));
  const statuses = ['OPEN','IN_PROGRESS','COMPLETED','CANCELLED'];
  for (let i = 0; i < 50; i++) {
    const status = i < 20 ? statuses[0] : i < 30 ? statuses[1] : i < 45 ? statuses[2] : statuses[3];
    const wo = await prisma.workOrder.create({ data: { assetId: assets[i % 100].id, templateId: templates[i % 5].id, assignedToUserId: users[i % users.length].id, title: `Work order ${i + 1}`, status, priority: i % 3 === 0 ? 'HIGH' : 'MEDIUM', dueDate: daysFromNow(i - 10), completedAt: status === 'COMPLETED' ? new Date() : null } });
    if (status === 'COMPLETED' && i < 45) await prisma.serviceEvent.create({ data: { workOrderId: wo.id, technician: users[i % users.length].name, notes: 'Completed service', cost: String(75 + i * 5), eventDate: new Date() } });
  }
  for (let i = 0; i < 5; i++) await prisma.retirement.create({ data: { assetId: assets[110 + i].id, reason: 'End of useful life', residualValue: '0', approvedBy: users[0].id } });
  for (let i = 0; i < 30; i++) await prisma.auditLog.create({ data: { entityType: 'Asset', entityId: assets[i].id, action: 'CREATE', userId: users[0].id, details: JSON.stringify({ seeded: true }) } });
  const counts = {};
  for (const model of ['role','permission','user','location','assetCategory','supplier','asset','warranty','purchaseOrder','invoice','custodyAssignment','transfer','maintenanceTemplate','workOrder','serviceEvent','retirement','auditLog']) counts[model] = await prisma[model].count();
  console.log('AssetHub demo seed counts:', counts);
}
main().then(() => prisma.$disconnect()).catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
