-- Garante a transportadora Camilo ativa para cotacao e tracking.
DO $$
DECLARE
  camilo_id INTEGER;
BEGIN
  SELECT "id"
    INTO camilo_id
    FROM "Carrier"
   WHERE lower("nome") = lower('Camilo')
   ORDER BY "id"
   LIMIT 1;

  IF camilo_id IS NULL THEN
    INSERT INTO "Carrier" (
      "nome",
      "tipoIntegracao",
      "ambientePadrao",
      "apiUrl",
      "portalUrl",
      "observacoes",
      "ativo",
      "createdAt",
      "updatedAt"
    ) VALUES (
      'Camilo',
      'API',
      'PRODUCAO',
      'https://ssw.inf.br/ws/sswCotacaoCliente/index.php',
      'https://ssw.inf.br/2/rastreamento',
      'Cotacao via webservice SSW e tracking automatico pelo portal SSW.',
      true,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    );
  ELSE
    UPDATE "Carrier"
       SET "nome" = 'Camilo',
           "tipoIntegracao" = 'API',
           "ambientePadrao" = 'PRODUCAO',
           "apiUrl" = 'https://ssw.inf.br/ws/sswCotacaoCliente/index.php',
           "portalUrl" = 'https://ssw.inf.br/2/rastreamento',
           "observacoes" = 'Cotacao via webservice SSW e tracking automatico pelo portal SSW.',
           "ativo" = true,
           "updatedAt" = CURRENT_TIMESTAMP
     WHERE "id" = camilo_id;
  END IF;
END $$;

-- Salva o endpoint padrao de tracking apenas se ainda nao existir configuracao.
INSERT INTO "SystemSetting" (
  "key", "value", "encrypted", "updatedById", "createdAt", "updatedAt"
)
VALUES (
  'CAMILO_TRACKING_URL',
  'https://ssw.inf.br/2/ssw_resultSSW',
  false,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;
