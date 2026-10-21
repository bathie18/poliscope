/* PoliScope — cœur applicatif : état, utilitaires, connexion, droits, routage et modules.
   La carte est dans map.js, les rapports PDF dans report.js. */
window.PS = window.PS || {};
(function (PS) {
  'use strict';
  /* ================= Utilitaires ================= */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const NF = new Intl.NumberFormat('fr-FR');
  const fmt = n => NF.format(Math.round(n));
  const pct = (n, d = 0) => `${(+n).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d })} %`;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const TODAY = new Date(2026, 9, 20);
  const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const dayFmt = off => { const d = new Date(TODAY); d.setDate(d.getDate() + off); return `${d.getDate()} ${MOIS[d.getMonth()]}` };
  const ago = n => n === 0 ? 'aujourd’hui' : (n === 1 ? 'hier' : `il y a ${n} j`);
  function hex2rgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)) }
  function mix(a, b, t) { const A = hex2rgb(a), B = hex2rgb(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('') }
  PS.U = { $, $$, esc, fmt, pct, clamp, css, dayFmt, ago, mix, TODAY };

  /* ================= État ================= */
  const KEY = 'poliscope-demo-v2';
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {} } catch (e) { saved = {} }
  const S = PS.S = {
    view: 'tableau', weights: saved.weights || { ...PS.DEFAULT_WEIGHTS }, focus: null,
    map: { base: 'osm', level: 'reg', ind: 'typo', layers: { coords: true, sections: false, iso: false, zones: false, remontees: false, labels: true }, sel: null, drawing: null },
    terrain: { action: null, door: 0, counts: { fav: 0, ind: 0, opp: 0, abs: 0 }, log: [], pending: [] },
    ctFilter: { q: '', role: '', cons: '' }, secFilter: { q: '', reg: '', st: '', mine: true }, actMine: true, prioLevel: 'dep'
  };
  const extra = PS.extra = { actions: saved.actions || [], contacts: saved.contacts || [], campaigns: saved.campaigns || [], edits: saved.edits || {}, audit: saved.audit || [], actState: saved.actState || {}, remontees: saved.remontees || [], remState: saved.remState || {} };
  PS.persist = () => { try { localStorage.setItem(KEY, JSON.stringify({ weights: S.weights, actions: extra.actions, contacts: extra.contacts, campaigns: extra.campaigns, edits: extra.edits, audit: extra.audit, actState: extra.actState, remontees: extra.remontees, remState: extra.remState })) } catch (e) { } };
  PS.ACTIONS = () => [...extra.actions, ...PS.D.actions];
  PS.CONTACTS = () => [...extra.contacts, ...PS.D.contacts];
  PS.REMONTEES = () => [...extra.remontees, ...PS.D.remontees];
  PS.CAMPAIGNS = () => [...extra.campaigns, ...PS.D.campaigns];
  PS.AUDIT = () => [...extra.audit, ...PS.D.audit];
  PS.log = (a) => { const h = new Date(); extra.audit.unshift({ t: `${String(h.getHours()).padStart(2, '0')}:${String(h.getMinutes()).padStart(2, '0')}`, u: `${PS.user.nom} (${PS.role.court})`, a }); extra.audit.splice(30); PS.persist() };

  /* ================= Authentification & droits ================= */
  PS.user = null; PS.role = null;
  const SKEY = 'poliscope-session';
  function perimLabel(u = PS.user) { const p = u.perimetre; return p.type === 'national' ? 'Sénégal' : (p.type === 'region' ? 'Région de ' + p.nom : 'Département de ' + p.nom) }
  PS.perimLabel = perimLabel;
  // obj : tout objet portant r (région) et dep (département)
  PS.canEdit = function (obj) {
    if (!PS.role || !obj) return false;
    const e = PS.role.edit, p = PS.user.perimetre;
    if (e === 'national') return true;
    if (e === 'aucun') return false;
    if (e === 'region') return obj.r === p.nom;
    if (e === 'departement') { if (obj.level === 'reg') return false; return obj.dep === p.nom || (obj.level === 'dep' && obj.n === p.nom) }
    return false;
  };
  PS.canSeePII = obj => PS.role.pii && PS.canEdit(obj);
  PS.canModule = m => PS.role.modules.includes(m);
  const editScopeText = () => PS.role.edit === 'national' ? 'tout le territoire' : (PS.role.edit === 'aucun' ? 'aucune modification (lecture seule)' : perimLabel());
  PS.editScopeText = editScopeText;
  PS.lockHTML = (what = 'Lecture seule') => `<div class="lock"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg><span>${esc(what)} : votre profil (${esc(PS.role.court)}) peut modifier ${esc(editScopeText())}.</span></div>`;
  const ADMKEY = 'poliscope-admin-v1', IMPKEY = 'poliscope-imp';
  const DEF_USERS = JSON.parse(JSON.stringify(PS.USERS)), DEF_ROLES = JSON.parse(JSON.stringify(PS.ROLES));
  function loadAdmin() { try { const a = JSON.parse(localStorage.getItem(ADMKEY) || 'null'); if (a && Array.isArray(a.users) && a.users.length) PS.USERS = a.users; if (a && a.roles && a.roles.admin_general) PS.ROLES = a.roles } catch (e) { } }
  PS.saveAdmin = () => { try { localStorage.setItem(ADMKEY, JSON.stringify({ users: PS.USERS, roles: PS.ROLES })) } catch (e) { } };
  PS.resetAdmin = () => { PS.USERS = JSON.parse(JSON.stringify(DEF_USERS)); PS.ROLES = JSON.parse(JSON.stringify(DEF_ROLES)); try { localStorage.removeItem(ADMKEY) } catch (e) { } };
  PS.impersonator = null;
  PS.isAdminGeneral = () => !!PS.user && PS.user.role === 'admin_general';
  function signIn(login) {
    const u = PS.USERS.find(x => x.login === login); if (!u || u.actif === false || !PS.ROLES[u.role]) return false;
    PS.user = u; PS.role = PS.ROLES[u.role];
    try { sessionStorage.setItem(SKEY, login) } catch (e) { }
    S.focus = defaultFocus(); S.secFilter.mine = PS.role.edit !== 'national' && PS.role.edit !== 'aucun'; S.actMine = S.secFilter.mine;
    S.map.sel = null; S.map.level = u.perimetre.type === 'national' ? 'reg' : (u.perimetre.type === 'region' ? 'dep' : 'com');
    if (S.report) S.report.terr = null;
    return true;
  }
  function signOut() { try { sessionStorage.removeItem(SKEY); sessionStorage.removeItem(IMPKEY) } catch (e) { } PS.user = null; PS.role = null; PS.impersonator = null; if (PS.mapDestroy) PS.mapDestroy(); renderLogin() }
  PS.impersonate = function (login) {
    const orig = PS.impersonator || PS.user;
    if (orig.role !== 'admin_general') { PS.toast('Seul un administrateur général peut changer de profil.'); return }
    const target = PS.USERS.find(x => x.login === login);
    if (!target || target.actif === false) { PS.toast('Ce compte est désactivé : activez-le avant de l’utiliser.'); return }
    PS.log(`a ouvert une session de test en tant que ${target.nom} (${PS.ROLES[target.role].label})`);
    if (!signIn(login)) { PS.toast('Impossible d’ouvrir ce compte : son rôle n’existe plus.'); return }
    PS.impersonator = orig; try { sessionStorage.setItem(IMPKEY, orig.login) } catch (e) { }
    shell(); go(PS.role.modules[0]); PS.toast(`Vous naviguez en tant que ${target.nom} (${PS.role.label}).`);
  };
  PS.stopImpersonation = function () {
    const o = PS.impersonator; if (!o) return;
    PS.impersonator = null; try { sessionStorage.removeItem(IMPKEY) } catch (e) { }
    signIn(o.login); S.adminTab = 'comptes'; shell(); go('admin'); PS.toast(`Retour à votre compte : ${o.nom}.`);
  };
  function defaultFocus() { const p = PS.user.perimetre; if (p.type === 'region') return PS.D.regions.find(r => r.n === p.nom).id; if (p.type === 'departement') return PS.D.depts.find(d => d.n === p.nom).id; return 'nat' }

  /* ================= Territoires ================= */
  PS.NAT = null;
  function natUnit() {
    const D = PS.D, ch = D.regions; const s = k => ch.reduce((a, d) => a + d[k], 0); const ins = s('inscrits');
    const w = k => ch.reduce((a, d) => a + d[k] * d.inscrits, 0) / ins;
    const u = { id: 'nat', level: 'nat', n: 'Sénégal', children: ch, pop: s('pop'), km2: s('km2'), inscrits: ins, communes: s('communes'), sections: s('sections'), actives: s('actives'), inactives: s('inactives'), membres: s('membres'), cartes: s('cartes'), objCartes: s('objCartes'), actions30: s('actions30'), participation: +w('participation').toFixed(1), score: +w('score').toFixed(1), scorePrev: +w('scorePrev').toFixed(1), rival: +w('rival').toFixed(1), access: +w('access').toFixed(2), activityTrend: Math.round(w('activityTrend')) };
    u.couv = Math.round(D.communes.filter(c => c.couv > 0).length / D.communes.length * 100); u.membres10k = +(u.membres / u.pop * 10000).toFixed(1); u.densite = Math.round(u.pop / u.km2);
    u.rang = u.score >= u.rival ? 1 : (u.score >= (100 - u.score - u.rival) * 0.55 ? 2 : 3);
    return u;
  }
  PS.unit = id => id === 'nat' ? PS.NAT : PS.D.byId[id];
  PS.communesOf = u => u.level === 'nat' ? PS.D.communes : u.level === 'reg' ? u.children.flatMap(d => d.children) : u.level === 'dep' ? u.children : [u];
  PS.sectionsOf = u => { const ids = new Set(PS.communesOf(u).map(c => c.id)); return PS.D.sections.filter(s => ids.has(s.commune)) };
  PS.inUnit = (obj, u) => u.level === 'nat' || (u.level === 'reg' && obj.r === u.n) || (u.level === 'dep' && obj.dep === u.n && obj.r === u.r) || (u.level === 'com' && (obj.commune === u.id || obj.commune === u.n));
  PS.terrLabel = u => u.level === 'nat' ? 'Sénégal' : u.level === 'reg' ? 'Région de ' + u.n : u.level === 'dep' ? 'Département de ' + u.n : 'Commune de ' + u.n;
  PS.terrSelect = function (id, value, withCommunes) {
    const D = PS.D;
    let h = `<select id="${id}" class="terr-sel" aria-label="Territoire"><option value="nat" ${value === 'nat' ? 'selected' : ''}>Sénégal (national)</option>`;
    for (const r of D.regions) {
      h += `<optgroup label="Région de ${esc(r.n)}"><option value="${r.id}" ${value === r.id ? 'selected' : ''}>${esc(r.n)} — région</option>`;
      for (const d of r.children) {
        h += `<option value="${d.id}" ${value === d.id ? 'selected' : ''}>&nbsp;&nbsp;${esc(d.n)} — département</option>`;
        if (withCommunes) for (const c of d.children) h += `<option value="${c.id}" ${value === c.id ? 'selected' : ''}>&nbsp;&nbsp;&nbsp;&nbsp;${esc(c.n)}</option>`;
      }
      h += '</optgroup>';
    }
    return h + '</select>';
  };

  /* ================= Indicateurs ================= */
  const TYPO = PS.TYPO;
  PS.typo = u => { if (u.score >= 38 && u.couv >= 50) return 'bastion'; if (u.couv < 50 && (u.score >= 30 || u.participation >= 63)) return 'renforcer'; if (u.score >= 28) return 'concurrentielle'; return 'conquerir' };
  PS.surveiller = u => u.activityTrend <= -22 && (u.score - u.scorePrev) <= -1.5;
  PS.typoChip = k => `<span class="chip t-${k}">${TYPO[k].l}</span>`;
  PS.survChip = `<span class="chip t-surveiller">À surveiller</span>`;
  let MAXINS = { dep: 1, com: 1 };
  const COMPONENTS = PS.COMPONENTS = [
    { k: 'poids', l: 'Poids électoral', h: 'Nombre d’inscrits dans le territoire', f: u => u.inscrits / (MAXINS[u.level] || MAXINS.dep) },
    { k: 'marge', l: 'Marge de progression', h: 'Écart entre notre score et 60 %', f: u => clamp(1 - u.score / 60, 0, 1) },
    { k: 'particip', l: 'Participation', h: 'Mobilisation habituelle de l’électorat', f: u => clamp((u.participation - 48) / 28, 0, 1) },
    { k: 'deficit', l: 'Déficit de couverture', h: 'Part des communes sans section', f: u => 1 - u.couv / 100 },
    { k: 'activite', l: 'Recul d’activité', h: 'Baisse des actions sur 90 jours', f: u => clamp(-u.activityTrend / 45, 0, 1) },
    { k: 'access', l: 'Accessibilité', h: 'Facilité d’accès des équipes (isochrones)', f: u => u.access }
  ];
  PS.priority = u => { let s = 0, w = 0; for (const c of COMPONENTS) { const wi = +S.weights[c.k] || 0; s += wi * c.f(u); w += wi } return w ? Math.round(s / w * 100) : 0 };
  PS.recos = function (u) {
    const r = [];
    if (u.level !== 'com' && u.couv < 45) { const n = Math.max(1, Math.ceil(u.communes * (0.6 - u.couv / 100))); r.push(['+', `Ouvrir ${n} antenne${n > 1 ? 's' : ''} : ${100 - u.couv} % des communes n’ont aucune section active.`, 'Réunion de section']) }
    if (u.level === 'com' && u.couv === 0) r.push(['+', 'Aucune section active dans la commune : identifier un responsable et ouvrir une antenne.', 'Réunion de section']);
    if (u.inactives > 0) r.push(['↻', `Relancer ${u.inactives} section${u.inactives > 1 ? 's' : ''} sans activité depuis plus de 90 jours.`, 'Réunion de section']);
    if (u.participation >= 62 && u.score < 32) r.push(['⌂', `Porte-à-porte ciblé : participation forte (${pct(u.participation, 1)}) mais score faible (${pct(u.score, 1)}).`, 'Porte-à-porte']);
    if (u.access < 0.45) r.push(['→', 'Organiser une caravane : accessibilité faible, les équipes couvrent mal le territoire.', 'Caravane']);
    if (u.objCartes && u.cartes < u.objCartes * 0.6) r.push(['◎', `Campagne de placement de cartes : ${Math.round(u.cartes / u.objCartes * 100)} % de l’objectif atteint.`, 'Placement de cartes']);
    if (PS.typo(u) === 'bastion') r.push(['✓', 'Consolider le bastion : renouveler les cartes et former les responsables.', 'Réunion de section']);
    return r.slice(0, 4);
  };
  PS.indValue = (k, u) => ({ priorite: PS.priority(u), score: u.score, couv: u.couv, participation: u.participation, membres10k: u.membres10k, activite: u.activityTrend })[k];
  PS.indColor = function (k, u) {
    const I = PS.INDICATORS[k];
    if (k === 'typo') return css(TYPO[PS.typo(u)].c);
    if (k === 'rang') return css(PS.RANG[u.rang].c);
    const v = PS.indValue(k, u);
    if (I.div) return v < 0 ? mix(css('--land-0'), css('--coral'), clamp(-v / 45, 0, 1)) : mix(css('--land-0'), css('--teal'), clamp(v / 35, 0, 1));
    return mix(css(I.ramp[0]), css(I.ramp[1]), clamp((v - I.min) / (I.max - I.min), 0, 1) * 0.92 + 0.08);
  };
  PS.indText = function (k, u) {
    if (k === 'typo') return PS.TYPO[PS.typo(u)].l;
    if (k === 'rang') return PS.RANG[u.rang].l;
    const v = PS.indValue(k, u), I = PS.INDICATORS[k];
    return `${(+v).toLocaleString('fr-FR')}${I.u}`;
  };
  PS.totals = u => u;

  /* ================= Petits graphiques ================= */
  PS.spark = function (vals, w = 120, h = 28, color = '--teal') {
    const mx = Math.max(...vals), mn = Math.min(...vals), c = css(color);
    const pts = vals.map((v, i) => [i / (vals.length - 1) * (w - 4) + 2, h - 3 - (v - mn) / ((mx - mn) || 1) * (h - 8)]);
    const line = pts.map(p => p.map(n => n.toFixed(1)).join(',')).join(' '), last = pts[pts.length - 1];
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polygon points="2,${h} ${line} ${w - 2},${h}" fill="${c}" fill-opacity=".12"/><polyline points="${line}" fill="none" stroke="${c}" stroke-width="1.6"/><circle cx="${last[0]}" cy="${last[1]}" r="2.6" fill="${c}"/></svg>`;
  };
  PS.weekly = (seed, base, growth) => { const r = PS.D.rng(PS.D.hash(seed)); return Array.from({ length: 12 }, (_, i) => Math.round(base * (1 + growth * i / 11) * (0.85 + r() * 0.3))) };

  /* ================= Toast, modale ================= */
  let toastT;
  PS.toast = function (msg) { let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t) } t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 3800) };
  PS.modal = function (title, body, foot) {
    PS.closeModal();
    const bg = document.createElement('div'); bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><h3>${esc(title)}</h3><button class="btn ghost sm" data-close aria-label="Fermer">Fermer</button></header><div class="mb">${body}</div>${foot ? `<footer>${foot}</footer>` : ''}</div>`;
    bg.addEventListener('click', e => { if (e.target === bg || e.target.closest('[data-close]')) PS.closeModal() });
    document.body.appendChild(bg);
    const f = bg.querySelector('input:not([type=checkbox]),select,textarea,button.primary'); if (f) f.focus();
    return bg;
  };
  PS.closeModal = () => $$('.modal-bg').forEach(m => m.remove());
  document.addEventListener('keydown', e => { if (e.key === 'Escape') PS.closeModal() });

  /* ================= Connexion ================= */
  const AV = ['--teal', '--amber', '--peri', '--coral', '--ink-2'];
  const initials = n => n.split(' ').map(x => x[0]).join('').slice(0, 2);
  function renderLogin() {
    document.getElementById('app').innerHTML = `
    <div class="login">
      <canvas id="loginMap" aria-hidden="true"></canvas><div class="login-veil"></div>
      <div class="login-inner">
        <section class="login-desc">
          <div class="brand">${PS.logoSVG(38)}<div><b>PoliScope</b><small>Pilotage territorial · CEGIT</small></div></div>
          <h1>Le poste de pilotage territorial des partis et coalitions.</h1>
          <p>Voir le territoire, organiser le maillage, prioriser l’action. Une plateforme cartocentrée alimentée par les résultats CivicScope et les remontées terrain.</p>
          <ul>
            <li><b>01</b><span>Maillage : sièges, coordinations, sections et antennes, de la région à la commune.</span></li>
            <li><b>02</b><span>Intelligence territoriale : résultats, participation, population, accessibilité.</span></li>
            <li><b>03</b><span>Actions terrain : porte-à-porte, phoning, caravanes, remontées de terrain.</span></li>
            <li><b>04</b><span>Décision : score de priorité, scénarios, rapports PDF par territoire.</span></li>
          </ul>
        </section>
        <section class="login-card" aria-labelledby="lgTitle">
          <div class="label">Connexion</div>
          <h2 id="lgTitle">Accéder à l’espace du parti</h2>
          <form id="loginForm" autocomplete="on" novalidate>
            <div class="field"><label for="lg-u">Identifiant</label><input id="lg-u" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required></div>
            <div class="field"><label for="lg-p">Mot de passe</label><input id="lg-p" name="password" type="password" autocomplete="current-password" required></div>
            <div class="err" id="lg-err" role="alert"></div>
            <button class="btn primary" type="submit">Se connecter</button>
          </form>
          <p class="small muted" style="margin:0">Vos identifiants vous sont remis par l’administrateur de votre parti. Mot de passe oublié : contactez-le.</p>
        </section>
        <div class="login-spacer" aria-hidden="true"></div>
      </div>
      <footer class="login-foot"><span>PoliScope © CEGIT — Centre d’Expertise en Géomatique et Ingénierie Territoriale</span><span>Version de démonstration · données du parti fictives</span></footer>
    </div>`;
    $('#loginForm').addEventListener('submit', e => {
      e.preventDefault();
      const login = $('#lg-u').value.trim().toLowerCase(), p = $('#lg-p').value, err = $('#lg-err');
      if (!login || !p) { err.textContent = 'Saisissez votre identifiant et votre mot de passe.'; return }
      const u = PS.USERS.find(x => x.login === login);
      if (!u || u.password !== p) { err.textContent = 'Identifiant ou mot de passe incorrect.'; $('#lg-p').select(); return }
      if (u.actif === false) { err.textContent = 'Ce compte est désactivé. Contactez l’administrateur de votre parti.'; return }
      enter(login);
    });
    $('#lg-u').focus();
    drawLoginMap();
  }
  function drawLoginMap() {
    const cv = $('#loginMap'); if (!cv || !cv.getContext) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2), W = cv.clientWidth, H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr; const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const B = [-17.6, 12.25, -11.3, 16.75], kx = Math.cos(14.5 * Math.PI / 180);
    const k = Math.min(W * 0.96 / ((B[2] - B[0]) * kx), H * 0.92 / (B[3] - B[1]));
    const ox = (W - (B[2] - B[0]) * kx * k) / 2, oy = (H - (B[3] - B[1]) * k) / 2;
    const P = ([x, y]) => [ox + (x - B[0]) * kx * k, H - oy - (y - B[1]) * k];
    const path = geom => { const ps = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates; g.beginPath(); for (const p of ps) for (const ring of p) { ring.forEach((pt, i) => { const [x, y] = P(pt); i ? g.lineTo(x, y) : g.moveTo(x, y) }); g.closePath() } };
    g.clearRect(0, 0, W, H);
    const tint = { bastion: 'rgba(63,182,177,.20)', concurrentielle: 'rgba(201,220,218,.07)', renforcer: 'rgba(227,168,58,.16)', conquerir: 'rgba(141,155,245,.13)' };
    for (const c of PS.D.communes) { path(c.geom); g.fillStyle = tint[PS.typo(c)]; g.fill('evenodd'); g.strokeStyle = 'rgba(201,220,218,.12)'; g.lineWidth = 0.6; g.stroke() }
    for (const d of PS.D.depts) { path(d.geom); g.strokeStyle = 'rgba(201,220,218,.22)'; g.lineWidth = 0.9; g.stroke() }
    for (const r of PS.D.regions) { path(r.geom); g.strokeStyle = 'rgba(201,220,218,.45)'; g.lineWidth = 1.4; g.stroke() }
    const col = { 'Active': '63,182,177', 'À relancer': '227,168,58', 'Inactive': '231,121,95' };
    for (const s of PS.D.sections) { const [x, y] = P([s.lng, s.lat]); g.beginPath(); g.arc(x, y, 5, 0, 7); g.fillStyle = `rgba(${col[s.statut]},.18)`; g.fill(); g.beginPath(); g.arc(x, y, 1.9, 0, 7); g.fillStyle = `rgba(${col[s.statut]},.95)`; g.fill() }
    for (const c of PS.D.coordsReg) { const [x, y] = P([c.lng, c.lat]); g.strokeStyle = 'rgba(227,168,58,.9)'; g.lineWidth = 1.5; g.strokeRect(x - 4, y - 4, 8, 8) }
  }
  let lmT; window.addEventListener('resize', () => { clearTimeout(lmT); lmT = setTimeout(() => { if (!PS.user && $('#loginMap')) drawLoginMap() }, 150) });
  function enter(login) { if (!signIn(login)) return; PS.log('s’est connecté·e'); shell(); const h = location.hash.slice(1); go(VIEWS[h] && PS.canModule(h) ? h : PS.role.modules[0]); PS.toast(`Bienvenue ${PS.user.nom}. Profil : ${PS.role.label}.`) }

  /* ================= Shell ================= */
  PS.logoSVG = (s = 34) => `<svg width="${s}" height="${s}" viewBox="0 0 34 34" aria-hidden="true"><circle cx="17" cy="17" r="15" fill="none" stroke="#fff" stroke-opacity=".9" stroke-width="2"/><circle cx="17" cy="17" r="8.5" fill="none" stroke="#e3a83a" stroke-width="2"/><path d="M17 1v8M17 25v8M1 17h8M25 17h8" stroke="#fff" stroke-opacity=".9" stroke-width="2"/><circle cx="17" cy="17" r="2.6" fill="#e3a83a"/></svg>`;
  const ICONS = {
    tableau: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>', carte: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14"/>',
    priorites: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', maillage: '<circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="18" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="M12 7.5v4M12 11.5 6.5 16M12 11.5l5.5 4.5"/>',
    contacts: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c1.7.8 2.7 2.6 3 5.2"/>',
    actions: '<path d="M4 4h16v16H4zM4 9h16M9 4v16"/>', terrain: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
    messages: '<path d="M4 5h16v11H9l-5 4z"/>', benevoles: '<path d="M12 3l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.4l-5.3 2.7 1-5.8-4.2-4.1 5.9-.9z"/>',
    agenda: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>', rapports: '<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7"/>',
    admin: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'
  };
  const ic = k => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg>`;
  function shell() {
    const u = PS.user, i = Math.max(0, PS.USERS.indexOf(u));
    document.getElementById('app').innerHTML = `
    <div class="app">
      <header class="topbar">
        <div class="brand">${PS.logoSVG()}<div><b>PoliScope</b><small>Pilotage territorial · CEGIT</small></div></div>
        <span class="demo-tag" title="Les données du parti sont simulées">Démo · données fictives</span>
        ${PS.impersonator ? `<div class="impbar" role="status"><span>Session de test : <b>${esc(u.nom)}</b> · ${esc(PS.role.label)}</span><button id="impBack">Revenir à mon compte</button></div>` : ''}
        <div class="spacer"></div>
        <div class="party"><span class="dot"></span><span>Parti fictif « Ànd Liggéey »</span></div>
        <div class="usermenu"><span class="avatar" style="background:${css(AV[i % 5])}">${esc(initials(u.nom))}</span><span class="who"><b>${esc(u.nom)}</b><span>${esc(PS.role.court)} · ${esc(perimLabel())}</span></span><button id="logout">Se déconnecter</button></div>
      </header>
      <nav class="rail" aria-label="Modules">
        ${PS.MODULES.map(([g, items]) => { const ok = items.filter(([k]) => PS.canModule(k)); return ok.length ? `<div class="grp">${g}</div>` + ok.map(([k, l]) => `<a href="#${k}" data-view="${k}">${ic(k)}<span>${l}</span>${k === 'actions' ? '<span class="badge" id="navBadge"></span>' : ''}</a>`).join('') : '' }).join('')}
        <div class="foot"><b style="color:#fff">${esc(PS.role.label)}</b><br>Modification : ${esc(editScopeText())}<br>Prototype · ${dayFmt(0)} 2026</div>
      </nav>
      <main id="main" tabindex="-1"></main>
    </div>`;
    $('#logout').addEventListener('click', () => { PS.log('s’est déconnecté·e'); signOut() });
    const ib = $('#impBack'); if (ib) ib.addEventListener('click', PS.stopImpersonation);
  }
  function setNav() {
    $$('.rail a').forEach(a => a.setAttribute('aria-current', a.dataset.view === S.view ? 'page' : 'false'));
    const n = PS.ACTIONS().filter(a => PS.canEdit(a) && a.st === 'À planifier').length;
    const b = $('#navBadge'); if (b) { b.textContent = n || ''; b.hidden = !n }
  }

  /* ================= Routage ================= */
  const VIEWS = PS.VIEWS = {};
  function go(v, opts) {
    if (!PS.canModule(v)) { PS.toast('Ce module n’est pas accessible avec votre profil.'); v = PS.role.modules[0] }
    S.view = v; if (opts && opts.sel) { S.map.sel = opts.sel; const u = PS.D.byId[opts.sel.id]; if (u && u.level) S.map.level = u.level; else if (opts.sel.t === 'sec') S.map.level = 'com' }
    try { history.replaceState(null, '', '#' + v) } catch (e) { }
    render();
  }
  PS.go = go;
  window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (PS.user && VIEWS[h] && h !== S.view) go(h) });
  document.addEventListener('click', e => {
    if (!PS.user) return;
    const a = e.target.closest('[data-view]'); if (a) { e.preventDefault(); go(a.dataset.view); return }
    const g = e.target.closest('[data-goto]'); if (g) { e.preventDefault(); go('carte', { sel: { t: 'unit', id: g.dataset.goto } }); return }
    const n = e.target.closest('[data-new-action]'); if (n) { e.preventDefault(); PS.actionForm({ dep: n.dataset.dep || '', type: n.dataset.type || '' }) }
  });
  function render() {
    if (PS.mapDestroy) PS.mapDestroy();
    const m = $('#main'); m.className = S.view === 'carte' ? 'flush' : '';
    m.innerHTML = VIEWS[S.view].html();
    VIEWS[S.view].bind && VIEWS[S.view].bind();
    setNav();
    if (S.view !== 'carte') m.scrollTop = 0;
  }
  PS.render = render;

  /* =========================================================
     TABLEAU DE BORD
     ========================================================= */
  VIEWS.tableau = {
    html() {
      const T = PS.unit(S.focus), kids = T.level === 'com' ? [] : T.children;
      const ACT = PS.ACTIONS().filter(a => PS.inUnit(a, T));
      const touched = ACT.reduce((a, x) => a + x.done, 0);
      const kp = [
        ['Sections actives', `${fmt(T.actives)}<span class="muted" style="font-size:14px"> / ${fmt(T.sections)}</span>`, `${T.inactives} inactives > 90 j`, 'down', PS.weekly('s' + T.id, T.actives * 0.9 + 1, 0.12)],
        ['Couverture communale', pct(T.couv), `${Math.round(T.communes * T.couv / 100)} commune${T.communes > 1 ? 's' : ''} sur ${T.communes}`, 'up', PS.weekly('c' + T.id, T.couv * 0.9 + 1, 0.1)],
        ['Membres', fmt(T.membres), '+4,2 % sur 30 j', 'up', PS.weekly('m' + T.id, T.membres * 0.9 + 1, 0.1)],
        ['Cartes 2026', fmt(T.cartes), `${Math.round(T.cartes / Math.max(1, T.objCartes) * 100)} % de l’objectif`, T.cartes / T.objCartes > 0.6 ? 'up' : 'down', PS.weekly('k' + T.id, T.cartes * 0.7 + 1, 0.4)],
        ['Actions (30 j)', fmt(T.actions30), `${ACT.filter(a => a.st === 'En cours').length} en cours`, 'up', PS.weekly('a' + T.id, T.actions30 / 4 + 1, 0.5)],
        ['Score électoral', pct(T.score, 1), `${(T.score - T.scorePrev) >= 0 ? '+' : ''}${(T.score - T.scorePrev).toFixed(1)} pt · participation ${pct(T.participation, 0)}`, T.score >= T.scorePrev ? 'up' : 'down', PS.weekly('e' + T.id, T.score, 0.05)]
      ];
      const lvlName = T.level === 'nat' ? 'région' : T.level === 'reg' ? 'département' : 'commune';
      let chart = '<p class="muted">Indicateurs détaillés sur la carte.</p>';
      if (kids.length) {
        const sorted = [...kids].sort((a, b) => b.couv - a.couv).slice(0, 24);
        const W = 640, rowH = 24, top = 24, lblW = 150, H = top + sorted.length * rowH + 20, x = v => lblW + v / 100 * (W - lblW - 46);
        const bars = sorted.map((u, i) => { const y = top + i * rowH; const c = u.couv >= 60 ? css('--teal') : (u.couv >= 40 ? css('--amber') : css('--coral')); return `<text x="${lblW - 8}" y="${y + 14}" text-anchor="end">${esc(u.n.length > 22 ? u.n.slice(0, 21) + '…' : u.n)}</text><rect x="${lblW}" y="${y + 4}" width="${Math.max(1, x(u.couv) - lblW).toFixed(1)}" height="14" rx="2" fill="${c}"/><text class="val" x="${(x(u.couv) + 6).toFixed(1)}" y="${y + 15}">${u.couv} %</text>` }).join('');
        const grid = [0, 25, 50, 75, 100].map(v => `<line x1="${x(v)}" x2="${x(v)}" y1="${top}" y2="${H - 18}" stroke="${css('--line')}" stroke-dasharray="${v ? '2 3' : ''}"/><text x="${x(v)}" y="${H - 4}" text-anchor="middle">${v} %</text>`).join('');
        const goal = `<line x1="${x(60)}" x2="${x(60)}" y1="${top}" y2="${H - 18}" stroke="${css('--ink')}" stroke-width="1.2"/><text x="${x(60)}" y="${top - 8}" text-anchor="middle" style="font-weight:600">objectif 60 %</text>`;
        chart = `<div class="chartbox"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Couverture communale">${grid}${bars}${goal}</svg></div>${kids.length > 24 ? `<p class="small muted">24 premières ${lvlName}s sur ${kids.length}.</p>` : ''}`;
      }
      const comm = PS.communesOf(T);
      const tc = { bastion: 0, concurrentielle: 0, renforcer: 0, conquerir: 0 }; (kids.length ? kids : [T]).forEach(d => tc[PS.typo(d)]++);
      const pool = T.level === 'nat' ? PS.D.depts : comm;
      const alerts = [];
      pool.filter(PS.surveiller).slice(0, 4).forEach(d => alerts.push(['--coral', `<b>${esc(d.n)}</b> : activité en baisse de ${-d.activityTrend} % et recul électoral de ${(d.scorePrev - d.score).toFixed(1)} pt.`, d.id]));
      pool.filter(d => d.couv < 30 && d.inscrits > 3000).slice(0, 3).forEach(d => alerts.push(['--amber', `<b>${esc(d.n)}</b> : ${d.level === 'com' ? 'aucune section active' : (100 - d.couv) + ' % des communes sans implantation'}.`, d.id]));
      const top5 = [...pool].sort((a, b) => PS.priority(b) - PS.priority(a)).slice(0, 5);
      const units = kids.length ? kids : [T];
      return `
      <div class="view-head"><div><div class="label">Tableau de bord</div><h1>${esc(PS.terrLabel(T))}</h1><p>Synthèse du maillage, des membres, de l’activité terrain et des résultats électoraux (CivicScope) pour le territoire choisi.</p></div>
      <div class="actions">${PS.terrSelect('focusSel', S.focus, true)}<button class="btn" data-view="rapports">Rapport PDF</button>${PS.role.edit !== 'aucun' && PS.canModule('actions') ? '<button class="btn primary" data-new-action>+ Nouvelle action</button>' : ''}</div></div>
      <section class="kpis" aria-label="Indicateurs clés">${kp.map(k => `<div class="kpi"><div class="label">${k[0]}</div><div class="v">${k[1]}</div><div class="d ${k[3]}">${k[2]}</div>${PS.spark(k[4])}</div>`).join('')}</section>
      <div class="grid g-main" style="margin-top:16px">
        <div class="stack">
          <section class="panel"><header><h3>Couverture communale par ${lvlName}</h3><span class="sub">communes disposant d’au moins une section active</span></header><div class="body">${chart}</div></section>
          <section class="panel"><header><h3>Placement des cartes 2026</h3><span class="sub">cartes placées / objectif (0,9 % des inscrits)</span></header>
            <div class="body">${[...units].sort((a, b) => b.cartes / b.objCartes - a.cartes / a.objCartes).slice(0, 16).map(u => { const p = u.cartes / Math.max(1, u.objCartes); return `<div class="progress-row"><span>${esc(u.n)}</span><div class="track"><div class="fill" style="width:${clamp(p * 100 / 1.3, 0, 100)}%;background:${p >= 0.6 ? css('--teal') : css('--amber')}"></div><div class="goal" style="left:${100 / 1.3}%"></div></div><span class="num small" style="text-align:right">${fmt(u.cartes)} · ${Math.round(p * 100)} %</span></div>` }).join('')}
            <p class="small muted" style="margin:8px 0 0">Le trait vertical marque l’objectif. En orange : retard de plus de 40 %.</p></div></section>
        </div>
        <div class="stack">
          <section class="panel"><header><h3>Typologie des ${kids.length ? lvlName + 's' : 'territoires'}</h3><span class="right"><button class="btn sm" data-goto="${T.id === 'nat' ? 'nat' : T.id}">Voir la carte</button></span></header>
            <div class="body"><div class="typo-strip">${Object.keys(tc).map(k => `<span style="width:${tc[k] / units.length * 100}%;background:${css(TYPO[k].c)}" title="${TYPO[k].l}"></span>`).join('')}</div>
            <div class="legend">${Object.keys(tc).map(k => `<div class="li"><span class="sw" style="background:${css(TYPO[k].c)}"></span><span style="flex:1">${TYPO[k].l} <span class="muted">· ${TYPO[k].d}</span></span><b class="num">${tc[k]}</b></div>`).join('')}</div></div></section>
          <section class="panel"><header><h3>Alertes</h3><span class="sub">${alerts.length} à traiter</span></header>
            <div class="body" style="padding-block:4px">${alerts.length ? alerts.slice(0, 6).map(a => `<div class="alert"><span class="sev" style="background:${css(a[0])}"></span><div style="flex:1">${a[1]}</div><a href="#carte" class="small" data-goto="${a[2]}">Voir</a></div>`).join('') : '<p class="muted">Aucune alerte sur ce territoire.</p>'}</div></section>
          <section class="panel"><header><h3>Priorités du moment</h3><span class="right"><button class="btn sm" data-view="priorites">Ajuster</button></span></header>
            <div class="body" style="padding-block:6px"><table class="tbl"><tbody>${top5.map((d, i) => `<tr class="click" data-goto="${d.id}"><td class="rank">${i + 1}</td><td>${esc(d.n)}<div class="small muted">${esc(d.level === 'com' ? d.dep : d.r)}</div></td><td>${PS.typoChip(PS.typo(d))}</td><td class="n"><b>${PS.priority(d)}</b></td></tr>`).join('')}</tbody></table></div></section>
        </div>
      </div>`;
    },
    bind() { $('#focusSel').addEventListener('change', e => { S.focus = e.target.value; render() }) }
  };

  /* =========================================================
     PRIORISATION
     ========================================================= */
  /* Stratégies de pondération prêtes à l'emploi (ordre des critères : poids, marge, particip, deficit, activite, access) */
  const STRATS = {
    equilibree: { l: 'Équilibrée', d: 'Réglage de référence : tous les critères comptent.', w: { poids: 3, marge: 2, particip: 2, deficit: 3, activite: 1, access: 1 } },
    conquete: { l: 'Conquête électorale', d: 'Gros électorats où notre score peut progresser.', w: { poids: 4, marge: 4, particip: 3, deficit: 1, activite: 0, access: 1 } },
    implantation: { l: 'Implantation', d: 'Zones blanches : communes sans section à couvrir en priorité.', w: { poids: 2, marge: 1, particip: 1, deficit: 5, activite: 0, access: 2 } },
    relance: { l: 'Relance du réseau', d: 'Sections qui s’essoufflent, avant que cela se voie dans les urnes.', w: { poids: 2, marge: 1, particip: 0, deficit: 1, activite: 5, access: 1 } },
    mobilisation: { l: 'Mobilisation avant scrutin', d: 'Toucher vite beaucoup d’électeurs mobilisables et accessibles.', w: { poids: 5, marge: 2, particip: 4, deficit: 0, activite: 1, access: 3 } }
  };
  PS.STRATS = STRATS;
  PS.priorityW = (u, W) => { let s = 0, t = 0; for (const c of COMPONENTS) { const wi = +W[c.k] || 0; s += wi * c.f(u); t += wi } return t ? Math.round(s / t * 100) : 0 };
  const sameW = (a, b) => COMPONENTS.every(c => (+a[c.k] || 0) === (+b[c.k] || 0));
  const SKEY_STRAT = 'poliscope-strategies-v1';
  let myStrats = []; try { myStrats = JSON.parse(localStorage.getItem(SKEY_STRAT) || '[]') || [] } catch (e) { myStrats = [] }
  const saveStrats = () => { try { localStorage.setItem(SKEY_STRAT, JSON.stringify(myStrats)) } catch (e) { } };
  function currentStrat() { for (const [k, s] of Object.entries(STRATS)) if (sameW(S.weights, s.w)) return { k, l: s.l }; const m = myStrats.find(s => sameW(S.weights, s.w)); return m ? { k: 'my:' + m.l, l: m.l } : { k: 'perso', l: 'Personnalisée' } }
  const TOPN = () => S.prioLevel === 'com' ? 15 : 10;
  VIEWS.priorites = {
    html() {
      const T = PS.unit(S.focus), cs = currentStrat();
      return `<div class="view-head"><div><div class="label">Priorisation · ${esc(PS.terrLabel(T))}</div><h1>Où concentrer nos efforts ?</h1><p>Choisissez une stratégie ou réglez le poids des six critères. Le classement, les territoires mis en évidence sur la matrice et la carte « Score de priorité » se mettent à jour.</p></div>
      <div class="actions">${PS.terrSelect('focusSel', S.focus, false)}<div class="seg" id="plvl" style="min-width:220px">${[['dep', 'Départements'], ['com', 'Communes']].map(([k, l]) => `<button data-l="${k}" aria-pressed="${S.prioLevel === k}">${l}</button>`).join('')}</div><button class="btn primary" id="toMap">Voir sur la carte</button></div></div>
      <div class="grid" style="grid-template-columns:minmax(0,290px) minmax(0,1fr);align-items:start" id="prioGrid">
        <div class="stack">
          <section class="panel"><header><h3>Stratégie</h3><span class="right chip s-neutral" id="stratNow">${esc(cs.l)}</span></header><div class="body" style="display:grid;gap:6px">
            ${Object.entries(STRATS).map(([k, s]) => `<button type="button" class="strat" data-strat="${k}" aria-pressed="${cs.k === k}"><b>${s.l}</b><span class="small muted">${s.d}</span></button>`).join('')}
            ${myStrats.length ? `<div class="label" style="margin-top:6px">Mes stratégies</div>` + myStrats.map((s, i) => `<div class="row" style="gap:6px;flex-wrap:nowrap"><button type="button" class="strat" style="flex:1" data-mystrat="${i}" aria-pressed="${cs.k === 'my:' + s.l}"><b>${esc(s.l)}</b></button><button type="button" class="btn sm ghost" data-delstrat="${i}" aria-label="Supprimer la stratégie ${esc(s.l)}">×</button></div>`).join('') : ''}
            <button type="button" class="btn sm" id="saveStrat" style="justify-self:start;margin-top:4px" ${cs.k === 'perso' ? '' : 'disabled title="Modifiez les poids pour créer une stratégie"'}>Enregistrer ces poids…</button>
          </div></section>
          <section class="panel"><header><h3>Pondération</h3></header><div class="body weights">
            ${COMPONENTS.map(c => `<div class="w-row"><label for="w-${c.k}">${c.l}</label><output id="o-${c.k}">${S.weights[c.k]}</output><input type="range" min="0" max="5" step="1" id="w-${c.k}" data-w="${c.k}" value="${S.weights[c.k]}"><div class="hint">${c.h}</div></div>`).join('')}
            <button class="linkbtn" data-info="priorite">Comment le score est-il calculé ?</button>
          </div></section>
        </div>
        <div class="stack">
          <section class="panel"><header><h3>Matrice score × couverture</h3><span class="sub">taille = inscrits · cliquez pour ouvrir la fiche</span></header><div class="body scatter"><div id="scatter"></div>
            <p class="small muted" style="margin:8px 0 0">${S.prioLevel === 'com' ? 'À l’échelle communale, la couverture vaut 0 % (aucune section active) ou 100 % : les communes forment deux colonnes. ' : ''}La position d’un territoire dépend de son score électoral et de sa couverture, pas des poids. Les <b>${TOPN()} territoires les plus prioritaires</b> selon la stratégie choisie sont cerclés et numérotés ; les autres sont estompés.</p></div></section>
          <section class="panel"><header><h3>Classement</h3><span class="sub" id="rankSub"></span></header><div class="tbl-wrap" id="rankTbl" style="max-height:70vh;overflow:auto"></div></section>
        </div>
      </div>`;
    },
    bind() {
      const refresh = () => { const cs = currentStrat(); $('#stratNow').textContent = cs.l; $$('[data-strat]').forEach(b => b.setAttribute('aria-pressed', b.dataset.strat === cs.k)); $$('[data-mystrat]').forEach(b => b.setAttribute('aria-pressed', 'my:' + myStrats[+b.dataset.mystrat].l === cs.k)); const sv = $('#saveStrat'); sv.disabled = cs.k !== 'perso'; drawRank() };
      const apply = w => { S.weights = { ...w }; COMPONENTS.forEach(c => { $('#w-' + c.k).value = S.weights[c.k]; $('#o-' + c.k).textContent = S.weights[c.k] }); PS.persist(); refresh() };
      $$('[data-w]').forEach(r => r.addEventListener('input', () => { S.weights[r.dataset.w] = +r.value; $('#o-' + r.dataset.w).textContent = r.value; PS.persist(); refresh() }));
      $$('[data-strat]').forEach(b => b.addEventListener('click', () => apply(STRATS[b.dataset.strat].w)));
      $$('[data-mystrat]').forEach(b => b.addEventListener('click', () => apply(myStrats[+b.dataset.mystrat].w)));
      $$('[data-delstrat]').forEach(b => b.addEventListener('click', () => { const s = myStrats.splice(+b.dataset.delstrat, 1)[0]; saveStrats(); render(); PS.toast(`Stratégie « ${s.l} » supprimée.`) }));
      $('#saveStrat').addEventListener('click', () => {
        const m = PS.modal('Enregistrer la stratégie', `<div class="field"><label for="st-n">Nom de la stratégie</label><input id="st-n" placeholder="ex. Législatives — Thiès"></div><p class="small muted" style="margin:0">Poids : ${COMPONENTS.map(c => `${c.l} ${S.weights[c.k]}`).join(' · ')}.<br>Dans la démonstration, la stratégie est enregistrée dans ce navigateur. En production, l’administrateur peut la partager avec les coordinations.</p>`, '<button class="btn" data-close>Annuler</button><button class="btn primary" id="st-ok">Enregistrer</button>');
        $('#st-ok', m).addEventListener('click', () => { const n = $('#st-n', m).value.trim(); if (!n) { PS.toast('Donnez un nom à la stratégie.'); return } if (Object.values(STRATS).some(s => s.l.toLowerCase() === n.toLowerCase()) || myStrats.some(s => s.l.toLowerCase() === n.toLowerCase())) { PS.toast('Ce nom est déjà utilisé.'); return } myStrats.push({ l: n, w: { ...S.weights } }); saveStrats(); PS.log(`a enregistré la stratégie de priorisation « ${n} »`); PS.closeModal(); render(); PS.toast(`Stratégie « ${n} » enregistrée.`) });
      });
      $('#toMap').addEventListener('click', () => { S.map.ind = 'priorite'; S.map.level = S.prioLevel; S.map.sel = null; go('carte') });
      $('#focusSel').addEventListener('change', e => { S.focus = e.target.value; render() });
      $('#plvl').addEventListener('click', e => { const b = e.target.closest('[data-l]'); if (b) { S.prioLevel = b.dataset.l; render() } });
      if (window.innerWidth < 900) $('#prioGrid').style.gridTemplateColumns = 'minmax(0,1fr)';
      drawRank();
    }
  };
  function prioUnits() { const T = PS.unit(S.focus); if (S.prioLevel === 'com') return PS.communesOf(T); if (T.level === 'nat') return PS.D.depts; if (T.level === 'reg') return T.children; if (T.level === 'dep') return [T]; return [PS.D.byId[T.parent]] }
  function drawScatter(rankOf) {
    const ds = prioUnits(), W = 640, H = 360, m = { l: 44, r: 14, t: 14, b: 36 }, N = TOPN();
    const x = v => m.l + v / 100 * (W - m.l - m.r), y = v => H - m.b - (Math.min(v, 62) / 62) * (H - m.t - m.b);
    const mi = Math.max(...ds.map(d => d.inscrits)); const rr = d => (ds.length > 80 ? 3 : 4) + Math.sqrt(d.inscrits / mi) * (ds.length > 80 ? 8 : 14);
    const jit = d => S.prioLevel === 'com' ? (d.couv > 0 ? -1 : 1) * (PS.D.hash(d.id) % 1000) / 1000 * 14 : 0;
    const top = d => rankOf[d.id] <= N && ds.length > N;
    const q = `<rect x="${x(50)}" y="${y(62)}" width="${x(100) - x(50)}" height="${y(38) - y(62)}" fill="${css('--teal')}" fill-opacity=".07"/><rect x="${x(0)}" y="${y(62)}" width="${x(50) - x(0)}" height="${y(30) - y(62)}" fill="${css('--amber')}" fill-opacity=".08"/><rect x="${x(0)}" y="${y(28)}" width="${x(100) - x(0)}" height="${y(0) - y(28)}" fill="${css('--peri')}" fill-opacity=".06"/>`;
    const ax = [0, 25, 50, 75, 100].map(v => `<line x1="${x(v)}" x2="${x(v)}" y1="${m.t}" y2="${H - m.b}" stroke="${css('--line')}"/><text x="${x(v)}" y="${H - m.b + 16}" text-anchor="middle">${v} %</text>`).join('') + [0, 10, 20, 30, 40, 50, 60].map(v => `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="${css('--line')}"/><text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('');
    const lbl = `<text class="qlbl" x="${x(98)}" y="${y(58)}" text-anchor="end" style="fill:${css('--teal')}">Bastions</text><text class="qlbl" x="${x(2)}" y="${y(58)}" style="fill:${css('--amber')}">À renforcer</text><text class="qlbl" x="${x(98)}" y="${y(3)}" text-anchor="end" style="fill:${css('--peri')}">À conquérir</text><text x="${(m.l + W - m.r) / 2}" y="${H - 4}" text-anchor="middle">Couverture communale →</text><text transform="translate(12 ${(m.t + H - m.b) / 2}) rotate(-90)" text-anchor="middle">Score électoral (%) →</text>`;
    const hl = ds.length > N;
    const order = [...ds].sort((a, b) => (top(a) - top(b)) || (b.inscrits - a.inscrits));
    const dots = order.map(d => { const t = top(d), cx = x(d.couv) + jit(d), cy = y(d.score), r = rr(d); return `<g data-goto="${d.id}" style="cursor:pointer"><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(t ? Math.max(r, 9) : r).toFixed(1)}" fill="${css(TYPO[PS.typo(d)].c)}" fill-opacity="${hl && !t ? 0.22 : 0.85}" stroke="${t ? css('--ink') : (PS.surveiller(d) ? css('--coral') : css('--surface'))}" stroke-width="${t ? 2 : (PS.surveiller(d) ? 2 : 1)}"><title>${esc(d.n)} — priorité ${PS.priority(d)}/100 (rang ${rankOf[d.id]}), score ${d.score} %, couverture ${d.couv} %</title></circle>${t ? `<text class="rk" x="${cx.toFixed(1)}" y="${(cy + 3.6).toFixed(1)}" text-anchor="middle">${rankOf[d.id]}</text>` : ''}</g>` }).join('');
    const named = hl ? ds.filter(top).filter(d => S.prioLevel !== 'com' || rankOf[d.id] <= 5) : [...ds].sort((a, b) => b.inscrits - a.inscrits).slice(0, 12);
    const names = named.map(d => `<text class="nm" x="${x(d.couv) + jit(d) + Math.max(rr(d), 9) + 3}" y="${y(d.score) + 4}">${esc(d.n)}</text>`).join('');
    $('#scatter').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Matrice score électoral et couverture">${q}${ax}${lbl}${dots}${names}</svg>`;
  }
  function drawRank() {
    const base = prioUnits(), ref = STRATS.equilibree.w;
    const ds = base.map(d => ({ d, p: PS.priority(d) })).sort((a, b) => b.p - a.p);
    const refRank = Object.fromEntries(base.map(d => ({ d, p: PS.priorityW(d, ref) })).sort((a, b) => b.p - a.p).map((o, i) => [o.d.id, i + 1]));
    const rankOf = Object.fromEntries(ds.map((o, i) => [o.d.id, i + 1]));
    const isRef = sameW(S.weights, ref);
    $('#rankSub').textContent = `${ds.length} ${S.prioLevel === 'com' ? 'communes' : 'départements'}${isRef ? '' : ' · évolution par rapport à la stratégie Équilibrée'}`;
    const mv = d => { if (isRef) return ''; const v = refRank[d.id] - rankOf[d.id]; return v > 0 ? `<span class="mv up" title="Gagne ${v} place${v > 1 ? 's' : ''}">▲ ${v}</span>` : v < 0 ? `<span class="mv down" title="Perd ${-v} place${v < -1 ? 's' : ''}">▼ ${-v}</span>` : '<span class="mv">=</span>' };
    $('#rankTbl').innerHTML = `<table class="tbl"><thead><tr><th>#</th>${isRef ? '' : '<th>Évol.</th>'}<th>Territoire</th><th>Typologie</th><th class="n">Score</th><th class="n">Rang</th><th class="n">Couv.</th><th class="n">Inscrits</th><th>Priorité</th><th>Scénario recommandé</th></tr></thead><tbody>
    ${ds.slice(0, 150).map(({ d, p }, i) => `<tr class="click ${i < TOPN() && ds.length > TOPN() ? 'toprow' : ''}" data-goto="${d.id}"><td class="rank">${i + 1}</td>${isRef ? '' : `<td>${mv(d)}</td>`}<td><b>${esc(d.n)}</b><div class="small muted">${esc(d.level === 'com' ? d.dep + ' · ' + d.r : d.r)}</div></td><td>${PS.typoChip(PS.typo(d))}${PS.surveiller(d) ? ' ' + PS.survChip : ''}</td><td class="n">${d.score.toLocaleString('fr-FR')} %</td><td class="n">${PS.RANG[d.rang].l}</td><td class="n">${d.couv} %</td><td class="n">${fmt(d.inscrits)}</td><td><div class="bar-cell"><div class="track"><div class="fill ${p >= 60 ? 'amber' : ''}" style="width:${p}%"></div></div><b class="num">${p}</b></div></td><td class="small">${esc((PS.recos(d)[0] || ['', '—'])[1])}</td></tr>`).join('')}</tbody></table>`;
    drawScatter(rankOf);
  }
  PS.indicatorInfo = function (k) {
    const I = PS.INDICATORS[k];
    PS.modal(I.l, `<p style="margin:0">${esc(I.desc)}</p><div><div class="label">Calcul</div><p style="margin:4px 0 0">${esc(I.calcul)}</p></div><div><div class="label">Source</div><p style="margin:4px 0 0">${esc(I.source)}</p></div><div><div class="label">À quoi ça sert</div><p style="margin:4px 0 0">${esc(I.usage)}</p></div>`, '<button class="btn primary" data-close>Compris</button>');
  };
  document.addEventListener('click', e => { const b = e.target.closest('[data-info]'); if (b) PS.indicatorInfo(b.dataset.info) });

  /* =========================================================
     MAILLAGE
     ========================================================= */
  const ST = { 'Active': 's-ok', 'À relancer': 's-warn', 'Inactive': 's-bad' };
  VIEWS.maillage = {
    html() {
      const F = S.secFilter;
      const canAny = PS.role.edit !== 'aucun';
      return `<div class="view-head"><div><div class="label">Maillage</div><h1>Sections et antennes</h1><p>Annuaire des structures du parti sur tout le Sénégal. Vous pouvez modifier les fiches de : <b>${esc(editScopeText())}</b>.</p></div>
      <div class="actions">${canAny ? '<button class="btn" id="newSec">+ Proposer une antenne</button>' : ''}<button class="btn" data-view="carte">Voir sur la carte</button></div></div>
      <div class="grid g-3" style="margin-bottom:16px" id="secStats"></div>
      <section class="panel"><header><div class="filters">
        <input type="search" id="sf-q" placeholder="Section, commune, responsable…" value="${esc(F.q)}" aria-label="Rechercher">
        <select id="sf-reg" aria-label="Région"><option value="">Toutes les régions</option>${PS.D.regions.map(r => `<option ${F.reg === r.n ? 'selected' : ''}>${esc(r.n)}</option>`).join('')}</select>
        <select id="sf-st" aria-label="Statut"><option value="">Tous les statuts</option>${['Active', 'À relancer', 'Inactive'].map(s => `<option ${F.st === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
        ${canAny && PS.role.edit !== 'national' ? `<label class="small row" style="gap:6px"><input type="checkbox" id="sf-mine" ${F.mine ? 'checked' : ''}> Mon périmètre uniquement</label>` : ''}
      </div><span class="right sub" id="secCount"></span></header><div class="tbl-wrap" style="max-height:62vh;overflow:auto" id="secTbl"></div></section>`;
    },
    bind() {
      const draw = () => {
        const F = S.secFilter, q = F.q.toLowerCase();
        const base = PS.D.sections.filter(s => !F.mine || PS.canEdit(s));
        const rows = base.filter(s => (!F.reg || s.r === F.reg) && (!F.st || s.statut === F.st) && (!q || (s.name + ' ' + s.resp + ' ' + s.communeName + ' ' + s.dep).toLowerCase().includes(q)));
        const c = k => base.filter(s => s.statut === k).length;
        $('#secStats').innerHTML = [['Active', 'Activité dans les 30 derniers jours'], ['À relancer', 'Dernière activité entre 30 et 90 jours'], ['Inactive', 'Aucune activité depuis plus de 90 jours']].map(([k, h]) => `<section class="panel"><div class="body"><span class="chip ${ST[k]}">${k}</span><div class="num" style="font-size:28px;font-weight:600;margin-top:6px">${c(k)}</div><div class="small muted">${h}</div></div></section>`).join('');
        $('#secCount').textContent = `${rows.length} / ${base.length} structures`;
        $('#secTbl').innerHTML = `<table class="tbl"><thead><tr><th>Structure</th><th>Commune</th><th>Département</th><th>Responsable</th><th class="n">Membres</th><th class="n">Cartes</th><th>Activité</th><th>Statut</th><th></th></tr></thead><tbody>${rows.slice(0, 400).map(s => { const ed = PS.canEdit(s); return `<tr class="click" data-sec="${s.id}"><td><b>Section ${esc(s.name)}</b><div class="small muted">${esc(s.level)}</div></td><td>${esc(s.communeName)}</td><td>${esc(s.dep)}</td><td>${esc(s.resp)}${ed && PS.role.pii ? `<div class="small muted mono">${esc(s.tel)}</div>` : ''}</td><td class="n">${fmt(s.membres)}</td><td class="n">${fmt(s.cartes)}</td><td class="small">${ago(s.last)}</td><td><span class="chip ${ST[s.statut]}">${s.statut}</span></td><td>${ed ? `<button class="btn sm" data-edit-sec="${s.id}">Modifier</button>` : '<span class="small muted" title="Hors de votre périmètre de modification">Lecture</span>'}</td></tr>` }).join('')}</tbody></table>`;
        $$('#secTbl [data-sec]').forEach(r => r.addEventListener('click', e => { if (e.target.closest('[data-edit-sec]')) return; go('carte', { sel: { t: 'sec', id: r.dataset.sec } }) }));
        $$('#secTbl [data-edit-sec]').forEach(b => b.addEventListener('click', () => PS.editSection(b.dataset.editSec, draw)));
      };
      [['sf-q', 'q', 'input'], ['sf-reg', 'reg', 'change'], ['sf-st', 'st', 'change']].forEach(([id, k, ev]) => { const el = $('#' + id); if (el) el.addEventListener(ev, () => { S.secFilter[k] = el.value; draw() }) });
      const mine = $('#sf-mine'); if (mine) mine.addEventListener('change', () => { S.secFilter.mine = mine.checked; draw() });
      const ns = $('#newSec'); if (ns) ns.addEventListener('click', proposeSection);
      draw();
    }
  };
  function editableDepts() { return PS.D.depts.filter(d => PS.canEdit(d)) }
  function proposeSection() {
    const ds = editableDepts(); if (!ds.length) { PS.toast('Votre profil ne permet pas de créer une antenne.'); return }
    const m = PS.modal('Proposer une nouvelle antenne', `<div class="grid g-2"><div class="field"><label for="ns-c">Commune</label><select id="ns-c">${ds.map(d => `<optgroup label="${esc(d.n)}">${d.children.map(c => `<option value="${c.id}">${esc(c.n)}</option>`).join('')}</optgroup>`).join('')}</select></div><div class="field"><label for="ns-l">Niveau</label><select id="ns-l"><option>Section communale</option><option>Sous-section de quartier</option><option>Antenne villageoise</option></select></div></div>
      <div class="field"><label for="ns-n">Quartier / village</label><input id="ns-n" placeholder="Nom du quartier ou du village"></div><div class="field"><label for="ns-r">Responsable pressenti</label><input id="ns-r" placeholder="Prénom Nom"></div>
      <p class="notice">La position GPS sera relevée sur le terrain avec QField ou KoboToolbox. La proposition est validée par la coordination départementale puis inscrite au journal.</p>`, `<button class="btn" data-close>Annuler</button><button class="btn primary" id="ns-ok">Envoyer pour validation</button>`);
    $('#ns-ok', m).addEventListener('click', () => { const n = $('#ns-n', m).value.trim(); if (!n) { $('#ns-n', m).focus(); PS.toast('Indiquez le quartier ou le village de la future antenne.'); return } const c = PS.D.byId[$('#ns-c', m).value]; PS.closeModal(); PS.log(`a proposé l’antenne « ${n} » (${c.n})`); PS.toast(`Antenne « ${n} » (${c.n}) envoyée pour validation.`) });
  }
  PS.editSection = function (id, after) {
    const s = PS.D.sections.find(x => x.id === id);
    if (!PS.canEdit(s)) { PS.toast(`Modification refusée : la section ${s.name} est hors de votre périmètre (${editScopeText()}).`); return }
    const m = PS.modal(`Modifier la section ${s.name}`, `<div class="grid g-2"><div class="field"><label for="es-r">Responsable</label><input id="es-r" value="${esc(s.resp)}"></div><div class="field"><label for="es-s">Statut</label><select id="es-s">${['Active', 'À relancer', 'Inactive'].map(x => `<option ${x === s.statut ? 'selected' : ''}>${x}</option>`).join('')}</select></div><div class="field"><label for="es-m">Membres</label><input id="es-m" type="number" min="0" value="${s.membres}"></div><div class="field"><label for="es-c">Cartes 2026</label><input id="es-c" type="number" min="0" value="${s.cartes}"></div></div><p class="notice">Chaque modification est horodatée et inscrite au journal (qui, quoi, quand).</p>`, `<button class="btn" data-close>Annuler</button><button class="btn primary" id="es-ok">Enregistrer</button>`);
    $('#es-ok', m).addEventListener('click', () => { s.resp = $('#es-r', m).value.trim() || s.resp; s.statut = $('#es-s', m).value; s.membres = +$('#es-m', m).value || 0; s.cartes = +$('#es-c', m).value || 0; s.last = s.statut === 'Active' ? 0 : s.last; extra.edits[s.id] = { resp: s.resp, statut: s.statut, membres: s.membres, cartes: s.cartes, last: s.last }; PS.log(`a modifié la fiche de la section ${s.name}`); PS.closeModal(); PS.toast(`Section ${s.name} mise à jour.`); after && after() });
  };

  /* =========================================================
     CONTACTS
     ========================================================= */
  VIEWS.contacts = {
    html() {
      const F = S.ctFilter;
      return `<div class="view-head"><div><div class="label">CRM organisationnel</div><h1>Contacts et membres</h1><p>Militants, sympathisants et bénévoles rattachés à leur section. Données nominatives visibles uniquement pour : <b>${esc(editScopeText())}</b>. Seuls les contacts consentants peuvent recevoir des messages.</p></div>
      <div class="actions"><button class="btn primary" id="addCt">+ Ajouter un contact</button></div></div>
      <div class="grid g-3" id="ctStats" style="margin-bottom:16px"></div>
      <section class="panel"><header><div class="filters">
        <input type="search" id="cf-q" placeholder="Nom, commune, section, étiquette…" value="${esc(F.q)}" aria-label="Rechercher un contact">
        <select id="cf-role" aria-label="Statut"><option value="">Tous les statuts</option>${['Militant', 'Sympathisant', 'Responsable de section', 'Bénévole'].map(s => `<option ${F.role === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
        <select id="cf-cons" aria-label="Consentement"><option value="">Consentement : tous</option>${['Oui', 'Non', 'À renouveler'].map(s => `<option ${F.cons === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
      </div><span class="right sub" id="ctCount"></span></header><div class="tbl-wrap" id="ctTbl"></div></section>`;
    },
    bind() {
      const draw = () => {
        const F = S.ctFilter, q = F.q.toLowerCase();
        const all = PS.CONTACTS().filter(PS.canSeePII);
        const rows = all.filter(c => (!F.role || c.role === F.role) && (!F.cons || c.consent === F.cons) && (!q || (c.prenom + ' ' + c.nom + ' ' + c.commune + ' ' + c.section + ' ' + c.tags.join(' ')).toLowerCase().includes(q)));
        const cons = all.filter(c => c.consent === 'Oui').length;
        $('#ctStats').innerHTML = `<section class="panel"><div class="body"><div class="label">Contacts visibles</div><div class="num" style="font-size:28px;font-weight:600">${fmt(all.length)}</div><div class="small muted">${esc(editScopeText())}</div></div></section>
          <section class="panel"><div class="body"><div class="label">Consentement recueilli</div><div class="num" style="font-size:28px;font-weight:600">${all.length ? Math.round(cons / all.length * 100) : 0} %</div><div class="small muted">${all.filter(c => c.consent === 'À renouveler').length} à renouveler</div></div></section>
          <section class="panel"><div class="body"><div class="label">Carte 2026</div><div class="num" style="font-size:28px;font-weight:600">${all.filter(c => c.carte === '2026').length}</div><div class="small muted">${all.filter(c => c.carte === '2025').length} cartes 2025 à renouveler</div></div></section>`;
        $('#ctCount').textContent = `${rows.length} contact${rows.length > 1 ? 's' : ''}`;
        const cc = { 'Oui': 's-ok', 'Non': 's-bad', 'À renouveler': 's-warn' };
        $('#ctTbl').innerHTML = rows.length ? `<table class="tbl"><thead><tr><th>Nom</th><th>Statut</th><th>Commune · section</th><th>Étiquettes</th><th>Carte</th><th>Source</th><th>Dernier contact</th><th>Consentement</th></tr></thead><tbody>${rows.map(c => `<tr class="click" data-ct="${c.id}"><td><b>${esc(c.prenom)} ${esc(c.nom)}</b><div class="small muted mono">${esc(c.tel)}</div></td><td class="small">${esc(c.role)}</td><td class="small">${esc(c.commune)}<div class="muted">${esc(c.dep)}</div></td><td>${c.tags.map(t => `<span class="chip s-neutral" style="margin:1px">${esc(t)}</span>`).join('')}</td><td class="mono small">${c.carte}</td><td class="small">${esc(c.source)}</td><td class="small">${ago(c.last)}</td><td><span class="chip ${cc[c.consent]}">${c.consent}</span></td></tr>`).join('')}</tbody></table>` : `<p class="body muted">Aucun contact ne correspond à ces filtres.</p>`;
        $$('#ctTbl [data-ct]').forEach(r => r.addEventListener('click', () => contactCard(PS.CONTACTS().find(c => c.id === r.dataset.ct))));
      };
      [['cf-q', 'q', 'input'], ['cf-role', 'role', 'change'], ['cf-cons', 'cons', 'change']].forEach(([id, k, ev]) => { const el = $('#' + id); el.addEventListener(ev, () => { S.ctFilter[k] = el.value; draw() }) });
      $('#addCt').addEventListener('click', () => {
        const ds = editableDepts();
        const m = PS.modal('Ajouter un contact', `<div class="grid g-2"><div class="field"><label for="nc-p">Prénom</label><input id="nc-p"></div><div class="field"><label for="nc-n">Nom</label><input id="nc-n"></div>
          <div class="field"><label for="nc-c">Commune</label><select id="nc-c">${ds.map(d => `<optgroup label="${esc(d.n)}">${d.children.map(c => `<option value="${c.id}">${esc(c.n)}</option>`).join('')}</optgroup>`).join('')}</select></div><div class="field"><label for="nc-r">Statut</label><select id="nc-r"><option>Sympathisant</option><option>Militant</option><option>Bénévole</option></select></div>
          <div class="field"><label for="nc-t">Téléphone</label><input id="nc-t" inputmode="tel" placeholder="77 000 00 00"></div><div class="field"><label for="nc-g">Étiquette</label><select id="nc-g">${PS.D.TAGS.map(t => `<option>${t}</option>`).join('')}</select></div></div>
          <label style="display:flex;gap:8px;align-items:flex-start;font-size:13.5px"><input type="checkbox" id="nc-ok-c" style="margin-top:3px"> La personne accepte que ses données soient enregistrées par le parti et qu’elle soit recontactée (SMS, WhatsApp, appel). Finalité et durée de conservation lui ont été indiquées.</label>`,
          `<button class="btn" data-close>Annuler</button><button class="btn primary" id="nc-ok">Enregistrer le contact</button>`);
        $('#nc-ok', m).addEventListener('click', () => {
          const p = $('#nc-p', m).value.trim(), n = $('#nc-n', m).value.trim();
          if (!p || !n) { PS.toast('Renseignez le prénom et le nom.'); return }
          if (!$('#nc-ok-c', m).checked) { PS.toast('Cochez le consentement : sans accord explicite, le contact ne peut pas être enregistré.'); return }
          const c = PS.D.byId[$('#nc-c', m).value], tel = $('#nc-t', m).value.replace(/\D/g, '');
          extra.contacts.unshift({ id: 'cx' + Date.now(), prenom: p, nom: n, role: $('#nc-r', m).value, tags: [$('#nc-g', m).value], dep: c.dep, r: c.r, commune: c.n, section: c.n, tel: tel.length >= 4 ? `${tel.slice(0, 2)} ••• •• ${tel.slice(-2)}` : '—', consent: 'Oui', carte: '—', source: 'Saisie manuelle', last: 0, engagement: 20 });
          PS.log(`a ajouté le contact ${p} ${n} (${c.n})`); PS.persist(); PS.closeModal(); PS.toast(`${p} ${n} ajouté·e avec consentement.`); draw();
        });
      });
      draw();
    }
  };
  function contactCard(c) {
    const hist = [[c.last, `${c.source} — échange avec la section ${c.section}`], [c.last + 14, 'Inscription à la liste WhatsApp de la section'], [c.last + 41, 'Participation à une réunion de quartier']];
    PS.modal(`${c.prenom} ${c.nom}`, `<div class="row"><span class="chip s-neutral">${esc(c.role)}</span>${c.tags.map(t => `<span class="chip s-neutral">${esc(t)}</span>`).join('')}<span class="chip ${c.consent === 'Oui' ? 's-ok' : (c.consent === 'Non' ? 's-bad' : 's-warn')}">Consentement : ${c.consent}</span></div>
     <div class="kv"><div><div class="k">Commune · section</div><div class="v" style="font-size:14px">${esc(c.commune)} · ${esc(c.section)}</div></div><div><div class="k">Téléphone</div><div class="v mono" style="font-size:14px">${esc(c.tel)}</div></div><div><div class="k">Carte</div><div class="v" style="font-size:14px">${c.carte}</div></div><div><div class="k">Engagement</div><div class="v" style="font-size:14px">${c.engagement}/100</div></div></div>
     <div><div class="label" style="margin-bottom:6px">Historique</div><div class="feed">${hist.map(h => `<div class="it"><span class="t">${dayFmt(-h[0])}</span><span>${esc(h[1])}</span></div>`).join('')}</div></div>
     <p class="notice">Données minimisées : aucune opinion, appartenance ethnique ou religieuse n’est enregistrée.</p>`,
      `<button class="btn" data-close>Fermer</button><button class="btn primary" data-close data-new-action data-dep="${esc(c.dep)}" data-type="Phoning">Planifier un rappel</button>`);
  }

  /* =========================================================
     ACTIONS TERRAIN
     ========================================================= */
  const COLS = ['À planifier', 'Planifiée', 'En cours', 'Terminée'];
  const pctOf = a => a.obj ? Math.round(a.done / a.obj * 100) : 0;
  PS.saveActState = a => { if (!String(a.id).startsWith('ax')) extra.actState[a.id] = { st: a.st, done: a.done, end: a.end, date: a.date, bilan: a.bilan || null }; PS.persist() };
  PS.histOf = u => PS.ACTIONS().filter(a => a.st === 'Terminée' && PS.inUnit(a, u)).sort((x, y) => y.end - x.end);
  VIEWS.actions = {
    html() {
      const canAny = PS.role.edit !== 'aucun', tab = S.actTab || 'suivi';
      return `<div class="view-head"><div><div class="label">Actions terrain</div><h1>Organiser et suivre les actions</h1><p>Porte-à-porte, phoning, caravanes, réunions et placement de cartes. Vous pouvez créer, faire avancer et clôturer les actions de : <b>${esc(editScopeText())}</b>.</p></div>
      <div class="actions">${canAny ? '<button class="btn primary" data-new-action>+ Nouvelle action</button>' : ''}</div></div>
      <div class="tabs" role="tablist"><button role="tab" data-atab2="suivi" aria-selected="${tab === 'suivi'}">Suivi en cours</button><button role="tab" data-atab2="historique" aria-selected="${tab === 'historique'}">Historique et bilans</button></div>
      ${tab === 'suivi' ? `<div class="filters" style="margin-bottom:12px">${PS.role.edit !== 'national' ? `<div class="seg" id="amine" style="min-width:250px"><button data-m="1" aria-pressed="${S.actMine}">Mon périmètre</button><button data-m="0" aria-pressed="${!S.actMine}">Tout le Sénégal</button></div>` : ''}<select id="afType" class="terr-sel" aria-label="Type d’action"><option value="">Tous les types</option>${Object.keys(PS.D.TYPES).map(t => `<option>${t}</option>`).join('')}</select></div><div class="kanban" id="kanban"></div>` : histHTML()}`;
    },
    bind() {
      $$('[data-atab2]').forEach(b => b.addEventListener('click', () => { S.actTab = b.dataset.atab2; render() }));
      if ((S.actTab || 'suivi') === 'historique') { bindHist(); return }
      const draw = () => {
        const ty = $('#afType').value;
        const A = PS.ACTIONS().filter(a => (!S.actMine || PS.canEdit(a)) && (!ty || a.type === ty) && !(a.st === 'Terminée' && a.end < -30));
        $('#kanban').innerHTML = COLS.map(c => { const it = A.filter(a => a.st === c); return `<div class="col"><h4>${c}${c === 'Terminée' ? ' · 30 j' : ''}<span class="num">${it.length}</span></h4>${it.map(a => { const p = Math.min(100, pctOf(a)); const ed = PS.canEdit(a); return `<div class="card ${a._new ? 'new' : ''}" data-act="${a.id}" tabindex="0"><div class="ty"><span class="mono" style="color:${css('--teal')}">${PS.D.TYPES[a.type]}</span>${esc(a.type)}${a.zone ? ' · zone dessinée' : ''}${ed ? '' : ' · <span title="Hors de votre périmètre">lecture</span>'}</div><h5>${esc(a.t)}</h5><div class="meta"><span>${esc(a.dep)}</span><span>${a.st === 'Terminée' ? 'terminée le ' + dayFmt(a.end) : (a.date < 0 ? 'depuis le ' + dayFmt(a.date) : 'le ' + dayFmt(a.date))}</span></div>${a.st !== 'À planifier' ? `<div class="track"><div class="fill" style="width:${p}%"></div></div><div class="meta"><span>${fmt(a.done)} / ${fmt(a.obj)}</span><span>${a.st === 'Terminée' ? (a.bilan ? 'bilan saisi' : 'bilan à saisir') : a.vol + ' bénévoles'}</span></div>` : `<div class="meta"><span>${esc(a.team)}</span><span>obj. ${fmt(a.obj)}</span></div>`}</div>` }).join('') || '<p class="small muted" style="margin:4px">Aucune action.</p>'}${c === 'Terminée' ? '<button class="linkbtn" data-goto-hist style="align-self:flex-start">Voir tout l’historique →</button>' : ''}</div>` }).join('');
        $$('#kanban [data-act]').forEach(el => { const open = () => PS.actionCard(PS.ACTIONS().find(a => a.id === el.dataset.act), draw); el.addEventListener('click', open); el.addEventListener('keydown', e => { if (e.key === 'Enter') open() }) });
        const gh = $('[data-goto-hist]'); if (gh) gh.addEventListener('click', () => { S.actTab = 'historique'; render() });
        extra.actions.forEach(a => delete a._new);
      };
      $('#afType').addEventListener('change', draw);
      const am = $('#amine'); if (am) am.addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (b) { S.actMine = b.dataset.m === '1'; $$('#amine button').forEach(x => x.setAttribute('aria-pressed', x === b)); draw() } });
      draw();
    }
  };
  function histHTML() {
    const H = S.hist = S.hist || { per: '180', terr: S.focus || 'nat', type: '', q: '' };
    return `<section class="panel"><header><div class="filters">
        ${PS.terrSelect('hf-t', H.terr, false)}
        <select id="hf-p" class="terr-sel" aria-label="Période">${[['30', '30 derniers jours'], ['90', '3 derniers mois'], ['180', '6 derniers mois'], ['all', 'Tout l’historique']].map(([k, l]) => `<option value="${k}" ${H.per === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <select id="hf-ty" class="terr-sel" aria-label="Type"><option value="">Tous les types</option>${Object.keys(PS.D.TYPES).map(t => `<option ${H.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <input type="search" id="hf-q" placeholder="Action, commune, équipe…" value="${esc(H.q)}" aria-label="Rechercher">
      </div><span class="right"><button class="btn sm" id="hf-exp">Exporter (CSV)</button></span></header>
      <div class="kpis kpis-4" id="hf-kpi"></div>
      <div class="tbl-wrap" id="hf-tbl"></div></section>`;
  }
  function histRows() {
    const H = S.hist, u = PS.unit(H.terr), q = H.q.toLowerCase();
    return PS.histOf(u).filter(a => (H.per === 'all' || a.end >= -(+H.per)) && (!H.type || a.type === H.type) && (!q || (a.t + ' ' + a.dep + ' ' + (a.commune || '') + ' ' + a.team).toLowerCase().includes(q)));
  }
  function bindHist() {
    const H = S.hist;
    const draw = () => {
      const rows = histRows();
      const touched = rows.reduce((s, a) => s + a.done, 0), att = rows.length ? Math.round(rows.reduce((s, a) => s + Math.min(150, pctOf(a)), 0) / rows.length) : 0;
      const pap = rows.filter(a => a.bilan && a.bilan.favorables != null), fav = pap.reduce((s, a) => s + a.bilan.favorables, 0), base = pap.reduce((s, a) => s + a.bilan.favorables + a.bilan.indecis + a.bilan.refus, 0);
      const noBilan = rows.filter(a => !a.bilan).length;
      $('#hf-kpi').innerHTML = [['Actions terminées', fmt(rows.length), noBilan ? `${noBilan} bilan${noBilan > 1 ? 's' : ''} à saisir` : 'tous les bilans saisis'], ['Personnes touchées', fmt(touched), 'contacts, participants, cartes'], ['Atteinte moyenne des objectifs', att + ' %', 'réalisé ÷ objectif'], ['Accueil favorable', base ? Math.round(fav / base * 100) + ' %' : '—', 'porte-à-porte et phoning, hors absents']].map(k => `<div class="kpi"><div class="label">${k[0]}</div><div class="v">${k[1]}</div><div class="d muted">${k[2]}</div></div>`).join('');
      $('#hf-tbl').innerHTML = rows.length ? `<table class="tbl"><thead><tr><th>Terminée le</th><th>Action</th><th>Territoire</th><th>Équipe</th><th class="n">Objectif</th><th class="n">Réalisé</th><th>Atteinte</th><th>Bilan</th></tr></thead><tbody>${rows.map(a => { const p = pctOf(a); return `<tr class="click" data-h="${a.id}"><td class="mono small">${dayFmt(a.end)}</td><td><b>${esc(a.t)}</b><div class="small muted">${esc(a.type)}</div></td><td class="small">${esc(a.commune ? a.commune + ' · ' : '')}${esc(a.dep)}</td><td class="small">${esc(a.team)}</td><td class="n">${fmt(a.obj)}</td><td class="n">${fmt(a.done)}</td><td><div class="bar-cell"><div class="track"><div class="fill ${p < 80 ? 'amber' : ''}" style="width:${Math.min(100, p)}%"></div></div><span class="num small">${p} %</span></div></td><td>${a.bilan ? '<span class="chip s-ok">Saisi</span>' : '<span class="chip s-warn">À saisir</span>'}</td></tr>` }).join('')}</tbody></table>` : '<p class="body muted">Aucune action terminée pour ces critères. Élargissez la période ou le territoire.</p>';
      $$('[data-h]').forEach(r => r.addEventListener('click', () => PS.actionCard(PS.ACTIONS().find(a => a.id === r.dataset.h), draw)));
    };
    $('#hf-t').addEventListener('change', e => { H.terr = e.target.value; draw() });
    $('#hf-p').addEventListener('change', e => { H.per = e.target.value; draw() });
    $('#hf-ty').addEventListener('change', e => { H.type = e.target.value; draw() });
    $('#hf-q').addEventListener('input', e => { H.q = e.target.value; draw() });
    $('#hf-exp').addEventListener('click', () => {
      const rows = histRows(), c = v => { v = String(v ?? ''); return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v };
      const txt = [['termine_le', 'action', 'type', 'commune', 'departement', 'equipe', 'objectif', 'realise', 'atteinte_pct', 'favorables', 'indecis', 'refus', 'absents', 'participants', 'cartes', 'resume', 'difficultes'], ...rows.map(a => { const b = a.bilan || {}; return [dayFmt(a.end) + ' 2026', a.t, a.type, a.commune || '', a.dep, a.team, a.obj, a.done, pctOf(a), b.favorables ?? '', b.indecis ?? '', b.refus ?? '', b.absents ?? '', b.participants ?? '', b.cartes ?? '', b.resume || '', b.difficultes || ''] })].map(r => r.map(c).join(';')).join('\n');
      try { const l = document.createElement('a'); l.href = URL.createObjectURL(new Blob(['﻿' + txt], { type: 'text/csv;charset=utf-8' })); l.download = 'poliscope_historique_actions.csv'; document.body.appendChild(l); l.click(); l.remove(); PS.log('a exporté l’historique des actions'); PS.toast(`${rows.length} actions exportées.`) } catch (e) { PS.toast('Téléchargement bloqué par le navigateur.') }
    });
    draw();
  }
  function bilanHTML(a) {
    const b = a.bilan; if (!b) return '';
    const parts = b.favorables != null ? `<div class="kv"><div><div class="k">Favorables</div><div class="v">${fmt(b.favorables)}</div></div><div><div class="k">Indécis</div><div class="v">${fmt(b.indecis)}</div></div><div><div class="k">Pas intéressés</div><div class="v">${fmt(b.refus)}</div></div><div><div class="k">Absents</div><div class="v">${fmt(b.absents)}</div></div>${b.nouveauxContacts != null ? `<div><div class="k">Nouveaux contacts (consentants)</div><div class="v">${fmt(b.nouveauxContacts)}</div></div>` : ''}</div>` : b.cartes != null ? `<div class="kv"><div><div class="k">Cartes placées</div><div class="v">${fmt(b.cartes)}</div></div></div>` : `<div class="kv"><div><div class="k">Participants</div><div class="v">${fmt(b.participants)}</div></div></div>`;
    return `<div class="bilan"><div class="label">Bilan</div>${parts}${b.resume ? `<p style="margin:0"><b>À retenir :</b> ${esc(b.resume)}</p>` : ''}${b.difficultes ? `<p style="margin:0"><b>Difficultés :</b> ${esc(b.difficultes)}</p>` : ''}</div>`;
  }
  PS.bilanHTML = bilanHTML;
  PS.actionCard = function (a, redraw) {
    const p = pctOf(a), i = COLS.indexOf(a.st), ed = PS.canEdit(a);
    const rm = PS.REMONTEES().filter(r => r.action === a.id);
    const m = PS.modal(a.t, `<div class="row"><span class="chip s-neutral">${esc(a.type)}</span><span class="chip ${a.st === 'Terminée' ? 's-ok' : (a.st === 'En cours' ? 's-warn' : 's-neutral')}">${a.st}${a.st === 'Terminée' ? ' le ' + dayFmt(a.end) : ''}</span><span class="small muted">${esc(a.commune ? a.commune + ' · ' : '')}${esc(a.dep)} · ${esc(a.r)}</span></div>
      <div class="kv"><div><div class="k">Équipe</div><div class="v" style="font-size:14px">${esc(a.team)}</div></div><div><div class="k">Bénévoles</div><div class="v">${a.vol}</div></div><div><div class="k">Objectif</div><div class="v">${fmt(a.obj)}</div></div><div><div class="k">Réalisé</div><div class="v">${fmt(a.done)} <span class="muted" style="font-size:13px">(${p} %)</span></div></div>
      ${a.menages ? `<div><div class="k">Ménages estimés dans la zone</div><div class="v">${fmt(a.menages)}</div></div><div><div class="k">Surface</div><div class="v">${a.km2.toFixed(1)} km²</div></div>` : ''}</div>
      ${a.st !== 'À planifier' ? `<div class="bar-cell"><div class="track" style="height:10px"><div class="fill" style="width:${Math.min(100, p)}%"></div></div></div>` : ''}
      ${a.note ? `<p style="margin:0">${esc(a.note)}</p>` : ''}
      ${rm.length ? `<div class="small"><b>${rm.length} remontées terrain</b> rattachées (${[...new Set(rm.map(r => r.outil))].join(', ')}) · <button class="linkbtn" id="ac-rm">les voir</button></div>` : ''}
      ${a.st === 'Terminée' ? (a.bilan ? bilanHTML(a) : `<p class="notice">Le bilan de cette action n’a pas encore été saisi.</p>`) : ''}
      ${ed ? '' : PS.lockHTML('Action en lecture seule')}`,
      `<button class="btn" data-close>Fermer</button>${a.zone ? '<button class="btn" id="ac-map">Voir la zone</button>' : ''}${ed && a.st === 'Terminée' ? `<button class="btn primary" id="ac-bilan">${a.bilan ? 'Modifier le bilan' : 'Saisir le bilan'}</button>` : ''}${i < 2 && ed ? `<button class="btn primary" id="ac-next">Passer à « ${COLS[i + 1]} »</button>` : ''}${i === 2 && ed ? '<button class="btn primary" id="ac-close">Clôturer et saisir le bilan</button>' : ''}`);
    const nx = $('#ac-next', m); if (nx) nx.addEventListener('click', () => { a.st = COLS[i + 1]; if (a.st === 'En cours' && !a.done) { a.done = Math.round(a.obj * 0.08); a.date = 0 } PS.log(`a passé l’action « ${a.t} » à « ${a.st} »`); PS.saveActState(a); PS.closeModal(); redraw && redraw(); PS.toast(`Action passée à « ${a.st} ».`) });
    const cl = $('#ac-close', m); if (cl) cl.addEventListener('click', () => bilanForm(a, true, redraw));
    const bb = $('#ac-bilan', m); if (bb) bb.addEventListener('click', () => bilanForm(a, false, redraw));
    const mp = $('#ac-map', m); if (mp) mp.addEventListener('click', () => { PS.closeModal(); S.map.layers.zones = true; const d = PS.D.depts.find(x => x.n === a.dep); go('carte', { sel: { t: 'unit', id: d.id } }) });
    const rb = $('#ac-rm', m); if (rb) rb.addEventListener('click', () => { PS.closeModal(); S.terrTab = 'remontees'; S.rmFilter = { action: a.id, statut: '', q: '' }; go('terrain') });
  };
  function bilanForm(a, closing, redraw) {
    const b = a.bilan || {}, rm = PS.REMONTEES().filter(r => r.action === a.id && r.statut === 'Validée');
    const cnt = k => rm.filter(r => r.resultat === k).length;
    const pap = a.type === 'Porte-à-porte' || a.type === 'Phoning' || a.type === 'Caravane' && rm.length;
    let sug = {};
    if (pap && b.favorables == null && rm.length) { const raw = { favorables: cnt('Favorable') + cnt('Viendra'), indecis: cnt('Indécis') + cnt('À rappeler'), refus: cnt('Pas intéressé') + cnt('Refus'), absents: cnt('Absent') + cnt('Pas de réponse') }; const tot = Object.values(raw).reduce((x, y) => x + y, 0) || 1; sug = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Math.round(a.done * v / tot)])); sug.absents = Math.max(0, a.done - sug.favorables - sug.indecis - sug.refus) }
    const v = k => b[k] ?? sug[k] ?? '';
    const m = PS.modal(`${closing ? 'Clôturer' : 'Bilan'} : ${a.t}`, `
      <div class="grid g-2"><div class="field"><label for="bl-r">Réalisé (contacts, participants, cartes…)</label><input id="bl-r" type="number" min="0" value="${b.realise ?? a.done}"></div><div class="field"><span class="flabel">Objectif</span><div class="num" style="padding:8px 0">${fmt(a.obj)}</div></div></div>
      ${pap ? `<div class="grid g-2">${[['favorables', 'Favorables'], ['indecis', 'Indécis'], ['refus', 'Pas intéressés'], ['absents', 'Absents'], ['nouveauxContacts', 'Nouveaux contacts consentants']].map(([k, l]) => `<div class="field"><label for="bl-${k}">${l}</label><input id="bl-${k}" type="number" min="0" value="${v(k)}"></div>`).join('')}</div>${rm.length && b.favorables == null ? `<p class="small muted" style="margin:0">Estimation : proportions observées dans les ${rm.length} remontées terrain validées, appliquées au réalisé. Corrigez avec les totaux de l’équipe.</p>` : ''}`
        : a.type === 'Placement de cartes' ? `<div class="field"><label for="bl-cartes">Cartes placées</label><input id="bl-cartes" type="number" min="0" value="${b.cartes ?? a.done}"></div>` : `<div class="field"><label for="bl-participants">Participants</label><input id="bl-participants" type="number" min="0" value="${b.participants ?? a.done}"></div>`}
      <div class="field"><label for="bl-res">À retenir</label><textarea id="bl-res" placeholder="Accueil, thèmes évoqués, relais identifiés…">${esc(b.resume || '')}</textarea></div>
      <div class="field"><label for="bl-dif">Difficultés rencontrées</label><textarea id="bl-dif" placeholder="Logistique, accès, sécurité, effectifs…" style="min-height:50px">${esc(b.difficultes || '')}</textarea></div>`,
      `<button class="btn" data-close>Annuler</button><button class="btn primary" id="bl-ok">${closing ? 'Clôturer l’action' : 'Enregistrer le bilan'}</button>`);
    $('#bl-ok', m).addEventListener('click', () => {
      const num = id => { const el = $('#bl-' + id, m); return el && el.value !== '' ? Math.max(0, +el.value) : undefined };
      const nb = { realise: num('r') ?? a.done, resume: $('#bl-res', m).value.trim(), difficultes: $('#bl-dif', m).value.trim() };
      ['favorables', 'indecis', 'refus', 'absents', 'nouveauxContacts', 'cartes', 'participants'].forEach(k => { const x = num(k); if (x !== undefined) nb[k] = x });
      a.bilan = nb; a.done = nb.realise;
      if (closing) { a.st = 'Terminée'; a.end = 0 }
      PS.log(closing ? `a clôturé l’action « ${a.t} » (${pctOf(a)} % de l’objectif)` : `a mis à jour le bilan de « ${a.t} »`);
      PS.saveActState(a); PS.closeModal(); redraw && redraw(); PS.toast(closing ? 'Action clôturée : elle figure dans l’historique avec son bilan.' : 'Bilan enregistré.');
    });
  }
  PS.actionForm = function (pre) {
    const ds = editableDepts();
    if (!ds.length) { PS.toast('Votre profil ne permet pas de créer des actions.'); return }
    const dsel = pre.dep && ds.some(d => d.n === pre.dep) ? pre.dep : ds[0].n;
    if (pre.dep && !ds.some(d => d.n === pre.dep)) PS.toast(`${pre.dep} est hors de votre périmètre : l’action sera créée dans ${dsel}.`);
    const m = PS.modal('Nouvelle action terrain', `
      ${pre.zone ? `<div class="notice">Zone dessinée : <b>${pre.km2.toFixed(1)} km²</b>, environ <b>${fmt(pre.menages)} ménages</b> (densité de la commune ÷ 8,7 personnes par ménage, ordre de grandeur).</div>` : ''}
      <div class="field"><label for="na-t">Intitulé</label><input id="na-t" value="${esc(pre.type ? pre.type + ' — ' + (pre.commune || dsel) : '')}"></div>
      <div class="grid g-2"><div class="field"><label for="na-ty">Type</label><select id="na-ty">${Object.keys(PS.D.TYPES).map(t => `<option ${t === pre.type ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="field"><label for="na-d">Département</label><select id="na-d">${ds.map(d => `<option ${d.n === dsel ? 'selected' : ''}>${esc(d.n)}</option>`).join('')}</select></div>
      <div class="field"><label for="na-dt">Début</label><input id="na-dt" type="date" value="2026-10-27"></div>
      <div class="field"><label for="na-o">Objectif (contacts, appels, cartes…)</label><input id="na-o" type="number" min="1" value="${pre.menages ? Math.round(pre.menages * 0.6) : 500}"></div>
      <div class="field"><label for="na-e">Équipe responsable</label><input id="na-e" placeholder="Ex. Équipe Jeunesse ${esc(dsel)}"></div>
      <div class="field"><label for="na-v">Bénévoles mobilisés</label><input id="na-v" type="number" min="0" value="10"></div></div>
      <div class="field"><label for="na-n">Consignes</label><textarea id="na-n" placeholder="Message clé, horaires, point de rendez-vous, formulaire QField / Kobo à utiliser…"></textarea></div>`,
      `<button class="btn" data-close>Annuler</button><button class="btn primary" id="na-ok">Créer l’action</button>`);
    $('#na-ok', m).addEventListener('click', () => {
      const t = $('#na-t', m).value.trim(); if (!t) { $('#na-t', m).focus(); PS.toast('Donnez un intitulé à l’action.'); return }
      const dt = new Date($('#na-dt', m).value || '2026-10-27'); const off = Math.round((dt - TODAY) / 864e5);
      const dep = $('#na-d', m).value, d = PS.D.depts.find(x => x.n === dep);
      const a = { id: 'ax' + Date.now(), t, type: $('#na-ty', m).value, dep, r: d.r, st: 'Planifiée', obj: +$('#na-o', m).value || 100, done: 0, team: $('#na-e', m).value.trim() || 'À affecter', vol: +$('#na-v', m).value || 0, date: off, end: off + 7, note: $('#na-n', m).value.trim(), _new: true };
      if (pre.zone) { a.zone = pre.zone; a.km2 = pre.km2; a.menages = pre.menages }
      extra.actions.unshift(a); PS.log(`a créé l’action « ${t} »`); PS.persist(); PS.closeModal(); PS.toast(`Action « ${t} » créée.`);
      if (S.view === 'actions' || S.view === 'carte') render(); else go('actions');
    });
  };

  /* =========================================================
     COLLECTE TERRAIN
     ========================================================= */
  const DOORS = [{ a: 'Rue 12 × Rue 7, maison 4', h: 'Ménage de 9 personnes · 1re visite' }, { a: 'Rue 12, maison 6 (boutique)', h: 'Commerçant · déjà sympathisant' }, { a: 'Rue 14, concession Ndiaye', h: '3 ménages · relance demandée le 3 oct.' }, { a: 'Rue 14, maison 2', h: '1re visite' }, { a: 'Place du marché, étal 18', h: 'Commerçante · tag Femmes' }, { a: 'Rue 15, maison 9', h: 'Absent lors du dernier passage' }];
  const RCHIP = { 'Favorable': 's-ok', 'Viendra': 's-ok', 'Indécis': 's-warn', 'À rappeler': 's-warn', 'Pas intéressé': 's-bad', 'Refus': 's-bad', 'Absent': 's-neutral', 'Pas de réponse': 's-neutral' };
  const STCHIP = { 'Validée': 's-ok', 'Rejetée': 's-neutral', 'Doublon possible': 's-warn', 'Consentement manquant': 's-warn', 'Hors périmètre': 's-bad' };
  const STHELP = { 'Doublon possible': 'Même position et même jour qu’une autre fiche : vérifier qu’il ne s’agit pas d’une double saisie.', 'Consentement manquant': 'Un numéro a été saisi sans case de consentement cochée : le contact ne sera pas enregistré dans le CRM.', 'Hors périmètre': 'Fiche saisie en dehors du département de l’équipe : à réaffecter ou rejeter.' };
  const isOpen = r => r.statut !== 'Validée' && r.statut !== 'Rejetée';
  function terrActions() { return PS.ACTIONS().filter(a => (a.type === 'Porte-à-porte' || a.type === 'Phoning') && (a.st === 'En cours' || a.st === 'Planifiée') && PS.canEdit(a)) }
  function setRemStatut(r, st) { r.statut = st; if (String(r.id).startsWith('rx')) PS.persist(); else { extra.remState[r.id] = st; PS.persist() } }
  function randomPointIn(a) {
    const d = PS.D.depts.find(x => x.n === a.dep); if (!d) return null;
    const cs = a.commune ? d.children.filter(c => c.n === a.commune) : d.children;
    const c = cs[Math.floor(Math.random() * cs.length)], bb = PS.D.bbox(c.geom);
    for (let k = 0; k < 300; k++) { const x = bb[0] + Math.random() * (bb[2] - bb[0]), y = bb[1] + Math.random() * (bb[3] - bb[1]); if (PS.D.inGeom([x, y], c.geom)) return { lat: +y.toFixed(5), lng: +x.toFixed(5), commune: c.n } }
    return { lat: c.lat, lng: c.lng, commune: c.n };
  }
  VIEWS.terrain = {
    html() {
      const tab = S.terrTab || 'appli', R = PS.REMONTEES();
      const mine = R.filter(r => PS.canEdit(r)), toCheck = mine.filter(isOpen).length;
      const r30 = (PS.role.edit === 'national' ? R : mine).filter(r => r.jour >= -30);
      const pap = r30.filter(r => r.type === 'Porte-à-porte' && r.resultat !== 'Absent'), fav = pap.filter(r => r.resultat === 'Favorable').length;
      const tabs = [['appli', 'Appli terrain'], ['remontees', 'Remontées'], ['valider', `À valider${toCheck ? ` (${toCheck})` : ''}`], ['import', 'Importer un fichier'], ['collecteurs', 'Collecteurs'], ['outils', 'Outils et formulaires']];
      return `<div class="view-head"><div><div class="label">Collecte terrain</div><h1>Des données de terrain fiables, même sans réseau</h1><p>Les fiches de porte-à-porte et de phoning arrivent de l’appli PoliScope, de QField, de KoboToolbox ou d’ODK. Elles font avancer les actions, apparaissent sur la carte et passent par une validation avant d’alimenter les indicateurs.</p></div>
        <div class="actions"><button class="btn" id="tr-map">Voir les remontées sur la carte</button></div></div>
      <section class="kpis kpis-4" aria-label="Collecte">${[['Remontées (30 j)', fmt(r30.length), PS.role.edit === 'national' ? 'tout le Sénégal' : esc(editScopeText())], ['À valider', fmt(toCheck), 'doublons, consentement, périmètre'], ['Accueil favorable', pap.length ? Math.round(fav / pap.length * 100) + ' %' : '—', 'porte-à-porte, hors absents'], ['Collecteurs actifs', fmt(new Set(r30.map(r => r.collecteur)).size), 'au moins une fiche sur 30 j']].map(k => `<div class="kpi"><div class="label">${k[0]}</div><div class="v">${k[1]}</div><div class="d muted">${k[2]}</div></div>`).join('')}</section>
      <div class="tabs" role="tablist" style="margin-top:16px">${tabs.map(([k, l]) => `<button role="tab" data-ttab="${k}" aria-selected="${tab === k}">${l}</button>`).join('')}</div>
      <div id="terrBody">${({ appli: tAppli, remontees: tRem, valider: tVal, import: tImp, collecteurs: tCol, outils: tOut })[tab]()}</div>`;
    },
    bind() {
      $$('[data-ttab]').forEach(b => b.addEventListener('click', () => { S.terrTab = b.dataset.ttab; render() }));
      $('#tr-map').addEventListener('click', () => { S.map.layers.remontees = true; go('carte') });
      ({ appli: bAppli, remontees: bRem, valider: bVal, import: bImp, collecteurs: () => { }, outils: () => { } })[S.terrTab || 'appli']();
    }
  };
  function tAppli() {
    const T = S.terrain, acts = terrActions();
    if (!T.action || !acts.some(a => a.id === T.action)) T.action = (acts.find(a => a.type === (T.tab === 'tel' ? 'Phoning' : 'Porte-à-porte')) || acts[0] || {}).id;
    const a = acts.find(x => x.id === T.action);
    const pend = T.pending.length;
    return `<div class="grid" style="grid-template-columns:minmax(0,320px) minmax(0,1fr);align-items:start" id="terrGrid">
      <div class="stack">
        <div class="field"><label for="tr-act">Action concernée</label><select id="tr-act" class="terr-sel">${acts.map(x => `<option value="${x.id}" ${x.id === T.action ? 'selected' : ''}>${esc(x.t)}</option>`).join('') || '<option>Aucune action en cours dans votre périmètre</option>'}</select></div>
        <div class="phone-wrap"><div class="phone"><div class="screen">
          <div class="p-status"><span>09:41</span><span>${pend ? 'Hors ligne' : '4G'} ▮▮▯</span></div>
          <div class="p-head"><small>${a ? esc(a.type) : 'Collecte'}</small><b>${a ? esc(a.t.split('—').pop().trim()) : 'Aucune action'}</b><small>${a ? `${esc(a.team)} · ${fmt(a.done)} / ${fmt(a.obj)}` : 'Créez une action dans « Actions terrain »'}</small></div>
          ${pend ? `<div class="p-off"><span>Hors ligne · ${pend} fiche${pend > 1 ? 's' : ''} en attente</span><button id="pSync">Synchroniser</button></div>` : `<div class="p-off" style="background:${css('--teal-soft')};color:${css('--teal')}"><span>Tout est synchronisé</span></div>`}
          <div class="p-body">
            ${!a ? '<p class="small muted">Aucune action de porte-à-porte ou de phoning en cours dans votre périmètre.</p>' : a.type === 'Porte-à-porte' ? `<div class="door"><span class="small muted">Porte ${T.door + 1} / ${DOORS.length} du parcours</span><span class="addr">${esc(DOORS[T.door % DOORS.length].a)}</span><span class="small muted">${esc(DOORS[T.door % DOORS.length].h)}</span></div>
            <div class="outcomes"><button data-out="Favorable">Favorable</button><button data-out="Indécis">Indécis</button><button data-out="Pas intéressé">Pas intéressé</button><button data-out="Absent">Absent</button></div>
            <label class="small row" style="gap:6px"><input type="checkbox" id="pCons"> Accepte d’être recontacté (consentement)</label>`
          : `<div class="door"><span class="small muted">Appel ${T.counts.fav + T.counts.ind + T.counts.opp + T.counts.abs + 1} · liste de la section</span><span class="addr">Awa D. — 77 ••• •• 48</span><span class="small muted">Dernier contact : meeting du 12 sept.</span></div>
            <div class="script"><b>Script</b><br>« Bonjour, je suis bénévole du parti. Nous organisons une réunion de quartier samedi à 17 h. Pouvons-nous compter sur votre présence ? »</div>
            <div class="outcomes"><button data-out="Viendra">Viendra</button><button data-out="À rappeler">À rappeler</button><button data-out="Refus">Refus</button><button data-out="Pas de réponse">Pas de réponse</button></div>`}
            <div class="p-counts"><div><b>${T.counts.fav}</b>Favorables</div><div><b>${T.counts.ind}</b>Indécis</div><div><b>${T.counts.opp}</b>Refus</div><div><b>${T.counts.abs}</b>Absents</div></div>
          </div></div></div></div>
      </div>
      <div class="stack">
        <section class="panel"><header><h3>Comment ça marche</h3></header><div class="body small" style="display:grid;gap:8px">
          <div><b>1. Saisie hors ligne.</b> <span class="muted">Le bénévole note chaque porte ou chaque appel. La position GPS est enregistrée avec la fiche.</span></div>
          <div><b>2. Synchronisation.</b> <span class="muted">Au retour du réseau, les fiches partent vers le serveur. Ici, le bouton « Synchroniser » du téléphone simule ce moment.</span></div>
          <div><b>3. Contrôles.</b> <span class="muted">Doublons, consentement, périmètre : les fiches douteuses vont dans « À valider ».</span></div>
          <div><b>4. Effets.</b> <span class="muted">Le réalisé de l’action avance, la fiche apparaît sur la carte (couche « Remontées terrain ») et pré-remplit le bilan à la clôture.</span></div>
        </div></section>
        <section class="panel"><header><h3>Dernières fiches synchronisées</h3><span class="sub">cette session</span></header><div class="tbl-wrap">${T.log.length ? `<table class="tbl"><thead><tr><th>Heure</th><th>Résultat</th><th>Commune</th><th>Action</th></tr></thead><tbody>${T.log.slice(0, 12).map(l => `<tr><td class="mono">${l.h}</td><td><span class="chip ${RCHIP[l.r.resultat]}">${esc(l.r.resultat)}</span></td><td>${esc(l.r.commune)}</td><td class="small">${esc(l.r.actionT)}</td></tr>`).join('')}</tbody></table>` : '<p class="body small muted" style="margin:0">Touchez un résultat sur le téléphone, puis « Synchroniser » : les fiches apparaissent ici, dans l’onglet Remontées et sur la carte.</p>'}</div></section>
      </div></div>`;
  }
  function bAppli() {
    if (window.innerWidth < 900) $('#terrGrid').style.gridTemplateColumns = 'minmax(0,1fr)';
    const T = S.terrain;
    const sel = $('#tr-act'); if (sel) sel.addEventListener('change', () => { T.action = sel.value; T.door = 0; render() });
    $$('[data-out]').forEach(b => b.addEventListener('click', () => {
      const a = PS.ACTIONS().find(x => x.id === T.action); if (!a) return;
      const k = b.dataset.out, map = { 'Favorable': 'fav', 'Viendra': 'fav', 'Indécis': 'ind', 'À rappeler': 'ind', 'Pas intéressé': 'opp', 'Refus': 'opp', 'Absent': 'abs', 'Pas de réponse': 'abs' };
      T.counts[map[k]]++;
      const pt = randomPointIn(a) || { lat: 14.7, lng: -17.4, commune: a.dep };
      T.pending.push({ id: 'rx' + Date.now() + Math.random().toString(36).slice(2, 6), action: a.id, actionT: a.t, type: a.type, dep: a.dep, r: a.r, commune: pt.commune, lat: pt.lat, lng: pt.lng, resultat: k, outil: 'Appli PoliScope', collecteur: PS.user.nom, jour: 0, statut: 'Validée', consent: !!($('#pCons') && $('#pCons').checked) });
      if (a.type === 'Porte-à-porte') T.door = (T.door + 1) % DOORS.length;
      render();
    }));
    const s = $('#pSync'); if (s) s.addEventListener('click', () => {
      const n = T.pending.length, h = new Date(), hh = `${String(h.getHours()).padStart(2, '0')}:${String(h.getMinutes()).padStart(2, '0')}`;
      T.pending.forEach(r => { extra.remontees.unshift(r); T.log.unshift({ h: hh, r }); const a = PS.ACTIONS().find(x => x.id === r.action); if (a) a.done += 1 });
      [...new Set(T.pending.map(r => r.action))].forEach(id => { const a = PS.ACTIONS().find(x => x.id === id); if (a) PS.saveActState(a) });
      T.pending = []; PS.log(`a synchronisé ${n} fiche${n > 1 ? 's' : ''} terrain`); PS.persist(); render(); PS.toast(`${n} fiche${n > 1 ? 's' : ''} synchronisée${n > 1 ? 's' : ''} : l’action avance et les points sont sur la carte.`);
    });
  }
  function remRows() {
    const F = S.rmFilter = S.rmFilter || { action: '', statut: '', q: '' }, q = F.q.toLowerCase();
    return PS.REMONTEES().filter(r => (!F.action || r.action === F.action) && (!F.statut || r.statut === F.statut) && (!q || (r.commune + ' ' + r.collecteur + ' ' + r.dep + ' ' + r.outil).toLowerCase().includes(q))).sort((a, b) => b.jour - a.jour);
  }
  function tRem() {
    const F = S.rmFilter = S.rmFilter || { action: '', statut: '', q: '' };
    const acts = [...new Map(PS.REMONTEES().map(r => [r.action, r.actionT])).entries()];
    return `<section class="panel"><header><div class="filters"><input type="search" id="rf-q" placeholder="Commune, collecteur, outil…" value="${esc(F.q)}" aria-label="Rechercher">
      <select id="rf-a" class="terr-sel" aria-label="Action"><option value="">Toutes les actions</option>${acts.map(([id, t]) => `<option value="${id}" ${F.action === id ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
      <select id="rf-s" class="terr-sel" aria-label="Contrôle"><option value="">Tous les contrôles</option>${Object.keys(STCHIP).map(k => `<option ${F.statut === k ? 'selected' : ''}>${k}</option>`).join('')}</select></div><span class="right sub" id="rf-n"></span></header><div class="tbl-wrap" id="rf-t" style="max-height:62vh;overflow:auto"></div></section>`;
  }
  function bRem() {
    const draw = () => { const rows = remRows(); $('#rf-n').textContent = `${rows.length} fiche${rows.length > 1 ? 's' : ''}`;
      $('#rf-t').innerHTML = rows.length ? `<table class="tbl"><thead><tr><th>Date</th><th>Résultat</th><th>Commune</th><th>Action</th><th>Collecteur</th><th>Outil</th><th>Contrôle</th></tr></thead><tbody>${rows.slice(0, 400).map(r => `<tr><td class="mono small">${dayFmt(r.jour)}</td><td><span class="chip ${RCHIP[r.resultat] || 's-neutral'}">${esc(r.resultat)}</span></td><td>${esc(r.commune)}<div class="small muted">${esc(r.dep)}</div></td><td class="small">${esc(r.actionT)}</td><td class="small">${esc(r.collecteur)}</td><td class="small">${esc(r.outil)}</td><td><span class="chip ${STCHIP[r.statut]}">${esc(r.statut)}</span></td></tr>`).join('')}</tbody></table>` : '<p class="body muted">Aucune fiche pour ces critères.</p>' };
    $('#rf-q').addEventListener('input', e => { S.rmFilter.q = e.target.value; draw() });
    $('#rf-a').addEventListener('change', e => { S.rmFilter.action = e.target.value; draw() });
    $('#rf-s').addEventListener('change', e => { S.rmFilter.statut = e.target.value; draw() });
    draw();
  }
  function tVal() {
    const rows = PS.REMONTEES().filter(r => isOpen(r) && PS.canEdit(r));
    return `<section class="panel"><header><h3>Fiches à vérifier</h3><span class="sub">${esc(editScopeText())}</span>${rows.length ? '<span class="right"><button class="btn sm" id="vl-all">Valider les doublons vérifiés</button></span>' : ''}</header>
      ${rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Contrôle</th><th>Fiche</th><th>Collecteur</th><th></th></tr></thead><tbody>${rows.map(r => `<tr><td><span class="chip ${STCHIP[r.statut]}">${esc(r.statut)}</span><div class="small muted" style="max-width:36ch;margin-top:4px">${esc(STHELP[r.statut] || '')}</div></td><td><b>${esc(r.resultat)}</b> · ${esc(r.commune)} (${esc(r.dep)})<div class="small muted">${dayFmt(r.jour)} · ${esc(r.actionT)} · ${esc(r.outil)}</div></td><td class="small">${esc(r.collecteur)}</td><td><div class="row" style="gap:6px;flex-wrap:nowrap;justify-content:flex-end"><button class="btn sm" data-vok="${r.id}">Valider</button><button class="btn sm" data-vko="${r.id}">Rejeter</button></div></td></tr>`).join('')}</tbody></table></div>`
        : '<p class="body muted" style="margin:0">Aucune fiche en attente dans votre périmètre : toutes les remontées ont passé les contrôles.</p>'}</section>
      ${PS.role.edit === 'aucun' ? PS.lockHTML('Validation') : ''}`;
  }
  function bVal() {
    const find = id => PS.REMONTEES().find(r => r.id === id);
    $$('[data-vok]').forEach(b => b.addEventListener('click', () => { const r = find(b.dataset.vok); setRemStatut(r, 'Validée'); PS.log(`a validé une fiche terrain (${r.commune})`); render() }));
    $$('[data-vko]').forEach(b => b.addEventListener('click', () => { const r = find(b.dataset.vko); setRemStatut(r, 'Rejetée'); PS.log(`a rejeté une fiche terrain (${r.commune})`); render() }));
    const all = $('#vl-all'); if (all) all.addEventListener('click', () => { const rs = PS.REMONTEES().filter(r => r.statut === 'Doublon possible' && PS.canEdit(r)); rs.forEach(r => setRemStatut(r, 'Validée')); PS.log(`a validé ${rs.length} doublons vérifiés`); render(); PS.toast(`${rs.length} fiche${rs.length > 1 ? 's' : ''} validée${rs.length > 1 ? 's' : ''}.`) });
  }
  /* ----- Import d'un export KoboToolbox / QField / ODK (CSV ou GeoJSON) ----- */
  const COLS_MAP = { lat: ['latitude', 'lat', '_position_latitude', '_geolocation_latitude', 'y', 'gps_latitude'], lng: ['longitude', 'lon', 'lng', '_position_longitude', '_geolocation_longitude', 'x', 'gps_longitude'], res: ['resultat', 'résultat', 'result', 'visite/resultat', 'outcome'], date: ['date', 'collecte_le', '_submission_time', 'start', 'end', 'today'], agent: ['agent', 'collecteur', 'username', '_submitted_by', 'enqueteur'], pos: ['position', '_geolocation', 'lieu/position', 'gps'] };
  const RES_NORM = { favorable: 'Favorable', indecis: 'Indécis', 'indécis': 'Indécis', pas_interesse: 'Pas intéressé', 'pas intéressé': 'Pas intéressé', 'pas interesse': 'Pas intéressé', absent: 'Absent', refus: 'Pas intéressé' };
  function parseCSV(txt) {
    txt = txt.replace(/^﻿/, ''); const first = txt.split(/\r?\n/)[0]; const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
    const rows = []; let cur = [], f = '', q = false;
    for (let i = 0; i < txt.length; i++) { const ch = txt[i]; if (q) { if (ch === '"') { if (txt[i + 1] === '"') { f += '"'; i++ } else q = false } else f += ch } else if (ch === '"') q = true; else if (ch === sep) { cur.push(f); f = '' } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && txt[i + 1] === '\n') i++; cur.push(f); rows.push(cur); cur = []; f = '' } else f += ch }
    if (f || cur.length) { cur.push(f); rows.push(cur) }
    const head = rows.shift().map(h => h.trim().toLowerCase());
    return rows.filter(r => r.some(x => x.trim())).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()])));
  }
  const pickCol = (o, keys) => { for (const k of keys) if (o[k] != null && o[k] !== '') return o[k]; return null };
  function toRecords(objs) {
    return objs.map(o => {
      let lat = parseFloat(String(pickCol(o, COLS_MAP.lat) ?? '').replace(',', '.')), lng = parseFloat(String(pickCol(o, COLS_MAP.lng) ?? '').replace(',', '.'));
      const pos = pickCol(o, COLS_MAP.pos); if ((isNaN(lat) || isNaN(lng)) && pos) { const p = String(pos).trim().split(/[\s,]+/).map(Number); if (p.length >= 2) { lat = p[0]; lng = p[1] } }
      const rr = String(pickCol(o, COLS_MAP.res) || '').trim(); const res = RES_NORM[rr.toLowerCase()] || (rr ? rr.charAt(0).toUpperCase() + rr.slice(1) : 'Non renseigné');
      return { lat, lng, resultat: res, date: pickCol(o, COLS_MAP.date), agent: pickCol(o, COLS_MAP.agent) || 'Collecteur importé', consent: /^(oui|yes|true|1)$/i.test(String(o.consentement || o.consent || '')) };
    });
  }
  function tImp() {
    const I = S.imp;
    return `<div class="grid g-main" style="align-items:start">
      <section class="panel"><header><h3>Importer des fiches</h3></header><div class="body" style="display:grid;gap:12px">
        <p style="margin:0">Déposez un export de <b>KoboToolbox</b> ou d’<b>ODK Central</b> (CSV) ou une couche <b>QField</b> exportée en GeoJSON. PoliScope repère les colonnes de position, de résultat, de date et de collecteur, puis applique les contrôles.</p>
        <div class="grid g-2"><div class="field"><label for="im-src">Outil d’origine</label><select id="im-src"><option>KoboToolbox</option><option>QField</option><option>ODK Collect</option></select></div>
        <div class="field"><label for="im-act">Rattacher à l’action</label><select id="im-act"><option value="">Aucune (fiches libres)</option>${terrActions().map(a => `<option value="${a.id}">${esc(a.t)}</option>`).join('')}</select></div></div>
        <label class="drop" for="im-file"><b>Choisir un fichier</b><span class="small muted">CSV (séparateur ; ou ,) ou GeoJSON · colonnes reconnues : latitude / longitude ou position, resultat, date, agent</span></label><input type="file" id="im-file" accept=".csv,.geojson,.json,text/csv,application/geo+json,application/json" hidden>
        <div id="im-prev">${I ? impPreview(I) : ''}</div>
      </div></section>
      <section class="panel"><header><h3>Pour essayer</h3></header><div class="body small" style="display:grid;gap:10px">
        <p style="margin:0">Téléchargez un fichier d’exemple au format d’export KoboToolbox (formulaire « Porte-à-porte » du dépôt), puis importez-le ici.</p>
        <button class="btn sm" id="im-sample" style="justify-self:start">Télécharger l’exemple (CSV)</button>
        <div class="muted">Contrôles appliqués : position dans le Sénégal, rattachement à la commune, doublon (même position au mètre près et même jour), consentement si un numéro est saisi, périmètre de votre profil.</div>
      </div></section></div>`;
  }
  function impPreview(I) {
    const c = k => I.recs.filter(r => r.ctrl === k).length;
    return `<div class="notice"><b>${esc(I.name)}</b> · ${I.recs.length} fiche${I.recs.length > 1 ? 's' : ''} lue${I.recs.length > 1 ? 's' : ''} : ${c('Validée')} valides, ${c('Doublon possible')} doublons possibles, ${c('Hors périmètre')} hors périmètre, ${c('Hors Sénégal')} sans position exploitable.</div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Résultat</th><th>Commune</th><th>Collecteur</th><th>Contrôle</th></tr></thead><tbody>${I.recs.slice(0, 8).map(r => `<tr><td>${esc(r.resultat)}</td><td>${esc(r.commune || '—')}</td><td class="small">${esc(r.agent)}</td><td><span class="chip ${STCHIP[r.ctrl] || 's-bad'}">${esc(r.ctrl)}</span></td></tr>`).join('')}</tbody></table></div>
      ${I.recs.length > 8 ? `<p class="small muted" style="margin:0">… et ${I.recs.length - 8} autres.</p>` : ''}
      <div class="row"><button class="btn" id="im-cancel">Annuler</button><button class="btn primary" id="im-go" ${I.recs.some(r => r.ctrl !== 'Hors Sénégal') ? '' : 'disabled'}>Importer ${I.recs.filter(r => r.ctrl !== 'Hors Sénégal').length} fiches</button></div>`;
  }
  function bImp() {
    const fi = $('#im-file');
    fi.addEventListener('change', () => {
      const f = fi.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        let objs;
        try {
          const txt = String(rd.result);
          if (/\.(geo)?json$/i.test(f.name) || txt.trim().startsWith('{')) { const g = JSON.parse(txt); objs = (g.features || []).filter(x => x.geometry && x.geometry.type === 'Point').map(x => ({ ...Object.fromEntries(Object.entries(x.properties || {}).map(([k, v]) => [k.toLowerCase(), v])), longitude: x.geometry.coordinates[0], latitude: x.geometry.coordinates[1] })) }
          else objs = parseCSV(txt);
        } catch (e) { PS.toast('Fichier illisible : vérifiez qu’il s’agit d’un CSV ou d’un GeoJSON valide.'); return }
        if (!objs.length) { PS.toast('Aucune fiche trouvée dans ce fichier.'); return }
        const recs = toRecords(objs), seen = new Set(PS.REMONTEES().map(r => `${r.lat.toFixed(4)},${r.lng.toFixed(4)},${r.jour}`));
        for (const r of recs) {
          if (isNaN(r.lat) || isNaN(r.lng)) { r.ctrl = 'Hors Sénégal'; continue }
          const c = PS.D.communes.find(x => PS.D.inGeom([r.lng, r.lat], x.geom));
          if (!c) { r.ctrl = 'Hors Sénégal'; continue }
          Object.assign(r, { commune: c.n, dep: c.dep, r: c.r });
          const d = r.date ? Math.round((new Date(String(r.date).slice(0, 10)) - TODAY) / 864e5) : 0; r.jour = isNaN(d) ? 0 : Math.min(0, d);
          const key = `${r.lat.toFixed(4)},${r.lng.toFixed(4)},${r.jour}`;
          r.ctrl = !PS.canEdit(c) ? 'Hors périmètre' : seen.has(key) ? 'Doublon possible' : 'Validée'; seen.add(key);
        }
        S.imp = { name: f.name, recs }; $('#im-prev').innerHTML = impPreview(S.imp); bindPrev();
      };
      rd.readAsText(f);
    });
    const bindPrev = () => {
      const c = $('#im-cancel'); if (c) c.addEventListener('click', () => { S.imp = null; $('#im-prev').innerHTML = ''; fi.value = '' });
      const g = $('#im-go'); if (g) g.addEventListener('click', () => {
        const src = $('#im-src').value, aId = $('#im-act').value, a = PS.ACTIONS().find(x => x.id === aId);
        const ok = S.imp.recs.filter(r => r.ctrl !== 'Hors Sénégal');
        ok.forEach((r, i) => extra.remontees.unshift({ id: 'rx' + Date.now() + '_' + i, action: a ? a.id : null, actionT: a ? a.t : 'Fiche importée (' + src + ')', type: 'Porte-à-porte', dep: r.dep, r: r.r, commune: r.commune, lat: +r.lat.toFixed(5), lng: +r.lng.toFixed(5), resultat: r.resultat, outil: src, collecteur: r.agent, jour: r.jour, statut: r.ctrl, consent: r.consent }));
        if (a) { a.done += ok.filter(r => r.ctrl === 'Validée').length; PS.saveActState(a) }
        PS.log(`a importé ${ok.length} fiches ${src} (${S.imp.name})`); PS.persist(); S.imp = null; S.terrTab = 'remontees'; S.rmFilter = { action: a ? a.id : '', statut: '', q: '' }; render(); PS.toast(`${ok.length} fiches importées depuis ${src}.`);
      });
    };
    bindPrev();
    $('#im-sample').addEventListener('click', () => {
      const p = PS.user.perimetre, d = p.type === 'departement' ? PS.D.depts.find(x => x.n === p.nom) : p.type === 'region' ? PS.D.regions.find(x => x.n === p.nom).children[0] : PS.D.depts.find(x => x.n === 'Mbour');
      const res = ['favorable', 'favorable', 'indecis', 'pas_interesse', 'absent'], ag = ['awa.sarr', 'ibrahima.diop', 'fatou.ba'];
      const lines = [['start', 'agent', 'region', 'commune', 'adresse', '_position_latitude', '_position_longitude', 'resultat', 'personnes', 'relance', 'consentement']];
      for (let i = 0; i < 24; i++) { const pt = randomPointIn({ dep: d.n }); lines.push([`2026-10-${String(14 + (i % 6)).padStart(2, '0')}T${10 + (i % 7)}:${String(i * 7 % 60).padStart(2, '0')}:00`, ag[i % 3], d.r, pt.commune, `Quartier ${1 + (i % 5)}, maison ${i + 3}`, pt.lat, pt.lng, res[i % 5], 1 + (i % 6), i % 4 ? 'non' : 'oui', i % 3 ? 'oui' : 'non']) }
      lines.push(lines[3].slice()); // un doublon volontaire
      try { const l = document.createElement('a'); l.href = URL.createObjectURL(new Blob(['﻿' + lines.map(r => r.join(';')).join('\n')], { type: 'text/csv;charset=utf-8' })); l.download = `export_kobo_porte_a_porte_${d.n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}.csv`; document.body.appendChild(l); l.click(); l.remove(); PS.toast('Fichier d’exemple téléchargé : importez-le avec « Choisir un fichier ».') } catch (e) { PS.toast('Téléchargement bloqué par le navigateur.') }
    });
  }
  function tCol() {
    const R = PS.REMONTEES().filter(r => PS.role.edit === 'national' || PS.canEdit(r)), by = {};
    for (const r of R) { const k = r.collecteur; (by[k] = by[k] || { n: 0, fav: 0, base: 0, last: -999, deps: new Set(), outils: new Set(), chk: 0 }); const b = by[k]; b.n++; if (r.resultat !== 'Absent' && r.resultat !== 'Pas de réponse') { b.base++; if (r.resultat === 'Favorable' || r.resultat === 'Viendra') b.fav++ } b.last = Math.max(b.last, r.jour); b.deps.add(r.dep); b.outils.add(r.outil); if (isOpen(r)) b.chk++ }
    const rows = Object.entries(by).sort((a, b) => b[1].n - a[1].n);
    return `<section class="panel"><header><h3>Activité des collecteurs</h3><span class="sub">${PS.role.edit === 'national' ? 'tout le Sénégal' : esc(editScopeText())}</span></header><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Collecteur</th><th>Territoire</th><th>Outils</th><th class="n">Fiches</th><th>Accueil favorable</th><th class="n">À vérifier</th><th>Dernière fiche</th></tr></thead><tbody>${rows.map(([k, b]) => { const p = b.base ? Math.round(b.fav / b.base * 100) : 0; return `<tr><td><b>${esc(k)}</b></td><td class="small">${esc([...b.deps].join(', '))}</td><td class="small">${esc([...b.outils].join(', '))}</td><td class="n">${b.n}</td><td><div class="bar-cell"><div class="track"><div class="fill" style="width:${p}%"></div></div><span class="num small">${p} %</span></div></td><td class="n">${b.chk || '—'}</td><td class="small">${ago(-b.last)}</td></tr>` }).join('') || '<tr><td colspan="7" class="muted">Aucun collecteur dans votre périmètre.</td></tr>'}</tbody></table></div>
      <div class="body small muted">Un taux de fiches « à vérifier » élevé chez un collecteur signale un besoin de formation à l’outil.</div></section>`;
  }
  function tOut() {
    return `<div class="grid g-3" style="margin-bottom:16px">
        ${[['QF', 'QField + QFieldCloud', 'Cartographie terrain sur projet QGIS : position des sections, permanences, zones de porte-à-porte, relevés hors ligne.'], ['KB', 'KoboToolbox', 'Formulaires XLSForm : porte-à-porte, recensement des antennes, placement des cartes, consentement.'], ['ODK', 'ODK Collect + Central', 'Alternative auto-hébergeable ; mêmes formulaires XLSForm, chiffrement des soumissions.']].map(c => `<section class="panel"><div class="body"><div class="conn" style="border:0;padding:0"><span class="lg">${c[0]}</span><div class="tx"><b>${c[1]}</b><span class="muted">${c[2]}</span></div></div></div></section>`).join('')}
      </div>
      <section class="panel"><header><h3>Formulaires fournis</h3></header><div class="body"><div class="grid g-2">
        ${[['Porte-à-porte', 'Adresse, résultat de la visite, sujets évoqués, consentement, position GPS.'], ['Recensement des antennes', 'Section, niveau, responsable, membres, photo de la permanence, position GPS.'], ['Placement de cartes', 'Numéro de carte, section, montant, reçu.'], ['Émargement d’événement', 'Événement, participants, consentement.']].map(f => `<div><b>${f[0]}</b><div class="small muted">${f[1]}</div></div>`).join('')}
      </div><p class="small muted" style="margin:12px 0 0">Les XLSForm et le projet QField type sont dans le dossier <span class="mono">collecte/</span> du dépôt. En production, les soumissions arrivent automatiquement (webhook Kobo/ODK, synchronisation QFieldCloud) ; l’import de fichier reste disponible en secours.</p></div></section>`;
  }

  /* =========================================================
     MESSAGES
     ========================================================= */
  const CH_IC = {
    'SMS': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 10h8M8 13h5"/></svg>',
    'WhatsApp': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.5-4.1A8 8 0 1 1 20 11.5z"/><path d="M9 9.5c.3 2 2 3.8 4.2 4.4l1.1-1.1 1.7.8"/></svg>',
    'Message vocal': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>'
  };
  PS.CH_IC = CH_IC;
  const fmtDur = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  VIEWS.messages = {
    html() {
      const C = PS.CAMPAIGNS().filter(c => PS.role.edit === 'national' || !c.r || PS.canEdit({ r: c.r, dep: c.dep }));
      const ch = S.msgCh || 'SMS', V = S.voice || {};
      return `<div class="view-head"><div><div class="label">Mobilisation</div><h1>Messages et campagnes</h1><p>Informer en masse une cible de votre périmètre (${esc(editScopeText())}) par SMS, WhatsApp ou message vocal. Seuls les contacts ayant donné leur accord sont comptés et contactés.</p></div></div>
      <div class="grid g-main" style="align-items:start">
        <section class="panel"><header><h3>Campagnes</h3></header><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Campagne</th><th>Canal</th><th>Cible</th><th class="n">Envoyés</th><th class="n">Délivrés</th><th class="n">Réponses</th><th>Statut</th></tr></thead><tbody>
          ${C.map(c => `<tr><td><b>${esc(c.nom)}</b><div class="small muted">${c.st === 'Programmée' ? 'prévue le ' : 'le '}${dayFmt(c.date)}</div></td><td><span class="ch-cell">${CH_IC[c.canal] || ''}${esc(c.canal)}</span>${c.mode ? `<div class="small muted">${esc(c.mode)}${c.duree ? ' · ' + fmtDur(c.duree) : ''}</div>` : ''}</td><td class="small">${esc(c.cible)}</td><td class="n">${c.env ? fmt(c.env) : '—'}</td><td class="n">${c.env ? Math.round(c.deliv / c.env * 100) + ' %' : '—'}</td><td class="n">${c.env ? Math.round(c.rep / c.env * 100) + ' %' : '—'}</td><td><span class="chip ${c.st === 'Envoyée' ? 's-ok' : 's-warn'}">${c.st}</span></td></tr>`).join('') || '<tr><td colspan="7" class="muted">Aucune campagne dans votre périmètre.</td></tr>'}</tbody></table></div></section>
        <section class="panel"><header><h3>Nouvelle campagne</h3></header><div class="body" style="display:grid;gap:12px">
          <div class="field"><label for="mg-n">Nom</label><input id="mg-n" placeholder="Ex. Invitation réunion de quartier" value="${esc(S.msgName || '')}"></div>
          <div class="field"><span class="flabel">Canal</span><div class="seg chan" id="mg-c" role="radiogroup" aria-label="Canal">${Object.keys(CH_IC).map(k => `<button type="button" role="radio" data-ch="${k}" aria-pressed="${ch === k}" aria-checked="${ch === k}">${CH_IC[k]}<span>${k === 'Message vocal' ? 'Vocal' : k}</span></button>`).join('')}</div></div>
          <div class="grid g-2"><div class="field"><label for="mg-s">Statut</label><select id="mg-s"><option value="">Tous</option><option>Militant</option><option>Sympathisant</option><option>Bénévole</option></select></div>
          <div class="field"><label for="mg-t">Étiquette</label><select id="mg-t"><option value="">Toutes</option>${PS.D.TAGS.map(t => `<option>${t}</option>`).join('')}</select></div></div>
          ${ch === 'Message vocal' ? `
          <div class="voice">
            <div class="field"><span class="flabel">Mode de diffusion</span>
              <label class="vopt"><input type="radio" name="vmode" value="Appel vocal automatisé" ${(V.mode || 'Appel vocal automatisé') === 'Appel vocal automatisé' ? 'checked' : ''}><span><b>Appel vocal automatisé</b><span class="small muted">Le serveur vocal appelle chaque contact et diffuse l’enregistrement. Fonctionne sur tous les téléphones, sans internet, pour les publics non lecteurs. Touche 1 pour confirmer sa présence.</span></span></label>
              <label class="vopt"><input type="radio" name="vmode" value="Note vocale WhatsApp" ${V.mode === 'Note vocale WhatsApp' ? 'checked' : ''}><span><b>Note vocale WhatsApp</b><span class="small muted">L’enregistrement est envoyé comme note vocale aux contacts équipés de WhatsApp.</span></span></label>
            </div>
            <div class="field"><label for="mg-lang">Langue de l’enregistrement</label><select id="mg-lang">${['Wolof', 'Français', 'Pulaar', 'Sérère', 'Diola', 'Mandinka', 'Soninké'].map(l => `<option ${V.lang === l ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
            <div class="rec" id="mg-rec">
              ${V.url ? `<audio controls src="${V.url}" style="width:100%"></audio><div class="row small" style="justify-content:space-between"><span class="muted">${esc(V.name || 'Enregistrement')} · ${fmtDur(V.dur || 0)}</span><button type="button" class="btn sm" id="v-clear">Supprimer et refaire</button></div>`
          : `<button type="button" class="micbtn" id="v-rec" aria-label="Enregistrer avec le micro">${CH_IC['Message vocal'].replace(/width="16" height="16"/, 'width="26" height="26"')}</button>
              <div><b id="v-state">Enregistrer avec le micro de l’ordinateur</b><div class="small muted" id="v-hint">Cliquez sur le micro, parlez, puis cliquez à nouveau pour arrêter. 30 à 60 secondes conseillées, 90 s au maximum.</div></div>`}
            </div>
            ${V.url ? '' : `<label class="btn sm" for="v-file" style="justify-self:start">Importer un fichier audio (MP3, WAV, M4A, OGG)</label><input type="file" id="v-file" accept="audio/*" hidden>`}
          </div>` : ''}
          <div class="field"><label for="mg-m">${ch === 'Message vocal' ? 'Script (aide à l’enregistrement, non envoyé)' : 'Message'}</label><textarea id="mg-m">${esc(S.msgText || (ch === 'Message vocal' ? 'Salam aleykoum, ici la section de votre commune. Nous vous invitons à la réunion de quartier samedi à 17 heures, à la permanence. Tapez 1 pour confirmer votre présence.' : 'Bonjour {prénom}, la section {section} vous invite à une réunion samedi à 17 h. Répondez OUI pour confirmer.'))}</textarea><span class="small muted" id="mg-cnt"></span></div>
          <div class="notice" id="mg-est"></div>
          <button class="btn primary" id="mg-ok">Programmer l’envoi</button>
        </div></section>
      </div>`;
    },
    bind() {
      const ch = () => S.msgCh || 'SMS';
      const keep = () => { S.msgName = $('#mg-n').value; S.msgText = $('#mg-m').value; const r = $('input[name=vmode]:checked'); if (r) { S.voice = S.voice || {}; S.voice.mode = r.value; S.voice.lang = $('#mg-lang').value } };
      const est = () => {
        const s = $('#mg-s').value, t = $('#mg-t').value;
        const base = PS.CONTACTS().filter(PS.canSeePII), seg = base.filter(c => (!s || c.role === s) && (!t || c.tags.includes(t)));
        const ok = seg.filter(c => c.consent === 'Oui').length;
        const scope = PS.user.perimetre.type === 'national' ? PS.NAT : PS.D.byId[defaultFocus()];
        const scale = Math.max(1, Math.round(scope.membres * 1.8 / Math.max(1, base.length)));
        const n = ok * scale, V = S.voice || {};
        let extraTxt = '';
        if (ch() === 'Message vocal') { const d = V.dur || 45; extraTxt = (V.mode || 'Appel vocal automatisé') === 'Appel vocal automatisé' ? ` · environ ${fmt(n * Math.ceil(d / 60))} minutes d’appel, ${Math.max(1, Math.round(n / 30 / 60))} h de diffusion avec 30 lignes simultanées.` : ' · envoi aux contacts équipés de WhatsApp.' }
        $('#mg-est').innerHTML = `Segment : <b>${fmt(n)}</b> destinataires estimés (consentement « Oui ») · ${fmt((seg.length - ok) * scale)} exclus faute d’accord${extraTxt}`;
        const m = $('#mg-m').value;
        $('#mg-cnt').textContent = ch() === 'SMS' ? `${m.length} caractères · ${Math.ceil(m.length / 160) || 1} SMS par destinataire` : (ch() === 'Message vocal' ? `Lecture à voix haute : environ ${Math.max(5, Math.round(m.split(/\s+/).length / 2.3))} secondes.` : `${m.length} caractères`);
      };
      $$('[data-ch]').forEach(b => b.addEventListener('click', () => { keep(); if ((S.msgCh || 'SMS') !== b.dataset.ch) S.msgText = ''; S.msgCh = b.dataset.ch; render() }));
      ['mg-s', 'mg-t'].forEach(i => $('#' + i).addEventListener('change', est)); $('#mg-m').addEventListener('input', est);
      $$('input[name=vmode]').forEach(r => r.addEventListener('change', () => { keep(); est() }));
      // Enregistrement au micro (MediaRecorder) ou import de fichier
      const setAudio = (blob, dur, name) => { keep(); if (S.voice && S.voice.url) URL.revokeObjectURL(S.voice.url); S.voice = Object.assign(S.voice || {}, { url: URL.createObjectURL(blob), dur, name }); render(); PS.toast('Enregistrement prêt : écoutez-le avant de programmer l’envoi.') };
      const recBtn = $('#v-rec');
      if (recBtn) recBtn.addEventListener('click', async () => {
        if (S._rec) { S._rec.stop(); return }
        if (!navigator.mediaDevices || !window.MediaRecorder) { PS.toast('Ce navigateur ne permet pas d’enregistrer : importez un fichier audio.'); return }
        let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }) } catch (e) { PS.toast('Accès au micro refusé. Autorisez le micro dans le navigateur, ou importez un fichier audio.'); return }
        const rec = new MediaRecorder(stream), chunks = [], t0 = Date.now(); S._rec = rec;
        rec.ondataavailable = e => chunks.push(e.data);
        rec.onstop = () => { clearInterval(S._recT); stream.getTracks().forEach(t => t.stop()); S._rec = null; setAudio(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }), (Date.now() - t0) / 1000, 'Enregistrement micro') };
        rec.start(); recBtn.classList.add('on'); $('#v-state').textContent = 'Enregistrement… 0:00'; $('#v-hint').textContent = 'Cliquez à nouveau sur le micro pour arrêter.';
        S._recT = setInterval(() => { const s = (Date.now() - t0) / 1000; const st = $('#v-state'); if (st) st.textContent = `Enregistrement… ${fmtDur(s)}`; if (s >= 90 && S._rec) S._rec.stop() }, 250);
      });
      const vf = $('#v-file'); if (vf) vf.addEventListener('change', () => { const f = vf.files[0]; if (!f) return; if (!/^audio\//.test(f.type)) { PS.toast('Ce fichier n’est pas un fichier audio.'); return } const a = new Audio(URL.createObjectURL(f)); a.addEventListener('loadedmetadata', () => setAudio(f, isFinite(a.duration) ? a.duration : 0, f.name)); a.addEventListener('error', () => setAudio(f, 0, f.name)) });
      const vc = $('#v-clear'); if (vc) vc.addEventListener('click', () => { keep(); URL.revokeObjectURL(S.voice.url); S.voice.url = null; S.voice.dur = 0; render() });
      $('#mg-ok').addEventListener('click', () => {
        const n = $('#mg-n').value.trim(); if (!n) { $('#mg-n').focus(); PS.toast('Nommez la campagne avant de la programmer.'); return }
        const c = ch(), V = S.voice || {};
        if (c === 'Message vocal' && !V.url) { PS.toast('Enregistrez le message au micro ou importez un fichier audio.'); return }
        const p = PS.user.perimetre, mode = c === 'Message vocal' ? ($('input[name=vmode]:checked') || {}).value : null;
        extra.campaigns.unshift({ id: 'mx' + Date.now(), nom: n, canal: c, mode: mode ? `${mode} · ${$('#mg-lang').value}` : null, duree: c === 'Message vocal' ? Math.round(V.dur || 0) : null, cible: `${$('#mg-s').value || 'Tous statuts'}${$('#mg-t').value ? ' · ' + $('#mg-t').value : ''} — ${perimLabel()}`, r: p.type === 'region' ? p.nom : (p.type === 'departement' ? PS.D.depts.find(d => d.n === p.nom).r : null), dep: p.type === 'departement' ? p.nom : null, env: 0, deliv: 0, rep: 0, st: 'Programmée', date: 1 });
        PS.log(`a programmé la campagne « ${n} » (${c})`); PS.persist(); S.msgName = ''; S.msgText = ''; if (V.url) { URL.revokeObjectURL(V.url); S.voice = { mode: V.mode, lang: V.lang } } render(); PS.toast(`Campagne « ${n} » programmée pour demain.`);
      });
      est();
    }
  };

  /* =========================================================
     BÉNÉVOLES, AGENDA
     ========================================================= */
  VIEWS.benevoles = {
    html() {
      const mine = PS.D.volunteers.filter(v => PS.canEdit({ r: v.r, dep: v.dep }));
      const list = (PS.role.edit === 'national' || !mine.length) ? PS.D.volunteers : mine;
      const T = PS.unit(S.focus); const teams = (T.level === 'nat' ? PS.D.depts : PS.communesOf(T)).filter(d => d.actives > 0).sort((a, b) => b.actions30 - a.actions30).slice(0, 10);
      const mx = Math.max(1, ...teams.map(t => t.actions30));
      return `<div class="view-head"><div><div class="label">Mobilisation</div><h1>Bénévoles et équipes</h1><p>Points gagnés par portes frappées (2), appels passés (3) et événements encadrés (40). Le classement entretient l’émulation entre sections.</p></div></div>
      <div class="grid g-2" style="align-items:start">
        <section class="panel"><header><h3>Classement des bénévoles</h3><span class="sub">${list === mine && PS.role.edit !== 'national' ? esc(perimLabel()) : 'national'} · 30 derniers jours</span></header><div class="body" style="padding-block:4px">
          ${list.slice(0, 12).map((v, i) => `<div class="leader"><span class="rank">${i + 1}</span><span class="avatar" style="background:${css(AV[i % 4])}">${esc(initials(v.nom))}</span><div style="min-width:0"><b>${esc(v.nom)}</b><div class="small muted">${esc(v.dep)} · ${fmt(v.portes)} portes · ${fmt(v.appels)} appels</div></div><b class="num">${fmt(v.pts)} pts</b></div>`).join('')}
        </div></section>
        <section class="panel"><header><h3>Équipes les plus actives</h3><span class="sub">${esc(PS.terrLabel(T))} · actions sur 30 jours</span></header><div class="body">
          ${teams.map(d => `<div class="progress-row"><span>${esc(d.n)}</span><div class="track"><div class="fill" style="width:${d.actions30 / mx * 100}%"></div></div><span class="num small" style="text-align:right">${d.actions30} actions</span></div>`).join('') || '<p class="muted">Aucune équipe active.</p>'}
          <div class="label" style="margin-top:16px">Badges</div>
          <div class="row" style="margin-top:6px">${['Première porte', '100 appels', 'Recruteur (10 cartes)', 'Caravanier', 'Cartographe QField'].map(b => `<span class="chip s-neutral">${b}</span>`).join('')}</div>
        </div></section>
      </div>`;
    }
  };
  VIEWS.agenda = {
    html() {
      return `<div class="view-head"><div><div class="label">Agenda</div><h1>Événements à venir</h1><p>Réunions de section, caravanes, causeries et meetings, avec suivi des inscriptions.</p></div>${PS.role.edit !== 'aucun' && PS.canModule('actions') ? '<div class="actions"><button class="btn primary" data-new-action data-type="Meeting">+ Nouvel événement</button></div>' : ''}</div>
      <section class="panel"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Événement</th><th>Type</th><th>Lieu</th><th>Inscriptions</th></tr></thead><tbody>
      ${PS.D.events.map(e => { const p = Math.round(e.ins / e.cap * 100); return `<tr><td class="mono">${dayFmt(e.d)}</td><td><b>${esc(e.t)}</b></td><td>${esc(e.type)}</td><td class="small">${esc(e.lieu)}</td><td><div class="bar-cell"><div class="track"><div class="fill ${p < 40 ? 'amber' : ''}" style="width:${p}%"></div></div><span class="num small">${fmt(e.ins)} / ${fmt(e.cap)}</span></div></td></tr>` }).join('')}
      </tbody></table></div></section>`;
    }
  };

  /* =========================================================
     ADMINISTRATION
     ========================================================= */
  VIEWS.admin = {
    html() {
      const can = PS.isAdminGeneral(), tab = S.adminTab || 'comptes';
      const tabs = [['comptes', 'Comptes'], ['roles', 'Rôles et permissions'], ['journal', 'Journal'], ['connecteurs', 'Connecteurs et sécurité']];
      return `<div class="view-head"><div><div class="label">Gouvernance</div><h1>Administration</h1><p>Gérer les comptes, les rôles et leurs permissions, suivre le journal des modifications.${can ? '' : ' Consultation seule : la gestion est réservée à l’administrateur général.'}</p></div></div>
      <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" data-atab="${k}" aria-selected="${tab === k}">${l}</button>`).join('')}</div>
      <div id="adminBody">${({ comptes: adminComptes, roles: adminRoles, journal: adminJournal, connecteurs: adminConn })[tab](can)}</div>`;
    },
    bind() {
      $$('[data-atab]').forEach(b => b.addEventListener('click', () => { S.adminTab = b.dataset.atab; render() }));
      const tab = S.adminTab || 'comptes';
      if (tab === 'comptes') bindComptes(); if (tab === 'roles') bindRoles();
    }
  };
  const MODLIST = PS.MODULES.flatMap(([, items]) => items);
  const EDIT_LBL = { national: 'Tout le Sénégal', region: 'Sa région', departement: 'Son département', aucun: 'Aucune (lecture)' };
  const usersOf = role => PS.USERS.filter(u => u.role === role).length;
  function adminComptes(can) {
    const f = S.userFilter || { q: '', role: '' };
    return `<section class="panel"><header><div class="filters"><input type="search" id="uf-q" placeholder="Nom ou identifiant…" value="${esc(f.q)}" aria-label="Rechercher un compte"><select id="uf-r" aria-label="Rôle"><option value="">Tous les rôles</option>${Object.entries(PS.ROLES).map(([k, r]) => `<option value="${k}" ${f.role === k ? 'selected' : ''}>${esc(r.label)}</option>`).join('')}</select></div>
      <span class="right">${can ? '<button class="btn sm" id="u-reset" title="Revenir aux comptes et rôles d’origine">Réinitialiser la démo</button><button class="btn primary sm" id="u-new">+ Créer un compte</button>' : ''}</span></header>
      <div class="tbl-wrap" id="u-tbl"></div></section>
      ${can ? '<p class="small muted" style="margin-top:10px">« Tester ce profil » ouvre l’application avec les droits du compte choisi, pour vérifier ce qu’il voit et peut modifier. Un bandeau permet de revenir à votre compte.</p>' : PS.lockHTML('Gestion des comptes')}`;
  }
  function bindComptes() {
    const can = PS.isAdminGeneral(); S.userFilter = S.userFilter || { q: '', role: '' };
    const draw = () => {
      const f = S.userFilter, q = f.q.toLowerCase(), me = (PS.impersonator || PS.user).login;
      const rows = PS.USERS.filter(u => (!f.role || u.role === f.role) && (!q || (u.nom + ' ' + u.login).toLowerCase().includes(q)));
      $('#u-tbl').innerHTML = `<table class="tbl"><thead><tr><th>Utilisateur</th><th>Rôle</th><th>Périmètre</th><th>Statut</th>${can ? '<th></th>' : ''}</tr></thead><tbody>${rows.map(u => { const r = PS.ROLES[u.role]; return `<tr><td><b>${esc(u.nom)}</b>${u.login === me ? ' <span class="chip s-neutral">vous</span>' : ''}<div class="small muted mono">${esc(u.login)}</div></td><td>${r ? esc(r.label) : '<span class="chip s-bad">Rôle supprimé</span>'}</td><td>${esc(perimLabel(u))}</td><td><span class="chip ${u.actif === false ? 's-bad' : 's-ok'}">${u.actif === false ? 'Désactivé' : 'Actif'}</span></td>${can ? `<td><div class="row" style="gap:6px;flex-wrap:nowrap;justify-content:flex-end"><button class="btn sm" data-u-edit="${esc(u.login)}">Modifier</button>${u.login !== me ? `<button class="btn sm" data-u-imp="${esc(u.login)}" ${u.actif === false ? 'disabled' : ''}>Tester ce profil</button>` : ''}</div></td>` : ''}</tr>` }).join('') || `<tr><td colspan="5" class="muted">Aucun compte ne correspond.</td></tr>`}</tbody></table>`;
      $$('[data-u-edit]').forEach(b => b.addEventListener('click', () => userForm(PS.USERS.find(u => u.login === b.dataset.uEdit), draw)));
      $$('[data-u-imp]').forEach(b => b.addEventListener('click', () => PS.impersonate(b.dataset.uImp)));
    };
    $('#uf-q').addEventListener('input', e => { S.userFilter.q = e.target.value; draw() });
    $('#uf-r').addEventListener('change', e => { S.userFilter.role = e.target.value; draw() });
    const nb = $('#u-new'); if (nb) nb.addEventListener('click', () => userForm(null, draw));
    const rs = $('#u-reset'); if (rs) rs.addEventListener('click', () => {
      const m = PS.modal('Réinitialiser la démonstration', '<p style="margin:0">Les comptes et les rôles reviennent à leur état d’origine. Les comptes créés et les permissions modifiées seront perdus.</p>', '<button class="btn" data-close>Annuler</button><button class="btn primary" id="rs-ok">Réinitialiser</button>');
      $('#rs-ok', m).addEventListener('click', () => { const me = (PS.impersonator || PS.user).login; PS.resetAdmin(); PS.closeModal(); PS.log('a réinitialisé les comptes et rôles de démonstration'); if (!signIn(me)) { signOut(); return } PS.impersonator = null; shell(); go('admin'); PS.toast('Comptes et rôles réinitialisés.') });
    });
    draw();
  }
  function perimField(roleKey, cur) {
    const e = (PS.ROLES[roleKey] || {}).edit;
    if (e === 'region') return `<div class="field"><label for="uf-pr">Région</label><select id="uf-pr">${PS.D.regions.map(r => `<option ${cur && cur.type === 'region' && cur.nom === r.n ? 'selected' : ''}>${esc(r.n)}</option>`).join('')}</select></div>`;
    if (e === 'departement') return `<div class="field"><label for="uf-pd">Département</label><select id="uf-pd">${PS.D.regions.map(r => `<optgroup label="${esc(r.n)}">${r.children.map(d => `<option ${cur && cur.type === 'departement' && cur.nom === d.n ? 'selected' : ''}>${esc(d.n)}</option>`).join('')}</optgroup>`).join('')}</select></div>`;
    return `<div class="field"><span class="small muted">Périmètre : Sénégal (national)${e === 'aucun' ? ', en lecture seule' : ''}.</span></div>`;
  }
  function userForm(u, after) {
    const isNew = !u, me = (PS.impersonator || PS.user).login;
    const roleKey = u ? u.role : 'admin_section';
    const m = PS.modal(isNew ? 'Créer un compte' : `Modifier le compte ${u.nom}`, `
      <div class="grid g-2">
        <div class="field"><label for="uf-n">Nom complet</label><input id="uf-n" value="${esc(u ? u.nom : '')}" placeholder="Prénom Nom"></div>
        <div class="field"><label for="uf-l">Identifiant</label><input id="uf-l" value="${esc(u ? u.login : '')}" placeholder="ex. section.thies" autocapitalize="none" spellcheck="false" ${isNew ? '' : 'readonly'}></div>
        <div class="field"><label for="uf-p">${isNew ? 'Mot de passe' : 'Nouveau mot de passe'}</label><input id="uf-p" type="text" autocomplete="off" placeholder="${isNew ? '8 caractères minimum' : 'Laisser vide pour ne pas changer'}"></div>
        <div class="field"><label for="uf-role">Rôle</label><select id="uf-role">${Object.entries(PS.ROLES).map(([k, r]) => `<option value="${k}" ${k === roleKey ? 'selected' : ''}>${esc(r.label)}</option>`).join('')}</select></div>
      </div>
      <div id="uf-perim">${perimField(roleKey, u && u.perimetre)}</div>
      <div class="small muted" id="uf-rdesc">${esc((PS.ROLES[roleKey] || {}).desc || '')}</div>
      <label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" id="uf-a" ${!u || u.actif !== false ? 'checked' : ''} ${u && u.login === me ? 'disabled' : ''}> Compte actif</label>
      <p class="notice">Démonstration : les comptes sont enregistrés dans ce navigateur. En production, ils sont créés dans Keycloak et l’utilisateur reçoit un lien d’activation pour choisir son mot de passe.</p>`,
      `${!isNew && u.login !== me ? '<button class="btn" id="uf-del" style="margin-right:auto;color:var(--coral)">Supprimer</button>' : ''}<button class="btn" data-close>Annuler</button><button class="btn primary" id="uf-ok">${isNew ? 'Créer le compte' : 'Enregistrer'}</button>`);
    $('#uf-role', m).addEventListener('change', e => { $('#uf-perim', m).innerHTML = perimField(e.target.value, u && u.perimetre); $('#uf-rdesc', m).textContent = PS.ROLES[e.target.value].desc || '' });
    $('#uf-ok', m).addEventListener('click', () => {
      const nom = $('#uf-n', m).value.trim(), login = $('#uf-l', m).value.trim().toLowerCase(), pw = $('#uf-p', m).value, role = $('#uf-role', m).value;
      if (!nom) { PS.toast('Indiquez le nom de la personne.'); return }
      if (isNew && !/^[a-z0-9][a-z0-9._-]{2,30}$/.test(login)) { PS.toast('Identifiant : 3 à 31 caractères, lettres minuscules, chiffres, point, tiret.'); return }
      if (isNew && PS.USERS.some(x => x.login === login)) { PS.toast(`L’identifiant « ${login} » existe déjà.`); return }
      if (isNew && pw.length < 8 && !(login === 'admin' && pw === 'admin')) { PS.toast('Le mot de passe doit faire au moins 8 caractères.'); return }
      if (!isNew && pw && pw.length < 8) { PS.toast('Le nouveau mot de passe doit faire au moins 8 caractères.'); return }
      const e = PS.ROLES[role].edit;
      const perimetre = e === 'region' ? { type: 'region', nom: $('#uf-pr', m).value } : e === 'departement' ? { type: 'departement', nom: $('#uf-pd', m).value } : { type: 'national' };
      const actif = $('#uf-a', m).checked;
      if (!isNew && u.role === 'admin_general' && (role !== 'admin_general' || !actif) && PS.USERS.filter(x => x.role === 'admin_general' && x.actif !== false).length <= 1) { PS.toast('Il doit rester au moins un administrateur général actif.'); return }
      if (isNew) { PS.USERS.push({ login, password: pw, nom, role, perimetre, actif }); PS.log(`a créé le compte ${login} (${PS.ROLES[role].label})`) }
      else { Object.assign(u, { nom, role, perimetre, actif }); if (pw) u.password = pw; PS.log(`a modifié le compte ${u.login}`) }
      PS.saveAdmin(); PS.closeModal(); PS.toast(isNew ? `Compte ${login} créé.` : `Compte ${u.login} enregistré.`);
      if (!isNew && u.login === PS.user.login) { PS.role = PS.ROLES[u.role]; shell(); go('admin'); return }
      after();
    });
    const del = $('#uf-del', m); if (del) del.addEventListener('click', () => {
      if (u.role === 'admin_general' && PS.USERS.filter(x => x.role === 'admin_general').length <= 1) { PS.toast('Impossible de supprimer le dernier administrateur général.'); return }
      del.outerHTML = `<span style="margin-right:auto;display:flex;gap:6px;align-items:center" class="small">Supprimer définitivement ? <button class="btn sm" id="uf-del2" style="color:var(--coral)">Confirmer</button></span>`;
      $('#uf-del2', m).addEventListener('click', () => { PS.USERS = PS.USERS.filter(x => x !== u); PS.saveAdmin(); PS.log(`a supprimé le compte ${u.login}`); PS.closeModal(); PS.toast(`Compte ${u.login} supprimé.`); after() });
    });
  }
  function adminRoles(can) {
    const head = MODLIST.map(([k, l]) => `<th class="perm" title="${esc(l)}">${esc(l.replace(' & ', ' '))}</th>`).join('');
    return `<section class="panel"><header><h3>Permissions par rôle</h3><span class="sub">cochez les modules accessibles ; la modification reste limitée au périmètre</span><span class="right">${can ? '<button class="btn sm" id="r-new">+ Créer un rôle</button><button class="btn primary sm" id="r-save">Enregistrer les permissions</button>' : ''}</span></header>
      <div class="tbl-wrap"><table class="tbl perm-tbl"><thead><tr><th>Rôle</th>${head}<th>Modification</th><th class="perm">Données nominatives</th><th class="n">Comptes</th>${can ? '<th></th>' : ''}</tr></thead><tbody>
      ${Object.entries(PS.ROLES).map(([k, r]) => { const lock = !can || k === 'admin_general'; return `<tr data-role="${k}"><td><b>${esc(r.label)}</b><div class="small muted mono">${esc(k)}</div></td>${MODLIST.map(([m]) => `<td class="perm"><input type="checkbox" data-mod="${m}" aria-label="${esc(r.label)} : ${esc(m)}" ${r.modules.includes(m) ? 'checked' : ''} ${lock ? 'disabled' : ''}></td>`).join('')}<td><select data-edit ${lock ? 'disabled' : ''} aria-label="Périmètre de modification">${Object.entries(EDIT_LBL).map(([e, l]) => `<option value="${e}" ${r.edit === e ? 'selected' : ''}>${l}</option>`).join('')}</select></td><td class="perm"><input type="checkbox" data-pii ${r.pii ? 'checked' : ''} ${lock ? 'disabled' : ''} aria-label="Données nominatives"></td><td class="n">${usersOf(k)}</td>${can ? `<td>${r.custom ? `<button class="btn sm" data-r-del="${k}" ${usersOf(k) ? 'disabled title="Rôle attribué à des comptes"' : ''}>Supprimer</button>` : ''}</td>` : ''}</tr>` }).join('')}
      </tbody></table></div>
      <div class="body small muted">Le rôle Administrateur général est verrouillé (accès complet) pour éviter de perdre l’accès à l’administration. Tous les rôles consultent la carte du Sénégal entier ; la modification et les données nominatives sont limitées au périmètre du compte. En production, ces règles sont appliquées par l’API et par PostgreSQL (Row-Level Security).</div></section>
      ${can ? '' : PS.lockHTML('Rôles et permissions')}`;
  }
  function bindRoles() {
    const sv = $('#r-save'); if (sv) sv.addEventListener('click', () => {
      $$('tr[data-role]').forEach(tr => { const k = tr.dataset.role; if (k === 'admin_general') return; const r = PS.ROLES[k];
        r.modules = $$('[data-mod]', tr).filter(c => c.checked).map(c => c.dataset.mod); r.edit = $('[data-edit]', tr).value; r.pii = $('[data-pii]', tr).checked;
        if (!r.modules.length) r.modules = ['carte'] });
      PS.saveAdmin(); PS.log('a modifié les permissions des rôles'); PS.role = PS.ROLES[PS.user.role]; shell(); go('admin'); PS.toast('Permissions enregistrées.');
    });
    const nw = $('#r-new'); if (nw) nw.addEventListener('click', () => {
      const m = PS.modal('Créer un rôle', `<div class="grid g-2"><div class="field"><label for="rn-l">Libellé</label><input id="rn-l" placeholder="ex. Responsable communication"></div><div class="field"><label for="rn-b">Partir du rôle</label><select id="rn-b">${Object.entries(PS.ROLES).map(([k, r]) => `<option value="${k}" ${k === 'analyste' ? 'selected' : ''}>${esc(r.label)}</option>`).join('')}</select></div></div><div class="field"><label for="rn-d">Description</label><input id="rn-d" placeholder="Ce que ce rôle peut faire"></div><p class="small muted" style="margin:0">Le nouveau rôle reprend les permissions du rôle de départ ; ajustez-les ensuite dans le tableau.</p>`, '<button class="btn" data-close>Annuler</button><button class="btn primary" id="rn-ok">Créer le rôle</button>');
      $('#rn-ok', m).addEventListener('click', () => {
        const l = $('#rn-l', m).value.trim(); if (!l) { PS.toast('Donnez un libellé au rôle.'); return }
        let k = l.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); if (!k || PS.ROLES[k]) k = (k || 'role') + '_' + Date.now().toString(36).slice(-4);
        const b = PS.ROLES[$('#rn-b', m).value];
        PS.ROLES[k] = { label: l, court: l.length > 18 ? l.slice(0, 17) + '…' : l, desc: $('#rn-d', m).value.trim() || `Rôle créé à partir de « ${b.label} ».`, edit: b.edit === 'national' ? 'aucun' : b.edit, pii: b.pii, modules: b.modules.filter(x => x !== 'admin'), custom: true };
        PS.saveAdmin(); PS.log(`a créé le rôle « ${l} »`); PS.closeModal(); render(); PS.toast(`Rôle « ${l} » créé : réglez ses permissions puis enregistrez.`);
      });
    });
    $$('[data-r-del]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.rDel; const l = PS.ROLES[k].label; delete PS.ROLES[k]; PS.saveAdmin(); PS.log(`a supprimé le rôle « ${l} »`); render(); PS.toast(`Rôle « ${l} » supprimé.`) }));
  }
  function adminJournal() {
    return `<section class="panel"><header><h3>Journal des modifications</h3><span class="sub">qui a fait quoi, et quand</span></header><div class="body feed" style="padding-block:4px">${PS.AUDIT().slice(0, 60).map(a => `<div class="it"><span class="t">${a.t}</span><span><b>${esc(a.u)}</b> ${esc(a.a)}</span></div>`).join('')}</div></section>`;
  }
  function adminConn() {
    const conns = [['CS', 'CivicScope', 'Résultats électoraux par scrutin : régions, départements, communes, bureaux de vote. Score, rang, participation.', 'Connecté', 's-ok'], ['QF', 'QFieldCloud', 'Synchronisation des projets QGIS terrain (sections, permanences, zones).', 'Connecté', 's-ok'], ['KB', 'KoboToolbox', 'Formulaires XLSForm (porte-à-porte, antennes, cartes).', 'Connecté', 's-ok'], ['ODK', 'ODK Central', 'Alternative auto-hébergée pour les formulaires XLSForm.', 'Disponible', 's-neutral'], ['SMS', 'Passerelle SMS (opérateur)', 'Envoi des SMS via l’API de l’opérateur, accusés de réception.', 'À configurer', 's-warn'], ['VOX', 'Serveur vocal (Asterisk)', 'Appels vocaux automatisés : diffusion d’un message enregistré via un trunk SIP opérateur.', 'À configurer', 's-warn'], ['API', 'API REST PoliScope', 'FastAPI + OpenAPI : interconnexion avec les outils du parti.', 'Disponible', 's-neutral']];
    return `<div class="grid g-2" style="align-items:start">
      <section class="panel"><header><h3>Connecteurs et sources</h3></header><div class="body" style="padding-block:4px">${conns.map(c => `<div class="conn"><span class="lg">${c[0]}</span><div class="tx"><b>${c[1]}</b><span class="muted">${c[2]}</span></div><span class="chip ${c[4]}">${c[3]}</span></div>`).join('')}</div></section>
      <div class="stack">
        <section class="panel"><header><h3>Pile technique 100 % open source</h3></header><div class="body small" style="display:grid;gap:8px">
          ${[['Données', 'PostgreSQL 16 + PostGIS 3 (limites administratives CEGIT, maillage, CRM)'], ['API', 'FastAPI (Python), OpenAPI 3, Martin pour les tuiles vectorielles'], ['Identité', 'Keycloak (OpenID Connect), rôles et périmètres'], ['Cartographie', 'Leaflet, fonds OpenStreetMap'], ['Terrain', 'QField / QFieldCloud, KoboToolbox, ODK Central'], ['Messages vocaux', 'Asterisk (serveur vocal), trunk SIP opérateur'], ['Rapports', 'jsPDF (navigateur) ; WeasyPrint côté serveur'], ['Exploitation', 'Docker Compose, Nginx, MinIO, pgBackRest']].map(r => `<div><b>${r[0]}</b> · <span class="muted">${r[1]}</span></div>`).join('')}
        </div></section>
        <section class="panel"><header><h3>Protection des données</h3></header><div class="body" style="display:grid;gap:10px;font-size:14px">
          <div><b>Cadre légal</b><div class="muted">Loi n° 2008-12 sur la protection des données à caractère personnel ; déclaration du traitement auprès de la CDP.</div></div>
          <div><b>Minimisation</b><div class="muted">Aucune donnée d’opinion, d’ethnie ou de religion. Numéros masqués, nominatifs limités au périmètre.</div></div>
          <div><b>Consentement</b><div class="muted">Recueilli à la saisie, daté, renouvelé tous les 24 mois.</div></div>
          <div><b>Hébergement</b><div class="muted">Option d’hébergement au Sénégal ; sauvegardes chiffrées, exports tracés.</div></div>
        </div></section>
      </div></div>`;
  }

  /* ================= Démarrage ================= */
  async function boot() {
    const app = document.getElementById('app');
    try {
      const geo = PS.GEO || Object.fromEntries(await Promise.all(['regions', 'departements', 'communes'].map(async n => { const r = await fetch(`assets/data/${n}.geojson`); if (!r.ok) throw new Error(n); return [n, await r.json()] })));
      PS.D = PS.buildData(geo);
    } catch (e) {
      app.innerHTML = `<div style="padding:40px;max-width:640px"><h1>PoliScope ne peut pas charger ses données</h1><p>Les fichiers <span class="mono">assets/data/*.geojson</span> sont introuvables. Ouvrez l’application via un serveur web (GitHub Pages, ou <span class="mono">python -m http.server</span> à la racine du dépôt) plutôt qu’en double-cliquant sur le fichier.</p></div>`;
      return;
    }
    // modifications locales de la démo
    for (const [id, v] of Object.entries(extra.edits)) { const s = PS.D.sections.find(x => x.id === id); if (s) Object.assign(s, v) }
    for (const [id, v] of Object.entries(extra.actState)) { const x = PS.D.actions.find(y => y.id === id); if (x) Object.assign(x, v) }
    for (const [id, v] of Object.entries(extra.remState)) { const x = PS.D.remontees.find(y => y.id === id); if (x) x.statut = v }
    PS.NAT = natUnit();
    MAXINS = { dep: Math.max(...PS.D.depts.map(d => d.inscrits)), com: Math.max(...PS.D.communes.map(d => d.inscrits)), reg: Math.max(...PS.D.regions.map(d => d.inscrits)) };
    loadAdmin();
    let login = null, imp = null; try { login = sessionStorage.getItem(SKEY); imp = sessionStorage.getItem(IMPKEY) } catch (e) { }
    if (login && signIn(login)) { if (imp) PS.impersonator = PS.USERS.find(x => x.login === imp) || null; shell(); const h = location.hash.slice(1); go(VIEWS[h] && PS.canModule(h) ? h : PS.role.modules[0]) } else renderLogin();
    const rr = () => { if (!$('.modal-bg') && PS.user) render() };
    try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', rr) } catch (e) { }
    new MutationObserver(rr).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }
  PS.boot = boot;
})(window.PS);
