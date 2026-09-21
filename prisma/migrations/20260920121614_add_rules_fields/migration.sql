-- AlterTable
ALTER TABLE "Asset" ADD COLUMN "purchaseCost" DECIMAL;
ALTER TABLE "Asset" ADD COLUMN "usefulLifeYears" INTEGER;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ServiceEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workOrderId" TEXT NOT NULL,
    "eventDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "technician" TEXT,
    "notes" TEXT,
    "cost" DECIMAL,
    "laborCost" DECIMAL NOT NULL DEFAULT 0,
    "partsCost" DECIMAL NOT NULL DEFAULT 0,
    "downtimeHours" REAL NOT NULL DEFAULT 0,
    "outcome" TEXT NOT NULL DEFAULT 'completed',
    "completedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceEvent_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ServiceEvent" ("cost", "createdAt", "eventDate", "id", "notes", "technician", "workOrderId") SELECT "cost", "createdAt", "eventDate", "id", "notes", "technician", "workOrderId" FROM "ServiceEvent";
DROP TABLE "ServiceEvent";
ALTER TABLE "new_ServiceEvent" RENAME TO "ServiceEvent";
CREATE INDEX "ServiceEvent_workOrderId_idx" ON "ServiceEvent"("workOrderId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
