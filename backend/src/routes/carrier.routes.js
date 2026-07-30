const router = require('express').Router();
const prisma = require('../db');
const auth = require('../middleware/auth');
const { adminOnly } = require('../middleware/auth');
const { evaluateCarrier } = require('../services/integration-registry');

router.use(auth);

function booleanValue(value, fallback = true) {
  if (value === undefined) return fallback;
  return value === true || value === 'true' || value === '1' || value === 'Ativo';
}

function carrierData(body, partial = false) {
  const data = {};
  const set = (key, value) => {
    if (!partial || value !== undefined) data[key] = value;
  };

  set('nome', body.nome === undefined ? undefined : String(body.nome).trim());
  set('logoUrl', body.logoUrl === '' ? null : body.logoUrl);
  set('tipoIntegracao', body.tipoIntegracao || (partial ? undefined : 'API'));
  set('ambientePadrao', body.ambientePadrao || (partial ? undefined : 'HOMOLOGACAO'));
  set('apiUrl', body.apiUrl ? String(body.apiUrl).trim() : body.apiUrl === '' ? null : undefined);
  set('portalUrl', body.portalUrl ? String(body.portalUrl).trim() : body.portalUrl === '' ? null : undefined);
  set('observacoes', body.observacoes ? String(body.observacoes).trim() : body.observacoes === '' ? null : undefined);
  set('ativo', body.ativo === undefined ? undefined : booleanValue(body.ativo));

  return data;
}

router.get('/', async (req, res) => {
  try {
    const search = String(req.query.search || '').trim();
    const showAll = req.user.role === 'ADMIN' && req.query.active === 'all';

    const carriers = await prisma.carrier.findMany({
      where: {
        ...(showAll ? {} : { ativo: true }),
        ...(search
          ? { nome: { contains: search, mode: 'insensitive' } }
          : {})
      },
      orderBy: { nome: 'asc' }
    });

    res.json(carriers);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar transportadoras.', error: error.message });
  }
});

router.get('/available-for-quote', async (req, res) => {
  try {
    const companyId = req.user.role === 'ADMIN'
      ? Number(req.query.companyId || 0)
      : Number(req.user.companyId || 0);

    if (!companyId) {
      return res.json([]);
    }

    const company = await prisma.company.findFirst({
      where: { id: companyId, ativo: true },
      select: { id: true }
    });

    if (!company) {
      return res.status(404).json({ message: 'Empresa não encontrada ou inativa.' });
    }

    const carriers = await prisma.carrier.findMany({
      where: { ativo: true },
      orderBy: { nome: 'asc' }
    });

    const credentials = await prisma.carrierCredential.findMany({
      where: {
        companyId,
        ativo: true,
        carrierId: { in: carriers.map((carrier) => carrier.id) }
      }
    });

    const credentialByKey = new Map(
      credentials.map((credential) => [
        `${credential.carrierId}:${credential.ambiente}`,
        credential
      ])
    );

    const evaluated = carriers.map((carrier) => {
      const credential = credentialByKey.get(
        `${carrier.id}:${carrier.ambientePadrao}`
      ) || null;
      const availability = evaluateCarrier(carrier, credential);

      return {
        ...carrier,
        availableForQuote: availability.available,
        unavailableReason: availability.reason,
        credentialSource: availability.credentialSource
      };
    });

    const includeUnavailable =
      req.user.role === 'ADMIN' && req.query.includeUnavailable === 'true';

    res.json(
      includeUnavailable
        ? evaluated
        : evaluated.filter((carrier) => carrier.availableForQuote)
    );
  } catch (error) {
    res.status(500).json({
      message: 'Erro ao carregar transportadoras disponíveis.',
      error: error.message
    });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const carrier = await prisma.carrier.findUnique({ where: { id: Number(req.params.id) } });
    if (!carrier || (!carrier.ativo && req.user.role !== 'ADMIN')) {
      return res.status(404).json({ message: 'Transportadora não encontrada.' });
    }
    res.json(carrier);
  } catch (error) {
    res.status(400).json({ message: 'Erro ao buscar transportadora.', error: error.message });
  }
});

router.post('/', adminOnly, async (req, res) => {
  try {
    const data = carrierData(req.body);
    data.ativo = req.body.ativo === undefined ? true : booleanValue(req.body.ativo);
    if (!data.nome) return res.status(400).json({ message: 'Informe o nome da transportadora.' });

    const carrier = await prisma.carrier.create({ data });
    res.status(201).json(carrier);
  } catch (error) {
    res.status(400).json({ message: 'Erro ao cadastrar transportadora.', error: error.message });
  }
});

router.put('/:id', adminOnly, async (req, res) => {
  try {
    const carrier = await prisma.carrier.update({
      where: { id: Number(req.params.id) },
      data: carrierData(req.body, true)
    });
    res.json(carrier);
  } catch (error) {
    res.status(400).json({ message: 'Erro ao atualizar transportadora.', error: error.message });
  }
});

router.delete('/:id', adminOnly, async (req, res) => {
  try {
    const carrier = await prisma.carrier.update({
      where: { id: Number(req.params.id) },
      data: { ativo: false }
    });
    res.json({ success: true, message: 'Transportadora desativada com sucesso.', carrier });
  } catch (error) {
    res.status(400).json({ message: 'Não foi possível desativar esta transportadora.', error: error.message });
  }
});

router.post('/:id/test', adminOnly, async (req, res) => {
  try {
    const carrier = await prisma.carrier.findUnique({ where: { id: Number(req.params.id) } });
    if (!carrier) return res.status(404).json({ success: false, message: 'Transportadora não encontrada.' });
    if (!carrier.ativo) return res.json({ success: false, status: 'offline', message: 'Transportadora inativa.' });

    if (carrier.tipoIntegracao === 'MANUAL') {
  return res.json({
    success: true,
    status: 'manual',
    message: 'Transportadora manual configurada corretamente.'
  });
}

          const credential = await prisma.carrierCredential.findFirst({
            where: {
              carrierId: carrier.id,
              ambiente: carrier.ambientePadrao,
              ativo: true,
              ...(req.body.companyId
                ? { companyId: Number(req.body.companyId) }
                : {})
            },
            select: {
              id: true,
              companyId: true,
              ambiente: true
            }
          });

    if (carrier.tipoIntegracao === 'PORTAL' && !carrier.portalUrl) {
      return res.json({ success: false, status: 'pending', message: 'Informe a URL do portal.' });
    }

    if (carrier.tipoIntegracao === 'API' && !carrier.apiUrl) {
      return res.json({ success: false, status: 'pending', message: 'Informe a URL da API.' });
    }

    return res.json({
      success: true,
      status: credential ? 'configured' : 'pending-credentials',
      message: credential
        ? 'Configuração básica e credencial encontradas.'
        : 'URL validada, mas nenhuma credencial ativa foi encontrada para o ambiente selecionado.',
      carrier: {
        id: carrier.id,
        nome: carrier.nome,
        tipoIntegracao: carrier.tipoIntegracao,
        ambiente: carrier.ambientePadrao
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao testar transportadora.', error: error.message });
  }
});

module.exports = router;
