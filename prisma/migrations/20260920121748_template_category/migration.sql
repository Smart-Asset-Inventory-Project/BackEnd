-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MaintenanceTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "frequencyDays" INTEGER,
    "tasks" TEXT,
    "categoryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MaintenanceTemplate_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AssetCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_MaintenanceTemplate" ("createdAt", "description", "frequencyDays", "id", "name", "tasks", "updatedAt") SELECT "createdAt", "description", "frequencyDays", "id", "name", "tasks", "updatedAt" FROM "MaintenanceTemplate";
DROP TABLE "MaintenanceTemplate";
ALTER TABLE "new_MaintenanceTemplate" RENAME TO "MaintenanceTemplate";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
