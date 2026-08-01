# FreteHub

Plataforma web para **cotação de fretes, comparação de transportadoras, acompanhamento de cargas, notificações operacionais e envio de propostas comerciais**.

O FreteHub centraliza a operação logística de múltiplas empresas e filiais, permite consultar diferentes transportadoras, salvar somente as cotações aprovadas pelo usuário, acompanhar eventos de tracking em uma timeline sem duplicações e distribuir alertas por plataforma e e-mail.

> **Baseline funcional:** V19  
> **Repositório:** https://github.com/alanleandro23/fretehub

---

## Sumário

- [Visão geral](#visão-geral)
- [Principais funcionalidades](#principais-funcionalidades)
- [Integrações](#integrações)
- [Perfis e permissões](#perfis-e-permissões)
- [Arquitetura](#arquitetura)
- [Tecnologias](#tecnologias)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Pré-requisitos](#pré-requisitos)
- [Instalação](#instalação)
- [Configuração de ambiente](#configuração-de-ambiente)
- [Banco de dados e Prisma](#banco-de-dados-e-prisma)
- [Execução em desenvolvimento](#execução-em-desenvolvimento)
- [Configuração das transportadoras](#configuração-das-transportadoras)
- [Configuração de e-mail](#configuração-de-e-mail)
- [Fluxos de negócio](#fluxos-de-negócio)
- [Armazenamento de arquivos](#armazenamento-de-arquivos)
- [API HTTP](#api-http)
- [Produção](#produção)
- [Backup e restauração](#backup-e-restauração)
- [Segurança](#segurança)
- [Solução de problemas](#solução-de-problemas)
- [Validação funcional](#validação-funcional)
- [Limitações conhecidas](#limitações-conhecidas)
- [Roadmap](#roadmap)
- [Versionamento](#versionamento)

---

## Visão geral

O FreteHub foi desenvolvido para reduzir trabalho manual e reunir em uma única aplicação:

- cadastro de empresas, filiais, produtos e transportadoras;
- credenciais diferentes por empresa e ambiente;
- cotação simultânea em múltiplas transportadoras;
- comparação por preço e prazo;
- histórico compartilhado de cotações salvas;
- tracking manual com atualização automática;
- timeline logística com deduplicação de eventos;
- alertas de entrega, atraso, divergência e falha de consulta;
- comprovantes de entrega por link ou anexo;
- exportação de propostas em Excel e PDF;
- envio de propostas por e-mail;
- controle de acesso por perfil.

A aplicação possui uma API própria em Node.js e uma SPA React. O banco de dados principal é PostgreSQL, acessado por Prisma ORM.

---

## Principais funcionalidades

### Cotação de frete

- Consulta simultânea às transportadoras habilitadas para a empresa.
- Validação de CNPJ/CPF, CEP, valor, peso, volumes e dimensões.
- Cadastro de múltiplos volumes e produtos.
- Reaproveitamento de produtos já cadastrados.
- Destinatários frequentes recuperados das cotações anteriores.
- Destaque de menor preço e menor prazo.
- Tratamento de HTTP 429, `rate limit` e indisponibilidade temporária.
- Mensagens normalizadas para o usuário, incluindo retornos HTML do SSW.

#### Prévia antes de salvar

O fluxo de cotação é intencionalmente dividido em duas etapas:

1. **Gerar cotação** cria somente uma prévia.
2. **Salvar cotação** grava a cotação no banco e no histórico.

A prévia:

- não aparece no histórico;
- expira em 24 horas;
- é protegida com AES-256-GCM;
- é vinculada ao usuário e à empresa;
- possui salvamento idempotente para impedir duplicações.

### Histórico de cotações

- Exibe todas as cotações efetivamente salvas.
- Visível para todos os perfis autorizados.
- Layout responsivo, sem barra horizontal externa.
- Mostra responsável, rota, mercadoria, melhor preço e melhor prazo.
- Visualização detalhada ao selecionar a cotação.
- Exportação em Excel e PDF.
- Envio da proposta por e-mail.
- Registro dos envios realizados.

### Excel e PDF

- Logomarca da empresa.
- Identificação da cotação e do responsável.
- Remetente e destinatário.
- Origem e destino.
- Produtos, volumes, medidas, cubagem e peso.
- Valor declarado.
- Resultados das transportadoras.
- Destaques de menor preço e menor prazo.
- PDF gerado com Chromium/Playwright.

### Tracking de cargas

- Inclusão manual da carga.
- Tracking compartilhado entre os usuários.
- Consulta automática em ciclo fixo de **1 hora**.
- Botão **Monitorar agora** para consulta imediata.
- Pesquisa por NF, pedido, CT-e/conhecimento e destinatário.
- Atualização de previsão, destino, status e entrega.
- Interrupção automática do monitoramento após a entrega.
- Retentativas progressivas após erros temporários.

### Timeline logística

- Evento inicial `CRIADO`.
- Eventos reais retornados pela transportadora.
- Ordenação cronológica.
- Deduplicação por status, data e localização.
- Atualização de ocorrências existentes quando não há nova etapa.
- Registro separado de divergências.
- Tratamento de entrega como etapa final.

### Filtros avançados

O painel de filtros pode ser mostrado ou ocultado e permite combinações por:

- empresa;
- transportadora;
- usuário responsável;
- status;
- Nota Fiscal;
- pedido;
- CT-e/conhecimento;
- destinatário;
- CNPJ/CPF;
- período de criação;
- período de previsão;
- período de entrega;
- com ou sem comprovante;
- somente atrasadas;
- com divergência;
- com falha de consulta;
- ordenação e paginação.

### Central de notificações

- Sino com contador de notificações não lidas.
- Controle individual de leitura por usuário.
- Marcar uma ou todas como lidas.
- Arquivar notificações.
- Abertura direta do tracking relacionado.

Tipos de alerta:

- entrega realizada;
- carga atrasada;
- divergência logística;
- falha no rastreamento;
- comprovante de entrega disponível.

### Comprovantes de entrega

- Link externo fornecido pela transportadora.
- Anexo manual em PDF, JPG, JPEG ou PNG.
- Limite de 8 MB por arquivo.
- Identificação da origem: transportadora ou manual.
- Registro do usuário e da data do anexo.
- Visualização e download.
- Exclusão de comprovante manual restrita ao administrador.
- Notificação automática ao disponibilizar um comprovante.

### Empresas

- Cadastro de matriz e filiais.
- CNPJ único por empresa.
- Autopreenchimento por CNPJ via BrasilAPI.
- Complementação de endereço pelo ViaCEP.
- Cache de consulta cadastral por 24 horas.
- Campos permanecem editáveis após o preenchimento automático.
- Logo por URL ou upload.
- Upload de PNG/JPG/JPEG com limite de 5 MB.
- Logo anexada tem prioridade sobre a URL.

### Cadastros administrativos

- Usuários.
- Empresas.
- Produtos.
- Transportadoras.
- Credenciais por empresa, transportadora e ambiente.
- Configurações de tracking e e-mail.
- Auditoria das principais alterações administrativas.

---

## Integrações

| Transportadora | Cotação | Tracking | Situação |
|---|---:|---:|---|
| **Jamef** | Sim | Sim | Integração REST; timeline e previsão |
| **Braspress** | Sim | Sim | API v3; consulta por NF ou pedido |
| **Camilo / SSW** | Sim | Sim | Cotação SOAP e tracking pelo portal SSW |
| **Correios** | Demonstração | Não | Serviço mock; integração oficial ainda pendente |
| **Movvi** | Não | Não | Planejada; depende de documentação e credenciais oficiais |

> As transportadoras somente ficam disponíveis quando estão ativas, possuem integração implementada e têm credencial válida para a empresa e o ambiente selecionados.

---

## Perfis e permissões

O enum do banco utiliza `ADMIN`, `OPERATOR` e `VIEWER`. Na interface, `VIEWER` é apresentado como **Consulta**.

| Recurso | Administrador | Operador | Consulta |
|---|:---:|:---:|:---:|
| Visualizar cotações salvas | ✅ | ✅ | ✅ |
| Gerar cotação | ✅ | ✅ | ❌ |
| Salvar cotação | ✅ | ✅ | ❌ |
| Exportar Excel/PDF | ✅ | ✅ | ✅ |
| Enviar proposta por e-mail | ✅ | ✅ | ❌ |
| Excluir cotação | ✅ | ❌ | ❌ |
| Visualizar trackings e timeline | ✅ | ✅ | ✅ |
| Cadastrar tracking | ✅ | ✅ | ❌ |
| Monitorar agora | ✅ | ✅ | ❌ |
| Editar/excluir tracking | ✅ | ❌ | ❌ |
| Anexar comprovante | ✅ | ✅ | ❌ |
| Excluir comprovante manual | ✅ | ❌ | ❌ |
| Gerenciar usuários | ✅ | ❌ | ❌ |
| Gerenciar empresas/produtos | ✅ | ❌ | ❌ |
| Gerenciar transportadoras/credenciais | ✅ | ❌ | ❌ |
| Configurar tracking e SMTP | ✅ | ❌ | ❌ |

As permissões são verificadas no backend. Ocultar um botão no frontend não substitui a autorização da API.

---

## Arquitetura

```mermaid
flowchart LR
    U[Usuário] --> F[Frontend React / Vite]
    F -->|REST + JWT| A[API Node.js / Express]
    A --> P[(PostgreSQL)]
    A --> PR[Prisma ORM]
    PR --> P

    A --> J[Jamef]
    A --> B[Braspress]
    A --> C[Camilo / SSW]

    W[Worker de tracking] --> A
    W --> J
    W --> B
    W --> C

    A --> FS[Storage local de logos e comprovantes]
    A --> E[SMTP / Resend / Webhook]
    A --> X[ExcelJS]
    A --> PDF[Playwright / Chromium]
    A --> EXT[BrasilAPI / ViaCEP]
```

### Componentes

- **Frontend:** SPA React servida pelo Vite.
- **Backend:** API Express com autenticação JWT.
- **Banco:** PostgreSQL com migrations Prisma.
- **Worker:** processo no mesmo backend que consulta trackings e processa e-mails.
- **Storage:** arquivos persistentes no sistema de arquivos.
- **Integrações:** REST, SOAP e portal SSW.

---

## Tecnologias

### Backend

- Node.js 20+
- Express 5
- Prisma 6
- PostgreSQL
- Zod
- Axios
- SOAP
- JSON Web Token
- bcryptjs
- ExcelJS
- Playwright

### Frontend

- React 19
- React DOM
- Vite 8
- React Hook Form
- Zod
- Axios
- Lucide React
- Recharts
- Tailwind/PostCSS

---

## Estrutura do projeto

```text
fretehub/
├── backend/
│   ├── prisma/
│   │   ├── migrations/
│   │   ├── schema.prisma
│   │   └── seed.js
│   ├── src/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── services/
│   │   │   └── integrations/
│   │   ├── utils/
│   │   ├── db.js
│   │   └── server.js
│   ├── storage/
│   │   ├── company-logos/
│   │   └── delivery-proofs/
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── main.jsx
│   │   └── style.css
│   ├── .env.example
│   └── package.json
├── .gitignore
└── README.md
```

---

## Pré-requisitos

- **Node.js 20 ou superior**
- **npm**
- **PostgreSQL**
- Git
- Chromium instalado pelo Playwright para gerar PDFs

Verifique as versões:

```bash
node --version
npm --version
psql --version
git --version
```

---

## Instalação

### 1. Clonar o repositório

```bash
git clone https://github.com/alanleandro23/fretehub.git
cd fretehub
```

### 2. Instalar o backend

```bash
cd backend
npm ci
```

### 3. Criar o arquivo de ambiente

Windows:

```cmd
copy .env.example .env
```

Linux/macOS:

```bash
cp .env.example .env
```

Edite `backend/.env` e configure pelo menos:

```env
DATABASE_URL="postgresql://USUARIO:SENHA@localhost:5432/fretehub?schema=public"
JWT_SECRET="CHAVE_LONGA_E_ALEATORIA"
ENCRYPTION_KEY="OUTRA_CHAVE_LONGA_E_ESTAVEL"
PORT=3001
NODE_ENV=development
QUOTE_DRAFT_SECRET="CHAVE_EXCLUSIVA_PARA_PREVIAS"
```

### 4. Criar/atualizar o banco

No Windows, prefira `npx.cmd`:

```cmd
npx.cmd prisma migrate deploy
npx.cmd prisma generate
npm run seed
```

Linux/macOS:

```bash
npx prisma migrate deploy
npx prisma generate
npm run seed
```

### 5. Instalar o Chromium do Playwright

```bash
npx playwright install chromium
```

No Windows:

```cmd
npx.cmd playwright install chromium
```

### 6. Instalar o frontend

```bash
cd ../frontend
npm ci
```

Crie o arquivo de ambiente:

```env
VITE_API_URL=http://localhost:3001
```

> O frontend não precisa receber `DATABASE_URL`, senhas de transportadoras, tokens ou chaves privadas.

---

## Configuração de ambiente

### Variáveis essenciais do backend

| Variável | Obrigatória | Descrição |
|---|:---:|---|
| `DATABASE_URL` | ✅ | Conexão PostgreSQL usada pelo Prisma |
| `JWT_SECRET` | ✅ | Assinatura dos tokens JWT |
| `ENCRYPTION_KEY` | ✅ | Criptografia de senhas, tokens e configurações sensíveis |
| `PORT` | Não | Porta da API; padrão `3001` |
| `HOST` | Não | Host de escuta; padrão `0.0.0.0` |
| `NODE_ENV` | Não | `development` ou `production` |
| `QUOTE_DRAFT_SECRET` | Recomendado | Chave das prévias; fallback para `JWT_SECRET`/`ENCRYPTION_KEY` |
| `ALLOW_MOCK_QUOTES` | Não | Deve permanecer `false` em produção |

### Tracking

| Variável | Padrão | Descrição |
|---|---:|---|
| `TRACKING_WORKER_ENABLED` | `true` | Habilita o worker automático |
| `TRACKING_BATCH_SIZE` | `20` | Quantidade processada por ciclo |
| `JAMEF_TRACKING_URL` | vazio | URL base do tracking Jamef |
| `BRASPRESS_TRACKING_URL` | vazio | URL base do tracking Braspress |
| `CAMILO_TRACKING_URL` | portal SSW | URL do tracking Camilo/SSW |

O intervalo global é fixo em **60 minutos**. URLs e configurações de tracking também podem ser salvas no painel administrativo; quando existem no banco, elas têm prioridade sobre o `.env`.

### E-mail

| Variável | Descrição |
|---|---|
| `EMAIL_NOTIFICATIONS_ENABLED` | Liga/desliga os e-mails transacionais |
| `EMAIL_NOTIFICATION_BATCH_SIZE` | Quantidade de e-mails processados por lote |
| `EMAIL_PROVIDER` | `none`, `smtp`, `resend` ou `webhook` |
| `EMAIL_FROM` | Remetente padrão |
| `APP_URL` | URL usada nos links dos e-mails |
| `SMTP_HOST` | Ex.: `smtp.gmail.com` |
| `SMTP_PORT` | `587` para STARTTLS ou `465` para SSL direto |
| `SMTP_SECURE` | `false` na 587; `true` na 465 |
| `SMTP_USER` | Usuário SMTP |
| `SMTP_PASSWORD` | Senha de aplicativo ou credencial SMTP |
| `SMTP_FROM` | Remetente específico do SMTP |
| `SMTP_REPLY_TO` | Endereço de resposta opcional |
| `RESEND_API_KEY` | Alternativa via Resend |
| `EMAIL_WEBHOOK_URL` | Alternativa via webhook |
| `EMAIL_WEBHOOK_TOKEN` | Token opcional do webhook |

As configurações sensíveis salvas pela interface são criptografadas no banco com `ENCRYPTION_KEY`. Essa chave deve permanecer estável; se ela mudar, as credenciais já armazenadas não poderão ser descriptografadas.

### Diretórios persistentes

```env
DELIVERY_PROOF_DIR=C:\dados\fretehub\comprovantes
COMPANY_LOGO_DIR=C:\dados\fretehub\logos-empresas
```

Em Linux:

```env
DELIVERY_PROOF_DIR=/var/lib/fretehub/delivery-proofs
COMPANY_LOGO_DIR=/var/lib/fretehub/company-logos
```

### Frontend

```env
VITE_API_URL=http://localhost:3001
```

---

## Banco de dados e Prisma

### Comandos úteis

```bash
# Validar o schema
npx prisma validate

# Gerar o Prisma Client
npx prisma generate

# Aplicar migrations existentes
npx prisma migrate deploy

# Ver o estado das migrations
npx prisma migrate status

# Criar migration em desenvolvimento
npx prisma migrate dev --name nome_da_alteracao

# Executar o seed
npm run seed
```

No Windows, use `npx.cmd` quando o sistema tentar abrir o arquivo `npx` como documento.

### Usuário inicial

O seed cria ou reativa:

```text
E-mail: admin@fretehub.com
Senha: admin123
Perfil: Administrador
```

Troque a senha imediatamente no primeiro acesso.

### Principais entidades

- `User`
- `Company`
- `Product`
- `Carrier`
- `CarrierCredential`
- `Quote`
- `QuoteItem`
- `QuoteResult`
- `ShipmentTracking`
- `ShipmentEvent`
- `DeliveryProof`
- `Notification`
- `NotificationRecipient`
- `SystemSetting`
- `QuoteProposalLog`
- `AuditLog`

---

## Execução em desenvolvimento

### Backend

```bash
cd backend
npm run dev
```

Saída esperada:

```text
FreteHub API online na porta 3001
Tracking automático ativo (ciclo fixo a cada 1 hora).
```

Health check:

```text
GET http://localhost:3001/health
```

Resposta:

```json
{
  "ok": true,
  "app": "FreteHub"
}
```

### Frontend

Em outro terminal:

```bash
cd frontend
npm run dev
```

Acesse:

```text
http://localhost:5173
```

---

## Configuração das transportadoras

As credenciais podem ser cadastradas em **Credenciais**, vinculadas à empresa, transportadora e ambiente. Evite armazená-las diretamente no repositório.

### Jamef

Tracking de produção:

```text
https://api.jamef.com.br/consulta/v1
```

O sistema acrescenta `/rastreamento` quando necessário.

Requisitos usuais:

- usuário/senha ou token;
- CNPJ/documento do tomador;
- Nota Fiscal ou conhecimento;
- credencial ativa no mesmo ambiente da transportadora.

### Braspress

Base de produção:

```text
https://api.braspress.com
```

Rotas utilizadas:

```text
/v3/tracking/byNf/{cnpjTomador}/{notaFiscal}/json
/v3/tracking/byNumPedido/{cnpjTomador}/{numeroPedido}/json
```

Autenticação por usuário e senha da API.

### Camilo / SSW

Cotação SOAP:

```text
https://ssw.inf.br/ws/sswCotacaoCliente/index.php
```

Tracking:

```text
https://ssw.inf.br/2/ssw_resultSSW
```

Dados esperados:

- domínio SSW;
- usuário;
- senha do usuário;
- senha do pagador;
- código da mercadoria;
- CNPJ do pagador.

O parser remove entidades HTML e classifica como erro mensagens de rota/cidade não atendida.

### Correios

A implementação atual é apenas demonstrativa e usa resultado mock quando explicitamente permitido. Não utilize em produção até integrar as APIs oficiais de Token, Preço, Prazo e Rastro.

---

## Configuração de e-mail

### Gmail / SMTP

No painel administrativo, use:

```text
Servidor: smtp.gmail.com
Porta: 587
SSL direto: não
Usuário: conta Gmail
Senha: senha de aplicativo
Remetente: FreteHub <conta@gmail.com>
```

Alternativa com SSL direto:

```text
Porta: 465
SSL direto: sim
```

Use o botão **Enviar e-mail de teste** antes de habilitar os envios automáticos.

### Resend

Configure uma chave `re_...` e um remetente autorizado. Domínios de teste podem ter restrições de destinatário.

### Webhook

O webhook recebe um `POST` JSON com os dados do evento, destinatários, assunto, conteúdo HTML/texto e anexos quando aplicável.

### Retentativas

- até 10 tentativas por destinatário;
- espera exponencial iniciando em 15 minutos;
- limite máximo de 24 horas entre tentativas;
- registro da falha no banco.

---

## Fluxos de negócio

### Cotação

```mermaid
sequenceDiagram
    participant U as Usuário
    participant F as Frontend
    participant A as API
    participant T as Transportadoras
    participant D as PostgreSQL

    U->>F: Preenche a cotação
    F->>A: POST /quotes/preview
    A->>T: Consulta transportadoras
    T-->>A: Valores, prazos e mensagens
    A-->>F: Prévia protegida
    Note over A,D: Nada é gravado no histórico
    U->>F: Clica em Salvar cotação
    F->>A: POST /quotes/save
    A->>D: Grava cotação, itens e resultados
    A-->>F: Cotação salva
```

### Tracking

1. O operador cadastra a carga manualmente.
2. O sistema cria o evento inicial.
3. A primeira consulta fica agendada para uma hora.
4. O botão **Monitorar agora** antecipa a consulta.
5. O worker interpreta os eventos da transportadora.
6. Eventos idênticos são atualizados, não duplicados.
7. Divergências geram alertas.
8. A entrega encerra o monitoramento.
9. A plataforma cria notificação e agenda e-mail.
10. Comprovantes retornados pela integração podem ser cadastrados automaticamente.

### Proposta comercial

1. A cotação precisa estar salva.
2. O usuário escolhe PDF, Excel ou ambos.
3. Informa destinatários, cópia, assunto e mensagem.
4. A API gera os anexos.
5. O provedor de e-mail envia a proposta.
6. O resultado fica registrado em `QuoteProposalLog`.

---

## Armazenamento de arquivos

### Comprovantes

Padrão:

```text
backend/storage/delivery-proofs
```

Formatos:

- PDF
- JPG/JPEG
- PNG

Limite: **8 MB**.

### Logos

Padrão:

```text
backend/storage/company-logos
```

Formatos:

- PNG
- JPG/JPEG

Limite: **5 MB**.

As pastas de storage não devem ser enviadas ao Git. Elas precisam de backup independente do PostgreSQL.

---

## API HTTP

Todas as rotas privadas usam:

```http
Authorization: Bearer <token-jwt>
```

### Autenticação

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/auth/login` | Login |
| `GET` | `/auth/me` | Usuário atual |
| `POST` | `/auth/change-password` | Alterar senha |

### Cotações

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/quotes/preview` | Gerar prévia |
| `POST` | `/quotes/save` | Salvar prévia |
| `GET` | `/quotes` | Listar histórico |
| `GET` | `/quotes/recipients/frequent` | Destinatários frequentes |
| `GET` | `/quotes/:id` | Detalhar cotação |
| `GET` | `/quotes/:id/export-excel` | Exportar Excel |
| `GET` | `/quotes/:id/export-pdf` | Exportar PDF |
| `POST` | `/quotes/:id/send-proposal` | Enviar proposta |
| `DELETE` | `/quotes/:id` | Excluir cotação |

### Tracking

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/tracking` | Listar e filtrar |
| `POST` | `/tracking` | Cadastrar tracking |
| `GET` | `/tracking/:id` | Detalhes e timeline |
| `PUT` | `/tracking/:id` | Editar |
| `DELETE` | `/tracking/:id` | Excluir |
| `POST` | `/tracking/:id/check` | Monitorar agora |
| `POST` | `/tracking/:id/events` | Evento manual |
| `GET` | `/tracking/filter-options` | Opções dos filtros |
| `GET` | `/tracking/available-carriers` | Transportadoras disponíveis |

### Comprovantes

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/tracking/:id/proofs` | Listar comprovantes |
| `POST` | `/tracking/:id/proofs` | Adicionar arquivo/link |
| `GET` | `/tracking/:id/proofs/:proofId/download` | Baixar arquivo |
| `DELETE` | `/tracking/:id/proofs/:proofId` | Excluir comprovante manual |

### Notificações

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/notifications` | Listar notificações |
| `GET` | `/notifications/unread-count` | Contador não lido |
| `POST` | `/notifications/read-all` | Marcar todas como lidas |
| `POST` | `/notifications/:id/read` | Marcar uma como lida |
| `DELETE` | `/notifications/:id` | Arquivar |

### Administração

- `/users`
- `/companies`
- `/products`
- `/carriers`
- `/carrier-credentials`
- `/tracking/admin/config`
- `/tracking/admin/email-test`

Consulta pública autenticada de CNPJ:

```text
GET /companies/lookup/cnpj/:cnpj
```

---

## Produção

### Backend

```bash
cd backend
npm ci --omit=dev
npx prisma migrate deploy
npx prisma generate
npx playwright install chromium
npm start
```

### Frontend

```bash
cd frontend
npm ci
npm run build
```

Publique `frontend/dist` em um servidor web ou CDN e configure:

```env
VITE_API_URL=https://api.seudominio.com.br
```

### Recomendações

- Executar a API com PM2, systemd ou outro supervisor.
- Usar Nginx/Apache como proxy reverso.
- Configurar HTTPS.
- Restringir CORS ao domínio do frontend.
- Usar PostgreSQL com backup automático.
- Colocar os diretórios de storage em volume persistente.
- Monitorar logs e disponibilidade do endpoint `/health`.
- Manter `ALLOW_MOCK_QUOTES=false`.
- Não usar o usuário e a senha padrão do seed em produção.

> O repositório atual não inclui Docker Compose, pipeline de CI/CD ou configuração pronta de proxy reverso.

---

## Backup e restauração

Um backup completo precisa incluir:

1. banco PostgreSQL;
2. logos das empresas;
3. comprovantes de entrega;
4. arquivo `.env` armazenado em local seguro;
5. valor atual de `ENCRYPTION_KEY`.

### PostgreSQL

Backup:

```bash
pg_dump -Fc -d fretehub -f fretehub.backup
```

Restauração:

```bash
pg_restore -d fretehub fretehub.backup
```

### Arquivos

Copie os diretórios definidos em:

```text
COMPANY_LOGO_DIR
DELIVERY_PROOF_DIR
```

Sem esses diretórios, os registros permanecerão no banco, mas os arquivos físicos não poderão ser exibidos ou baixados.

---

## Segurança

- Autenticação JWT.
- Senhas dos usuários armazenadas com bcrypt.
- Credenciais de transportadoras e configurações sensíveis criptografadas.
- Autorização por permissão no backend.
- Prévia de cotação criptografada e com validade.
- Validação de uploads por tipo e tamanho.
- URLs externas limitadas a HTTP/HTTPS.
- Segredos excluídos do Git por `.gitignore`.

### Nunca versionar

- `backend/.env`
- `node_modules/`
- `dist/`
- arquivos de storage;
- backups do banco;
- tokens, senhas ou chaves de API;
- logs com respostas sensíveis.

Verificação:

```bash
git check-ignore -v backend/.env
git status
```

### Observações para produção

- Troque imediatamente qualquer credencial compartilhada em texto aberto.
- Use chaves longas e aleatórias.
- Restrinja o acesso ao painel administrativo.
- Defina uma política de rotação de senhas e tokens.
- Restrinja o CORS; a configuração atual usa `cors()` sem lista de origens.
- Mantenha o sistema operacional e o Node.js atualizados.

---

## Solução de problemas

### `EPERM: operation not permitted` no Prisma

Algum processo Node está usando a DLL do Prisma.

Windows:

```cmd
taskkill /F /IM node.exe
rmdir /S /Q node_modules\.prisma\client
npx.cmd prisma generate
```

### Windows pede um aplicativo para abrir `npx`

Use explicitamente:

```cmd
npx.cmd prisma generate
```

### `Unknown argument` em uma consulta Prisma

O schema ou client está desatualizado:

```bash
npx prisma migrate deploy
npx prisma generate
```

### Porta 3001 já está em uso

Windows:

```cmd
netstat -ano | findstr :3001
taskkill /PID NUMERO_DO_PID /F
```

### API inicia e encerra

Execute diretamente para ver o erro:

```bash
node src/server.js
```

Confirme que o servidor e o timer do worker permanecem referenciados.

### Tracking mostra URL não configurada

Acesse:

```text
Tracking de cargas → Configurar tracking
```

Salve a URL correta e confirme que a transportadora possui credencial ativa.

### E-mail fica pendente

Verifique:

- provedor selecionado;
- senha de aplicativo;
- host/porta/SSL;
- remetente autorizado;
- `APP_URL`;
- botão de teste do SMTP;
- logs da API.

### PDF não é gerado

Instale o Chromium:

```bash
npx playwright install chromium
```

### Cotação não aparece no histórico

Isso é esperado antes do clique em **Salvar cotação**. Gerar a prévia não grava no banco.

### CNPJ não é preenchido automaticamente

- confirme 14 dígitos válidos;
- verifique acesso à BrasilAPI e ao ViaCEP;
- preencha manualmente em caso de indisponibilidade externa.

---

## Validação funcional

Antes de publicar uma nova versão, teste:

- login e troca de senha;
- perfis Administrador, Operador e Consulta;
- cadastro de empresa e consulta de CNPJ;
- logo por URL e upload;
- produtos, transportadoras e credenciais;
- prévia de cotação sem gravação;
- salvamento e histórico;
- Excel e PDF;
- envio de proposta;
- tracking Jamef;
- tracking Braspress;
- tracking Camilo;
- botão Monitorar agora;
- deduplicação da timeline;
- filtros avançados;
- comprovante por arquivo e link;
- central de notificações;
- e-mail de teste;
- layout em diferentes resoluções;
- `git status` sem segredos ou arquivos persistentes.

---

## Limitações conhecidas

- Correios ainda usa implementação de demonstração, não a API oficial.
- Movvi ainda não está integrada.
- O tracking Camilo depende do formato do portal SSW e pode exigir manutenção quando o HTML mudar.
- BrasilAPI e ViaCEP são serviços externos e podem ficar indisponíveis.
- Logos e comprovantes são armazenados localmente; ambientes com múltiplas instâncias precisam de storage compartilhado.
- Não há suíte automatizada completa de testes.
- Não há pipeline CI/CD no repositório.
- O CORS ainda precisa ser restringido para produção.
- O frontend está concentrado em poucos arquivos e pode ser modularizado conforme o projeto crescer.

---

## Roadmap

- Integração oficial com Correios.
- Integração com Movvi.
- Dashboard operacional e indicadores de SLA.
- Relatórios de economia e desempenho por transportadora.
- Importação de trackings por Excel/CSV.
- Monitoramento em lote.
- Storage S3/compatível para logos e comprovantes.
- Testes unitários, integração e end-to-end.
- Pipeline de CI/CD.
- Docker e Docker Compose.
- Observabilidade com métricas, tracing e alertas.
- Autenticação em dois fatores.
- Recuperação de senha por e-mail.

---

## Versionamento

Fluxo recomendado:

```bash
git checkout -b feature/nome-da-melhoria
git add .
git commit -m "Descrição objetiva da alteração"
git push -u origin feature/nome-da-melhoria
```

Após validar uma versão estável:

```bash
git tag -a vX.Y.Z -m "Descrição da versão"
git push origin vX.Y.Z
```

Convenção sugerida:

- **MAJOR:** alterações incompatíveis;
- **MINOR:** novas funcionalidades compatíveis;
- **PATCH:** correções sem mudança de contrato.

---

## Licenciamento

O repositório não possui uma licença de código aberto definida. Adicione um arquivo `LICENSE` antes de autorizar redistribuição, uso comercial por terceiros ou contribuições públicas.

---

**FreteHub** — cotação, tracking e gestão logística em uma única plataforma.
