-- Padroniza perfis da plataforma em ADMIN e USER.
CREATE TYPE "Role_new" AS ENUM ('ADMIN', 'USER');

ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User"
  ALTER COLUMN "role" TYPE "Role_new"
  USING (
    CASE
      WHEN "role"::text = 'ADMIN' THEN 'ADMIN'::"Role_new"
      ELSE 'USER'::"Role_new"
    END
  );
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'USER';
DROP TYPE "Role";
ALTER TYPE "Role_new" RENAME TO "Role";

-- Completa os dados de usuário e remove permissões por página.
UPDATE "User" SET "name" = split_part("email", '@', 1) WHERE "name" IS NULL;
ALTER TABLE "User" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "User"
  ADD COLUMN "companyId" INTEGER,
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "User" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "updatedAt" IS NULL;
ALTER TABLE "User" ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "User" DROP COLUMN IF EXISTS "pagePermissions";
ALTER TABLE "User"
  ADD CONSTRAINT "User_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "User_companyId_idx" ON "User"("companyId");

-- Catálogo de produtos pesquisável durante a cotação.
CREATE TABLE "Product" (
  "id" SERIAL NOT NULL,
  "sku" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "lengthMeters" DECIMAL(10,3) NOT NULL,
  "widthMeters" DECIMAL(10,3) NOT NULL,
  "heightMeters" DECIMAL(10,3) NOT NULL,
  "defaultVolumes" INTEGER NOT NULL DEFAULT 1,
  "weightKg" DECIMAL(10,3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");
CREATE INDEX "Product_description_idx" ON "Product"("description");

-- Novos dados de transportadora.
ALTER TABLE "Carrier"
  ADD COLUMN "logoUrl" TEXT,
  ADD COLUMN "ambientePadrao" "Environment" NOT NULL DEFAULT 'HOMOLOGACAO';

-- Credenciais por empresa, transportadora e ambiente.
DROP INDEX IF EXISTS "CarrierCredential_companyId_carrierId_key";
ALTER TABLE "CarrierCredential"
  ADD COLUMN "contrato" TEXT,
  ADD COLUMN "cnpjVinculado" TEXT;
CREATE UNIQUE INDEX "CarrierCredential_companyId_carrierId_ambiente_key"
  ON "CarrierCredential"("companyId", "carrierId", "ambiente");

-- Tipos de frete controlados e suporte ao tomador terceiro.
CREATE TYPE "FreightType" AS ENUM ('CIF', 'FOB', 'TERCEIROS');
ALTER TABLE "Quote"
  ALTER COLUMN "tipoFrete" TYPE "FreightType"
  USING (
    CASE UPPER("tipoFrete")
      WHEN 'CIF' THEN 'CIF'::"FreightType"
      WHEN 'FOB' THEN 'FOB'::"FreightType"
      ELSE 'TERCEIROS'::"FreightType"
    END
  );
ALTER TABLE "Quote"
  ADD COLUMN "cnpjTerceiro" TEXT,
  ADD COLUMN "razaoSocialTerceiro" TEXT;

-- Mantém vínculo e fotografia dos dados do produto usados na cotação.
ALTER TABLE "QuoteItem"
  ADD COLUMN "productId" INTEGER,
  ADD COLUMN "sku" TEXT;
ALTER TABLE "QuoteItem"
  ADD CONSTRAINT "QuoteItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "QuoteItem_productId_idx" ON "QuoteItem"("productId");
