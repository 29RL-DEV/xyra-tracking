-- CreateEnum
CREATE TYPE "ShipmentAuditAction" AS ENUM ('CREATED', 'UPDATED', 'EVENT_APPLIED');

-- DropForeignKey
ALTER TABLE "internal_notes" DROP CONSTRAINT "internal_notes_authorId_fkey";

-- CreateTable
CREATE TABLE "shipment_audit_entries" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "action" "ShipmentAuditAction" NOT NULL,
    "changes" JSONB,
    "staffUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_audit_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shipment_audit_entries_shipmentId_createdAt_idx" ON "shipment_audit_entries"("shipmentId", "createdAt");

-- AddForeignKey
ALTER TABLE "internal_notes" ADD CONSTRAINT "internal_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "staff_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_audit_entries" ADD CONSTRAINT "shipment_audit_entries_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_audit_entries" ADD CONSTRAINT "shipment_audit_entries_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "staff_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
