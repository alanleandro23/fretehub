const express = require('express');
const auth = require('../middleware/auth');
const { adminOnly } = require('../middleware/auth');
const {
  MAX_PACKAGE_BYTES,
  getSystemUpdateStatus,
  validateAndStageUpdate,
  requestInstall,
  deleteStagedUpdate
} = require('../services/system-update.service');

const router = express.Router();
router.use(auth, adminOnly);

router.get('/status', (req, res) => {
  try {
    res.json(getSystemUpdateStatus());
  } catch (error) {
    res.status(500).json({ message: 'Erro ao consultar atualizações.', error: error.message });
  }
});

router.post(
  '/validate',
  express.raw({ type: ['application/zip', 'application/octet-stream'], limit: MAX_PACKAGE_BYTES }),
  (req, res) => {
    try {
      const result = validateAndStageUpdate(
        req.body,
        req.headers['x-fretehub-filename'] || 'fretehub-update.zip',
        req.user
      );
      res.status(201).json(result);
    } catch (error) {
      res.status(400).json({ message: 'Pacote de atualização recusado.', error: error.message });
    }
  }
);

router.post('/:id/install', (req, res) => {
  try {
    res.status(202).json(requestInstall(req.params.id, req.user));
  } catch (error) {
    res.status(400).json({ message: 'Não foi possível iniciar a atualização.', error: error.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    res.json(deleteStagedUpdate(req.params.id));
  } catch (error) {
    res.status(400).json({ message: 'Não foi possível remover o pacote.', error: error.message });
  }
});

router.use((error, req, res, next) => {
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Pacote de atualização excede o limite permitido.' });
  }
  return next(error);
});

module.exports = router;
