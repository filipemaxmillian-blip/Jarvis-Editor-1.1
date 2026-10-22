# Jarvis Social

App para iPhone que agenda posts e responde comentários em várias contas do **Instagram** e do **Facebook**.
É um PWA (instala pelo Safari) com um servidor que publica no horário e roda as automações.

## O que faz

- **Contas:** entre com o Facebook e todas as Páginas e os perfis do Instagram ligados a elas são conectados. Repita para adicionar mais.
- **Agendar:** foto, Reels ou Story no Instagram; texto, foto ou vídeo no Facebook. Um post pode sair em várias contas.
- **Comentários:** caixa única com os comentários novos de todas as contas, com resposta e mensagem privada.
- **Automações:** quando alguém comenta, o app responde no post e manda uma mensagem privada sozinho. Automações com palavra-chave têm prioridade.
- **Lembretes:** enquete e ocultar curtidas não existem na API da Meta, então viram lembretes no post.

Sem servidor (por exemplo, abrindo o `dist/preview.html`), o app roda em modo demonstração com dados de exemplo.

## Limites da API da Meta

| Função | Instagram | Facebook |
|---|---|---|
| Postar e agendar | Sim | Sim |
| Responder comentários | Sim | Sim |
| Mensagem privada a quem comentou | Sim (1 por comentário, até 7 dias) | Sim (1 por comentário, até 7 dias) |
| Desativar comentários | Sim | Não |
| Enquete, ocultar curtidas | Não | Não |
| Ver quem curtiu, saber se segue | Não | Parcial / Não |

## Passo a passo para colocar no ar

### 1. Conta do Instagram

Cada Instagram precisa ser **Profissional** (Criador ou Empresa) e estar **ligado a uma Página do Facebook**
(Instagram > Configurações > Tipo de conta e ferramentas / Central de Contas).

### 2. Hospedar o servidor

Com o [Render](https://render.com): **New > Blueprint**, escolha este repositório. O arquivo `render.yaml` na raiz
cria o serviço, o disco e gera `SECRET_KEY` e `META_WEBHOOK_VERIFY_TOKEN`. Preencha:

- `APP_PASSWORD`: a senha para entrar no app
- `PUBLIC_URL`: o endereço que o Render der, ex.: `https://jarvis-social.onrender.com`
- `META_APP_ID` e `META_APP_SECRET`: do passo 3

Qualquer hospedagem com Node 22.13+ e disco persistente serve (Railway, Fly.io, um VPS). Veja `.env.example`.

### 3. Criar o app na Meta

Em [developers.facebook.com](https://developers.facebook.com) > **Meus apps > Criar app**, tipo **Empresa**.

1. **Configurações > Básico:** copie o ID e a Chave Secreta do app para `META_APP_ID` e `META_APP_SECRET`.
   Em "Domínios do app", coloque o domínio do `PUBLIC_URL`.
2. Adicione **Login do Facebook para Empresas**. Em "URIs de redirecionamento OAuth válidos":
   `PUBLIC_URL/auth/meta/callback`
3. Adicione **Instagram** (API com Login do Facebook) e **Messenger**.
4. Adicione **Webhooks**:
   - URL de retorno: `PUBLIC_URL/webhooks/meta`
   - Token de verificação: o valor de `META_WEBHOOK_VERIFY_TOKEN`
   - Assine **Page > feed** e **Instagram > comments**

### 4. Conectar e instalar

1. Abra o `PUBLIC_URL` no Safari do iPhone, entre com a senha e toque em **Conectar com Facebook**.
2. Toque em **Compartilhar > Adicionar à Tela de Início**.

### Modo de desenvolvimento x modo ao vivo

Enquanto o app da Meta estiver em **desenvolvimento**, ele funciona para as contas de quem tem função no app
(você). Isso basta para postar nas suas contas. Para receber comentários de outras pessoas e rodar as
automações para o público, a Meta exige o app em modo **ao vivo**, com verificação da empresa e
**Análise do app** das permissões usadas (lista em `server/meta.js`). A Meta pode mudar essas regras.

## Rodar no computador

```bash
cd social
cp .env.example .env    # preencha
npm install
npm run dev             # http://localhost:3000
```

Webhooks precisam de um endereço público com HTTPS (use um túnel como o `cloudflared` para testar).

## Estrutura

- `src/app.html`, `src/app.js`: o app (tela e lógica)
- `public/`: manifesto, ícones e service worker do PWA
- `server/`: servidor Express
  - `meta.js`: chamadas à Graph API
  - `scheduler.js`: publica os posts no horário (a cada 30 s)
  - `webhooks.js`: recebe comentários e roda as automações
  - `security.js`: sessão, senha e criptografia dos tokens
  - `db.js`: banco SQLite (embutido no Node)
