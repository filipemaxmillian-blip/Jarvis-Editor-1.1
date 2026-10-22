# Jarvis Social

App para iPhone (PWA) que agenda posts e responde comentários em várias contas de
Instagram, Facebook, TikTok e YouTube.

**Status:** protótipo de interface com dados de exemplo. Nada é publicado de verdade ainda.

## Rodar

```bash
cd social
npm run build     # gera dist/
npm run preview   # serve dist/ localmente
```

Para instalar no iPhone, publique `dist/` em um endereço HTTPS, abra no Safari e toque em
Compartilhar → Adicionar à Tela de Início.

## O que as APIs oficiais permitem

| Função | Instagram | Facebook | TikTok | YouTube |
|---|---|---|---|---|
| Postar e agendar | Sim | Sim | Sim (privado até a auditoria) | Sim |
| Responder comentários | Sim | Sim | Só conta Business | Sim |
| Mensagem privada a quem comentou | Sim (1 por comentário, 7 dias) | Sim | Não | Não existe |
| Desativar comentários | Sim | Não | Sim | Não |
| Enquete | Não | Não | Não | Não |
| Ocultar curtidas | Não | Não | Não | Não |
| Ver quem curtiu | Não | Parcial | Não | Não |
| Saber se a pessoa segue | Não | Não | Não | Não |

Enquete e ocultar curtidas viram lembretes: o app avisa na hora da publicação para você fazer no app oficial.

## Próximos passos

1. Back-end (servidor) que guarda os tokens das contas e publica no horário, mesmo com o iPhone desligado.
2. Login oficial de cada rede (OAuth) para conectar várias contas.
3. Webhooks do Instagram/Facebook para receber comentários em tempo real e rodar as automações.
4. Cadastro de app e revisão em Meta, TikTok e Google.
