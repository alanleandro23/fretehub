const jamef = require('./integrations/jamef.service');
const braspress = require('./integrations/braspress.service');
const camilo = require('./integrations/camilo.service');
const correios = require('./integrations/correios.service');
const { getConfigValue } = require('./config.service');

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function hasPassword(credential) {
  return Boolean(
    credential?.senha ||
    credential?.senhaCriptografada
  );
}

function hasToken(credential) {
  return Boolean(
    credential?.token ||
    credential?.tokenCriptografado
  );
}

function hasUser(credential) {
  return Boolean(String(credential?.usuario || '').trim());
}

function envFlag(name) {
  const value = String(process.env[name] || '').trim().toLowerCase();
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function hasEnvUserPassword(prefix) {
  return Boolean(
    String(process.env[`${prefix}_USERNAME`] || '').trim() &&
    String(process.env[`${prefix}_PASSWORD`] || '')
  );
}

const definitions = [
  {
    key: 'jamef',
    matches: ['jamef'],
    service: jamef,
    enabledEnv: 'JAMEF_API_ENABLED',
    credentialReady(credential) {
      return hasToken(credential) || (hasUser(credential) && hasPassword(credential));
    },
    envCredentialReady() {
      return Boolean(String(process.env.JAMEF_TOKEN || '').trim()) || hasEnvUserPassword('JAMEF');
    },
    async trackingReady() {
      return Boolean(String(await getConfigValue('JAMEF_TRACKING_URL', '')).trim());
    }
  },
  {
    key: 'braspress',
    matches: ['braspress'],
    service: braspress,
    enabledEnv: 'BRASPRESS_API_ENABLED',
    credentialReady(credential) {
      return hasUser(credential) && hasPassword(credential);
    },
    envCredentialReady() {
      return hasEnvUserPassword('BRASPRESS');
    },
    async trackingReady() {
      return Boolean(String(await getConfigValue('BRASPRESS_TRACKING_URL', '')).trim());
    }
  },
  {
    key: 'camilo',
    matches: ['camilo'],
    service: camilo,
    enabledEnv: 'CAMILO_API_ENABLED',
    credentialReady(credential) {
      return Boolean(
        hasUser(credential) &&
        hasPassword(credential) &&
        hasToken(credential) &&
        String(credential?.codigoCliente || '').trim()
      );
    },
    envCredentialReady() {
      return Boolean(
        hasEnvUserPassword('CAMILO') &&
        String(process.env.CAMILO_PAYER_PASSWORD || '').trim() &&
        String(process.env.CAMILO_DOMAIN || '').trim()
      );
    },
    async trackingReady() {
      return Boolean(String(await getConfigValue(
        'CAMILO_TRACKING_URL',
        'https://ssw.inf.br/2/ssw_resultSSW'
      )).trim());
    }
  },
  {
    key: 'correios',
    matches: ['correios'],
    service: correios,
    enabledEnv: 'CORREIOS_API_ENABLED',
    credentialReady(credential) {
      return hasToken(credential) || Boolean(
        hasUser(credential) &&
        hasPassword(credential) &&
        (String(credential?.codigoCliente || '').trim() || String(credential?.contrato || '').trim())
      );
    },
    envCredentialReady() {
      return Boolean(String(process.env.CORREIOS_TOKEN || '').trim()) || Boolean(
        hasEnvUserPassword('CORREIOS') &&
        (
          String(process.env.CORREIOS_CARD || process.env.CORREIOS_CARTAO_POSTAGEM || '').trim() ||
          String(process.env.CORREIOS_CONTRACT || process.env.CORREIOS_CONTRATO || '').trim()
        )
      );
    },
    trackingReady() {
      // A API Rastro usa os mesmos hosts oficiais e a mesma credencial
      // já validada para as demais APIs dos Correios.
      return true;
    }
  }
];

function getDefinition(carrierOrName) {
  const normalized = normalizeName(
    typeof carrierOrName === 'object'
      ? carrierOrName?.nome
      : carrierOrName
  );

  return definitions.find((definition) =>
    definition.matches.some((match) => normalized.includes(match))
  ) || null;
}

function allowMocks() {
  return String(process.env.ALLOW_MOCK_QUOTES || '').toLowerCase() === 'true';
}

function evaluateCarrier(carrier, credential, options = {}) {
  const definition = getDefinition(carrier);

  if (!carrier?.ativo) {
    return {
      available: false,
      reason: 'Transportadora inativa.',
      definition: null,
      credentialSource: null
    };
  }

  if (!definition?.service?.quoteFreight) {
    return {
      available: false,
      reason: 'Integração de cotação não implementada.',
      definition,
      credentialSource: null
    };
  }

  const explicitEnabled = envFlag(definition.enabledEnv);
  const databaseCredentialReady = Boolean(
    credential?.ativo !== false && definition.credentialReady(credential)
  );
  const environmentCredentialReady = definition.envCredentialReady();

  if (explicitEnabled === false && definition.strictDisable) {
    return {
      available: false,
      reason: 'Integração desativada no arquivo .env.',
      definition,
      credentialSource: null
    };
  }

  if (databaseCredentialReady) {
    return {
      available: true,
      reason: null,
      definition,
      credentialSource: 'database'
    };
  }

  if (explicitEnabled !== false && environmentCredentialReady) {
    return {
      available: true,
      reason: null,
      definition,
      credentialSource: 'environment'
    };
  }

  if (explicitEnabled === false) {
    return {
      available: false,
      reason: 'Integração desativada no arquivo .env e sem credencial ativa no sistema.',
      definition,
      credentialSource: null
    };
  }

  if (allowMocks() && options.allowMock !== false) {
    return {
      available: true,
      reason: null,
      definition,
      credentialSource: 'mock'
    };
  }

  return {
    available: false,
    reason: 'Credencial ativa e completa não encontrada para esta empresa.',
    definition,
    credentialSource: null
  };
}

async function evaluateTrackingCarrier(carrier, credential) {
  const quoteEvaluation = evaluateCarrier(carrier, credential, { allowMock: false });

  if (!quoteEvaluation.available) {
    return quoteEvaluation;
  }

  if (!quoteEvaluation.definition?.service?.trackShipment) {
    return {
      ...quoteEvaluation,
      available: false,
      reason: 'Tracking automático não implementado para esta transportadora.'
    };
  }

  if (!(await quoteEvaluation.definition.trackingReady())) {
    return {
      ...quoteEvaluation,
      available: false,
      reason: 'URL de tracking não configurada no arquivo .env.'
    };
  }

  return quoteEvaluation;
}

module.exports = {
  normalizeName,
  getDefinition,
  evaluateCarrier,
  evaluateTrackingCarrier
};
