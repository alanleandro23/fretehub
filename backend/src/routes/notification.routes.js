const router = require('express').Router();
const auth = require('../middleware/auth');
const { requirePermission, PERMISSIONS } = require('../middleware/auth');
const {
  listNotifications,
  unreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  archiveNotification
} = require('../services/notification.service');

router.use(auth, requirePermission(PERMISSIONS.TRACKING_VIEW));

router.get('/', async (req, res) => {
  try {
    res.json(await listNotifications(req.user, req.query));
  } catch (error) {
    res.status(400).json({ message: 'Erro ao carregar notificações.', error: error.message });
  }
});

router.get('/unread-count', async (req, res) => {
  try {
    res.json(await unreadCount(req.user));
  } catch (error) {
    res.status(400).json({ message: 'Erro ao contar notificações.', error: error.message });
  }
});

router.post('/read-all', async (req, res) => {
  try {
    res.json(await markAllNotificationsRead(req.user));
  } catch (error) {
    res.status(400).json({ message: 'Erro ao marcar notificações.', error: error.message });
  }
});

router.post('/:id/read', async (req, res) => {
  try {
    res.json(await markNotificationRead(req.params.id, req.user));
  } catch (error) {
    res.status(400).json({ message: 'Erro ao marcar notificação.', error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    res.json(await archiveNotification(req.params.id, req.user));
  } catch (error) {
    res.status(400).json({ message: 'Erro ao arquivar notificação.', error: error.message });
  }
});

module.exports = router;
