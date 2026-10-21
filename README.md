# Jarvis Editor 1.1

Editor de vídeo para Windows feito com Electron, Vite e React.

## O que você precisa ter instalado

- [Node.js](https://nodejs.org/) versão 18 ou mais nova (pode baixar a versão "LTS").
- [Git](https://git-scm.com/) (opcional, só se for baixar o projeto pelo terminal).

Para conferir se o Node.js está instalado, abra o **Prompt de Comando** ou o **PowerShell** e digite:

```bash
node -v
npm -v
```

Se aparecer um número de versão nos dois, está tudo certo.

## 1. Baixar o projeto

Pelo terminal:

```bash
git clone https://github.com/filipemaxmillian-blip/Jarvis-Editor-1.1.git
cd Jarvis-Editor-1.1
```

Ou baixe o ZIP pelo botão verde **Code > Download ZIP** no GitHub, extraia e abra o terminal dentro da pasta.

## 2. Instalar as dependências

Só precisa fazer isso uma vez (ou quando o `package.json` mudar):

```bash
npm install
```

## 3. Rodar em modo de desenvolvimento

```bash
npm run dev
```

Esse comando liga o Vite e abre a janela do Jarvis Editor. Quando você salva um arquivo em `src/`, a tela atualiza sozinha. Para fechar, feche a janela ou aperte `Ctrl + C` no terminal.

## 4. Gerar o instalador do Windows

```bash
npm run package:win
```

O instalador (`.exe`) aparece dentro da pasta `release/`. É só dar dois cliques nele para instalar.

## Comandos disponíveis

| Comando               | O que faz                                              |
| --------------------- | ------------------------------------------------------ |
| `npm run dev`         | Abre o editor em modo de desenvolvimento.              |
| `npm run build`       | Gera os arquivos finais da interface na pasta `dist/`. |
| `npm start`           | Abre só a janela do Electron (o Vite precisa estar ligado). |
| `npm run package:win` | Gera o instalador do Windows.                          |

## Estrutura das pastas

```
electron/main.js   -> cria a janela do aplicativo (Electron)
index.html         -> página principal carregada pelo Vite
src/main.tsx       -> ponto de entrada do React
src/App.tsx        -> tela principal do editor
src/style.css      -> estilos da tela
vite.config.ts     -> configuração do Vite
```

## Problemas comuns

- **A janela abre em branco depois de instalar:** confira se o `vite.config.ts` tem a linha `base: "./"`. Sem ela, o aplicativo instalado não acha os arquivos da interface.
- **Erro "port 5173 is already in use":** já tem outro `npm run dev` aberto. Feche o outro terminal e tente de novo.
- **`npm` não é reconhecido como comando:** o Node.js não está instalado ou o terminal foi aberto antes da instalação. Instale o Node.js e abra um terminal novo.
