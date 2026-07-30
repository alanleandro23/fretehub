const jwt = require('jsonwebtoken');
const prisma = require('../db');

async function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Token ausente.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: Number(payload.id) },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        companyId: true,
        active: true,
        mustChangePassword: true
      }
    });

    if (!user || !user.active) {
      return res.status(401).json({ message: 'Usuário inexistente ou inativo.' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      message: 'Token inválido ou expirado.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({
      message: 'Acesso restrito ao administrador.'
    });
  }

  next();
}

module.exports = auth;
module.exports.adminOnly = adminOnly;
