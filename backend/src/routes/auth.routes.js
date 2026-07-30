const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../db');
const auth = require('../middleware/auth');

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    companyId: user.companyId,
    active: user.active,
    mustChangePassword: user.mustChangePassword,
    company: user.company || null
  };
}

router.post('/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!email || !password) {
      return res.status(400).json({ message: 'Informe e-mail e senha.' });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { company: true }
    });

    if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ message: 'Credenciais inválidas.' });
    }

    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET não configurado.');
    }

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({ token, user: publicUser(user) });
  } catch (error) {
    res.status(500).json({
      message: 'Erro ao realizar login.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.get('/me', auth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { company: true }
  });

  res.json(publicUser(user));
});

router.post('/change-password', auth, async (req, res) => {
  try {
    const currentPassword = String(req.body.currentPassword || '');
    const newPassword = String(req.body.newPassword || '');

    if (newPassword.length < 8) {
      return res.status(400).json({
        message: 'A nova senha deve ter no mínimo 8 caracteres.'
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      return res.status(400).json({ message: 'Senha atual incorreta.' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(newPassword, 12),
        mustChangePassword: false
      }
    });

    res.json({ success: true, message: 'Senha alterada com sucesso.' });
  } catch (error) {
    res.status(400).json({
      message: 'Não foi possível alterar a senha.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
