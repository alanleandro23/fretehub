require('dotenv').config({
  path: require('path').resolve(__dirname, '../.env')
});

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const carriers = [
  {
    nome: 'Jamef',
    tipoIntegracao: 'API',
    ambientePadrao: 'HOMOLOGACAO',
    ativo: true
  },
  {
    nome: 'Braspress',
    tipoIntegracao: 'API',
    ambientePadrao: 'PRODUCAO',
    apiUrl: 'https://api.braspress.com',
    ativo: true
  },
  {
    nome: 'Correios',
    tipoIntegracao: 'API',
    ambientePadrao: 'HOMOLOGACAO',
    ativo: true
  },
  {
    nome: 'Camilo',
    tipoIntegracao: 'API',
    ambientePadrao: 'PRODUCAO',
    apiUrl: 'https://ssw.inf.br/ws/sswCotacaoCliente/index.php',
    portalUrl: 'https://ssw.inf.br/ws/sswCotacaoCliente/help.html',
    observacoes: 'Cotação via webservice SSW e tracking automático pelo portal SSW.',
    ativo: true
  }
];

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

  for (const carrier of carriers) {
    await prisma.carrier.upsert({
      where: { nome: carrier.nome },
      update: carrier,
      create: carrier
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
