const jwt = require('jsonwebtoken');
const prisma = require('../db');

const PERMISSIONS = Object.freeze({
  QUOTE_VIEW: 'QUOTE_VIEW',
  QUOTE_CREATE: 'QUOTE_CREATE',
  QUOTE_SAVE: 'QUOTE_SAVE',
  QUOTE_EXPORT: 'QUOTE_EXPORT',
  QUOTE_SEND: 'QUOTE_SEND',
  QUOTE_DELETE: 'QUOTE_DELETE',
  TRACKING_VIEW: 'TRACKING_VIEW',
  TRACKING_CREATE: 'TRACKING_CREATE',
  TRACKING_CHECK: 'TRACKING_CHECK',
  TRACKING_EDIT: 'TRACKING_EDIT',
  TRACKING_DELETE: 'TRACKING_DELETE',
  TRACKING_EVENT_CREATE: 'TRACKING_EVENT_CREATE',
  TRACKING_PROOF_CREATE: 'TRACKING_PROOF_CREATE',
  TRACKING_PROOF_DELETE: 'TRACKING_PROOF_DELETE',
  TRACKING_CONFIG_MANAGE: 'TRACKING_CONFIG_MANAGE',
  USER_MANAGE: 'USER_MANAGE',
  COMPANY_MANAGE: 'COMPANY_MANAGE',
  CARRIER_MANAGE: 'CARRIER_MANAGE',
  CREDENTIAL_MANAGE: 'CREDENTIAL_MANAGE',
  PRODUCT_MANAGE: 'PRODUCT_MANAGE'
});

const ALL_PERMISSIONS = Object.freeze(Object.values(PERMISSIONS));

const ROLE_PERMISSIONS = Object.freeze({
  ADMIN: ALL_PERMISSIONS,
  OPERATOR: Object.freeze([
    PERMISSIONS.QUOTE_VIEW,
    PERMISSIONS.QUOTE_CREATE,
    PERMISSIONS.QUOTE_SAVE,
    PERMISSIONS.QUOTE_EXPORT,
    PERMISSIONS.QUOTE_SEND,
    PERMISSIONS.TRACKING_VIEW,
    PERMISSIONS.TRACKING_CREATE,
    PERMISSIONS.TRACKING_CHECK,
    PERMISSIONS.TRACKING_PROOF_CREATE
  ]),
  VIEWER: Object.freeze([
    PERMISSIONS.QUOTE_VIEW,
    PERMISSIONS.QUOTE_EXPORT,
    PERMISSIONS.TRACKING_VIEW
  ])
});

function normalizeRole(role) {
  if (role === 'ADMIN') return 'ADMIN';
  if (role === 'VIEWER') return 'VIEWER';
  // Compatibilidade temporária com tokens/sessões antigas.
  return 'OPERATOR';
}

function permissionsForRole(role) {
  return [...(ROLE_PERMISSIONS[normalizeRole(role)] || [])];
}

function hasPermission(user, permission) {
  return Boolean(user && permissionsForRole(user.role).includes(permission));
}

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

    req.user = {
      ...user,
      role: normalizeRole(user.role),
      permissions: permissionsForRole(user.role)
    };
    next();
  } catch (error) {
    return res.status(401).json({
      message: 'Token inválido ou expirado.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

function requirePermission(...requiredPermissions) {
  return function permissionMiddleware(req, res, next) {
    const missing = requiredPermissions.filter(
      (permission) => !hasPermission(req.user, permission)
    );

    if (missing.length) {
      return res.status(403).json({
        message: 'Seu perfil não possui permissão para executar esta ação.',
        requiredPermissions: missing
      });
    }

    next();
  };
}

function adminOnly(req, res, next) {
  if (!req.user || normalizeRole(req.user.role) !== 'ADMIN') {
    return res.status(403).json({
      message: 'Acesso restrito ao administrador.'
    });
  }

  next();
}

module.exports = auth;
module.exports.adminOnly = adminOnly;
module.exports.requirePermission = requirePermission;
module.exports.hasPermission = hasPermission;
module.exports.permissionsForRole = permissionsForRole;
module.exports.normalizeRole = normalizeRole;
module.exports.PERMISSIONS = PERMISSIONS;
module.exports.ROLE_PERMISSIONS = ROLE_PERMISSIONS;
