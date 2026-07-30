const router = require('express').Router();
const bcrypt = require('bcryptjs');
const prisma = require('../db');
const auth = require('../middleware/auth');
const { adminOnly } = require('../middleware/auth');

router.use(auth, adminOnly);

const selectUser = {
  id: true,
  email: true,
  name: true,
  role: true,
  companyId: true,
  active: true,
  mustChangePassword: true,
  createdAt: true,
  updatedAt: true,
  company: {
    select: {
      id: true,
      razaoSocial: true,
      nomeFantasia: true,
      cnpj: true
    }
  }
};

function normalizeRole(value) {
  return value === 'ADMIN' ? 'ADMIN' : 'USER';
}

function normalizeCompanyId(value) {
  if (value === '' || value === null || value === undefined) return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

router.get('/', async (req, res) => {
  try {
    const search = String(req.query.search || '').trim();
    const users = await prisma.user.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } }
            ]
          }
        : undefined,
      orderBy: { name: 'asc' },
      select: selectUser
    });

    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao listar usuários.', error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const name = String(req.body.name || '').trim();
    const initialPassword = String(req.body.initialPassword || req.body.password || '');

    if (!name || !email || initialPassword.length < 8) {
      return res.status(400).json({
        message: 'Informe nome, e-mail e senha inicial com no mínimo 8 caracteres.'
      });
    }

    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash: await bcrypt.hash(initialPassword, 12),
        role: normalizeRole(req.body.role),
        companyId: normalizeCompanyId(req.body.companyId),
        active: req.body.active !== false,
        mustChangePassword: true
      },
      select: selectUser
    });

    res.status(201).json(user);
  } catch (error) {
    res.status(400).json({ message: 'Erro ao criar usuário.', error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const data = {};

    if (req.body.email !== undefined) data.email = String(req.body.email).trim().toLowerCase();
    if (req.body.name !== undefined) data.name = String(req.body.name).trim();
    if (req.body.role !== undefined) data.role = normalizeRole(req.body.role);
    if (req.body.companyId !== undefined) data.companyId = normalizeCompanyId(req.body.companyId);
    if (req.body.active !== undefined) data.active = Boolean(req.body.active);

    if (id === req.user.id && data.active === false) {
      return res.status(400).json({ message: 'Você não pode desativar o próprio usuário.' });
    }

    if (id === req.user.id && data.role === 'USER') {
      return res.status(400).json({ message: 'Você não pode remover o próprio perfil ADMIN.' });
    }

    const user = await prisma.user.update({
      where: { id },
      data,
      select: selectUser
    });

    res.json(user);
  } catch (error) {
    res.status(400).json({ message: 'Erro ao atualizar usuário.', error: error.message });
  }
});

router.post('/:id/reset-password', async (req, res) => {
  try {
    const initialPassword = String(req.body.initialPassword || req.body.password || '');

    if (initialPassword.length < 8) {
      return res.status(400).json({ message: 'A senha inicial deve ter no mínimo 8 caracteres.' });
    }

    await prisma.user.update({
      where: { id: Number(req.params.id) },
      data: {
        passwordHash: await bcrypt.hash(initialPassword, 12),
        mustChangePassword: true
      }
    });

    res.json({ success: true, message: 'Senha redefinida. O usuário deverá alterá-la no próximo acesso.' });
  } catch (error) {
    res.status(400).json({ message: 'Erro ao redefinir senha.', error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (id === req.user.id) {
      return res.status(400).json({ message: 'Você não pode desativar o próprio usuário.' });
    }

    const user = await prisma.user.update({
      where: { id },
      data: { active: false },
      select: selectUser
    });

    res.json({ success: true, message: 'Usuário desativado com sucesso.', user });
  } catch (error) {
    res.status(400).json({ message: 'Erro ao desativar usuário.', error: error.message });
  }
});

module.exports = router;
