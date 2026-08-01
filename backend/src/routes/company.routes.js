const router = require('express').Router();
const prisma = require('../db');
const auth = require('../middleware/auth');
const { adminOnly } = require('../middleware/auth');
const {
  serializeCompany,
  storeUploadedLogo,
  deleteUploadedLogo
} = require('../services/company-logo.service');
const { lookupCompanyByCnpj } = require('../services/company-profile.service');

router.use(auth);

function companyWhereForUser(user) {
  if (user.role === 'ADMIN') return {};
  return user.companyId ? { id: user.companyId, ativo: true } : { id: -1 };
}

function booleanValue(value, fallback = true) {
  if (value === undefined) return fallback;
  return value === true || value === 'true' || value === '1' || value === 'Ativo';
}

function nullableText(value) {
  if (value === undefined) return undefined;
  const normalized = String(value || '').trim();
  return normalized || null;
}

function companyData(body, partial = false) {
  const requiredText = ['razaoSocial', 'cnpj', 'cep', 'endereco', 'cidade', 'uf'];
  const optionalText = [
    'nomeFantasia',
    'inscricaoEstadual',
    'numero',
    'complemento',
    'bairro',
    'telefone',
    'email',
    'logoUrl'
  ];
  const data = {};

  for (const field of requiredText) {
    if (!partial || body[field] !== undefined) data[field] = String(body[field] || '').trim();
  }

  for (const field of optionalText) {
    const value = nullableText(body[field]);
    if (!partial || value !== undefined) data[field] = value;
  }

  if (!partial || body.ativo !== undefined) data.ativo = booleanValue(body.ativo, true);
  if (data.cnpj) data.cnpj = data.cnpj.replace(/\D/g, '');
  if (data.cep) data.cep = data.cep.replace(/\D/g, '');
  if (data.uf) data.uf = data.uf.toUpperCase().slice(0, 2);
  if (data.email) data.email = data.email.toLowerCase();
  return data;
}

function validateRequiredCompanyFields(data) {
  const labels = {
    razaoSocial: 'razão social',
    cnpj: 'CNPJ',
    cep: 'CEP',
    endereco: 'endereço',
    cidade: 'cidade',
    uf: 'UF'
  };
  const missing = Object.entries(labels).filter(([field]) => !data[field]).map(([, label]) => label);
  if (missing.length) throw new Error(`Preencha os campos obrigatórios: ${missing.join(', ')}.`);
  if (String(data.cnpj).replace(/\D/g, '').length !== 14) throw new Error('Informe o CNPJ com 14 dígitos.');
  if (String(data.cep).replace(/\D/g, '').length !== 8) throw new Error('Informe o CEP com 8 dígitos.');
}

async function applyLogoMutation(body, current = null) {
  const data = {};
  const clearUploadedLogo = body.clearLogoFile === true || body.clearLogoFile === 'true';
  let newLogo = null;

  if (body.logoDataBase64) newLogo = await storeUploadedLogo(body);

  if (newLogo) Object.assign(data, newLogo);
  else if (clearUploadedLogo) {
    Object.assign(data, {
      logoFileName: null,
      logoMimeType: null,
      logoStoragePath: null,
      logoUpdatedAt: null
    });
  }

  return {
    data,
    oldStoragePathToDelete: (newLogo || clearUploadedLogo) ? current?.logoStoragePath || null : null,
    newStoragePathToCleanup: newLogo?.logoStoragePath || null
  };
}

router.get('/lookup/cnpj/:cnpj', async (req, res) => {
  try {
    res.json(await lookupCompanyByCnpj(req.params.cnpj));
  } catch (error) {
    const status = error.status === 404 ? 404 : 400;
    res.status(status).json({ message: 'Não foi possível consultar o CNPJ.', error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const companies = await prisma.company.findMany({
      where: companyWhereForUser(req.user),
      orderBy: { razaoSocial: 'asc' }
    });
    res.json(companies.map(serializeCompany));
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar empresas.', error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (req.user.role !== 'ADMIN' && id !== req.user.companyId) {
      return res.status(403).json({ message: 'Empresa não permitida para este usuário.' });
    }
    const company = await prisma.company.findUnique({ where: { id } });
    if (!company) return res.status(404).json({ message: 'Empresa não encontrada.' });
    res.json(serializeCompany(company));
  } catch (error) {
    res.status(400).json({ message: 'Erro ao buscar empresa.', error: error.message });
  }
});

router.post('/', adminOnly, async (req, res) => {
  let logoMutation = null;
  try {
    const data = companyData(req.body);
    validateRequiredCompanyFields(data);
    logoMutation = await applyLogoMutation(req.body);
    const company = await prisma.company.create({ data: { ...data, ...logoMutation.data } });
    res.status(201).json(serializeCompany(company));
  } catch (error) {
    if (logoMutation?.newStoragePathToCleanup) await deleteUploadedLogo(logoMutation.newStoragePathToCleanup);
    res.status(400).json({ message: 'Erro ao cadastrar empresa.', error: error.message });
  }
});

router.put('/:id', adminOnly, async (req, res) => {
  let logoMutation = null;
  try {
    const current = await prisma.company.findUnique({ where: { id: Number(req.params.id) } });
    if (!current) return res.status(404).json({ message: 'Empresa não encontrada.' });

    const data = companyData(req.body, true);
    validateRequiredCompanyFields({ ...current, ...data });
    logoMutation = await applyLogoMutation(req.body, current);

    const company = await prisma.company.update({
      where: { id: current.id },
      data: { ...data, ...logoMutation.data }
    });
    if (logoMutation.oldStoragePathToDelete) await deleteUploadedLogo(logoMutation.oldStoragePathToDelete);
    res.json(serializeCompany(company));
  } catch (error) {
    if (logoMutation?.newStoragePathToCleanup) await deleteUploadedLogo(logoMutation.newStoragePathToCleanup);
    res.status(400).json({ message: 'Erro ao atualizar empresa.', error: error.message });
  }
});

router.post('/:id/activate', adminOnly, async (req, res) => {
  try {
    const companyId = Number(req.params.id);
    const company = await prisma.$transaction(async (tx) => {
      const activatedCompany = await tx.company.update({ where: { id: companyId }, data: { ativo: true } });
      await tx.user.updateMany({ where: { companyId }, data: { active: true } });
      return activatedCompany;
    });
    res.json({ success: true, message: 'Empresa e usuários vinculados foram ativados.', company: serializeCompany(company) });
  } catch (error) {
    res.status(400).json({ message: 'Não foi possível ativar esta empresa.', error: error.message });
  }
});

router.post('/:id/deactivate', adminOnly, async (req, res) => {
  try {
    const company = await prisma.company.update({ where: { id: Number(req.params.id) }, data: { ativo: false } });
    await prisma.user.updateMany({ where: { companyId: company.id }, data: { active: false } });
    res.json({ success: true, message: 'Empresa e usuários vinculados foram desativados.', company: serializeCompany(company) });
  } catch (error) {
    res.status(400).json({ message: 'Não foi possível desativar esta empresa.', error: error.message });
  }
});

router.delete('/:id', adminOnly, async (req, res) => {
  try {
    const companyId = Number(req.params.id);
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) return res.status(404).json({ message: 'Empresa não encontrada.' });

    await prisma.$transaction(async (tx) => {
      const quotes = await tx.quote.findMany({ where: { companyId }, select: { id: true } });
      const quoteIds = quotes.map((quote) => quote.id);
      const trackings = await tx.shipmentTracking.findMany({ where: { companyId }, select: { id: true } });
      const trackingIds = trackings.map((tracking) => tracking.id);

      if (trackingIds.length) await tx.shipmentEvent.deleteMany({ where: { trackingId: { in: trackingIds } } });
      await tx.shipmentTracking.deleteMany({ where: { companyId } });
      if (quoteIds.length) {
        await tx.quoteResult.deleteMany({ where: { quoteId: { in: quoteIds } } });
        await tx.quoteItem.deleteMany({ where: { quoteId: { in: quoteIds } } });
      }
      await tx.quote.deleteMany({ where: { companyId } });
      await tx.carrierCredential.deleteMany({ where: { companyId } });
      await tx.user.deleteMany({ where: { companyId, role: { in: ['OPERATOR', 'VIEWER'] } } });
      await tx.user.updateMany({ where: { companyId, role: 'ADMIN' }, data: { companyId: null } });
      await tx.company.delete({ where: { id: companyId } });
    });

    await deleteUploadedLogo(company.logoStoragePath);
    res.json({ success: true, message: 'Empresa excluída permanentemente com seus dados operacionais vinculados.' });
  } catch (error) {
    res.status(400).json({ message: 'Não foi possível excluir esta empresa.', error: error.message });
  }
});

module.exports = router;
