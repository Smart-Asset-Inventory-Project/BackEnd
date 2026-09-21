const {z}=require('zod');
exports.location=z.object({name:z.string().min(1),code:z.string().min(1),address:z.string().optional(),description:z.string().optional(),parentId:z.string().uuid().optional()});
exports.category=z.object({name:z.string().min(1),code:z.string().min(1),description:z.string().optional()});
exports.asset=z.object({assetTag:z.string().min(1),name:z.string().min(1),categoryId:z.string().uuid(),locationId:z.string().uuid(),serialNumber:z.string().optional(),model:z.string().optional(),status:z.string().optional(),value:z.number().optional(),condition:z.string().optional(),assignedToUserId:z.string().uuid().optional()});
