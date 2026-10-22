(() => {
  "use strict";

  const PLATFORMS = {
    instagram: { name: "Instagram", short: "IG", need: "Conta Profissional (Criador ou Empresa) ligada a uma Página do Facebook" },
    facebook:  { name: "Facebook",  short: "FB", need: "Páginas que você administra" }
  };
  const ORDER = ["instagram", "facebook"];

  // What Meta's official API allows. Shown on the Accounts screen.
  const LIMITS = [
    ["Postar e agendar", ["y", "y"], "Instagram: foto, Reels e Story. Facebook: texto, foto e vídeo."],
    ["Responder comentários", ["y", "y"], ""],
    ["Mensagem privada a quem comentou", ["y", "y"], "Uma mensagem por comentário, em até 7 dias."],
    ["Desativar comentários no post", ["y", "n"], ""],
    ["Enquete", ["n", "n"], "Não existe na API. O app te lembra de criar na hora."],
    ["Ocultar curtidas", ["n", "n"], "Só pelo app oficial. O app te lembra de ativar."],
    ["Ver quem curtiu", ["n", "p"], "Facebook mostra parte das reações em Páginas."],
    ["Saber se a pessoa te segue", ["n", "n"], "Nenhuma API mostra a lista de seguidores."]
  ];
  const MARK = { y: "Sim", n: "Não", p: "Limitado" };
  const STATUS_LABEL = { agendado: "Agendado", publicando: "Publicando…", publicado: "Publicado", parcial: "Publicado em parte", falhou: "Falhou" };

  /* ---------- Demo data (used when there is no server, e.g. the preview link) ---------- */

  const DEMO_KEY = "jarvis-social-demo-v2";
  const H = 3600e3, D = 24 * H;
  const at = (offset, hour, min = 0) => { const d = new Date(Date.now() + offset); d.setHours(hour, min, 0, 0); return d.toISOString(); };
  const SEED = () => ({
    accounts: [
      { id: "a1", platform: "instagram", handle: "@jarvis.cortes", followers: 18400 },
      { id: "a2", platform: "instagram", handle: "@felipe.edita", followers: 3260 },
      { id: "a3", platform: "facebook", handle: "Jarvis Cortes", followers: 5120 },
      { id: "a4", platform: "facebook", handle: "Felipe Edita", followers: 870 }
    ],
    posts: [
      { id: "p1", caption: "3 cortes que deixam qualquer vídeo mais dinâmico ✂️ Salva pra usar depois!", accountIds: ["a1", "a3"], when: at(0, 19, 30), format: "reels", media: "VÍDEO", status: "agendado", options: { hideLikes: true } },
      { id: "p2", caption: "Antes e depois da color: qual você prefere? Comenta A ou B 👇", accountIds: ["a1", "a2", "a3"], when: at(D, 12), format: "feed", media: "FOTO", status: "agendado", options: { poll: true } },
      { id: "p3", caption: "Bastidores da edição de hoje", accountIds: ["a2"], when: at(2 * D, 18), format: "story", media: "VÍDEO", status: "agendado", options: {} },
      { id: "p4", caption: "Transição de câmera girando, passo a passo 🎬", accountIds: ["a1", "a3"], when: at(-D, 20), format: "reels", media: "VÍDEO", status: "publicado", options: {} }
    ],
    comments: [
      { id: "c1", accountId: "a1", author: "@marina.vlogs", text: "Que transição incrível! Qual app você usa?", post: "Transição de câmera girando", when: Date.now() - 40 * 60e3 },
      { id: "c2", accountId: "a1", author: "@rafa_drone", text: "Quero tutorial dessa!!", post: "Transição de câmera girando", when: Date.now() - 2 * H },
      { id: "c3", accountId: "a3", author: "Juliana Prado", text: "Muito bom, compartilhei no grupo da faculdade", post: "Transição de câmera girando", when: Date.now() - 3 * H },
      { id: "c4", accountId: "a2", author: "@cinemacaseiro", text: "Explica a configuração do keyframe? 🙏", post: "Bastidores", when: Date.now() - 5 * H, replied: "Vou fazer um vídeo só sobre isso essa semana!" }
    ],
    rules: [
      { id: "r1", name: "Agradecer e convidar a seguir", enabled: true, accountIds: ["a1", "a2", "a3"], keyword: "",
        replyText: "Valeu demais! 🙌 Te mandei uma mensagem.",
        dmText: "Vi que você comentou nesse vídeo! Vamos postar mais vídeos assim, então pra não perder já segue a gente! 😉👍🏻", runs: 37 },
      { id: "r2", name: "Palavra-chave TUTORIAL", enabled: false, accountIds: ["a1"], keyword: "tutorial",
        replyText: "Te enviei o link no direct 📩", dmText: "Aqui está o tutorial completo que você pediu: (cole o link aqui)", runs: 0 }
    ]
  });

  /* ---------- Data layer: same calls in both modes ---------- */

  let mode = "demo"; // "live" when the server answers
  let state = { accounts: [], posts: [], comments: [], rules: [] };
  let metaConfigured = false;
  let setup = null; // server checklist, live mode only

  const DEMO_SETUP = {
    publicUrl: "https://jarvis-social.onrender.com", https: true, metaConfigured: false,
    redirectUri: "https://jarvis-social.onrender.com/auth/meta/callback",
    webhookUrl: "https://jarvis-social.onrender.com/webhooks/meta",
    verifyToken: "(gerado pela hospedagem)", accounts: 4, needsReconnect: 0
  };

  const saveDemo = () => { try { localStorage.setItem(DEMO_KEY, JSON.stringify(state)); } catch {} };
  const loadDemo = () => { try { return JSON.parse(localStorage.getItem(DEMO_KEY)) || SEED(); } catch { return SEED(); } };

  class ApiError extends Error {}

  async function request(method, path, body, headers) {
    const res = await fetch(path, {
      method, credentials: "same-origin",
      headers: body instanceof Blob ? headers : { "Content-Type": "application/json" },
      body: body instanceof Blob ? body : body !== undefined ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== "api/login") { showLogin(); throw new ApiError("Faça login para continuar."); }
    if (!res.ok) throw new ApiError(data.error || "Algo deu errado. Tente de novo.");
    return data;
  }

  async function refresh() {
    const [data, s] = await Promise.all([request("GET", "api/state"), request("GET", "api/setup")]);
    metaConfigured = data.metaConfigured;
    state = data;
    setup = s;
  }

  /* ---------- Notifications ---------- */

  const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  let pushOn = false;

  async function checkPush() {
    if (!pushSupported()) return;
    const reg = await navigator.serviceWorker.getRegistration();
    pushOn = Boolean(await reg?.pushManager.getSubscription());
  }

  const keyBytes = (b64) => {
    const raw = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  };

  async function enablePush() {
    if (mode !== "live") return toast("No app instalado, este botão ativa os avisos no iPhone.");
    if (!pushSupported()) return toast(isStandalone() ? "Este aparelho não aceita notificações." : "Primeiro instale o app: Compartilhar > Adicionar à Tela de Início.");
    try {
      // iOS only shows the permission prompt when this runs straight from a tap.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return toast("Notificações bloqueadas. Libere em Ajustes > Notificações > Jarvis Social.");
      const reg = await navigator.serviceWorker.ready;
      const { key } = await request("GET", "api/push/key");
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
      await request("POST", "api/push/subscribe", sub.toJSON());
      pushOn = true;
      await refresh(); render(); toast("Notificações ativadas");
    } catch (err) {
      toast(err.message || "Não foi possível ativar as notificações.");
    }
  }

  function copyText(text) {
    const done = () => toast("Copiado");
    navigator.clipboard?.writeText(text).then(done, () => toast("Toque e segure o texto para copiar."))
      ?? toast("Toque e segure o texto para copiar.");
  }

  // Runs an action against the server, or applies `demo` to local data. Then redraws.
  async function act(method, path, body, demo, okMsg) {
    try {
      if (mode === "live") { await request(method, path, body); await refresh(); }
      else { demo(); saveDemo(); }
      render();
      if (okMsg) toast(okMsg);
      return true;
    } catch (err) {
      toast(err.message);
      return false;
    }
  }

  /* ---------- Helpers ---------- */

  let tab = "agenda";
  let inboxFilter = "all";
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = () => Math.random().toString(36).slice(2, 9);
  const acct = (id) => state.accounts.find((a) => a.id === id);
  const fmtNum = (n) => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(".", ",") + " mil" : String(n || 0);
  const fmtTime = (iso) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const dayLabel = (iso) => {
    const d = new Date(iso); const t = new Date(); t.setHours(0, 0, 0, 0);
    const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - t) / D);
    if (diff === 0) return "Hoje";
    if (diff === 1) return "Amanhã";
    if (diff === -1) return "Ontem";
    return d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "short" });
  };
  const ago = (ms) => { const m = Math.max(1, Math.round((Date.now() - ms) / 60e3)); return m < 60 ? `há ${m} min` : m < 1440 ? `há ${Math.round(m / 60)} h` : `há ${Math.round(m / 1440)} d`; };
  const pf = (p, lg) => `<span class="pf ${p}${lg ? " lg" : ""}" aria-label="${PLATFORMS[p].name}">${PLATFORMS[p].short}</span>`;
  const acctChip = (a) => a ? `<span class="acct">${pf(a.platform)}<span>${esc(a.handle)}</span></span>` : "";
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3200);
  }

  /* ---------- Views ---------- */

  function viewAgenda() {
    if (mode === "demo") state.posts.forEach((p) => { if (p.status === "agendado" && Date.parse(p.when) <= Date.now()) p.status = "publicado"; });
    const queued = (p) => p.status === "agendado" || p.status === "publicando";
    const upcoming = state.posts.filter(queued).sort((a, b) => a.when.localeCompare(b.when));
    const done = state.posts.filter((p) => !queued(p)).sort((a, b) => b.when.localeCompare(a.when)).slice(0, 10);
    const pending = state.comments.filter((c) => !c.replied).length;
    const groups = {};
    upcoming.forEach((p) => (groups[dayLabel(p.when)] ||= []).push(p));

    return `
      <h2 class="view-title">Agenda</h2>
      <p class="view-sub">Tudo que vai sair nas suas contas, em ordem.</p>
      <div class="stats">
        <div class="stat"><b>${upcoming.length}</b><span>agendados</span></div>
        <div class="stat"><b>${state.accounts.length}</b><span>contas</span></div>
        <div class="stat"><b>${pending}</b><span>sem resposta</span></div>
      </div>
      ${!state.accounts.length ? `<div class="note" style="margin-top:14px">Comece conectando suas contas na aba <strong>Contas</strong>.</div>` : ""}
      ${reconnectNote()}
      ${upcoming.length ? Object.entries(groups).map(([day, posts]) => `
        <h3 class="group">${esc(day)}</h3>
        <div class="stack">${posts.map(postCard).join("")}</div>`).join("")
      : `<div class="empty">Nada agendado. Toque em <b>+</b> para criar um post.</div>`}
      ${done.length ? `<h3 class="group">Publicados</h3><div class="stack">${done.map(postCard).join("")}</div>` : ""}
    `;
  }

  function reconnectNote() {
    const lost = state.accounts.filter((a) => a.needsReconnect);
    if (!lost.length) return "";
    return `<div class="card warn-card" style="margin-top:14px"><b>${lost.map((a) => esc(a.handle)).join(", ")} ${lost.length === 1 ? "foi desconectada" : "foram desconectadas"}</b>
      <p class="view-sub" style="margin:4px 0 10px">A Meta cancelou o acesso (troca de senha ou permissão removida). Posts e automações dessa conta estão parados.</p>
      <button class="btn primary" data-action="connect">Conectar de novo</button></div>`;
  }

  function postCard(p) {
    const accts = p.accountIds.map(acct).filter(Boolean);
    const reminders = [p.options?.poll && "criar enquete", p.options?.hideLikes && "ocultar curtidas"].filter(Boolean);
    const errors = (p.errors || []).map((e) => `<p class="post-error">${esc(acct(e.accountId)?.handle || "Conta")}: ${esc(e.error)}</p>`).join("");
    return `<article class="card post">
      <div class="thumb">${p.thumb ? `<img src="${p.thumb}" alt="">` : esc(p.media || "POST")}</div>
      <div class="post-body">
        <div class="row"><span class="post-time">${fmtTime(p.when)}</span>
          <span class="status ${p.status}">${STATUS_LABEL[p.status] || p.status}</span>
          ${p.format === "story" ? `<span class="status publicando">Story</span>` : ""}
          ${reminders.length && p.status !== "falhou" ? `<span class="status lembrete" title="Faça isso no app oficial logo após publicar">Lembrete: ${reminders.join(", ")}</span>` : ""}
        </div>
        <p class="caption">${esc(p.caption) || "<i>Sem legenda</i>"}</p>
        <div class="row">${accts.map(acctChip).join("")}</div>
        ${errors}
        <div class="actions">
          ${p.status === "agendado" ? `<button class="btn" data-action="publish-now" data-id="${p.id}">Publicar agora</button>` : ""}
          ${p.status === "falhou" || p.status === "parcial" ? `<button class="btn" data-action="retry" data-id="${p.id}">Tentar de novo</button>` : ""}
          ${p.status !== "publicando" ? `<button class="btn danger" data-action="delete-post" data-id="${p.id}">${p.status === "agendado" ? "Excluir" : "Remover da lista"}</button>` : ""}
        </div>
      </div>
    </article>`;
  }

  function viewInbox() {
    const list = state.comments
      .filter((c) => inboxFilter === "all" || (inboxFilter === "pending" ? !c.replied : acct(c.accountId)?.platform === inboxFilter))
      .sort((a, b) => b.when - a.when);
    const filters = [["all", "Todos"], ["pending", "Sem resposta"], ...ORDER.map((p) => [p, PLATFORMS[p].name])];
    return `
      <h2 class="view-title">Comentários</h2>
      <p class="view-sub">Responda todas as contas num lugar só.</p>
      ${mode === "live" ? `<div style="margin:-6px 0 12px"><button class="btn" data-action="sync">Buscar comentários agora</button></div>` : ""}
      <div class="chips">${filters.map(([k, l]) => `<button class="chip" data-action="filter" data-f="${k}" aria-pressed="${inboxFilter === k}">${l}</button>`).join("")}</div>
      <div class="stack">${list.length ? list.map(commentCard).join("") : `<div class="empty">Nenhum comentário ainda. Os novos aparecem aqui assim que chegam.</div>`}</div>
    `;
  }

  function commentCard(c) {
    const a = acct(c.accountId);
    return `<article class="card">
      <div class="comment-head">
        <div class="avatar">${esc((c.author.replace("@", "")[0] || "?").toUpperCase())}</div>
        <div class="comment-meta"><b>${esc(c.author)}</b><small>${ago(c.when)} · em “${esc(c.post)}”</small></div>
        ${a ? pf(a.platform) : ""}
      </div>
      <p class="comment-text">${esc(c.text)}</p>
      ${c.replied ? `<div class="replied"><span class="tag">Respondido</span><br>${esc(c.replied)}</div>` : ""}
      ${c.dmSent ? `<div class="replied"><span class="tag">Mensagem privada enviada</span><br>${esc(c.dmSent)}</div>` : ""}
      <div class="actions">
        ${!c.replied ? `<button class="btn primary" data-action="reply" data-id="${esc(c.id)}">Responder</button>` : ""}
        ${!c.dmSent ? `<button class="btn" data-action="dm" data-id="${esc(c.id)}">Mensagem privada</button>` : ""}
      </div>
    </article>`;
  }

  function viewRules() {
    return `
      <h2 class="view-title">Automações</h2>
      <p class="view-sub">Quando alguém comentar, o app responde e manda uma mensagem privada sozinho.</p>
      <div class="note" style="margin-bottom:14px">Quem só <strong>curtiu</strong> não pode receber mensagem automática: a Meta não informa quem curtiu nem se a pessoa te segue. Por isso a automação funciona com <strong>comentários</strong>.</div>
      <div class="stack">${state.rules.length ? state.rules.map(ruleCard).join("") : `<div class="empty">Nenhuma automação ainda.</div>`}</div>
      <div style="margin-top:14px"><button class="btn block" data-action="new-rule">Nova automação</button></div>
    `;
  }

  function ruleCard(r) {
    const accts = r.accountIds.map(acct).filter(Boolean);
    return `<article class="card">
      <div class="row" style="justify-content:space-between;flex-wrap:nowrap">
        <b style="min-width:0">${esc(r.name)}</b>
        <button class="switch" role="switch" aria-checked="${r.enabled}" aria-label="Ativar ${esc(r.name)}" data-action="toggle-rule" data-id="${r.id}"></button>
      </div>
      <dl class="rule-flow">
        <dt>Quando</dt><dd>${r.keyword ? `Alguém comentar “${esc(r.keyword)}”` : "Alguém comentar qualquer coisa"}</dd>
        <dt>Em</dt><dd><div class="row">${accts.map(acctChip).join("") || "Nenhuma conta"}</div></dd>
        <dt>Responder no post</dt><dd>${esc(r.replyText) || "<i>Não responder</i>"}</dd>
        <dt>Mensagem privada</dt><dd>${esc(r.dmText) || "<i>Não enviar</i>"}</dd>
      </dl>
      <div class="actions" style="justify-content:space-between;align-items:center">
        <small style="color:var(--muted)">Usada ${plural(r.runs, "vez", "vezes")}</small>
        <span class="row"><button class="btn ghost" data-action="edit-rule" data-id="${r.id}">Editar</button><button class="btn danger" data-action="delete-rule" data-id="${r.id}">Excluir</button></span>
      </div>
    </article>`;
  }

  function viewAccounts() {
    return `
      <h2 class="view-title">Contas</h2>
      <p class="view-sub">Entre com o Facebook uma vez e escolha as Páginas e os perfis do Instagram. Repita para adicionar mais.</p>
      <button class="btn primary block" data-action="connect">Conectar com Facebook</button>
      ${mode === "live" && !metaConfigured ? `<div class="note" style="margin-top:10px">O servidor ainda não tem as chaves do app da Meta (<strong>META_APP_ID</strong> e <strong>META_APP_SECRET</strong>).</div>` : ""}
      <div class="stack" style="margin-top:14px">${ORDER.map((p) => {
        const list = state.accounts.filter((a) => a.platform === p);
        return `<section class="card">
          <div class="platform-head">${pf(p, true)}<div><b>${PLATFORMS[p].name}</b><small>${esc(PLATFORMS[p].need)}</small></div></div>
          ${list.length ? list.map((a) => `<div class="acct-row"><div><b>${esc(a.handle)}</b>${a.needsReconnect
              ? `<small style="color:var(--warn)">Desconectada: conecte de novo</small>`
              : `<small>${fmtNum(a.followers)} seguidores</small>`}</div>
            ${a.needsReconnect ? `<button class="btn" data-action="connect">Reconectar</button>` : ""}
            <button class="btn danger" data-action="disconnect" data-id="${a.id}">Remover</button></div>`).join("")
          : `<div class="acct-row"><div><small>Nenhuma conta conectada.</small></div></div>`}
        </section>`;
      }).join("")}</div>
      <h3 class="group">Configuração</h3>
      ${setupCard()}
      <h3 class="group">O que dá para fazer</h3>
      <div class="table-wrap"><table style="min-width:0">
        <thead><tr><th>Função</th>${ORDER.map((p) => `<th>${PLATFORMS[p].short}</th>`).join("")}</tr></thead>
        <tbody>${LIMITS.map(([f, v, n]) => `<tr><td><b>${f}</b>${n ? `<br><small style="color:var(--muted)">${n}</small>` : ""}</td>${v.map((x) => `<td class="${x}">${MARK[x]}</td>`).join("")}</tr>`).join("")}</tbody>
      </table></div>
      <div style="margin-top:18px" class="row">
        ${mode === "live" ? `<button class="btn ghost" data-action="logout">Sair</button>` : `<button class="btn ghost" data-action="reset">Restaurar dados de exemplo</button>`}
      </div>
    `;
  }

  function setupCard() {
    const s = mode === "live" && setup ? setup : DEMO_SETUP;
    let host = s.publicUrl;
    try { host = new URL(s.publicUrl).host; } catch {}
    const when = (iso) => ago(Date.parse(iso));
    const items = [
      [s.https, "Endereço com HTTPS", s.https ? s.publicUrl : "Defina PUBLIC_URL com o endereço https da hospedagem."],
      [s.metaConfigured, "Chaves do app da Meta", s.metaConfigured ? "META_APP_ID e META_APP_SECRET configurados." : "Preencha META_APP_ID e META_APP_SECRET no servidor."],
      [Boolean(s.webhookVerifiedAt), "Webhook confirmado pela Meta", s.webhookVerifiedAt ? `Confirmado ${when(s.webhookVerifiedAt)}.` : "Cole a URL de retorno e o token abaixo em Webhooks, no painel da Meta."],
      [s.accounts > 0 && !s.needsReconnect, "Contas conectadas",
        s.needsReconnect ? `${plural(s.needsReconnect, "conta precisa", "contas precisam")} ser conectada de novo.` : s.accounts ? `${plural(s.accounts, "conta conectada", "contas conectadas")}.` : "Toque em Conectar com Facebook."],
      [Boolean(s.lastWebhookAt), "Comentários chegando na hora",
        s.lastWebhookAt ? `Último aviso da Meta ${when(s.lastWebhookAt)}.` : s.lastSyncAt ? `Ainda não. O app busca a cada 3 minutos (última busca ${when(s.lastSyncAt)}).` : "Começa depois que uma conta for conectada."],
      [pushOn, "Notificações neste iPhone", pushOn ? "Ativadas." : isStandalone() ? "Toque em Ativar notificações." : "Instale o app na Tela de Início e ative aqui."]
    ];
    const copies = [
      ["Domínio do app", host],
      ["URI de redirecionamento do OAuth", s.redirectUri],
      ["URL de retorno do webhook", s.webhookUrl],
      ["Token de verificação do webhook", s.verifyToken || "Defina META_WEBHOOK_VERIFY_TOKEN no servidor"]
    ];
    return `<section class="card">
      ${items.map(([ok, title, detail]) => `<div class="check"><span class="check-dot ${ok ? "ok" : "bad"}" aria-label="${ok ? "Pronto" : "Pendente"}">${ok ? "✓" : "!"}</span>
        <div><b>${title}</b><small>${esc(detail)}</small></div></div>`).join("")}
      <div class="actions" style="margin-top:8px">
        <button class="btn primary" data-action="push">${pushOn ? "Notificações ativas" : "Ativar notificações"}</button>
        ${pushOn ? `<button class="btn" data-action="push-test">Enviar teste</button>` : ""}
      </div>
    </section>
    <h3 class="group">Para colar no painel da Meta</h3>
    <section class="card">
      ${copies.map(([label, value]) => `<div class="field" style="margin-bottom:12px"><span class="label">${label}</span>
        <div class="copy-row"><code>${esc(value)}</code><button class="btn" data-action="copy" data-v="${esc(value)}">Copiar</button></div></div>`).join("")}
      <small style="color:var(--muted)">No webhook, assine <b>Page › feed</b> e <b>Instagram › comments</b>.</small>
    </section>`;
  }

  const VIEWS = { agenda: viewAgenda, inbox: viewInbox, rules: viewRules, accounts: viewAccounts };

  function render() {
    $("#view").innerHTML = VIEWS[tab]();
    document.querySelectorAll(".tab[data-tab]").forEach((b) => {
      if (b.dataset.tab === tab) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    const pending = state.comments.filter((c) => !c.replied).length;
    const badge = $("#inbox-badge"); badge.hidden = !pending; badge.textContent = pending > 99 ? "99+" : pending;
    $("#demo-pill").hidden = mode !== "demo";
  }

  /* ---------- Sheets ---------- */

  let sheetLocked = false;
  function openSheet(html, onMount, locked = false) {
    sheetLocked = locked;
    $("#sheet-body").innerHTML = `<div class="grabber"></div>${html}`;
    $("#sheet").hidden = false; $("#scrim").hidden = false;
    document.body.style.overflow = "hidden";
    onMount && onMount($("#sheet-body"));
  }
  function closeSheet(force) {
    if (sheetLocked && !force) return;
    $("#sheet").hidden = true; $("#scrim").hidden = true; document.body.style.overflow = "";
  }

  const sheetHead = (title) => `<div class="sheet-head"><h2>${title}</h2><button class="btn ghost" type="button" data-action="close">Cancelar</button></div>`;

  function accountPicker(selected) {
    return state.accounts.length
      ? ORDER.flatMap((p) => state.accounts.filter((a) => a.platform === p)).map((a) => `<label class="pick">${pf(a.platform)}<div><b>${esc(a.handle)}</b><small>${PLATFORMS[a.platform].name}</small></div>
          <input type="checkbox" name="acct" value="${a.id}" ${selected.includes(a.id) ? "checked" : ""}></label>`).join("")
      : `<div class="note">Conecte uma conta na aba Contas primeiro.</div>`;
  }

  const localInput = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60e3).toISOString().slice(0, 16);

  function showLogin() {
    openSheet(`
      <div class="sheet-head"><h2>Entrar</h2></div>
      <p class="view-sub">Digite a senha definida no servidor do Jarvis Social.</p>
      <form id="login-form">
        <div class="field"><label for="l-pass">Senha</label><input class="input" id="l-pass" type="password" autocomplete="current-password" required></div>
        <p class="error" id="l-error" hidden></p>
        <button class="btn primary block" type="submit">Entrar</button>
      </form>`, (root) => {
      $("#login-form", root).addEventListener("submit", async (e) => {
        e.preventDefault();
        try {
          await request("POST", "api/login", { password: $("#l-pass", root).value });
          mode = "live"; await refresh(); closeSheet(true); render();
        } catch (err) {
          const el = $("#l-error", root); el.textContent = err.message; el.hidden = false;
        }
      });
    }, true);
  }

  function compose() {
    const draft = { format: "reels", when: "schedule", thumb: null, file: null, kind: null };
    const def = new Date(Date.now() + 2 * H); def.setMinutes(0, 0, 0);
    openSheet(`
      ${sheetHead("Novo post")}
      <form id="compose-form" novalidate>
        <div class="field"><span class="label">Mídia</span>
          <label class="drop" for="c-media" id="c-drop">Toque para escolher foto ou vídeo</label>
          <input id="c-media" type="file" accept="image/jpeg,image/png,video/mp4,video/quicktime" hidden>
        </div>
        <div class="field"><span class="label">Formato</span>
          <div class="seg" id="c-format">
            <button type="button" data-v="feed" aria-pressed="false">Feed</button>
            <button type="button" data-v="reels" aria-pressed="true">Reels</button>
            <button type="button" data-v="story" aria-pressed="false">Story</button>
          </div>
        </div>
        <div class="field"><label for="c-caption">Legenda</label>
          <textarea class="input" id="c-caption" maxlength="2200" placeholder="Escreva a legenda e as hashtags"></textarea>
          <div class="counter"><span id="c-count">0</span> / 2.200</div>
        </div>
        <div class="field"><span class="label">Publicar em</span><div class="stack" id="c-accts">${accountPicker([])}</div></div>
        <div class="field"><span class="label">Quando</span>
          <div class="seg two" id="c-when">
            <button type="button" data-v="now" aria-pressed="false">Agora</button>
            <button type="button" data-v="schedule" aria-pressed="true">Agendar</button>
          </div>
          <input class="input" type="datetime-local" id="c-date" value="${localInput(def)}">
        </div>
        <div class="field"><span class="label">Opções</span>
          <div class="stack">
            <label class="pick"><div><b>Desativar comentários</b><small>Só no Instagram</small></div><span class="opt-badge api">Automático</span><input type="checkbox" id="c-nocomments"></label>
            <label class="pick"><div><b>Ocultar curtidas</b><small>O app te lembra de ativar no Instagram</small></div><span class="opt-badge manual">Lembrete</span><input type="checkbox" id="c-hidelikes"></label>
            <label class="pick"><div><b>Enquete</b><small>O app te lembra de criar a enquete no story</small></div><span class="opt-badge manual">Lembrete</span><input type="checkbox" id="c-poll"></label>
          </div>
        </div>
        <p class="error" id="c-error" hidden></p>
        <button class="btn primary block" type="submit" id="c-submit">Agendar</button>
      </form>`, (root) => {
      const cap = $("#c-caption", root), submit = $("#c-submit", root), err = $("#c-error", root);
      const chosen = () => [...root.querySelectorAll('input[name="acct"]:checked')].map((i) => i.value);
      const updateSubmit = () => {
        const n = chosen().length;
        submit.textContent = (draft.when === "now" ? "Publicar" : "Agendar") + (n ? ` em ${plural(n, "conta", "contas")}` : "");
      };
      cap.addEventListener("input", () => ($("#c-count", root).textContent = cap.value.length.toLocaleString("pt-BR")));
      $("#c-accts", root).addEventListener("change", updateSubmit);
      const seg = (id, key, after) => $(id, root).addEventListener("click", (e) => {
        const b = e.target.closest("button[data-v]"); if (!b) return;
        draft[key] = b.dataset.v;
        $(id, root).querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
        after && after();
      });
      seg("#c-format", "format");
      seg("#c-when", "when", () => { $("#c-date", root).hidden = draft.when === "now"; updateSubmit(); });

      $("#c-media", root).addEventListener("change", (e) => {
        const f = e.target.files[0]; if (!f) return;
        draft.file = f;
        draft.kind = f.type.startsWith("video") ? "video" : "image";
        draft.thumb = null;
        const drop = $("#c-drop", root);
        if (draft.kind === "image") {
          const img = new Image(); const url = URL.createObjectURL(f);
          img.onload = () => {
            const c = document.createElement("canvas"); const s = 240 / Math.max(img.width, img.height);
            c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
            c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
            draft.thumb = c.toDataURL("image/jpeg", 0.75);
            drop.innerHTML = `<img src="${draft.thumb}" alt="Prévia">`;
            URL.revokeObjectURL(url);
          };
          img.src = url;
        } else {
          drop.textContent = `🎬 ${f.name}`;
        }
      });

      $("#compose-form", root).addEventListener("submit", async (e) => {
        e.preventDefault();
        const ids = chosen();
        const platforms = ids.map((id) => acct(id)?.platform);
        const when = draft.when === "now" ? null : new Date($("#c-date", root).value);
        const problem = !ids.length ? "Escolha pelo menos uma conta." :
          (!cap.value.trim() && !draft.file) ? "Adicione uma mídia ou uma legenda." :
          (!draft.file && platforms.includes("instagram")) ? "O Instagram precisa de uma foto ou vídeo." :
          (draft.format === "story" && platforms.includes("facebook")) ? "Stories só podem ser agendados no Instagram. Desmarque as Páginas do Facebook." :
          (when && (isNaN(when) || when.getTime() < Date.now())) ? "Escolha um horário no futuro." : "";
        if (problem) { err.textContent = problem; err.hidden = false; return; }
        err.hidden = true;

        const options = { noComments: $("#c-nocomments", root).checked, hideLikes: $("#c-hidelikes", root).checked, poll: $("#c-poll", root).checked };
        const label = draft.when === "now" ? `Enviado para ${plural(ids.length, "conta", "contas")}` : `Agendado para ${dayLabel(when.toISOString()).toLowerCase()} às ${fmtTime(when.toISOString())}`;
        submit.disabled = true;
        try {
          let media = null;
          if (mode === "live" && draft.file) {
            submit.textContent = "Enviando mídia…";
            media = await request("POST", "api/media", draft.file, { "Content-Type": draft.file.type });
          }
          const ok = await act("POST", "api/posts",
            { caption: cap.value.trim(), accountIds: ids, when: when ? when.toISOString() : null, format: draft.format, media, thumb: draft.thumb, options },
            () => state.posts.push({
              id: uid(), caption: cap.value.trim(), accountIds: ids, when: (when || new Date()).toISOString(), format: draft.format,
              media: draft.kind === "video" ? "VÍDEO" : draft.kind ? "FOTO" : "TEXTO", thumb: draft.thumb,
              status: when ? "agendado" : "publicado", options
            }), label);
          if (ok) { closeSheet(true); tab = "agenda"; render(); }
        } catch (e2) {
          err.textContent = e2.message; err.hidden = false;
        } finally {
          submit.disabled = false; updateSubmit();
        }
      });
      updateSubmit();
    });
  }

  const QUICK = ["Valeu demais! 🙌", "Obrigado! Tem mais vindo por aí 🔥", "Te mandei no direct 📩"];

  function replySheet(c, isDm) {
    const rule = state.rules.find((r) => r.enabled && r.accountIds.includes(c.accountId));
    openSheet(`
      ${sheetHead(isDm ? "Mensagem privada" : "Responder")}
      <div class="card" style="margin-bottom:14px"><b>${esc(c.author)}</b><p class="comment-text" style="margin-bottom:0">${esc(c.text)}</p></div>
      ${isDm ? `<div class="note" style="margin-bottom:14px">A Meta permite <strong>uma</strong> mensagem privada por comentário, em até 7 dias.</div>` : ""}
      <form id="reply-form">
        ${!isDm ? `<div class="chips">${QUICK.map((q) => `<button type="button" class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join("")}</div>` : ""}
        <div class="field"><label for="r-text">${isDm ? "Mensagem" : "Resposta"}</label>
          <textarea class="input" id="r-text" required>${isDm ? esc(rule?.dmText || "") : ""}</textarea></div>
        <button class="btn primary block" type="submit">${isDm ? "Enviar mensagem" : "Responder"}</button>
      </form>`, (root) => {
      root.querySelectorAll("[data-q]").forEach((b) => b.addEventListener("click", () => ($("#r-text", root).value = b.dataset.q)));
      $("#reply-form", root).addEventListener("submit", async (e) => {
        e.preventDefault();
        const text = $("#r-text", root).value.trim(); if (!text) return;
        const ok = await act("POST", `api/comments/${encodeURIComponent(c.id)}/${isDm ? "dm" : "reply"}`, { text },
          () => { if (isDm) c.dmSent = text; else c.replied = text; },
          isDm ? "Mensagem enviada" : "Resposta publicada");
        if (ok) closeSheet(true);
      });
    });
  }

  function ruleSheet(existing) {
    const r = existing || { name: "", keyword: "", replyText: "", dmText: "", accountIds: [] };
    openSheet(`
      ${sheetHead(existing ? "Editar automação" : "Nova automação")}
      <form id="rule-form">
        <div class="field"><label for="ru-name">Nome</label><input class="input" id="ru-name" value="${esc(r.name)}" placeholder="Ex.: Convidar a seguir"></div>
        <div class="field"><label for="ru-kw">Só quando o comentário tiver a palavra</label><input class="input" id="ru-kw" value="${esc(r.keyword)}" placeholder="Deixe vazio para qualquer comentário"></div>
        <div class="field"><span class="label">Contas</span><div class="stack">${accountPicker(r.accountIds)}</div></div>
        <div class="field"><label for="ru-reply">Resposta pública no comentário</label><textarea class="input" id="ru-reply" placeholder="Opcional">${esc(r.replyText)}</textarea></div>
        <div class="field"><label for="ru-dm">Mensagem privada</label><textarea class="input" id="ru-dm" placeholder="Opcional">${esc(r.dmText)}</textarea></div>
        <p class="error" id="ru-error" hidden></p>
        <button class="btn primary block" type="submit">Salvar</button>
      </form>`, (root) => {
      $("#rule-form", root).addEventListener("submit", async (e) => {
        e.preventDefault();
        const data = {
          name: $("#ru-name", root).value.trim(), keyword: $("#ru-kw", root).value.trim(),
          replyText: $("#ru-reply", root).value.trim(), dmText: $("#ru-dm", root).value.trim(),
          accountIds: [...root.querySelectorAll('input[name="acct"]:checked')].map((i) => i.value)
        };
        const problem = !data.name ? "Dê um nome à automação." : !data.accountIds.length ? "Escolha pelo menos uma conta." : (!data.replyText && !data.dmText) ? "Escreva uma resposta ou uma mensagem." : "";
        if (problem) { const el = $("#ru-error", root); el.textContent = problem; el.hidden = false; return; }
        const ok = existing
          ? await act("PUT", `api/rules/${existing.id}`, data, () => Object.assign(existing, data), "Automação salva")
          : await act("POST", "api/rules", data, () => state.rules.push({ id: uid(), enabled: true, runs: 0, ...data }), "Automação criada");
        if (ok) closeSheet(true);
      });
    });
  }

  function demoConnectSheet() {
    openSheet(`
      ${sheetHead("Conectar com Facebook")}
      <div class="note" style="margin-bottom:14px">No app instalado, este botão abre o login oficial do Facebook. Você escolhe as Páginas e os perfis do Instagram ligados a elas, e todos aparecem aqui.</div>
      <form id="connect-form">
        <div class="field"><span class="label">Rede (demonstração)</span>
          <div class="seg two" id="cn-p"><button type="button" data-v="instagram" aria-pressed="true">Instagram</button><button type="button" data-v="facebook" aria-pressed="false">Facebook</button></div></div>
        <div class="field"><label for="cn-handle">Nome da conta</label><input class="input" id="cn-handle" placeholder="@usuario ou nome da Página" required></div>
        <button class="btn primary block" type="submit">Conectar</button>
      </form>`, (root) => {
      let p = "instagram";
      $("#cn-p", root).addEventListener("click", (e) => {
        const b = e.target.closest("button[data-v]"); if (!b) return;
        p = b.dataset.v; $("#cn-p", root).querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
      });
      $("#connect-form", root).addEventListener("submit", (e) => {
        e.preventDefault();
        let h = $("#cn-handle", root).value.trim(); if (!h) return;
        if (p === "instagram" && !h.startsWith("@")) h = "@" + h;
        state.accounts.push({ id: uid(), platform: p, handle: h, followers: 0 });
        saveDemo(); closeSheet(true); render(); toast(`${h} conectada`);
      });
    });
  }

  /* ---------- Events ---------- */

  const find = (list, id) => state[list].find((x) => x.id === id);

  document.addEventListener("click", (e) => {
    if (e.target.id === "scrim") return closeSheet();
    const t = e.target.closest("[data-tab],[data-action]");
    if (!t) return;
    if (t.dataset.tab) { tab = t.dataset.tab; render(); window.scrollTo(0, 0); return; }
    const id = t.dataset.id;
    switch (t.dataset.action) {
      case "compose": return compose();
      case "close": return closeSheet();
      case "filter": inboxFilter = t.dataset.f; return render();
      case "publish-now":
        return act("POST", `api/posts/${id}/publish-now`, {}, () => { const p = find("posts", id); p.status = "publicado"; p.when = new Date().toISOString(); }, "Publicando agora");
      case "retry":
        return act("POST", `api/posts/${id}/retry`, {}, () => { find("posts", id).status = "publicado"; }, "Tentando de novo");
      case "delete-post":
        return act("DELETE", `api/posts/${id}`, undefined, () => { state.posts = state.posts.filter((x) => x.id !== id); }, "Post removido");
      case "reply": return replySheet(find("comments", id), false);
      case "dm": return replySheet(find("comments", id), true);
      case "toggle-rule": {
        const r = find("rules", id);
        return act("POST", `api/rules/${id}/toggle`, {}, () => { r.enabled = !r.enabled; }, r.enabled ? "Automação desligada" : "Automação ligada");
      }
      case "new-rule": return ruleSheet();
      case "edit-rule": return ruleSheet(find("rules", id));
      case "delete-rule":
        return act("DELETE", `api/rules/${id}`, undefined, () => { state.rules = state.rules.filter((x) => x.id !== id); }, "Automação excluída");
      case "connect":
        if (mode === "live") { location.href = "auth/meta/start"; return; }
        return demoConnectSheet();
      case "disconnect":
        return act("DELETE", `api/accounts/${id}`, undefined, () => {
          state.accounts = state.accounts.filter((x) => x.id !== id);
          state.posts.forEach((p) => (p.accountIds = p.accountIds.filter((a) => a !== id)));
          state.posts = state.posts.filter((p) => p.accountIds.length);
        }, "Conta removida");
      case "logout":
        return request("POST", "api/logout").finally(() => { state = { accounts: [], posts: [], comments: [], rules: [] }; render(); showLogin(); });
      case "push": return pushOn ? toast("As notificações já estão ativas") : enablePush();
      case "push-test": return act("POST", "api/push/test", {}, () => {}, "Notificação enviada");
      case "sync": return act("POST", "api/sync", {}, () => {}, "Comentários atualizados");
      case "copy": return copyText(t.dataset.v);
      case "reset": state = SEED(); saveDemo(); render(); return toast("Dados de exemplo restaurados");
    }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#sheet").hidden) closeSheet(); });

  /* ---------- Start ---------- */

  async function boot() {
    const params = new URLSearchParams(location.search);
    try {
      const res = await fetch("api/state", { credentials: "same-origin" });
      if (res.status === 401) { mode = "live"; render(); showLogin(); }
      else if (res.ok && (res.headers.get("content-type") || "").includes("json")) {
        mode = "live"; await refresh();
      } else { state = loadDemo(); }
    } catch {
      state = loadDemo();
    }
    if (params.has("conectadas")) { tab = "accounts"; toast(`${plural(Number(params.get("conectadas")), "conta conectada", "contas conectadas")}`); }
    if (params.has("erro")) { tab = "accounts"; toast(params.get("erro")); }
    if (VIEWS[params.get("aba")]) tab = params.get("aba");
    if ([...params.keys()].length) history.replaceState(null, "", location.pathname);
    await checkPush().catch(() => {});
    render();
    // Keep the screens fresh while the app is open (new comments, finished posts).
    setInterval(() => { if (mode === "live" && !document.hidden && $("#sheet").hidden) refresh().then(render).catch(() => {}); }, 30_000);
  }
  boot();

  if ("serviceWorker" in navigator && location.protocol === "https:" && !/claude|anthropic/.test(location.hostname)) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
