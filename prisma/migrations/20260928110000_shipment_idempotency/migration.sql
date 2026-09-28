-- CreateTable
CREATE TABLE "shipment_creation_keys" (
    "id" TEXT NOT NULL,
    "staffUserId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_creation_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shipment_creation_keys_staffUserId_key_key" ON "shipment_creation_keys"("staffUserId", "key");

-- CreateIndex
CREATE INDEX "shipment_creation_keys_createdAt_idx" ON "shipment_creation_keys"("createdAt");

-- AddForeignKey
ALTER TABLE "shipment_creation_keys" ADD CONSTRAINT "shipment_creation_keys_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "staff_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_creation_keys" ADD CONSTRAINT "shipment_creation_keys_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
