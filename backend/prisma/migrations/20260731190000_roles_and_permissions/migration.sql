-- V15: perfis Administrador, Operador e Consulta.
-- Usuários antigos do perfil USER são preservados como OPERATOR.

CREATE TYPE "Role_new" AS ENUM ('ADMIN', 'OPERATOR', 'VIEWER');

ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User"
  ALTER COLUMN "role" TYPE "Role_new"
  USING (
    CASE
      WHEN "role"::text = 'USER' THEN 'OPERATOR'
      ELSE "role"::text
    END
  )::"Role_new";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'OPERATOR';

DROP TYPE "Role";
ALTER TYPE "Role_new" RENAME TO "Role";
