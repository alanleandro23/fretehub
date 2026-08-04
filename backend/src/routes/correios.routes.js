const router = require('express').Router();
const prisma = require('../db');
const auth = require('../middleware/auth');
const { decrypt } = require('../utils/crypto');
const { evaluateCarrier } = require('../services/integration-registry');
const correios = require('../services/integrations/correios.service');

router.use(auth);

function credentialPayload(row) {
  if (!row) return null;
  return {
    id: row.id,
    ativo: row.ativo,
    ambiente: row.ambiente,
    usuario: row.usuario,
    senha: row.senhaCriptografada ? decrypt(row.senhaCriptografada) : null,
    token: row.tokenCriptografado ? decrypt(row.tokenCriptografado) : null,
    codigoCliente: row.codigoCliente,
    contrato: row.contrato,
    cnpjVinculado: row.cnpjVinculado,
    configuracao: row.configuracao || null
  };
}

async function correiosContext(req) {
  const companyId = req.user.role === 'ADMIN'
    ? Number(req.query.companyId || req.body?.companyId || 0)
    : Number(req.user.companyId || 0);

  if (!companyId) {
    throw new Error('Selecione uma empresa para utilizar a integração dos Correios.');
  }

  const company = await prisma.company.findFirst({
    where: { id: companyId, ativo: true }
  });
  if (!company) throw new Error('Empresa não encontrada ou inativa.');

  const carriers = await prisma.carrier.findMany({
    where: { ativo: true },
    orderBy: { id: 'asc' }
  });
  const carrier = carriers.find((row) =>
    String(row.nome || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .includes('correios')
  );

  if (!carrier) throw new Error('Cadastre e ative a transportadora Correios.');

  const credentialRow = await prisma.carrierCredential.findUnique({
    where: {
      companyId_carrierId_ambiente: {
        companyId,
        carrierId: carrier.id,
        ambiente: carrier.ambientePadrao
      }
    }
  });
  const credential = credentialPayload(credentialRow);
  const evaluation = evaluateCarrier(carrier, credential, { allowMock: false });

  if (!evaluation.available) {
    throw new Error(evaluation.reason || 'Credencial dos Correios indisponível.');
  }

  return {
    company,
    carrier: {
      id: carrier.id,
      nome: carrier.nome,
      ambiente: carrier.ambientePadrao,
      apiUrl: carrier.apiUrl
    },
    credential,
    credentialSource: evaluation.credentialSource
  };
}

router.get('/cep/:cep', async (req, res) => {
  try {
    const context = await correiosContext(req);
    const address = await correios.lookupCep(context, req.params.cep);
    res.json(address);
  } catch (error) {
    res.status(400).json({
      message: 'Não foi possível consultar o CEP nos Correios.',
      error: error.message
    });
  }
});

module.exports = router;
