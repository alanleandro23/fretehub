const prisma = require('../db');
const router = require('express').Router();
const auth = require('../middleware/auth');
const { requirePermission, PERMISSIONS } = require('../middleware/auth');

const {
  listTrackings,
  listAvailableCarriers,
  getTrackingFilterOptions,
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
const { sendTestEmail } = require('../services/email.service');
const {
  listDeliveryProofs,
  createManualDeliveryProof,
  getDeliveryProofFile,
  deleteDeliveryProof
} = require('../services/delivery-proof.service');

router.use(auth);

router.get('/admin/config', requirePermission(PERMISSIONS.TRACKING_CONFIG_MANAGE), async (req, res) => {
  try {
    res.json(await getTrackingAdminConfig());
  } catch (error) {
    res.status(400).json({ message: 'Erro ao carregar as configurações do tracking.', error: error.message });
  }
});

router.put('/admin/config', requirePermission(PERMISSIONS.TRACKING_CONFIG_MANAGE), async (req, res) => {
  try {
    res.json(await updateTrackingAdminConfig(req.body, req.user));
  } catch (error) {
    res.status(400).json({ message: 'Erro ao salvar as configurações do tracking.', error: error.message });
  }
});

router.post('/admin/email-test', requirePermission(PERMISSIONS.TRACKING_CONFIG_MANAGE), async (req, res) => {
  const recipient = String(req.body?.to || '').trim();
  try {
    const result = await sendTestEmail(recipient, req.user);
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'SMTP_TEST_SUCCESS',
        entity: 'SystemSetting',
        payload: { provider: result.provider, recipients: result.recipients }
      }
    }).catch(() => null);
    res.json({ success: true, provider: result.provider, recipients: result.recipients });
  } catch (error) {
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'SMTP_TEST_FAILURE',
        entity: 'SystemSetting',
        payload: { recipient, error: error.message }
      }
    }).catch(() => null);
    res.status(400).json({ message: 'Falha no envio do e-mail de teste.', error: error.message });
  }
});


router.get('/filter-options', requirePermission(PERMISSIONS.TRACKING_VIEW), async (req, res) => {
  try {
    res.json(await getTrackingFilterOptions(req.user));
  } catch (error) {
    res.status(400).json({ message: 'Erro ao carregar opções dos filtros.', error: error.message });
  }
});

router.get('/available-carriers', requirePermission(PERMISSIONS.TRACKING_CREATE), async (req, res) => {
  try {
    res.json(await listAvailableCarriers(req.query, req.user));
  } catch (error) {
    res.status(400).json({ message: 'Erro ao carregar transportadoras.', error: error.message });
  }
});

router.get('/notifications/pending', requirePermission(PERMISSIONS.TRACKING_VIEW), async (req, res) => {
  try {
    res.json(await pendingDeliveryNotifications(req.user));
  } catch (error) {
    res.status(400).json({ message: 'Erro ao consultar notificações.', error: error.message });
  }
});

router.post('/:id/notifications/ack', requirePermission(PERMISSIONS.TRACKING_VIEW), async (req, res) => {
  try {
    res.json(await acknowledgeDeliveryNotification(req.params.id, req.user));
  } catch (error) {
    res.status(400).json({ message: 'Erro ao confirmar notificação.', error: error.message });
  }
});

router.get('/', requirePermission(PERMISSIONS.TRACKING_VIEW), async (req, res) => {
  try {
    res.json(await listTrackings(req.query, req.user));
  } catch (error) {
    res.status(400).json({ message: 'Erro ao consultar tracking.', error: error.message });
  }
});


router.get('/:id/proofs', requirePermission(PERMISSIONS.TRACKING_VIEW), async (req, res) => {
  try {
    res.json(await listDeliveryProofs(req.params.id, req.user));
  } catch (error) {
    res.status(400).json({ message: 'Erro ao consultar comprovantes.', error: error.message });
  }
});

router.post('/:id/proofs', requirePermission(PERMISSIONS.TRACKING_PROOF_CREATE), async (req, res) => {
  try {
    res.status(201).json(await createManualDeliveryProof(req.params.id, req.body, req.user));
  } catch (error) {
    res.status(400).json({ message: 'Erro ao anexar comprovante.', error: error.message });
  }
});

router.get('/:id/proofs/:proofId/download', requirePermission(PERMISSIONS.TRACKING_VIEW), async (req, res) => {
  try {
    const { proof, absolutePath } = await getDeliveryProofFile(req.params.id, req.params.proofId, req.user);
    res.download(absolutePath, proof.fileName || `comprovante-${proof.id}`);
  } catch (error) {
    res.status(400).json({ message: 'Erro ao baixar comprovante.', error: error.message });
  }
});

router.delete('/:id/proofs/:proofId', requirePermission(PERMISSIONS.TRACKING_PROOF_DELETE), async (req, res) => {
  try {
    res.json(await deleteDeliveryProof(req.params.id, req.params.proofId, req.user));
  } catch (error) {
    res.status(400).json({ message: 'Erro ao excluir comprovante.', error: error.message });
  }
});

router.get('/:id', requirePermission(PERMISSIONS.TRACKING_VIEW), async (req, res) => {
  try {
    const result = await getTrackingById(req.params.id, req.user);
    if (!result) return res.status(404).json({ message: 'Tracking não encontrado.' });
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: 'Erro ao consultar tracking.', error: error.message });
  }
});

router.post('/', requirePermission(PERMISSIONS.TRACKING_CREATE), async (req, res) => {
  try {
    const result = await createTracking(req.body, req.user);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ message: 'Erro ao criar tracking.', error: error.message });
  }
});

router.put('/:id', requirePermission(PERMISSIONS.TRACKING_EDIT), async (req, res) => {
  try {
    res.json(await updateTracking(req.params.id, req.body, req.user));
  } catch (error) {
    res.status(400).json({ message: 'Erro ao alterar tracking.', error: error.message });
  }
});

router.delete('/:id', requirePermission(PERMISSIONS.TRACKING_DELETE), async (req, res) => {
  try {
    res.json(await deleteTracking(req.params.id));
  } catch (error) {
    res.status(400).json({ message: 'Erro ao excluir tracking.', error: error.message });
  }
});

router.post('/:id/check', requirePermission(PERMISSIONS.TRACKING_CHECK), async (req, res) => {
  try {
    res.json(await checkTrackingNow(req.params.id, req.user));
  } catch (error) {
    res.status(400).json({ message: 'Erro ao atualizar tracking.', error: error.message });
  }
});

router.post('/:id/events', requirePermission(PERMISSIONS.TRACKING_EVENT_CREATE), async (req, res) => {
  try {
    res.json(await addTrackingEvent(req.params.id, req.body, req.user));
  } catch (error) {
    res.status(400).json({ message: 'Erro ao adicionar evento.', error: error.message });
  }
});

module.exports = router;
