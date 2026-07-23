# BLY! Automation

Sistema de rastreio, cobrança PIX, chatbot IA (texto + áudio) e disparos automáticos por
WhatsApp e e-mail, integrado à base de clientes da Shopify.

## Você pode subir isso AGORA, mesmo sem WhatsApp, Mercado Pago ou domínio

O sistema foi feito pra funcionar em "modo esqueleto": ele sobe e fica no ar só com o banco
de dados configurado (o Railway cria isso sozinho). Cada integração (Shopify, WhatsApp,
Mercado Pago, e-mail, IA) fica **adormecida** até você colar a chave correspondente — não
trava o deploy nem quebra nada, ela simplesmente não faz nada até ser configurada, e avisa
isso nos logs.

Depois do deploy, abra a URL gerada pelo Railway no navegador (ex:
`https://seu-projeto.up.railway.app`) — aparece uma página mostrando o que já está
configurado (✅) e o que ainda está pendente (⏳). É o jeito mais fácil de confirmar visualmente
que o esqueleto subiu certo.

**Únicas duas coisas realmente necessárias pra esse primeiro deploy funcionar:**
1. O banco de dados PostgreSQL (adicionado com 1 clique no Railway).
2. `ADMIN_SECRET` — qualquer senha sua, só pra proteger a rota administrativa.

Todo o resto do `.env.example` pode ficar em branco por enquanto, e você preenche aos
poucos conforme for conseguindo cada credencial (número de WhatsApp, chave do Mercado Pago,
domínio etc).

## Como subir isso (sem usar terminal, passo a passo)

Veja o guia completo na conversa com o Claude, ou siga o resumo abaixo. Em qualquer passo
que travar, volta e pergunta.

1. **Suba o código pro GitHub** (github.com > New repository > Upload files > arrasta a pasta).
2. **Crie conta no [Railway](https://railway.app)** e escolha "Deploy from GitHub repo".
3. **Adicione um banco de dados**: dentro do projeto no Railway, clique em "+ New" > "Database"
   > "PostgreSQL". Ele cria e conecta sozinho (a variável `DATABASE_URL` aparece automática).
4. **Preencha as variáveis de ambiente** na aba "Variables" do serviço (uma de cada vez, nome e
   valor) — veja a lista completa em `.env.example`. As tabelas do banco são criadas sozinhas
   na primeira vez que o servidor liga, não precisa rodar nenhum comando.
5. **Gere o domínio público**: aba "Settings" > "Networking" > "Generate Domain". Essa é a URL
   que você vai usar nos webhooks da Shopify, Meta e Mercado Pago.
6. **Configure os webhooks** nas 3 plataformas apontando pra essa URL (veja seções abaixo).
7. **Teste**: acesse `https://sua-url.up.railway.app/health` no navegador — se aparecer
   `{"status":"ok"}`, o servidor está de pé.

## Segurança - o que já vem pronto
- Toda mensagem recebida da Shopify, WhatsApp e Mercado Pago é validada por assinatura
  (HMAC) antes de ser processada — payloads falsos são rejeitados.
- A rota administrativa (`/admin/sync-customers`) exige uma senha própria (`ADMIN_SECRET`),
  enviada no header `x-admin-secret`.
- Nenhuma chave de API fica no código — tudo vem de variáveis de ambiente, que ficam
  criptografadas no Railway e nunca aparecem pro público.
- **Nunca compartilhe** o conteúdo do `.env` ou das variáveis do Railway com ninguém.

## Configuração de cada integração

### Shopify
1. No admin da Shopify: **Configurações > Notificações > Webhooks**.
2. Crie webhooks para:
   - `orders/create` → `https://sua-url.up.railway.app/webhooks/shopify/orders-create`
   - `orders/paid` → `https://sua-url.up.railway.app/webhooks/shopify/orders-paid`
   - `fulfillments/create` → `https://sua-url.up.railway.app/webhooks/shopify/fulfillments-create`
3. Copie o **signing secret** exibido para `SHOPIFY_WEBHOOK_SECRET`.
4. Gere um **Admin API access token** em **Apps > Develop apps**, escopo `read_customers,read_orders`.

### WhatsApp Cloud API (Meta)
1. Crie um app no [Meta for Developers](https://developers.facebook.com) com o produto WhatsApp.
2. Pegue `WHATSAPP_PHONE_NUMBER_ID` e `WHATSAPP_ACCESS_TOKEN` (token permanente via System User).
3. Configure o webhook: `https://sua-url.up.railway.app/webhooks/whatsapp`, usando o
   `WHATSAPP_VERIFY_TOKEN` que você escolher.
4. Crie e aprove os templates no Meta Business Manager:
   - `pix_pendente` (variáveis: nome, número do pedido, valor)
   - `atualizacao_rastreio` (variáveis: nome, número do pedido, código de rastreio, status)

### Mercado Pago
1. Pegue `MP_ACCESS_TOKEN` de produção em **Suas integrações > Credenciais**.
2. Configure o webhook em **Suas integrações > Webhooks**:
   `https://sua-url.up.railway.app/webhooks/mercadopago`, evento `payment`.
3. Copie o **webhook secret** para `MP_WEBHOOK_SECRET`.

### E-mail
Use um provedor SMTP (Resend, SES, SendGrid). Preencha `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`.

### IA
- `ANTHROPIC_API_KEY`: chave da API do Claude, em [console.anthropic.com](https://console.anthropic.com).
- `TRANSCRIPTION_API_KEY` + `TRANSCRIPTION_ENDPOINT`: provedor de transcrição de áudio
  (ex: OpenAI Whisper).

### Rastreio
O arquivo `src/jobs/scheduler.js` tem um espaço reservado (`checkTrackingStatus`) pra plugar
seu provedor de rastreio (Correios, AfterShip, 17Track).

### Sincronizar leads já existentes na Shopify
Depois do deploy, faça uma chamada com o header `x-admin-secret: SEU_ADMIN_SECRET`
pra `POST https://sua-url.up.railway.app/admin/sync-customers` (dá pra fazer isso pelo
próprio Postman ou por uma extensão de navegador tipo "Requestly", sem precisar de terminal).

## Rodando localmente (opcional, só se você programa)
```bash
npm install
cp .env.example .env   # preencha as variáveis
npm run dev
```

## Próximos passos recomendados
- [ ] Criar e aprovar os templates de WhatsApp no Meta Business Manager antes de ativar em produção.
- [ ] Implementar `checkTrackingStatus` com o provedor de rastreio escolhido.
- [ ] Adicionar opt-out (descadastro) de WhatsApp/e-mail por resposta do lead (ex: "PARAR").
