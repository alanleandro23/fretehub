const router = require('express').Router();
const prisma = require('../db');
const auth = require('../middleware/auth');
const { adminOnly } = require('../middleware/auth');
const { encrypt } = require('../utils/crypto');

router.use(auth, adminOnly);

const credentialSelect = {
  id: true,
  companyId: true,
  carrierId: true,
  usuario: true,
  codigoCliente: true,
  contrato: true,
  cnpjVinculado: true,
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
