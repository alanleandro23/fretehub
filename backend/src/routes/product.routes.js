const router = require('express').Router();
const prisma = require('../db');
const auth = require('../middleware/auth');
const { adminOnly } = require('../middleware/auth');

router.use(auth);

function toBoolean(value, fallback = true) {
  if (value === undefined) return fallback;
  return value === true || value === 'true' || value === '1';
}

function productData(body, partial = false) {
  const data = {};

  const set = (key, value) => {
    if (!partial || value !== undefined) {
      data[key] = value;
    }
  };

  set(
    'description',
    body.description === undefined
      ? undefined
      : String(body.description).trim()
  );

  set(
    'lengthMeters',
    body.lengthMeters === undefined
      ? undefined
      : Number(body.lengthMeters)
  );

  set(
    'widthMeters',
    body.widthMeters === undefined
      ? undefined
      : Number(body.widthMeters)
  );

  set(
    'heightMeters',
    body.heightMeters === undefined
      ? undefined
      : Number(body.heightMeters)
  );

  set(
    'weightKg',
    body.weightKg === undefined
      ? undefined
      : Number(body.weightKg)
  );

  set(
    'active',
    body.active === undefined
      ? undefined
      : toBoolean(body.active)
  );

  return data;
}

function validateProduct(data, partial = false) {
  const requiredFields = [
    'description',
    'lengthMeters',
    'widthMeters',
    'heightMeters',
    'weightKg'
  ];

  if (
    !partial &&
    requiredFields.some(
      (field) =>
        data[field] === undefined ||
        data[field] === null ||
        data[field] === ''
    )
  ) {
    return 'Informe descrição, dimensões e peso do produto.';
  }

  if (
    data.description !== undefined &&
    String(data.description).trim().length < 2
  ) {
    return 'A descrição deve possuir pelo menos 2 caracteres.';
  }

  for (const field of [
    'lengthMeters',
    'widthMeters',
    'heightMeters'
  ]) {
    if (
      data[field] !== undefined &&
      (!Number.isFinite(data[field]) || data[field] <= 0)
    ) {
      return 'As dimensões devem ser maiores que zero e informadas em metros.';
    }
  }

  if (
    data.weightKg !== undefined &&
    (!Number.isFinite(data.weightKg) || data.weightKg <= 0)
  ) {
    return 'O peso deve ser maior que zero e informado em quilogramas.';
  }

  return null;
}

async function descriptionAlreadyExists(description, ignoredId = null) {
  if (!description) return false;

  const existing = await prisma.product.findFirst({
    where: {
      description: {
        equals: String(description).trim(),
        mode: 'insensitive'
      },
      ...(ignoredId
        ? {
            id: {
              not: ignoredId
            }
          }
        : {})
    },
    select: {
      id: true
    }
  });

  return Boolean(existing);
}

router.get('/', async (req, res) => {
  try {
    const search = String(req.query.search || '').trim();

    const where = {
      ...(req.user.role === 'ADMIN' && req.query.active === 'all'
        ? {}
        : {
            active:
              req.query.active === 'false' &&
              req.user.role === 'ADMIN'
                ? false
                : true
          }),
      ...(search
        ? {
            description: {
              contains: search,
              mode: 'insensitive'
            }
          }
        : {})
    };

    const products = await prisma.product.findMany({
      where,
      orderBy: {
        description: 'asc'
      },
      take: Math.min(Number(req.query.limit) || 100, 500)
    });

    res.json(products);
  } catch (error) {
    res.status(500).json({
      message: 'Erro ao listar produtos.',
      error: error.message
    });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const product = await prisma.product.findUnique({
      where: {
        id: Number(req.params.id)
      }
    });

    if (
      !product ||
      (!product.active && req.user.role !== 'ADMIN')
    ) {
      return res.status(404).json({
        message: 'Produto não encontrado.'
      });
    }

    res.json(product);
  } catch (error) {
    res.status(500).json({
      message: 'Erro ao consultar produto.',
      error: error.message
    });
  }
});

router.post('/', adminOnly, async (req, res) => {
  try {
    const data = productData(req.body);

    data.active =
      req.body.active === undefined
        ? true
        : toBoolean(req.body.active);

    const validationError = validateProduct(data);

    if (validationError) {
      return res.status(400).json({
        message: validationError
      });
    }

    if (await descriptionAlreadyExists(data.description)) {
      return res.status(409).json({
        message: 'Já existe um produto com essa descrição.'
      });
    }

    const product = await prisma.product.create({
      data
    });

    res.status(201).json(product);
  } catch (error) {
    res.status(400).json({
      message: 'Erro ao cadastrar produto.',
      error: error.message
    });
  }
});

router.put('/:id', adminOnly, async (req, res) => {
  try {
    const id = Number(req.params.id);

    const existingProduct = await prisma.product.findUnique({
      where: { id }
    });

    if (!existingProduct) {
      return res.status(404).json({
        message: 'Produto não encontrado.'
      });
    }

    const data = productData(req.body, true);
    const validationError = validateProduct(data, true);

    if (validationError) {
      return res.status(400).json({
        message: validationError
      });
    }

    if (
      data.description &&
      (await descriptionAlreadyExists(data.description, id))
    ) {
      return res.status(409).json({
        message: 'Já existe outro produto com essa descrição.'
      });
    }

    const product = await prisma.product.update({
      where: { id },
      data
    });

    res.json(product);
  } catch (error) {
    res.status(400).json({
      message: 'Erro ao atualizar produto.',
      error: error.message
    });
  }
});

router.delete('/:id', adminOnly, async (req, res) => {
  try {
    const product = await prisma.product.update({
      where: {
        id: Number(req.params.id)
      },
      data: {
        active: false
      }
    });

    res.json({
      success: true,
      message: 'Produto desativado com sucesso.',
      product
    });
  } catch (error) {
    res.status(400).json({
      message: 'Erro ao desativar produto.',
      error: error.message
    });
  }
});

module.exports = router;