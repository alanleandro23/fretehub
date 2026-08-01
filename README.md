# FreteHub — atualização V2

Consulte primeiro `PASSO_A_PASSO_APLICACAO.md`. Esta versão mantém a cotação como prévia até o clique em **Salvar cotação** e adiciona tracking de 1 hora, botão **Monitorar agora**, CRUD e configuração administrativa na própria página.

---

# FreteHub — cotação controlada e tracking automático

Aplicação de cotação e acompanhamento de fretes com frontend React/Vite, API Node/Express, Prisma e PostgreSQL.

## Alterações desta entrega

### Cotação sem gravação automática

- **Gerar cotação** consulta as transportadoras e exibe somente uma prévia.
- A prévia não aparece no Dashboard nem no Histórico.
- A cotação é gravada no banco somente após clicar em **Salvar cotação**.
- A prévia é criptografada e autenticada pelo backend e expira após 24 horas, evitando leitura ou alteração dos valores antes do salvamento.
- O salvamento é idempotente: cliques repetidos na mesma prévia não devem criar cotações duplicadas.
- A exportação para Excel fica disponível apenas depois que a cotação for salva.

### Tratamento de limite de consultas

- Erros como `Quota has been exceeded`, HTTP 429, `rate limit` e `too many requests` são reconhecidos como falhas temporárias.
- O backend tenta novamente com espera progressiva antes de devolver erro.
- Caso o limite continue ativo, a mensagem exibida ao usuário é traduzida e orienta a tentar novamente em alguns instantes.

### Tracking: inclusão manual e automação posterior

- O primeiro passo é o cadastro manual da carga.
- O cadastro gera o evento `CADASTRO_MANUAL` na timeline.
- A primeira consulta não bloqueia mais o formulário: ela é agendada para o worker.
- Depois do cadastro, o worker:
  - consulta a transportadora;
  - atualiza o status;
  - registra novas ocorrências na timeline;
  - usa intervalo progressivo após erros temporários;
  - interrompe o monitoramento após confirmar a entrega.

### Notificação de entrega

- A notificação visual na plataforma continua pendente até ser fechada pelo usuário.
- Quando a entrega é confirmada, o worker também agenda o envio de e-mail.
- O e-mail é enviado para os endereços válidos do usuário responsável e da empresa, sem duplicação.
- Falhas de envio são registradas e repetidas automaticamente com intervalo progressivo.
- Após o envio, a timeline recebe o evento `NOTIFICACAO_EMAIL_ENVIADA`.
- O envio pode usar um webhook próprio ou a API da Resend.

## Requisitos

- Node.js 20 ou superior
- PostgreSQL
- npm

## Atualização do banco e backend

Preserve seu arquivo `backend/.env` e faça backup do PostgreSQL antes de aplicar a migration.

```bash
cd backend
npm ci
npx prisma generate
npx prisma migrate deploy
npm run dev
```

Em produção:

```bash
npm start
```

## Frontend

```bash
cd frontend
npm ci
npm run dev
```

Build de produção:

```bash
npm run build
```

## Configuração da prévia de cotação

A assinatura usa `QUOTE_DRAFT_SECRET`. Quando ela não estiver preenchida, o backend utiliza `JWT_SECRET` ou `ENCRYPTION_KEY`.

```env
QUOTE_DRAFT_SECRET="UMA_CHAVE_FORTE_E_ALEATORIA"
```

## Worker de tracking

```env
TRACKING_WORKER_ENABLED=true
TRACKING_WORKER_INTERVAL_MS=60000
TRACKING_BATCH_SIZE=20
EMAIL_NOTIFICATION_BATCH_SIZE=20
```

O backend precisa permanecer em execução para consultar cargas e enviar notificações.

## Configuração de e-mail

### Opção 1 — webhook próprio

```env
EMAIL_NOTIFICATIONS_ENABLED=true
EMAIL_FROM="FreteHub <notificacoes@seudominio.com.br>"
APP_URL="https://fretehub.seudominio.com.br"
EMAIL_WEBHOOK_URL="https://seu-servico.exemplo/webhooks/email"
EMAIL_WEBHOOK_TOKEN="TOKEN_OPCIONAL"
```

O webhook recebe um `POST` JSON com o evento `shipment.delivered`, destinatários, assunto, HTML, texto e identificadores da carga.

### Opção 2 — Resend

```env
EMAIL_NOTIFICATIONS_ENABLED=true
EMAIL_FROM="FreteHub <notificacoes@seudominio.com.br>"
APP_URL="https://fretehub.seudominio.com.br"
RESEND_API_KEY="SUA_CHAVE"
```

Quando `EMAIL_WEBHOOK_URL` e `RESEND_API_KEY` estiverem preenchidos, o webhook tem prioridade.

## Integrações de transportadoras

As transportadoras disponíveis para cotação e tracking continuam dependendo de:

- cadastro ativo;
- integração implementada e habilitada;
- credencial válida para a empresa selecionada;
- URL de cotação ou tracking configurada.

Em produção, mantenha valores simulados desativados:

```env
ALLOW_MOCK_QUOTES=false
```

## Primeiro acesso

O seed mantém o usuário inicial:

```text
E-mail: admin@fretehub.com
Senha: admin123
```

Altere a senha no primeiro acesso.

## V19 — Histórico responsivo e empresas inteligentes

- Histórico de cotações em lista responsiva, sem barra horizontal da página.
- Menu de ações por cotação com visualização, Excel, PDF, envio e exclusão conforme permissão.
- Filtros avançados do tracking recolhíveis.
- Cadastro de empresa com consulta de CNPJ via backend e complemento de endereço por CEP.
- Logomarca da empresa por URL ou arquivo PNG/JPEG.
- Destinatários frequentes reaproveitados a partir das cotações salvas.
- Arquivos de logo armazenados fora do Git em `backend/storage/company-logos`.
