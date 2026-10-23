# ECC (Everything Claude Code) — instalação no projeto

Fonte: https://github.com/affaan-m/ECC (v2.2.3, licença MIT — ver `ECC-LICENSE`).

Equivalente manual ao perfil `minimal` do ECC para o alvo `claude-project`, sem hooks:

- `rules/` — regras `common`, `typescript`, `react`, `web`
- `agents/` — definições de subagentes
- `commands/` — comandos de barra (`/plan`, `/tdd`, `/build-fix`, ...)
- `skills/` — skills do módulo `workflow-quality` + React, Vite, frontend, segurança e padrões de código

Não incluído: runtime de hooks, scripts Node do ECC e configs de outras plataformas.
Alguns comandos citam scripts do ECC (ex.: `scripts/astra-review.js`) que não estão neste repositório.
Para atualizar ou instalar a versão completa: `npx ecc-universal@2.2.3 setup`.

## Revisão de segurança

Removidos do ECC: skills que trazem scripts/hooks executáveis (`ck`, `continuous-learning*`,
`delivery-gate`, `skill-comply`, `skill-stocktake`, `rules-distill`, `story-lifecycle`,
`agent-self-evaluation`, `repo-scan`, `configure-ecc`, `deepseek-harness-setup`,
`codehealth-mcp`, `plankton-code-quality`) e comandos que enviam código para outros
provedores de IA ou importam conteúdo de URLs (`astra-review`, `multi-*`, `santa-loop`,
`council-multi-model`, `instinct-*`, `jira`, `pm2`, `auto-update` etc.).
