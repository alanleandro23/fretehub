-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'OPERATOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "IntegrationType" AS ENUM ('API', 'PORTAL', 'MANUAL');

-- CreateEnum
CREATE TYPE "Environment" AS ENUM ('HOMOLOGACAO', 'PRODUCAO');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'COMPLETED', 'ERROR', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ResultStatus" AS ENUM ('success', 'error');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "role" "Role" NOT NULL DEFAULT 'OPERATOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" SERIAL NOT NULL,
    "razaoSocial" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "cnpj" TEXT NOT NULL,
    "inscricaoEstadual" TEXT,
    "cep" TEXT NOT NULL,
    "endereco" TEXT NOT NULL,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "cidade" TEXT NOT NULL,
    "uf" TEXT NOT NULL,
    "telefone" TEXT,
    "email" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Carrier" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "tipoIntegracao" "IntegrationType" NOT NULL DEFAULT 'API',
    "apiUrl" TEXT,
    "portalUrl" TEXT,
    "observacoes" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Carrier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarrierCredential" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "carrierId" INTEGER NOT NULL,
    "usuario" TEXT,
    "senhaCriptografada" TEXT,
    "tokenCriptografado" TEXT,
    "codigoCliente" TEXT,
    "ambiente" "Environment" NOT NULL DEFAULT 'PRODUCAO',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarrierCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER,
    "cnpjDestinatario" TEXT NOT NULL,
    "razaoSocialDestinatario" TEXT,
    "cepDestino" TEXT NOT NULL,
    "enderecoDestino" TEXT,
    "cidadeDestino" TEXT,
    "ufDestino" TEXT,
    "valorMercadoria" DECIMAL(12,2) NOT NULL,
    "pesoTotal" DECIMAL(12,3) NOT NULL,
    "quantidadeVolumes" INTEGER NOT NULL,
    "tipoFrete" TEXT NOT NULL,
    "modal" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'COMPLETED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteItem" (
    "id" SERIAL NOT NULL,
    "quoteId" INTEGER NOT NULL,
    "descricao" TEXT,
    "comprimento" DECIMAL(10,3) NOT NULL,
    "largura" DECIMAL(10,3) NOT NULL,
    "altura" DECIMAL(10,3) NOT NULL,
    "peso" DECIMAL(10,3) NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "cubagem" DECIMAL(10,4) NOT NULL,

    CONSTRAINT "QuoteItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteResult" (
    "id" SERIAL NOT NULL,
    "quoteId" INTEGER NOT NULL,
    "carrierId" INTEGER NOT NULL,
    "status" "ResultStatus" NOT NULL,
    "valorFrete" DECIMAL(12,2),
    "prazo" TEXT,
    "modalidade" TEXT,
    "mensagem" TEXT,
    "rawResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Company_cnpj_key" ON "Company"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "Carrier_nome_key" ON "Carrier"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "CarrierCredential_companyId_carrierId_key" ON "CarrierCredential"("companyId", "carrierId");

-- AddForeignKey
ALTER TABLE "CarrierCredential" ADD CONSTRAINT "CarrierCredential_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarrierCredential" ADD CONSTRAINT "CarrierCredential_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "Carrier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteResult" ADD CONSTRAINT "QuoteResult_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteResult" ADD CONSTRAINT "QuoteResult_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "Carrier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
