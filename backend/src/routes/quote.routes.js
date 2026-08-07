const router = require('express').Router();
const prisma = require('../db');
const auth = require('../middleware/auth');
const { requirePermission, hasPermission, PERMISSIONS } = require('../middleware/auth');
const { generateQuotePreview, saveQuotePreview } = require('../services/quote.service');
const { buildQuoteWorkbook } = require('../utils/excel');
const { buildQuotePdf } = require('../utils/pdf');
const { sendQuoteProposal } = require('../services/quote-proposal.service');

router.use(auth);

router.get('/companies/available', requirePermission(PERMISSIONS.QUOTE_CREATE), async (req, res) => {
  try {
    const companies = await prisma.company.findMany({
      where: { ativo: true },
      select: {
        id: true,
        razaoSocial: true,
        nomeFantasia: true,
        cnpj: true,
        cep: true,
        endereco: true,
        numero: true,
        complemento: true,
        bairro: true,
        cidade: true,
        uf: true,
        ativo: true
      },
      orderBy: { razaoSocial: 'asc' }
    });
    res.json(companies);
  } catch (error) {
    res.status(500).json({
      message: 'Erro ao carregar empresas disponíveis para cotação.',
      error: error.message
    });
  }
});

function accessWhere() {
  // O histórico de cotações salvas é compartilhado entre todos os usuários autenticados.
  return {};
}

const quoteInclude = {
  company: true,
  user: { select: { id: true, name: true, email: true } },
  items: { include: { product: true } },
  results: { include: { carrier: true } },
  proposalLogs: {
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50
  }
};

async function findAccessibleQuote(id, user) {
  const quote = await prisma.quote.findFirst({
    where: { id: Number(id), ...accessWhere(user) },
    include: quoteInclude
  });
  if (quote && !hasPermission(user, PERMISSIONS.QUOTE_SEND)) quote.proposalLogs = [];
  return quote;
}

router.post('/preview', requirePermission(PERMISSIONS.QUOTE_CREATE), async (req, res) => {
  try {
    const preview = await generateQuotePreview(req.user, req.body);
    res.status(200).json(preview);
  } catch (error) {
    res.status(400).json({ message: 'Não foi possível gerar a cotação.', error: error.message });
  }
});

router.post('/save', requirePermission(PERMISSIONS.QUOTE_SAVE), async (req, res) => {
  try {
    const quote = await saveQuotePreview(req.user, req.body.draftToken);
    res.status(201).json(quote);
  } catch (error) {
    res.status(400).json({ message: 'Não foi possível salvar a cotação.', error: error.message });
  }
});

// Compatibilidade temporária com clientes antigos: gerar uma prévia sem salvar no histórico.
router.post('/', requirePermission(PERMISSIONS.QUOTE_CREATE), async (req, res) => {
  try {
    const preview = await generateQuotePreview(req.user, req.body);
    res.status(200).json(preview);
  } catch (error) {
    res.status(400).json({ message: 'Não foi possível gerar a cotação.', error: error.message });
  }
});

router.get('/', requirePermission(PERMISSIONS.QUOTE_VIEW), async (req, res) => {
  try {
    const quotes = await prisma.quote.findMany({
      where: {
        status: { not: 'INACTIVE' },
        ...accessWhere(req.user)
      },
      include: {
        company: true,
        user: { select: { id: true, name: true, email: true } },
        results: { include: { carrier: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(req.query.limit) || 200, 1000)
    });
    res.json(quotes);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao consultar histórico.', error: error.message });
  }
});


router.get('/recipients/frequent', requirePermission(PERMISSIONS.QUOTE_CREATE), async (req, res) => {
  try {
    const quotes = await prisma.quote.findMany({
      where: { status: { not: 'INACTIVE' } },
      select: {
        cnpjDestinatario: true,
        razaoSocialDestinatario: true,
        cepDestino: true,
        enderecoDestino: true,
        cidadeDestino: true,
        ufDestino: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' },
      take: 500
    });

    const unique = new Map();
    for (const quote of quotes) {
      const key = String(quote.cnpjDestinatario || '').replace(/\D/g, '');
      if (!key || unique.has(key)) continue;
      unique.set(key, {
        cnpj: key,
        razaoSocial: quote.razaoSocialDestinatario || '',
        cep: String(quote.cepDestino || '').replace(/\D/g, ''),
        endereco: quote.enderecoDestino || '',
        cidade: quote.cidadeDestino || '',
        uf: quote.ufDestino || '',
        lastUsedAt: quote.createdAt
      });
    }
    res.json(Array.from(unique.values()).slice(0, 100));
  } catch (error) {
    res.status(500).json({ message: 'Erro ao consultar destinatários frequentes.', error: error.message });
  }
});

router.get('/:id/export-excel', requirePermission(PERMISSIONS.QUOTE_EXPORT), async (req, res) => {
  try {
    const quote = await findAccessibleQuote(req.params.id, req.user);
    if (!quote) return res.status(404).json({ message: 'Cotação não encontrada.' });

    const workbook = await buildQuoteWorkbook(quote);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=cotacao-${quote.id}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res.status(400).json({ message: 'Erro ao exportar cotação.', error: error.message });
  }
});

router.get('/:id/export-pdf', requirePermission(PERMISSIONS.QUOTE_EXPORT), async (req, res) => {
  try {
    const quote = await findAccessibleQuote(req.params.id, req.user);
    if (!quote) return res.status(404).json({ message: 'Cotação não encontrada.' });

    const pdf = await buildQuotePdf(quote);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=cotacao-${quote.id}.pdf`);
    res.end(pdf);
  } catch (error) {
    res.status(400).json({ message: 'Erro ao gerar o PDF da cotação.', error: error.message });
  }
});

router.post('/:id/send-proposal', requirePermission(PERMISSIONS.QUOTE_SEND), async (req, res) => {
  try {
    const quote = await findAccessibleQuote(req.params.id, req.user);
    if (!quote) return res.status(404).json({ message: 'Cotação não encontrada.' });

    const proposal = await sendQuoteProposal({
      quote,
      user: req.user,
      to: req.body.to,
      cc: req.body.cc,
      subject: req.body.subject,
      message: req.body.message,
      formats: req.body.formats
    });
    res.status(201).json({ success: true, message: 'Proposta enviada por e-mail.', proposal });
  } catch (error) {
    res.status(400).json({ message: 'Não foi possível enviar a proposta.', error: error.message });
  }
});

router.get('/:id', requirePermission(PERMISSIONS.QUOTE_VIEW), async (req, res) => {
  try {
    const quote = await findAccessibleQuote(req.params.id, req.user);
    if (!quote) return res.status(404).json({ message: 'Cotação não encontrada.' });
    res.json(quote);
  } catch (error) {
    res.status(400).json({ message: 'Erro ao buscar cotação.', error: error.message });
  }
});

router.delete('/:id', requirePermission(PERMISSIONS.QUOTE_DELETE), async (req, res) => {
  try {
    const quote = await prisma.quote.update({
      where: { id: Number(req.params.id) },
      data: { status: 'INACTIVE' }
    });
    res.json({ success: true, message: 'Cotação removida do histórico.', quote });
  } catch (error) {
    res.status(400).json({ message: 'Erro ao remover cotação.', error: error.message });
  }
});

module.exports = router;
