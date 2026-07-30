require('dotenv').config({
  path: require('path').resolve(__dirname, '../.env')
});

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  await prisma.user.upsert({
    where: { email: 'admin@fretehub.com' },
    update: {
      role: 'ADMIN',
      active: true
    },
    create: {
      email: 'admin@fretehub.com',
      name: 'Administrador',
      passwordHash: await bcrypt.hash('admin123', 12),
      role: 'ADMIN',
      active: true,
      mustChangePassword: true
    }
  });

  for (const nome of ['Jamef', 'Braspress', 'Correios', 'Movvi', 'Camilo', 'Generoso']) {
    await prisma.carrier.upsert({
      where: { nome },
      update: {},
      create: {
        nome,
        tipoIntegracao: 'API',
        ambientePadrao: 'HOMOLOGACAO',
        ativo: true
      }
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
