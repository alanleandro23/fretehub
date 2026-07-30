/*
  Warnings:

  - You are about to drop the column `defaultVolumes` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `sku` on the `Product` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[description]` on the table `Product` will be added. If there are existing duplicate values, this will fail.
  - Made the column `weightKg` on table `Product` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "Product_sku_key";

-- AlterTable
ALTER TABLE "CarrierCredential" ALTER COLUMN "ambiente" SET DEFAULT 'HOMOLOGACAO';

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "defaultVolumes",
DROP COLUMN "sku",
ALTER COLUMN "weightKg" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Product_description_key" ON "Product"("description");
