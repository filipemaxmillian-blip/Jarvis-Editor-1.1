# Jarvis-Editor-1.1

Editor de vídeo para Reels, TikTok e Shorts, com assistente de voz no estilo Jarvis.

## Recursos

- **Assistente Jarvis** — fale (botão do microfone) ou digite comandos em português, inclusive vários de uma vez:
  "formato vertical, efeito cinema e gerar legendas", "marcar início", "marcar fim", "voltar 5 segundos",
  "legendas estilo jarvis", "adiciona transições", "aumenta a música", "exportar". Diga "ajuda" para ver mais.
- **Legendas automáticas** — transcrição da fala com Whisper rodando localmente, legendas animadas palavra por palavra
  (estilos Reels, Jarvis e Clássico), edição do texto e download em `.srt`.
- **Efeitos** — Cinema, Preto e branco, Vintage, Neon Jarvis, Glitch e Zoom lento.
- **Transições** — entrada com fade, zoom ou flash e saída com fade.
- **Cortes** — arraste as alças amarelas na linha do tempo ou use "Marcar início/fim".
- **Áudio** — trilha sonora com volume próprio, mixada com o áudio do vídeo.
- **Formatos** — 9:16, 16:9 e 1:1, com exportação já com efeitos e legendas.

## Rodando

```bash
npm install
npm run dev          # abre o app no Electron
npm run package:win  # gera o instalador para Windows
```

No primeiro uso das legendas ou da voz, o modelo de IA (~150 MB) é baixado da internet e fica em cache;
depois disso tudo funciona offline. A exportação é feita em tempo real (um vídeo de 30 s leva 30 s).
