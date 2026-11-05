(function () {
"use strict";
var cfg = window.APP_CONFIG || {};
var app = document.getElementById("app");

/* ---------- utilitats ---------- */
function esc(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; }
function fmt(iso) {
  try { return new Date(iso).toLocaleString("ca-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch (e) { return iso; }
}
function de(n) { return /^[aeiouàèéíòóúhAEIOUH]/.test(n) ? "d'" + n : "de " + n; }
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
var FLAG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 2h2v20H5zM8 3h12l-3 5 3 5H8z"/></svg>';
function $(id) { return document.getElementById(id); }

/* ---------- fotos ---------- */
function safeName(n) { return (n || "foto.jpg").replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(-60); }
function photoPath(itemId, filename) {
  var who = B.mode === "owner" ? "owner" : String(B.token);
  return B.data.project.id + "/" + who + "/" + itemId + "/" + Date.now() + "-" + safeName(filename);
}
function resizeImage(file, maxDim, quality) {
  return new Promise(function (resolve) {
    if (!file.type || file.type.indexOf("image/") !== 0 || !window.createImageBitmap && !window.Image) { resolve(file); return; }
    var img = new Image(), url = URL.createObjectURL(file);
    var done = function (result) { URL.revokeObjectURL(url); resolve(result); };
    img.onload = function () {
      var w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h || (w <= maxDim && h <= maxDim)) { done(file); return; }
      var scale = Math.min(maxDim / w, maxDim / h);
      var canvas = document.createElement("canvas");
      canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
      var ctx = canvas.getContext("2d");
      if (!ctx) { done(file); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(function (blob) { done(blob || file); }, "image/jpeg", quality);
    };
    img.onerror = function () { done(file); };
    img.src = url;
  });
}
function photoUrl(path) { return sb.storage.from("photos").getPublicUrl(path).data.publicUrl; }

if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
  app.innerHTML = '<div class="auth"><h1>Falta configurar</h1><p>Obre <b>config.js</b> i enganxa-hi la URL i la «anon key» del teu projecte de Supabase. Les instruccions són al fitxer README.md.</p></div>';
  return;
}
if (!window.supabase) { app.innerHTML = '<p class="err">No s\'ha pogut carregar la llibreria de Supabase. Comprova la connexió.</p>'; return; }
var sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

var session = null, recovery = false, B = null, pollTimer = null;

/* ---------- enrutament ---------- */
function parseRoute() {
  var h = location.hash.replace(/^#\/?/, "");
  var p = h.split("/");
  if (p[0] === "obra" && p[1]) return { name: "owner", id: p[1] };
  if (p[0] === "l" && p[1]) return { name: "guest", token: p[1] };
  return { name: "home" };
}
function go(h) { if (location.hash === h) route(); else location.hash = h; }
window.addEventListener("hashchange", route);

function stopPoll() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

async function route() {
  stopPoll(); B = null;
  var r = parseRoute();
  if (r.name === "guest") return openBoard({ mode: "guest", token: r.token });
  if (recovery) return viewNewPassword();
  if (!session) return viewLogin();
  if (r.name === "owner") return openBoard({ mode: "owner", projectId: r.id });
  return viewHome();
}

sb.auth.onAuthStateChange(function (ev, s) {
  var wasIn = !!session; session = s;
  if (ev === "SIGNED_IN" && wasIn) return;
  if (ev === "PASSWORD_RECOVERY") recovery = true;
  if (ev === "SIGNED_IN" || ev === "SIGNED_OUT" || ev === "PASSWORD_RECOVERY") route();
});
sb.auth.getSession().then(function (r) { session = r.data.session; route(); });

/* ---------- accés: entrar, crear compte, recuperar ---------- */
function authErr(e) {
  var m = (e && e.message) || "";
  if (/Invalid login/i.test(m)) return "Correu o contrasenya incorrectes.";
  if (/already registered/i.test(m)) return "Aquest correu ja té un compte. Prova d'entrar.";
  if (/at least 6/i.test(m)) return "La contrasenya ha de tenir almenys 6 caràcters.";
  if (/valid email|invalid format/i.test(m)) return "El correu no és vàlid.";
  if (/rate limit|too many/i.test(m)) return "Massa intents. Espera una estona i torna-ho a provar.";
  if (/confirm/i.test(m)) return "Cal confirmar el correu abans d'entrar. Mira la teva safata d'entrada.";
  return "No s'ha pogut fer: " + m;
}

function viewLogin(mode, msg) {
  mode = mode || "in";
  var reg = mode === "up";
  app.innerHTML = '<div class="auth"><h1>Seguiment d\'obra</h1><p class="sub">Preguntes, respostes i pendents de cada obra, en un sol lloc.</p>' +
    '<div class="tabs"><button type="button" class="chip" data-m="in" aria-pressed="' + !reg + '">Entrar</button><button type="button" class="chip" data-m="up" aria-pressed="' + reg + '">Crear compte</button></div>' +
    (msg ? '<p class="' + (msg.bad ? "err" : "okmsg") + '" role="status">' + esc(msg.text) + "</p>" : "") +
    '<form id="af">' +
    (reg ? '<div class="field"><label for="a-name">El teu nom</label><input id="a-name" type="text" maxlength="40" autocomplete="name" required></div>' : "") +
    '<div class="field"><label for="a-mail">Correu</label><input id="a-mail" type="email" autocomplete="email" required></div>' +
    '<div class="field"><label for="a-pass">Contrasenya</label><input id="a-pass" type="password" minlength="6" autocomplete="' + (reg ? "new-password" : "current-password") + '" required></div>' +
    '<button type="submit" class="btn primary">' + (reg ? "Crea el compte" : "Entra") + "</button> " +
    (reg ? "" : '<button type="button" class="linkbtn" id="forgot">He oblidat la contrasenya</button>') +
    '</form><p class="meta">Si només t\'han passat un enllaç d\'una obra, no cal compte: obre aquest enllaç directament.</p></div>';
  app.querySelectorAll("[data-m]").forEach(function (b) { b.addEventListener("click", function () { viewLogin(b.getAttribute("data-m")); }); });
  $("af").addEventListener("submit", async function (ev) {
    ev.preventDefault();
    var mail = $("a-mail").value.trim(), pass = $("a-pass").value;
    if (reg) {
      var name = $("a-name").value.trim();
      var r = await sb.auth.signUp({ email: mail, password: pass, options: { data: { name: name } } });
      if (r.error) return viewLogin("up", { text: authErr(r.error), bad: true });
      if (!r.data.session) return viewLogin("in", { text: "Compte creat. Confirma el correu que t'hem enviat i després entra.", bad: false });
    } else {
      var r2 = await sb.auth.signInWithPassword({ email: mail, password: pass });
      if (r2.error) return viewLogin("in", { text: authErr(r2.error), bad: true });
    }
  });
  var f = $("forgot");
  if (f) f.addEventListener("click", async function () {
    var mail = $("a-mail").value.trim();
    if (!mail) return viewLogin("in", { text: "Escriu primer el teu correu i torna a prémer «He oblidat la contrasenya».", bad: true });
    var r = await sb.auth.resetPasswordForEmail(mail, { redirectTo: location.href.split("#")[0] });
    viewLogin("in", r.error ? { text: authErr(r.error), bad: true } : { text: "T'hem enviat un correu amb l'enllaç per posar una contrasenya nova.", bad: false });
  });
}

function viewNewPassword(msg) {
  app.innerHTML = '<div class="auth"><h1>Contrasenya nova</h1>' + (msg ? '<p class="err">' + esc(msg) + "</p>" : "") +
    '<form id="pf"><div class="field"><label for="p1">Escriu la contrasenya nova</label><input id="p1" type="password" minlength="6" autocomplete="new-password" required></div>' +
    '<button type="submit" class="btn primary">Desa</button></form></div>';
  $("pf").addEventListener("submit", async function (ev) {
    ev.preventDefault();
    var r = await sb.auth.updateUser({ password: $("p1").value });
    if (r.error) return viewNewPassword(authErr(r.error));
    recovery = false; go("#/");
  });
}

/* ---------- inici: llista d'obres ---------- */
function myName() { var u = session && session.user; return (u && u.user_metadata && u.user_metadata.name) || (u && u.email ? u.email.split("@")[0] : "Jo"); }

async function viewHome(msg) {
  app.innerHTML = '<div class="top"><span class="who-am">Hola, ' + esc(myName()) + '</span><button type="button" class="btn" id="out">Surt</button></div><h1>Les teves obres</h1><p class="sub" id="hs">Carregant...</p><ul class="plist" id="pl"></ul>' +
    '<div class="panel"><h3>Nova obra</h3><form id="nf">' +
    '<div class="field"><label for="n-name">Nom de l\'obra</label><input id="n-name" type="text" maxlength="120" required></div>' +
    '<div class="field"><label for="n-client">Nom del client (apareix a les etiquetes)</label><input id="n-client" type="text" maxlength="80"></div>' +
    '<div class="field"><label for="n-tpl">Punts de partida</label><select id="n-tpl"><option value="empty">Obra buida</option><option value="demo">Amb l\'exemple (cuina, portes i armaris)</option></select></div>' +
    '<button type="submit" class="btn primary">Crea l\'obra</button> <span class="err" id="ne"></span></form></div>';
  $("out").addEventListener("click", function () { sb.auth.signOut(); });
  var r = await sb.from("projects").select("id,name,client_name,created_at").order("created_at", { ascending: false });
  if (r.error) { $("hs").textContent = "No s'han pogut carregar les obres."; return; }
  $("hs").textContent = r.data.length ? "" : "Encara no tens cap obra. Crea la primera aquí sota.";
  $("pl").innerHTML = r.data.map(function (p) { return '<li><a href="#/obra/' + esc(p.id) + '">' + esc(p.name) + "<small>" + esc(p.client_name || "Sense client") + " · " + esc(fmt(p.created_at)) + "</small></a></li>"; }).join("");
  $("nf").addEventListener("submit", async function (ev) {
    ev.preventDefault();
    var btn = ev.target.querySelector("button"); btn.disabled = true;
    var owner = myName();
    var pr = await sb.from("projects").insert({ name: $("n-name").value.trim(), client_name: $("n-client").value.trim(), owner_name: owner }).select("id").single();
    if (pr.error) { $("ne").textContent = "No s'ha pogut crear l'obra."; btn.disabled = false; return; }
    if ($("n-tpl").value === "demo") {
      var rows = [], pos = 0, rep = function (t) { return (t || "").replace(/\bIvan\b/g, owner); };
      window.TEMPLATE_SECTIONS.forEach(function (sec) { sec.items.forEach(function (it) {
        rows.push({ project_id: pr.data.id, section: sec.title, position: pos++, title: it.t, question: rep(it.q), answer: rep(it.a), next_step: rep(it.n), todo: rep(it.who), status: it.s });
      }); });
      var ir = await sb.from("items").insert(rows);
      if (ir.error) { $("ne").textContent = "L'obra s'ha creat però no s'han pogut afegir els punts d'exemple."; }
    }
    go("#/obra/" + pr.data.id);
  });
}

/* ---------- importar punts d'un text (WhatsApp, correu...) ---------- */
function impStripMark(s) {
  s = s.replace(/^[-*]\s+/, "").trim();
  if (s.length > 1 && s.charAt(0) === "*" && s.charAt(s.length - 1) === "*") s = s.slice(1, -1).trim();
  if (s.length > 1 && s.charAt(0) === "_" && s.charAt(s.length - 1) === "_") s = s.slice(1, -1).trim();
  return s;
}
function impIsBullet(line) { return /^\s*[-*]\s+/.test(line); }
function impIsHeader(line) {
  var t = line.trim();
  return t.length > 0 && t.length <= 60 && !impIsBullet(line) && /:$/.test(t);
}
function impTitle(s) {
  s = s.trim();
  if (!s) return "";
  if (s.length <= 100) return s;
  var cut = s.slice(0, 100), sp = cut.lastIndexOf(" ");
  if (sp > 40) cut = cut.slice(0, sp);
  return cut + "…";
}
function headline(i) { return impTitle(i.question) || i.section || "Punt"; }
function parseImportText(text, defaultSection) {
  var lines = text.replace(/\r\n/g, "\n").split("\n");
  var items = [], section = (defaultSection || "General").trim() || "General";
  var qLines = [], aLines = [];
  function flush() {
    var q = qLines.join(" ").trim().slice(0, 4000), a = aLines.join(" ").trim().slice(0, 4000);
    qLines = []; aLines = [];
    var title = impTitle(q || a);
    if (!title) return;
    items.push({ section: section, title: title, question: q, answer: a });
  }
  for (var k = 0; k < lines.length; k++) {
    var line = lines[k].trim();
    if (!line) { if (aLines.length) flush(); continue; }
    if (impIsHeader(line)) { flush(); section = line.replace(/:$/, "").trim() || section; continue; }
    if (impIsBullet(line)) { aLines.push(impStripMark(line)); }
    else { if (aLines.length) flush(); qLines.push(impStripMark(line)); }
  }
  flush();
  return items;
}

/* ---------- tauler (propietari i convidat) ---------- */
async function openBoard(opts) {
  B = Object.assign({ data: null, json: "", me: "", active: "tots", editing: null, editingQ: null, drafts: {}, confirmDel: null, confirmItem: null, confirmPhoto: null, focusNext: false,
    share: null, lastSeen: 0, canStore: false, msgText: "", msgBad: false }, opts);
  app.innerHTML = '<p class="sub">Carregant...</p>';
  var ok = await loadBoard(true);
  if (!ok) return;
  var pid = B.data.project.id;
  var seen = lsGet("seg-seen-" + pid);
  B.canStore = seen !== null; B.lastSeen = +seen || 0;
  lsSet("seg-seen-" + pid, String(B.lastSeen || Date.now()));
  B.canStore = lsGet("seg-seen-" + pid) !== null;
  B.me = B.mode === "owner" ? B.data.project.owner_name : (lsGet("seg-name") || "");
  if (B.mode === "owner") {
    var sr = await sb.from("projects").select("share_token,share_enabled").eq("id", pid).single();
    B.share = sr.error ? null : sr.data;
  }
  renderShell(); renderDyn();
  var mine = B;
  pollTimer = setInterval(function () { if (B === mine && document.visibilityState === "visible") loadBoard(false); }, 8000);
}
function saveSeen() { if (B && B.data && B.canStore) lsSet("seg-seen-" + B.data.project.id, String(Date.now())); }
window.addEventListener("pagehide", saveSeen);
document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") saveSeen(); });

async function loadBoard(first) {
  var mine = B;
  var r = await sb.rpc("get_board", { p_project: mine.projectId || null, p_token: mine.token || null });
  if (B !== mine) return false;
  if (r.error) {
    if (first) {
      app.innerHTML = '<div class="auth"><h1>No trobem aquesta obra</h1><p>' + (mine.mode === "guest" ? "L'enllaç no és vàlid o el propietari l'ha desactivat. Demana'n un de nou." : "No tens accés a aquesta obra.") + '</p>' +
        (mine.mode === "owner" ? '<a class="sublink" href="#/">Torna a les teves obres</a>' : "") + "</div>";
    } else setMsg("S'ha perdut la connexió. Es tornarà a provar sola.", true);
    return false;
  }
  var json = JSON.stringify(r.data);
  if (mine.msgBad && !first) setMsg("Connectat. Els canvis es veuen en directe.", false);
  if (json === mine.json) return true;
  mine.json = json; mine.data = r.data;
  var m = {}; r.data.entries.forEach(function (e) { (m[e.item_id] = m[e.item_id] || []).push(e); }); mine.logs = m;
  var ph = {}; (r.data.photos || []).forEach(function (p) { (ph[p.item_id] = ph[p.item_id] || []).push(p); }); mine.photosByItem = ph;
  var bi = {}; r.data.items.forEach(function (i) { bi[i.id] = i; }); mine.byId = bi;
  if (!first) renderDyn();
  return true;
}
function setMsg(t, bad) { if (!B) return; B.msgText = t; B.msgBad = !!bad; var el = $("status"); if (el) { el.textContent = t; el.className = "status" + (bad ? " bad" : ""); } }

function labels() {
  var P = B.data.project, c = P.client_name || "el client";
  return { done: "Resolt", client: "Pendent " + de(c), pro: "Pendent " + de(P.owner_name), open: "Sense resposta", info: "Informatiu" };
}

function shareUrl() { return location.href.split("#")[0] + "#/l/" + B.share.share_token; }

function renderShell() {
  var P = B.data.project, h = "";
  if (B.mode === "owner") h += '<div class="top"><a class="sublink" href="#/">← Les teves obres</a><button type="button" class="btn" id="out">Surt</button></div>';
  h += "<h1>" + esc(P.name) + '</h1><p class="sub">' + (B.mode === "owner" ? "Tu ets " + esc(P.owner_name) + ". " : "") + (P.client_name ? "Client: " + esc(P.client_name) + ". " : "") + "Cada punt mostra la pregunta, la resposta i qui ha de fer el següent pas.</p>";
  if (B.mode === "owner" && B.share) {
    h += '<div class="panel" id="sharep"><h3>Comparteix amb el client</h3>';
    if (B.share.share_enabled) {
      h += "<p>Qualsevol persona amb aquest enllaç pot veure i editar l'obra sense compte. Envia'l només a qui ha de participar.</p>" +
        '<input id="slink" type="text" readonly value="' + esc(shareUrl()) + '" aria-label="Enllaç per compartir"><div class="row"><button type="button" class="btn primary" id="scopy">Copia l\'enllaç</button>' +
        '<button type="button" class="btn" id="srot">Genera un enllaç nou</button><button type="button" class="btn danger" id="soff">Desactiva l\'enllaç</button></div>' +
        '<p class="meta">«Genera un enllaç nou» deixa de funcionar l\'antic. Fes-ho si l\'enllaç ha arribat a qui no toca.</p>';
    } else {
      h += '<p>L\'enllaç està desactivat: ningú pot entrar-hi.</p><div class="row"><button type="button" class="btn primary" id="son">Activa l\'enllaç</button></div>';
    }
    h += "</div>";
  }
  if (B.mode === "guest" || !B.me) {
    h += '<div class="panel" id="namep"><h3>' + (B.me ? "Escrius com a " + esc(B.me) : "Qui ets?") + '</h3><div class="row"><input id="nm" type="text" maxlength="40" placeholder="El teu nom" value="' + esc(B.me) + '" aria-label="El teu nom" style="max-width:240px"><button type="button" class="btn primary" id="nsave">Desa el nom</button></div>' +
      '<p class="meta">Aquest nom apareixerà amb cada canvi que facis, juntament amb la data i l\'hora.</p></div>';
  }
  h += '<p class="status' + (B.msgBad ? " bad" : "") + '" id="status" role="status">' + esc(B.msgText || "Connectat. Els canvis es veuen en directe.") + "</p>";
  h += '<div id="dyn"></div>';
  h += '<div class="panel"><h3>Afegeix un punt</h3><form id="af2"><div class="field"><label for="ap-sec">Secció (cuina, lavabos...)</label><input id="ap-sec" list="secs" type="text" maxlength="80" required><datalist id="secs"></datalist></div>' +
    '<div class="field"><label for="ap-q">Pregunta o tema</label><textarea id="ap-q" maxlength="4000" required></textarea></div>' +
    '<button type="submit" class="btn primary">Afegeix</button> <span class="err" id="ap-e"></span></form></div>';
  if (B.mode === "owner") {
    h += '<div class="panel"><h3>Importa punts d\'un text (WhatsApp, correu...)</h3>' +
      '<p>Enganxa el text. Una línia que acaba en « : » (i no comença amb «-» ni «*») es tracta com una secció nova. Les línies normals formen la pregunta; les que comencen per «-» o «*» formen la resposta. Tots els punts es creen en estat «Sense resposta»: revisa\'ls i ajusta\'ls després.</p>' +
      '<form id="impf"><div class="field"><label for="imp-sec">Secció per defecte (si el text no en té)</label><input id="imp-sec" type="text" maxlength="80" value="General"></div>' +
      '<div class="field"><label for="imp-txt">Text a convertir</label><textarea id="imp-txt" maxlength="20000" rows="10"></textarea></div>' +
      '<button type="submit" class="btn primary">Converteix i afegeix els punts</button> <span class="err" id="imp-e"></span><span class="okmsg" id="imp-ok"></span></form></div>';
  }
  app.innerHTML = h;
  fillSecs();
  bindShell();
}
function fillSecs() {
  var dl = $("secs"); if (!dl) return;
  var seen = {}; B.data.items.forEach(function (i) { seen[i.section] = 1; });
  dl.innerHTML = Object.keys(seen).map(function (s) { return '<option value="' + esc(s) + '">'; }).join("");
}

function bindShell() {
  var out = $("out"); if (out) out.addEventListener("click", function () { sb.auth.signOut(); });
  var ns = $("nsave");
  if (ns) ns.addEventListener("click", function () {
    var v = $("nm").value.trim(); if (!v) return;
    B.me = v; lsSet("seg-name", v); renderShell(); renderDyn();
  });
  var cp = $("scopy");
  if (cp) cp.addEventListener("click", function () {
    var inp = $("slink"); inp.select();
    var done = function () { cp.textContent = "Copiat"; setTimeout(function () { if ($("scopy")) $("scopy").textContent = "Copia l'enllaç"; }, 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(inp.value).then(done, function () { try { document.execCommand("copy"); done(); } catch (e) {} });
    else { try { document.execCommand("copy"); done(); } catch (e) {} }
  });
  function upd(patch) {
    return sb.from("projects").update(patch).eq("id", B.data.project.id).select("share_token,share_enabled").single().then(function (r) {
      if (r.error) { setMsg("No s'ha pogut canviar l'enllaç.", true); return; }
      B.share = r.data; renderShell(); renderDyn();
    });
  }
  var rot = $("srot"); if (rot) rot.addEventListener("click", function () {
    if (rot.getAttribute("data-c") !== "1") { rot.setAttribute("data-c", "1"); rot.textContent = "Segur? L'enllaç antic deixarà de funcionar"; return; }
    upd({ share_token: crypto.randomUUID() });
  });
  var off = $("soff"); if (off) off.addEventListener("click", function () { upd({ share_enabled: false }); });
  var on = $("son"); if (on) on.addEventListener("click", function () { upd({ share_enabled: true }); });
  var f = $("af2");
  if (f) f.addEventListener("submit", async function (ev) {
    ev.preventDefault();
    var pos = B.data.items.reduce(function (m, i) { return Math.max(m, i.position); }, -1) + 1;
    var sec = $("ap-sec").value.trim(), q = $("ap-q").value.trim();
    var r = await sb.rpc("add_item", args({ p_project: B.data.project.id, p_section: sec, p_title: impTitle(q) || sec || "Punt", p_question: q, p_position: pos }));
    if (r.error) { $("ap-e").textContent = "No s'ha pogut afegir."; return; }
    f.reset(); await loadBoard(false); fillSecs();
  });
  var impf = $("impf");
  if (impf) impf.addEventListener("submit", async function (ev) {
    ev.preventDefault();
    $("imp-e").textContent = ""; $("imp-ok").textContent = "";
    var parsed = parseImportText($("imp-txt").value, $("imp-sec").value);
    if (!parsed.length) { $("imp-e").textContent = "No s'ha identificat cap punt en aquest text."; return; }
    var btn = impf.querySelector("button"); btn.disabled = true;
    var pos = B.data.items.reduce(function (m, i) { return Math.max(m, i.position); }, -1) + 1;
    var rows = parsed.map(function (it) {
      return { project_id: B.data.project.id, section: it.section, position: pos++, title: it.title, question: it.question, answer: it.answer, status: "open" };
    });
    var r2 = await sb.from("items").insert(rows);
    btn.disabled = false;
    if (r2.error) { $("imp-e").textContent = "No s'ha pogut afegir els punts."; return; }
    impf.reset(); $("imp-sec").value = "General";
    $("imp-ok").textContent = "S'han afegit " + rows.length + " punts. Revisa\'ls més avall.";
    await loadBoard(false); fillSecs();
  });
}

/* ---------- part dinàmica: filtres, pendents, canvis i targetes ---------- */
function eff(i) { return i.status; }
function current(i) { var l = B.logs[i.id]; return l && l.length ? l[l.length - 1] : null; }
function isNew(at, by) { return B.canStore && B.lastSeen > 0 && by !== B.me && new Date(at).getTime() > B.lastSeen; }

function events() {
  var ev = [], L = labels();
  B.data.entries.forEach(function (e) { if (B.byId[e.item_id]) ev.push({ at: e.created_at, by: e.author, id: e.item_id, txt: "ha escrit a" }); });
  B.data.items.forEach(function (i) {
    if (i.flag_at) ev.push({ at: i.flag_at, by: i.flag_by, id: i.id, txt: i.flag ? "ha marcat com a important" : "ha tret la marca d'important de" });
    if (i.status_at) ev.push({ at: i.status_at, by: i.status_by, id: i.id, txt: "ha canviat l'estat a «" + L[i.status] + "» a" });
  });
  ev.sort(function (a, b) { return a.at < b.at ? 1 : -1; });
  return ev;
}

function renderDyn() {
  var el = $("dyn"); if (!el || !B || !B.data) return;
  var L = labels(), P = B.data.project, items = B.data.items;
  var openSet = {};
  el.querySelectorAll("details.hist[open]").forEach(function (d) { openSet[d.getAttribute("data-id")] = 1; });
  var af = document.activeElement;
  var ta0 = af && af.tagName === "TEXTAREA" && el.contains(af) ? af : null;
  var ss = ta0 ? ta0.selectionStart : 0, se = ta0 ? ta0.selectionEnd : 0, y = window.scrollY;

  var c = { tots: items.length, importants: 0 };
  Object.keys(L).forEach(function (k) { c[k] = 0; });
  items.forEach(function (i) { c[i.status]++; if (i.flag) c.importants++; });
  var defs = [["tots", "Tots"], ["importants", "Molt importants"]].concat(Object.keys(L).map(function (k) { return [k, L[k]]; }));
  var h = '<div class="legend" id="filters" role="group" aria-label="Filtrar per estat">' + defs.map(function (p) {
    return '<button type="button" class="chip" data-f="' + p[0] + '" aria-pressed="' + (B.active === p[0]) + '">' + esc(p[1]) + " <b>" + c[p[0]] + "</b></button>";
  }).join("") + "</div>";

  function li(arr) { return arr.map(function (i) { return "<li>" + esc(i.todo || headline(i)) + "</li>"; }).join("") || '<li class="empty">Res</li>'; }
  var cl = items.filter(function (i) { return i.status === "client" || i.status === "open"; });
  var pr = items.filter(function (i) { return i.status === "pro"; });
  var fl = items.filter(function (i) { return i.flag; });
  h += '<h2 style="margin-top:8px">Què queda per fer</h2><div class="todo">';
  if (fl.length) h += '<div class="box flag"><h3>Marcat com a molt important (' + fl.length + ")</h3><ul>" + fl.map(function (i) { return "<li>" + esc(i.section + ": " + headline(i)) + " (" + esc(i.flag_by || "") + ", " + esc(fmt(i.flag_at)) + ")</li>"; }).join("") + "</ul></div>";
  h += '<div class="box client"><h3>' + esc(L.client) + " (" + cl.length + ")</h3><ul>" + li(cl) + "</ul></div>";
  h += '<div class="box pro"><h3>' + esc(L.pro) + " (" + pr.length + ")</h3><ul>" + li(pr) + "</ul></div></div>";

  var ev = events().slice(0, 8);
  var newIds = {}; events().forEach(function (e) { if (isNew(e.at, e.by)) newIds[e.id] = 1; });
  if (ev.length) h += "<h2>Últims canvis</h2><ul class=\"feedlist\">" + ev.map(function (e) {
    return "<li>" + (isNew(e.at, e.by) ? '<span class="newtag">Nou</span> ' : "") + "<strong>" + esc(e.by || "?") + "</strong> " + esc(e.txt) + ' <button type="button" class="linkbtn" data-go="' + e.id + '">' + esc(headline(B.byId[e.id])) + '</button><span class="meta"> · ' + esc(fmt(e.at)) + "</span></li>";
  }).join("") + "</ul>";

  var secs = [], bySec = {};
  items.forEach(function (i) {
    var ok = B.active === "tots" || (B.active === "importants" ? i.flag : i.status === B.active);
    if (!ok) return;
    if (!bySec[i.section]) { bySec[i.section] = []; secs.push(i.section); }
    bySec[i.section].push(i);
  });
  secs.forEach(function (s) { h += "<h2>" + esc(s) + "</h2>" + bySec[s].map(function (i) { return card(i, L, newIds, openSet); }).join(""); });
  if (!secs.length) h += '<p class="empty">' + (items.length ? "No hi ha cap punt amb aquest filtre." : "Encara no hi ha cap punt. Afegeix el primer aquí sota.") + "</p>";

  el.innerHTML = h;
  window.scrollTo(0, y);
  var tgt = null;
  if (B.editing) tgt = $("ta-" + B.editing);
  else if (B.editingQ) tgt = $("tq-" + B.editingQ);
  if (tgt && (ta0 || B.focusNext)) { tgt.focus(); tgt.setSelectionRange(ta0 ? ss : tgt.value.length, ta0 ? se : tgt.value.length); }
  B.focusNext = false;
}

function entryMeta(e, label) {
  var h = '<p class="meta">' + label + esc(e.author) + " · " + esc(fmt(e.created_at));
  if (B.me && e.author.toLowerCase() === B.me.toLowerCase()) {
    if (B.confirmDel === e.id) h += ' · Segur? <button type="button" class="linkbtn danger" data-act="delyes" data-eid="' + e.id + '">Sí, esborra</button> <button type="button" class="linkbtn" data-act="delno">No</button>';
    else h += ' · <button type="button" class="linkbtn" data-act="del" data-eid="' + e.id + '">Esborra</button>';
  }
  return h + "</p>";
}

function photosBlock(i) {
  var pics = B.photosByItem[i.id] || [];
  var h = '<div class="photos"><p class="label">Fotos</p>';
  if (pics.length) {
    h += '<div class="photogrid">' + pics.map(function (p) {
      var url = photoUrl(p.path), mine_ = B.me && p.author.toLowerCase() === B.me.toLowerCase();
      var del = mine_ ? (B.confirmPhoto === p.id
        ? ' · Segur? <button type="button" class="linkbtn danger" data-act="phdelyes" data-pid="' + p.id + '">Sí</button> <button type="button" class="linkbtn" data-act="phdelno">No</button>'
        : ' · <button type="button" class="linkbtn" data-act="phdel" data-pid="' + p.id + '">Esborra</button>') : "";
      return '<figure><a href="' + esc(url) + '" target="_blank" rel="noopener"><img src="' + esc(url) + '" alt="Foto de ' + esc(p.author) + '" loading="lazy"></a>' +
        '<figcaption>' + esc(p.author) + del + "</figcaption></figure>";
    }).join("") + "</div>";
  }
  h += '<div class="tools"><label class="btn filebtn">Afegeix una foto<input type="file" accept="image/*" data-act="phpick" data-id="' + i.id + '"></label><span class="err" id="ph-e-' + i.id + '"></span></div></div>';
  return h;
}

function card(i, L, newIds, openSet) {
  var cur = current(i), hist = B.logs[i.id] || [], P = B.data.project, owner = B.mode === "owner";
  var h = '<article class="card' + (i.flag ? " flagged" : "") + '" data-s="' + i.status + '" id="c-' + i.id + '">';
  if (i.flag) h += '<p class="banner">Molt important · marcat per ' + esc(i.flag_by || "?") + " · " + esc(fmt(i.flag_at)) + "</p>";
  h += '<div class="head">' + (newIds[i.id] ? '<span class="newtag">Nou</span>' : "") + '<span class="pill ' + i.status + '">' + esc(L[i.status]) + "</span></div>";
  h += '<div class="q"><p class="label">' + esc(P.owner_name) + " pregunta</p>";
  if (B.editingQ === i.id) {
    h += '<textarea id="tq-' + i.id + '" data-qid="' + i.id + '" aria-label="Pregunta">' + esc(B.drafts["q" + i.id] != null ? B.drafts["q" + i.id] : i.question) + '</textarea><div class="tools"><button type="button" class="btn primary" data-act="qsave" data-id="' + i.id + '">Desa la pregunta</button><button type="button" class="btn" data-act="qcancel" data-id="' + i.id + '">Cancel·la</button></div>';
  } else h += "<p>" + esc(i.question) + "</p>";
  h += "</div>";
  if (cur || i.answer || i.status !== "info") {
    h += '<div class="a"><p class="label">' + (cur ? "Resposta actual" : "Resposta") + "</p>";
    var ce = B.editing === i.id ? "" : ' data-act="edit" data-id="' + i.id + '"';
    if (cur) h += '<p class="ansbox"' + ce + ">" + esc(cur.body) + "</p>" + entryMeta(cur, "Editat per ");
    else if (i.answer) h += '<p class="ansbox"' + ce + ">" + esc(i.answer) + "</p>";
    else h += '<p class="noans ansbox"' + ce + '>Encara sense resposta. Fes clic aquí per escriure-la.</p>';
    h += "</div>";
  }
  h += photosBlock(i);
  if (i.next_step) h += '<p class="next"><strong>Següent pas:</strong> ' + esc(i.next_step) + "</p>";
  if (i.status_by) h += '<p class="meta">Estat canviat per ' + esc(i.status_by) + " · " + esc(fmt(i.status_at)) + "</p>";
  if (B.editing === i.id) {
    var base = B.drafts[i.id] != null ? B.drafts[i.id] : (cur ? cur.body : (i.answer || ""));
    h += '<textarea id="ta-' + i.id + '" data-id="' + i.id + '" maxlength="4000" aria-label="Resposta">' + esc(base) + '</textarea><div class="tools"><button type="button" class="btn primary" data-act="save" data-id="' + i.id + '">Desa</button><button type="button" class="btn" data-act="cancel" data-id="' + i.id + '">Cancel·la</button></div>';
  } else {
    h += '<div class="tools"><button type="button" class="btn" data-act="edit" data-id="' + i.id + '">Escriu o edita la resposta</button>' +
      '<button type="button" class="btn flagbtn" data-act="flag" data-id="' + i.id + '" aria-pressed="' + !!i.flag + '">' + FLAG + (i.flag ? "Molt important" : "Marca com a important") + "</button>" +
      '<select data-act="status" data-id="' + i.id + '" aria-label="Estat">' + Object.keys(L).map(function (k) { return '<option value="' + k + '"' + (k === i.status ? " selected" : "") + ">" + esc(L[k]) + "</option>"; }).join("") + "</select></div>";
    if (owner) {
      h += '<div class="tools">' + (B.editingQ === i.id ? "" : '<button type="button" class="btn" data-act="qedit" data-id="' + i.id + '">Edita la pregunta</button>') +
        (B.confirmItem === i.id ? '<span class="meta">Segur? S\'esborra amb tot l\'historial.</span> <button type="button" class="btn danger" data-act="idelyes" data-id="' + i.id + '">Sí, elimina el punt</button> <button type="button" class="btn" data-act="idelno">No</button>'
          : '<button type="button" class="btn" data-act="idel" data-id="' + i.id + '">Elimina el punt</button>') + "</div>";
    }
  }
  if (hist.length) {
    h += '<details class="hist" data-id="' + i.id + '"' + (openSet[i.id] ? " open" : "") + "><summary>Historial (" + (hist.length + (i.answer ? 1 : 0)) + ")</summary><ol>";
    for (var k = hist.length - 1; k >= 0; k--) h += "<li><p>" + esc(hist[k].body) + "</p>" + entryMeta(hist[k], "") + "</li>";
    if (i.answer) h += "<li><p>" + esc(i.answer) + '</p><p class="meta">Resposta inicial</p></li>';
    h += "</ol></details>";
  }
  return h + "</article>";
}

/* ---------- accions ---------- */
function needMe() { if (!B.me) { setMsg("Escriu el teu nom a dalt per poder escriure.", true); return true; } return false; }
function args(extra) { return Object.assign({ p_token: B.token || null }, extra); }
async function write(promise, okText) {
  var r = await promise;
  if (r.error) { setMsg("No s'ha pogut desar. Torna-ho a provar.", true); await loadBoard(false); renderDyn(); return false; }
  if (okText) setMsg(okText, false);
  B.json = ""; await loadBoard(false); renderDyn(); return true;
}

app.addEventListener("click", async function (ev) {
  if (!B || !B.data) return;
  var go_ = ev.target.closest("[data-go]");
  if (go_) { var id0 = go_.getAttribute("data-go"); if (B.active !== "tots") { B.active = "tots"; renderDyn(); } var el0 = $("c-" + id0); if (el0) el0.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  var fb = ev.target.closest("[data-f]");
  if (fb) { B.active = fb.getAttribute("data-f"); renderDyn(); return; }
  var b = ev.target.closest("[data-act]"); if (!b || b.tagName === "SELECT") return;
  var act = b.getAttribute("data-act"), id = b.getAttribute("data-id"), item = id ? B.byId[id] : null;
  if (act === "edit") { B.editing = id; B.focusNext = true; delete B.drafts[id]; renderDyn(); return; }
  if (act === "cancel") { B.editing = null; delete B.drafts[id]; renderDyn(); return; }
  if (act === "qedit") { B.editingQ = id; B.focusNext = true; delete B.drafts["q" + id]; renderDyn(); return; }
  if (act === "qcancel") { B.editingQ = null; delete B.drafts["q" + id]; renderDyn(); return; }
  if (act === "del") { B.confirmDel = b.getAttribute("data-eid"); renderDyn(); return; }
  if (act === "delno") { B.confirmDel = null; renderDyn(); return; }
  if (act === "phdel") { B.confirmPhoto = b.getAttribute("data-pid"); renderDyn(); return; }
  if (act === "phdelno") { B.confirmPhoto = null; renderDyn(); return; }
  if (act === "idel") { B.confirmItem = id; renderDyn(); return; }
  if (act === "idelno") { B.confirmItem = null; renderDyn(); return; }
  if (act === "idelyes") { B.confirmItem = null; await write(sb.from("items").delete().eq("id", id), "Punt eliminat."); return; }
  if (act === "qsave") {
    var tq = $("tq-" + id), q = tq ? tq.value.trim() : "";
    B.editingQ = null; delete B.drafts["q" + id];
    await write(sb.from("items").update({ question: q, title: impTitle(q) || item.section || "Punt" }).eq("id", id), "Pregunta desada."); return;
  }
  if (needMe()) return;
  if (act === "delyes") { var eid = b.getAttribute("data-eid"); B.confirmDel = null; await write(sb.rpc("delete_entry", args({ p_entry: eid, p_author: B.me })), "Esborrat."); return; }
  if (act === "phdelyes") {
    var pid = b.getAttribute("data-pid"), photo = null;
    (B.data.photos || []).forEach(function (p) { if (p.id === pid) photo = p; });
    B.confirmPhoto = null;
    var rp = await sb.rpc("delete_photo", args({ p_photo: pid, p_author: B.me }));
    if (!rp.error && photo) sb.storage.from("photos").remove([photo.path]);
    B.json = ""; await loadBoard(false); renderDyn();
    return;
  }
  if (act === "flag") { await write(sb.rpc("set_flag", args({ p_item: id, p_flag: !item.flag, p_author: B.me }))); return; }
  if (act === "save") {
    var ta = $("ta-" + id), text = ta ? ta.value.trim() : "";
    if (!text) { setMsg("Escriu algun text abans de desar.", true); return; }
    var cur = current(item), prev = cur ? cur.body : (item.answer || "");
    if (text === prev) { B.editing = null; renderDyn(); return; }
    B.editing = null; delete B.drafts[id];
    var savedOk = await write(sb.rpc("add_entry", args({ p_item: id, p_author: B.me, p_body: text })), "Desat.");
    if (savedOk && item.status === "open") {
      await write(sb.rpc("set_status", args({ p_item: id, p_status: B.mode === "owner" ? "client" : "pro", p_author: B.me })));
    }
  }
});
app.addEventListener("input", function (ev) {
  var t = ev.target;
  if (t.tagName === "TEXTAREA" && t.getAttribute("data-id")) B.drafts[t.getAttribute("data-id")] = t.value;
  if (t.tagName === "TEXTAREA" && t.getAttribute("data-qid")) B.drafts["q" + t.getAttribute("data-qid")] = t.value;
});
app.addEventListener("change", async function (ev) {
  var t = ev.target;
  if (!B || !B.data) return;
  if (t.tagName === "INPUT" && t.type === "file" && t.getAttribute("data-act") === "phpick") {
    var id = t.getAttribute("data-id"), file = t.files && t.files[0];
    t.value = "";
    if (!file) return;
    var errEl = $("ph-e-" + id);
    if (needMe()) return;
    if (file.size > 20 * 1024 * 1024) { if (errEl) errEl.textContent = "La foto pesa massa (màxim 20 MB)."; return; }
    if (file.type && file.type.indexOf("image/") !== 0) { if (errEl) errEl.textContent = "Només es poden pujar imatges."; return; }
    if (errEl) errEl.textContent = "Pujant la foto...";
    var blob = await resizeImage(file, 1600, 0.82);
    var path = photoPath(id, file.name);
    var up = await sb.storage.from("photos").upload(path, blob, { contentType: blob.type || "image/jpeg" });
    if (up.error) { var e1 = $("ph-e-" + id); if (e1) e1.textContent = "No s'ha pogut pujar la foto."; return; }
    var r = await sb.rpc("add_photo", args({ p_item: id, p_author: B.me, p_path: path }));
    if (r.error) { var e2 = $("ph-e-" + id); if (e2) e2.textContent = "La foto s'ha pujat però no s'ha pogut desar."; return; }
    B.json = ""; await loadBoard(false); renderDyn();
    return;
  }
  var sel = ev.target; if (sel.tagName !== "SELECT" || !sel.getAttribute("data-id")) return;
  var id2 = sel.getAttribute("data-id");
  if (sel.value === B.byId[id2].status) return;
  if (needMe()) { renderDyn(); return; }
  await write(sb.rpc("set_status", args({ p_item: id2, p_status: sel.value, p_author: B.me })));
});
})();
