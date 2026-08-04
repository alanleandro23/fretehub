const router = require('express').Router();
const prisma = require('../db');
const auth = require('../middleware/auth');
const { adminOnly } = require('../middleware/auth');
const { encrypt, decrypt } = require('../utils/crypto');
const { getDefinition } = require('../services/integration-registry');

router.use(auth, adminOnly);

const credentialSelect = {
  id: true,
  companyId: true,
  carrierId: true,
  usuario: true,
  codigoCliente: true,
  contrato: true,
  cnpjVinculado: true,
  configuracao: true,
  ambiente: true,
  ativo: true,
  createdAt: true,
  updatedAt: true,
  senhaCriptografada: true,
  tokenCriptografado: true,
  company: { select: { id: true, razaoSocial: true, nomeFantasia: true, cnpj: true } },
  carrier: { select: { id: true, nome: true, logoUrl: true } }
};

function safeCredential(row) {
  const { senhaCriptografada, tokenCriptografado, ...safe } = row;
  return {
    ...safe,
    hasPassword: Boolean(senhaCriptografada),
    hasToken: Boolean(tokenCriptografado)
  };
}

function credentialData(body, partial = false) {
  const data = {};
  const set = (key, value) => {
    if (!partial || value !== undefined) data[key] = value;
  };

  set('companyId', body.companyId === undefined ? undefined : Number(body.companyId));
  set('carrierId', body.carrierId === undefined ? undefined : Number(body.carrierId));
  set('ambiente', body.ambiente || (partial ? undefined : 'HOMOLOGACAO'));
  set('usuario', body.usuario === '' ? null : body.usuario);
  set('codigoCliente', body.codigoCliente === '' ? null : body.codigoCliente);
  set('contrato', body.contrato === '' ? null : body.contrato);
  set('cnpjVinculado', body.cnpjVinculado === '' ? null : body.cnpjVinculado);
  set('ativo', body.ativo === undefined ? undefined : body.ativo === true || body.ativo === 'true');

  if (
    body.configuracao !== undefined ||
    body.correiosDr !== undefined ||
    body.correiosProdutos !== undefined
  ) {
    const baseConfig = body.configuracao && typeof body.configuracao === 'object'
      ? body.configuracao
      : {};

    data.configuracao = {
      ...baseConfig,
      ...(body.correiosDr !== undefined
        ? { correiosDr: String(body.correiosDr || '').replace(/\D/g, '') || null }
        : {}),
      ...(body.correiosProdutos !== undefined
        ? { correiosProdutos: String(body.correiosProdutos || '').trim() || null }
        : {})
    };
  }

  if (body.senha) data.senhaCriptografada = encrypt(String(body.senha));
  if (body.token) data.tokenCriptografado = encrypt(String(body.token));
  if (body.clearPassword === true) data.senhaCriptografada = null;
  if (body.clearToken === true) data.tokenCriptografado = null;

  return data;
}

router.get('/', async (req, res) => {
  try {
    const rows = await prisma.carrierCredential.findMany({
      where: {
        ...(req.query.companyId ? { companyId: Number(req.query.companyId) } : {}),
        ...(req.query.carrierId ? { carrierId: Number(req.query.carrierId) } : {})
      },
      select: credentialSelect,
      orderBy: [{ company: { razaoSocial: 'asc' } }, { carrier: { nome: 'asc' } }]
    });

    res.json(rows.map(safeCredential));
  } catch (error) {
    res.status(500).json({ message: 'Erro ao listar credenciais.', error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const data = credentialData(req.body);
    data.ativo = req.body.ativo === undefined ? true : data.ativo;

    if (!Number.isInteger(data.companyId) || !Number.isInteger(data.carrierId)) {
      return res.status(400).json({ message: 'Informe empresa e transportadora.' });
    }

    const row = await prisma.carrierCredential.create({ data, select: credentialSelect });
    res.status(201).json(safeCredential(row));
  } catch (error) {
    res.status(400).json({ message: 'Erro ao cadastrar credencial.', error: error.message });
  }
});

router.post('/:id/test', async (req, res) => {
  try {
    const row = await prisma.carrierCredential.findUnique({
      where: { id: Number(req.params.id) },
      include: { company: true, carrier: true }
    });

    if (!row) {
      return res.status(404).json({ message: 'Credencial não encontrada.' });
    }

    const definition = getDefinition(row.carrier);
    if (!definition?.service?.testConnection) {
      return res.status(400).json({
        message: 'Esta integração não possui teste de autenticação implementado.'
      });
    }

    const result = await definition.service.testConnection({
      company: row.company,
      carrier: {
        id: row.carrier.id,
        nome: row.carrier.nome,
        ambiente: row.ambiente,
        apiUrl: row.carrier.apiUrl
      },
      credential: {
        id: row.id,
        ambiente: row.ambiente,
        usuario: row.usuario,
        senha: row.senhaCriptografada ? decrypt(row.senhaCriptografada) : null,
        token: row.tokenCriptografado ? decrypt(row.tokenCriptografado) : null,
        codigoCliente: row.codigoCliente,
        contrato: row.contrato,
        cnpjVinculado: row.cnpjVinculado,
        configuracao: row.configuracao || null
      }
    });

    res.json(result);
  } catch (error) {
    res.status(400).json({
      success: false,
      status: 'offline',
      message: 'Falha ao autenticar nos Correios.',
      error: error.message
    });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const row = await prisma.carrierCredential.update({
      where: { id: Number(req.params.id) },
      data: credentialData(req.body, true),
      select: credentialSelect
    });
    res.json(safeCredential(row));
  } catch (error) {
    res.status(400).json({ message: 'Erro ao atualizar credencial.', error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const row = await prisma.carrierCredential.update({
      where: { id: Number(req.params.id) },
      data: { ativo: false },
      select: credentialSelect
    });
    res.json({ success: true, message: 'Credencial desativada.', credential: safeCredential(row) });
  } catch (error) {
    res.status(400).json({ message: 'Erro ao desativar credencial.', error: error.message });
  }
});

module.exports = router;
