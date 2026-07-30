const {
  processDueTrackings,
  processPendingDeliveryEmails
} = require('./tracking.service');

const ONE_HOUR_MS = 60 * 60 * 1000;
let timer = null;
let running = false;

async function runCycle() {
  if (running) return;
  running = true;

  try {
    const batchSize = Number(process.env.TRACKING_BATCH_SIZE || 20);
    const trackingResults = await processDueTrackings(batchSize);
    const failedTrackings = trackingResults.filter((item) => !item.success);

    if (failedTrackings.length) {
      console.warn(`Tracking automático: ${failedTrackings.length} consulta(s) com erro no ciclo.`);
    }

    const emailResults = await processPendingDeliveryEmails(
      Number(process.env.EMAIL_NOTIFICATION_BATCH_SIZE || batchSize)
    );
    const failedEmails = emailResults.filter((item) => !item.success);

    if (failedEmails.length) {
      console.warn(`Notificações por e-mail: ${failedEmails.length} envio(s) pendente(s) após erro.`);
    }
  } catch (error) {
    console.error('Falha no ciclo do tracking automático:', error.message);
  } finally {
    running = false;
  }
}

function startTrackingWorker() {
  if (process.env.TRACKING_WORKER_ENABLED === 'false' || timer) return;

  timer = setInterval(runCycle, ONE_HOUR_MS);
  setTimeout(runCycle, 1500);
  console.log('Tracking automático ativo (ciclo fixo a cada 1 hora).');
}

function stopTrackingWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { startTrackingWorker, stopTrackingWorker, runCycle };
