require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const {
  startTrackingWorker,
  stopTrackingWorker
} = require('./services/tracking.worker');

const app = express();

app.use(cors());
app.use(express.json({ limit: '12mb' }));

const companyLogoDirectory = path.resolve(
  process.env.COMPANY_LOGO_DIR || path.join(__dirname, '../storage/company-logos')
);
app.use('/company-logos', express.static(companyLogoDirectory, {
  fallthrough: true,
  maxAge: '1d',
  immutable: false
}));

app.use('/auth', require('./routes/auth.routes'));
app.use('/users', require('./routes/user.routes'));
app.use('/companies', require('./routes/company.routes'));
app.use('/products', require('./routes/product.routes'));
app.use('/carriers', require('./routes/carrier.routes'));
app.use('/carrier-credentials', require('./routes/credential.routes'));
app.use('/quotes', require('./routes/quote.routes'));
app.use('/tracking', require('./routes/tracking.routes'));
app.use('/notifications', require('./routes/notification.routes'));

app.get('/health', (_, res) => {
  res.json({ ok: true, app: 'FreteHub' });
});

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  res.status(500).json({ message: 'Erro interno do servidor.' });
});

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '0.0.0.0';

const server = app.listen(PORT, HOST, () => {
  console.log(`FreteHub API online na porta ${PORT}`);
  startTrackingWorker();
});

server.on('error', (error) => {
  console.error('Erro ao iniciar a API:', error);

  if (error.code === 'EADDRINUSE') {
    console.error(`A porta ${PORT} já está sendo utilizada por outro processo.`);
  }

  process.exitCode = 1;
});

function shutdown(signal) {
  console.log(`\n${signal} recebido. Encerrando FreteHub...`);
  stopTrackingWorker();

  server.close(() => {
    console.log('FreteHub encerrado corretamente.');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Encerramento forçado após 10 segundos.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
