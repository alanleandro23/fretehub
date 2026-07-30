const router = require('express').Router();
const auth = require('../middleware/auth');
const { adminOnly } = require('../middleware/auth');

const {
  listTrackings,
  listAvailableCarriers,
  createTracking,
  updateTracking,
  deleteTracking,
  addTrackingEvent,
  getTrackingById,
  checkTrackingNow,
  pendingDeliveryNotifications,
  acknowledgeDeliveryNotification
} = require('../services/tracking.service');
const {
  getTrackingAdminConfig,
  updateTrackingAdminConfig
} = require('../services/config.service');

router.use(auth);

router.get('/admin/config', adminOnly, async (req, res) => {
  try {
    res.json(await getTrackingAdminConfig());
  } catch (error) {
    res.status(400).json({ message: 'Erro ao carregar as configurações do tracking.', error: error.message });
  }
});

router.put('/admin/config', adminOnly, async (req, res) => {
  try {
    res.json(await updateTrackingAdminConfig(req.body, req.user));
  } catch (error) {
    res.status(400).json({ message: 'Erro ao salvar as configurações do tracking.', error: error.message });
  }
});

router.get('/available-carriers', async (req, res) => {
  try {
    res.json(await listAvailableCarriers(req.query, req.user));
  } catch (error) {
    res.status(400).json({ message: 'Erro ao carregar transportadoras.', error: error.message });
  }
});

router.get('/notifications/pending', async (req, res) => {
  try {
    res.json(await pendingDeliveryNotifications(req.user));
  } catch (error) {
    res.status(400).json({ message: 'Erro ao consultar notificações.', error: error.message });
  }
});

router.post('/:id/notifications/ack', async (req, res) => {
  try {
    res.json(await acknowledgeDeliveryNotification(req.params.id, req.user));
  } catch (error) {
    res.status(400).json({ message: 'Erro ao confirmar notificação.', error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    res.json(await listTrackings(req.query, req.user));
  } catch (error) {
    res.status(400).json({ message: 'Erro ao consultar tracking.', error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await getTrackingById(req.params.id, req.user);
    if (!result) return res.status(404).json({ message: 'Tracking não encontrado.' });
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: 'Erro ao consultar tracking.', error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const result = await createTracking(req.body, req.user);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ message: 'Erro ao criar tracking.', error: error.message });
  }
});

router.put('/:id', adminOnly, async (req, res) => {
  try {
    res.json(await updateTracking(req.params.id, req.body, req.user));
  } catch (error) {
    res.status(400).json({ message: 'Erro ao alterar tracking.', error: error.message });
  }
});

router.delete('/:id', adminOnly, async (req, res) => {
  try {
    res.json(await deleteTracking(req.params.id));
  } catch (error) {
    res.status(400).json({ message: 'Erro ao excluir tracking.', error: error.message });
  }
});

router.post('/:id/check', async (req, res) => {
  try {
    res.json(await checkTrackingNow(req.params.id, req.user));
  } catch (error) {
    res.status(400).json({ message: 'Erro ao atualizar tracking.', error: error.message });
  }
});

router.post('/:id/events', adminOnly, async (req, res) => {
  try {
    res.json(await addTrackingEvent(req.params.id, req.body, req.user));
  } catch (error) {
    res.status(400).json({ message: 'Erro ao adicionar evento.', error: error.message });
  }
});

module.exports = router;
