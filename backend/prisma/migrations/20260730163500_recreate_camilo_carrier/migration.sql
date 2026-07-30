-- Recria ou reativa a transportadora Camilo para cotacao via SSW.
-- Esta migration nao armazena credenciais. Usuario, senhas e dominio devem
-- ser cadastrados na tela Credenciais do FreteHub.
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
      'https://ssw.inf.br/ws/sswCotacaoCliente/help.html',
      'Cotacao via webservice SSW. Tracking automatico ainda nao configurado.',
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
           "portalUrl" = 'https://ssw.inf.br/ws/sswCotacaoCliente/help.html',
           "observacoes" = 'Cotacao via webservice SSW. Tracking automatico ainda nao configurado.',
           "ativo" = true,
           "updatedAt" = CURRENT_TIMESTAMP
     WHERE "id" = camilo_id;
  END IF;
END $$;
