const router = require('express').Router();
const prisma = require('../db');
const auth = require('../middleware/auth');
const { adminOnly } = require('../middleware/auth');
const { generateQuotePreview, saveQuotePreview } = require('../services/quote.service');
const { buildQuoteWorkbook } = require('../utils/excel');

router.use(auth);

function accessWhere() {
  // O histórico de cotações salvas é compartilhado entre todos os usuários autenticados.
  return {};
}

const quoteInclude = {
  company: true,
  user: { select: { id: true, name: true, email: true } },
  items: { include: { product: true } },
  results: { include: { carrier: true } }
};

async function findAccessibleQuote(id, user) {
  return prisma.quote.findFirst({
    where: { id: Number(id), ...accessWhere(user) },
    include: quoteInclude
  });
}

router.post('/preview', async (req, res) => {
  try {
    const preview = await generateQuotePreview(req.user, req.body);
    res.status(200).json(preview);
  } catch (error) {
    res.status(400).json({ message: 'Não foi possível gerar a cotação.', error: error.message });
  }
});

router.post('/save', async (req, res) => {
  try {
    const quote = await saveQuotePreview(req.user, req.body.draftToken);
    res.status(201).json(quote);
  } catch (error) {
    res.status(400).json({ message: 'Não foi possível salvar a cotação.', error: error.message });
  }
});

// Compatibilidade temporária com clientes antigos: gerar uma prévia sem salvar no histórico.
router.post('/', async (req, res) => {
  try {
    const preview = await generateQuotePreview(req.user, req.body);
    res.status(200).json(preview);
  } catch (error) {
    res.status(400).json({ message: 'Não foi possível gerar a cotação.', error: error.message });
  }
});

router.get('/', async (req, res) => {
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

router.get('/:id/export-excel', async (req, res) => {
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

router.get('/:id', async (req, res) => {
  try {
    const quote = await findAccessibleQuote(req.params.id, req.user);
    if (!quote) return res.status(404).json({ message: 'Cotação não encontrada.' });
    res.json(quote);
  } catch (error) {
    res.status(400).json({ message: 'Erro ao buscar cotação.', error: error.message });
  }
});

router.delete('/:id', adminOnly, async (req, res) => {
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
