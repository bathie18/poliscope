/* PoliScope — rapports PDF territoriaux (jsPDF + jsPDF-AutoTable, licence MIT) et exports de données.
   Le rapport contient : la carte du territoire (typologie, sections, coordinations), le tableau de bord,
   les sous-territoires, la liste géolocalisée des sections et coordinations, les recommandations. */
window.PS = window.PS || {};
(function (PS) {
  'use strict';
  const { $, $$, esc, fmt, dayFmt } = PS.U;
  const S = PS.S;
  // Palette fixe pour l'impression (indépendante du thème clair/sombre de l'écran)
  const PAL = { teal: '#0b6466', amber: '#c98a12', peri: '#5d6fe0', coral: '#c4533a', grey: '#7a8a87', ink: '#14211f', line: '#c9d4d2', land: '#f3f5f2', rail: '#0f2b2b' };
  const TYPO_PRINT = { bastion: PAL.teal, concurrentielle: '#a3aead', renforcer: PAL.amber, conquerir: PAL.peri };
  const STAT = { 'Active': PAL.teal, 'À relancer': PAL.amber, 'Inactive': PAL.coral };
  const clean = s => String(s ?? '').replace(/[  ]/g, ' ').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/•/g, '-').replace(/→/g, '->').replace(/·/g, '-');
  const nf = n => clean(fmt(n));

  if (!S.report) S.report = { terr: null, scale: null, model: 'complet', history: [] };

  function childrenOf(u) { return u.level === 'nat' ? PS.D.regions : u.level === 'reg' ? u.children : u.level === 'dep' ? u.children : [u] }
  function geomsOf(u) { return u.level === 'nat' ? PS.D.regions.map(r => r.geom) : [u.geom] }
  function bboxOf(gs) { const a = [180, 90, -180, -90]; for (const g of gs) { const b = PS.D.bbox(g); a[0] = Math.min(a[0], b[0]); a[1] = Math.min(a[1], b[1]); a[2] = Math.max(a[2], b[2]); a[3] = Math.max(a[3], b[3]) } return a }

  /* ---------- Carte du territoire dessinée sur canvas ---------- */
  PS.drawTerritoryMap = function (cv, u, opts) {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height, pad = 36;
    const bb = bboxOf(geomsOf(u)); const lat0 = (bb[1] + bb[3]) / 2, kx = Math.cos(lat0 * Math.PI / 180);
    const sx = (W - 2 * pad) / ((bb[2] - bb[0]) * kx || 1), sy = (H - 2 * pad) / ((bb[3] - bb[1]) || 1), k = Math.min(sx, sy);
    const ox = (W - (bb[2] - bb[0]) * kx * k) / 2, oy = (H - (bb[3] - bb[1]) * k) / 2;
    const P = ([x, y]) => [ox + (x - bb[0]) * kx * k, H - oy - (y - bb[1]) * k];
    const path = geom => { const ps = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates; g.beginPath(); for (const p of ps) for (const ring of p) { ring.forEach((pt, i) => { const [x, y] = P(pt); i ? g.lineTo(x, y) : g.moveTo(x, y) }); g.closePath() } };
    g.fillStyle = '#eef4f6'; g.fillRect(0, 0, W, H);
    // contexte : territoires voisins
    const ctx = u.level === 'nat' ? [] : u.level === 'reg' ? PS.D.regions.filter(r => r !== u) : u.level === 'dep' ? PS.D.depts.filter(d => d !== u) : PS.D.communes.filter(c => c.dep === u.dep && c !== u);
    for (const v of ctx) { path(v.geom); g.fillStyle = '#e4e8e6'; g.fill('evenodd'); g.strokeStyle = '#ffffff'; g.lineWidth = 1; g.stroke() }
    const kids = childrenOf(u);
    for (const c of kids) { path(c.geom); g.fillStyle = TYPO_PRINT[PS.typo(c)]; g.globalAlpha = 0.78; g.fill('evenodd'); g.globalAlpha = 1; g.strokeStyle = '#ffffff'; g.lineWidth = 1.4; g.stroke() }
    for (const gg of geomsOf(u)) { path(gg); g.strokeStyle = PAL.rail; g.lineWidth = 2.6; g.stroke() }
    if (opts.positions) {
      const secs = PS.sectionsOf(u);
      const r = Math.max(3.5, Math.min(7, 900 / Math.sqrt(secs.length + 50)));
      for (const s of secs) { const [x, y] = P([s.lng, s.lat]); g.beginPath(); g.arc(x, y, r, 0, 7); g.fillStyle = STAT[s.statut]; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1.2; g.stroke() }
      const inU = c => u.level === 'nat' || (u.level === 'reg' && c.r === u.n) || (u.level === 'dep' && c.dep === u.n) || (u.level === 'com' && c.dep === u.dep && PS.D.inGeom([c.lng, c.lat], u.geom));
      for (const c of PS.D.coordsDep.filter(inU)) { const [x, y] = P([c.lng, c.lat]); g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.fillStyle = PAL.teal; g.strokeStyle = '#fff'; g.lineWidth = 2; g.fillRect(-7, -7, 14, 14); g.strokeRect(-7, -7, 14, 14); g.restore() }
      for (const c of PS.D.coordsReg.filter(c => u.level === 'nat' || c.r === u.r || c.r === u.n)) { if (u.level === 'com' && !PS.D.inGeom([c.lng, c.lat], u.geom)) continue; const [x, y] = P([c.lng, c.lat]); g.fillStyle = PAL.rail; g.fillRect(x - 11, y - 11, 22, 22); g.strokeStyle = PAL.amber; g.lineWidth = 2.5; g.strokeRect(x - 11, y - 11, 22, 22); g.fillStyle = '#fff'; g.font = 'bold 12px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('R', x, y + 1) }
    }
    if (kids.length > 1 && kids.length <= 40) {
      g.font = `600 ${kids.length > 20 ? 13 : 16}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const c of kids) { const [x, y] = P([c.lng, c.lat]); g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,.9)'; g.strokeText(c.n, x, y); g.fillStyle = PAL.ink; g.fillText(c.n, x, y) }
    }
    // nord + échelle
    g.fillStyle = PAL.ink; g.beginPath(); g.moveTo(W - 40, 26); g.lineTo(W - 50, 54); g.lineTo(W - 40, 48); g.lineTo(W - 30, 54); g.closePath(); g.fill(); g.font = 'bold 14px sans-serif'; g.textAlign = 'center'; g.fillText('N', W - 40, 70);
    const kmPerPx = 111.32 * kx / (k * kx) * kx; // degrés -> km (approx.)
    const target = (W * 0.18) * (111.32 * kx) / (kx * k); const nice = [1, 2, 5, 10, 20, 25, 50, 100, 200][[1, 2, 5, 10, 20, 25, 50, 100, 200].findIndex(v => v >= target * 0.6)] || 200;
    const px = nice / (111.32 * kx) * kx * k; g.fillStyle = PAL.ink; g.fillRect(24, H - 30, px, 6); g.fillStyle = '#fff'; g.fillRect(24 + px / 2, H - 29, px / 2 - 1, 4); g.fillStyle = PAL.ink; g.font = '13px sans-serif'; g.textAlign = 'left'; g.fillText(`${nice} km`, 28 + px, H - 25);
    void kmPerPx;
  };

  /* ---------- Vue Rapports ---------- */
  const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const SCALES = [['reg', 'Régions', () => PS.D.regions], ['dep', 'Départements', () => PS.D.depts], ['com', 'Communes', () => PS.D.communes]];
  const OPTS = [['carte', 'Carte du territoire (typologie)'], ['positions', 'Position des sections et coordinations'], ['tableau', 'Tableau de bord et statistiques'], ['sous', 'Indicateurs des sous-territoires'], ['sections', 'Liste géolocalisée des sections'], ['histo', 'Historique des actions terminées'], ['recos', 'Recommandations']];
  const MODELS = {
    complet: { l: 'Rapport complet', d: 'Carte, tableau de bord, sous-territoires, sections, actions, recommandations.', o: ['carte', 'positions', 'tableau', 'sous', 'sections', 'histo', 'recos'] },
    synthese: { l: 'Fiche de synthèse', d: 'Une page : carte et chiffres clés, pour une réunion ou un entretien.', o: ['carte', 'positions', 'tableau'] },
    maillage: { l: 'Rapport maillage', d: 'Carte et liste géolocalisée des sections et coordinations.', o: ['carte', 'positions', 'sections'] },
    activite: { l: 'Bilan d’activité terrain', d: 'Chiffres clés, actions terminées et leurs bilans, recommandations.', o: ['tableau', 'histo', 'recos'] }
  };
  const LVL = { nat: 'Pays', reg: 'Région', dep: 'Département', com: 'Commune' };
  function parentLabel(u) { return u.level === 'com' ? `${u.dep} · ${u.r}` : u.level === 'dep' ? `Région de ${u.r}` : u.level === 'reg' ? 'Sénégal' : '' }
  function perimId() { const p = PS.user.perimetre; if (p.type === 'region') return PS.D.regions.find(r => r.n === p.nom).id; if (p.type === 'departement') return PS.D.depts.find(d => d.n === p.nom).id; return 'nat' }
  PS.VIEWS.rapports = {
    html() {
      const R = S.report;
      if (!R.terr) R.terr = S.focus || 'nat';
      if (!R.scale) { const u = PS.unit(R.terr); R.scale = u.level === 'nat' ? 'dep' : u.level }
      if (!R.model) R.model = 'complet'; if (!R.history) R.history = [];
      const ex = [['csv-sub', 'Indicateurs des sous-territoires', 'CSV · une ligne par région, département ou commune du territoire choisi'], ['geo-com', 'Communes + indicateurs', 'GeoJSON · géométries et indicateurs, pour QGIS ou un WebSIG'], ['geo-sec', 'Sections et coordinations', 'GeoJSON · points géolocalisés, statut, effectifs'], ['csv-act', 'Actions terrain', 'CSV · type, territoire, équipe, objectif, réalisé, bilan']];
      return `<div class="view-head"><div><div class="label">Rapports</div><h1>Rapports territoriaux</h1><p>Choisissez une échelle, recherchez la localité, puis le modèle de rapport. Le PDF contient la carte du territoire, la position des sections et coordinations, le tableau de bord et les statistiques.</p></div></div>
      <div class="report-grid">
        <div class="stack">
          <section class="panel"><header><h3>1 · Territoire</h3></header><div class="body" style="display:grid;gap:12px">
            <div class="scale-tiles" role="radiogroup" aria-label="Échelle">${SCALES.map(([k, l, f]) => `<button type="button" role="radio" data-scale="${k}" aria-checked="${R.scale === k}" aria-pressed="${R.scale === k}"><b>${l}</b><span class="num">${f().length}</span></button>`).join('')}</div>
            <div class="search"><input type="search" id="rpQ" autocomplete="off" placeholder="Rechercher ${R.scale === 'reg' ? 'une région' : R.scale === 'dep' ? 'un département' : 'une commune'}…" aria-label="Rechercher une localité" aria-controls="rpRes"><div class="sr" id="rpRes" role="listbox"></div></div>
            <div class="row" style="gap:6px"><button type="button" class="btn sm" data-quick="nat">Sénégal entier</button>${PS.user.perimetre.type !== 'national' ? `<button type="button" class="btn sm" data-quick="perim">Mon périmètre</button>` : ''}</div>
            <div class="terr-card" id="rpSel"></div>
          </div></section>
          <section class="panel"><header><h3>2 · Modèle</h3></header><div class="body" style="display:grid;gap:10px">
            <div class="model-cards">${Object.entries(MODELS).map(([k, m]) => `<label class="mcard"><input type="radio" name="rpModel" value="${k}" ${R.model === k ? 'checked' : ''}><span><b>${m.l}</b><span class="small muted">${m.d}</span></span></label>`).join('')}</div>
            <details class="checks"><summary class="small" style="cursor:pointer">Ajuster le contenu</summary><div class="checks" style="margin-top:8px">${OPTS.map(([k, l]) => `<label><input type="checkbox" data-opt="${k}" ${MODELS[R.model].o.includes(k) || (R.custom && R.custom[k]) ? 'checked' : ''}> ${l}</label>`).join('')}</div></details>
          </div></section>
          <button class="btn primary" id="rpGo" style="justify-content:center;padding-block:10px">Générer le PDF</button>
        </div>
        <div class="stack">
          <section class="panel"><header><h3>Aperçu de la carte</h3><span class="sub" id="rpSub"></span></header><div class="body"><div class="report-prev"><canvas id="rpCanvas" width="1600" height="1100" aria-label="Aperçu de la carte du rapport"></canvas></div>
            <div class="legend" style="flex-direction:row;flex-wrap:wrap;gap:6px 16px;margin-top:10px">${Object.keys(PS.TYPO).map(t => `<span class="li"><span class="sw" style="background:${TYPO_PRINT[t]}"></span>${PS.TYPO[t].l}</span>`).join('')}${Object.keys(STAT).map(s => `<span class="li"><span class="sdot" style="background:${STAT[s]}"></span>Section ${s.toLowerCase()}</span>`).join('')}<span class="li"><span class="coord-icon" style="width:10px;height:10px;background:${PAL.teal}"></span>Coord. départementale</span><span class="li"><span class="hq-icon" style="width:16px;height:16px;font-size:8px">R</span>Coord. régionale</span></div></div></section>
          <section class="panel"><header><h3>Rapports générés</h3><span class="sub">cette session</span></header><div class="body" id="rpHist"></div></section>
        </div>
      </div>
      <h2 style="font-size:18px;margin:26px 0 12px">Exports de données</h2>
      <div class="grid g-2">${ex.map(e => `<section class="panel"><div class="body row" style="justify-content:space-between;flex-wrap:nowrap"><div style="min-width:0"><b>${e[1]}</b><div class="small muted">${e[2]}</div></div><button class="btn" data-exp="${e[0]}">Exporter</button></div></section>`).join('')}</div>`;
    },
    bind() {
      const R = S.report;
      const opts = () => Object.fromEntries(OPTS.map(([k]) => [k, !!($(`[data-opt="${k}"]`) || {}).checked]));
      const prev = () => { const u = PS.unit(R.terr); $('#rpSub').textContent = PS.terrLabel(u); PS.drawTerritoryMap($('#rpCanvas'), u, opts()) };
      const card = () => {
        const u = PS.unit(R.terr); const t = PS.typo(u);
        $('#rpSel').innerHTML = `<div class="small muted">${LVL[u.level]}${u.level !== 'nat' ? ' · ' + esc(parentLabel(u)) : ''}</div><b style="font-size:17px;font-family:var(--f-display)">${esc(u.n)}</b>
          <div class="row" style="gap:6px;margin-top:4px">${PS.typoChip(t)}<span class="chip s-neutral">Priorité ${PS.priority(u)}/100</span></div>
          <div class="kv" style="margin-top:8px"><div><div class="k">Population</div><div class="v" style="font-size:14px">${fmt(u.pop)}</div></div><div><div class="k">Sections</div><div class="v" style="font-size:14px">${u.sections}</div></div><div><div class="k">Couverture</div><div class="v" style="font-size:14px">${u.level === 'com' ? (u.couv ? 'Oui' : 'Non') : u.couv + ' %'}</div></div><div><div class="k">Score électoral</div><div class="v" style="font-size:14px">${PS.U.pct(u.score, 1)}</div></div></div>`;
      };
      const pick = id => { R.terr = id; $('#rpQ').value = ''; $('#rpRes').innerHTML = ''; card(); prev() };
      const search = () => {
        const q = norm($('#rpQ').value.trim()), list = SCALES.find(s => s[0] === R.scale)[2]();
        let hits, title;
        if (!q) { hits = [...list].sort((a, b) => b.pop - a.pop).slice(0, 6); title = 'Les plus peuplées' }
        else { hits = list.filter(u => norm(u.n).includes(q) || norm(parentLabel(u)).includes(q)).sort((a, b) => (norm(a.n).startsWith(q) ? 0 : 1) - (norm(b.n).startsWith(q) ? 0 : 1) || a.n.localeCompare(b.n)).slice(0, 10); title = hits.length ? `${hits.length === 10 ? '10 premiers' : hits.length} résultat${hits.length > 1 ? 's' : ''}` : '' }
        $('#rpRes').innerHTML = hits.length ? `<div class="sr-title">${title}</div>` + hits.map((u, i) => `<button type="button" role="option" data-pick="${u.id}" class="${i === 0 && q ? 'first' : ''}"><span><b>${esc(u.n)}</b><span class="small muted"> · ${esc(parentLabel(u))}</span></span><span class="small muted num">${fmt(u.pop)} hab.</span></button>`).join('') : `<div class="sr-title">Aucune localité ne correspond à « ${esc($('#rpQ').value)} » dans les ${SCALES.find(s => s[0] === R.scale)[1].toLowerCase()}.</div>`;
        $$('[data-pick]').forEach(b => b.addEventListener('mousedown', e => { e.preventDefault(); pick(b.dataset.pick) }));
      };
      $$('[data-scale]').forEach(b => b.addEventListener('click', () => { R.scale = b.dataset.scale; $$('[data-scale]').forEach(x => { x.setAttribute('aria-pressed', x === b); x.setAttribute('aria-checked', x === b) }); $('#rpQ').placeholder = `Rechercher ${R.scale === 'reg' ? 'une région' : R.scale === 'dep' ? 'un département' : 'une commune'}…`; $('#rpQ').focus(); search() }));
      $('#rpQ').addEventListener('input', search); $('#rpQ').addEventListener('focus', search);
      $('#rpQ').addEventListener('blur', () => setTimeout(() => { const r = $('#rpRes'); if (r) r.innerHTML = '' }, 150));
      $('#rpQ').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const f = $('[data-pick]'); if (f) pick(f.dataset.pick) } if (e.key === 'Escape') { $('#rpRes').innerHTML = '' } });
      $$('[data-quick]').forEach(b => b.addEventListener('click', () => pick(b.dataset.quick === 'nat' ? 'nat' : perimId())));
      $$('input[name=rpModel]').forEach(r => r.addEventListener('change', () => { R.model = r.value; $$('[data-opt]').forEach(c => c.checked = MODELS[R.model].o.includes(c.dataset.opt)); prev() }));
      $$('[data-opt]').forEach(c => c.addEventListener('change', prev));
      const hist = () => { $('#rpHist').innerHTML = R.history.length ? `<div class="feed">${R.history.map((h, i) => `<div class="it" style="grid-template-columns:52px minmax(0,1fr) auto"><span class="t">${h.t}</span><span><b>${esc(h.label)}</b><div class="small muted">${esc(MODELS[h.model] ? MODELS[h.model].l : 'Personnalisé')} · ${h.pages} page${h.pages > 1 ? 's' : ''}</div></span><button class="btn sm" data-regen="${i}">Régénérer</button></div>`).join('')}</div>` : '<p class="small muted" style="margin:0">Aucun rapport généré pour l’instant. Les rapports produits apparaissent ici et sont inscrits au journal.</p>'; $$('[data-regen]').forEach(b => b.addEventListener('click', () => { const h = R.history[+b.dataset.regen]; buildPDF(PS.unit(h.terr), h.opts) })) };
      $('#rpGo').addEventListener('click', () => {
        const u = PS.unit(R.terr), o = opts();
        if (!Object.values(o).some(Boolean)) { PS.toast('Cochez au moins un contenu pour le rapport.'); return }
        const n = buildPDF(u, o); if (!n) return;
        const h = new Date(); R.history.unshift({ t: `${String(h.getHours()).padStart(2, '0')}:${String(h.getMinutes()).padStart(2, '0')}`, terr: R.terr, label: PS.terrLabel(u), model: R.model, pages: n, opts: o }); R.history.splice(12); hist();
      });
      $$('[data-exp]').forEach(b => b.addEventListener('click', () => doExport(b.dataset.exp)));
      card(); prev(); hist();
    }
  };

  /* ---------- Génération PDF ---------- */
  function buildPDF(u, O) {
    if (!window.jspdf) { PS.toast('Le module PDF n’est pas chargé.'); return }
    const { jsPDF } = window.jspdf; const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, M = 14; let y = 0;
    const kids = childrenOf(u).filter(c => c !== u);
    const head = (title) => { doc.setFillColor(PAL.rail); doc.rect(0, 0, W, 24, 'F'); doc.setTextColor('#ffffff'); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text('PoliScope', M, 11); doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor('#c9dcda'); doc.text('Pilotage territorial - CEGIT', M, 17); doc.setTextColor('#f6d48a'); doc.text(clean(title), W - M, 11, { align: 'right' }); doc.setTextColor('#c9dcda'); doc.text(clean(`${dayFmt(0)} 2026 - ${PS.user.nom} (${PS.role.court})`), W - M, 17, { align: 'right' }); doc.setTextColor(PAL.ink); y = 32 };
    const h2 = t => { if (y > 260) { doc.addPage(); head(PS.terrLabel(u)) } doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(PAL.teal); doc.text(clean(t), M, y); doc.setTextColor(PAL.ink); y += 6 };
    head(PS.terrLabel(u));
    doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.text(clean(`Rapport territorial - ${PS.terrLabel(u)}`), M, y + 4); y += 11;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor('#4a5b58');
    doc.text(doc.splitTextToSize(clean(`Typologie : ${PS.TYPO[PS.typo(u)].l}. Score de priorité : ${PS.priority(u)}/100. Résultats : CivicScope (scrutin de référence). Maillage et activité : PoliScope. Population : RGPH-5 (ANSD, 2023)${u.level === 'com' ? ', estimée à la commune' : ''}. Données du parti simulées (démonstration).`), W - 2 * M), M, y); y += 11; doc.setTextColor(PAL.ink);
    // KPI
    const kp = [['Sections actives', `${nf(u.actives)} / ${nf(u.sections)}`], ['Couverture', `${u.couv} %`], ['Membres', nf(u.membres)], ['Cartes 2026', `${nf(u.cartes)} (${Math.round(u.cartes / Math.max(1, u.objCartes) * 100)} %)`], ['Score électoral', clean(PS.U.pct(u.score, 1))], ['Participation', clean(PS.U.pct(u.participation, 1))]];
    const bw = (W - 2 * M - 5 * 3) / 6;
    kp.forEach((k, i) => { const x = M + i * (bw + 3); doc.setFillColor('#f6f8f8'); doc.setDrawColor(PAL.line); doc.roundedRect(x, y, bw, 17, 1.5, 1.5, 'FD'); doc.setFontSize(6.5); doc.setTextColor('#7a8a87'); doc.text(clean(k[0].toUpperCase()), x + 2, y + 5); doc.setFontSize(10.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(PAL.ink); doc.text(clean(k[1]), x + 2, y + 12.5); doc.setFont('helvetica', 'normal') });
    y += 23;
    if (O.carte || O.positions) {
      const cv = document.createElement('canvas'); cv.width = 1600; cv.height = 1100; PS.drawTerritoryMap(cv, u, O);
      const iw = W - 2 * M, ih = iw * 1100 / 1600; doc.addImage(cv.toDataURL('image/jpeg', 0.9), 'JPEG', M, y, iw, ih); doc.setDrawColor(PAL.line); doc.rect(M, y, iw, ih); y += ih + 4;
      doc.setFontSize(8); let lx = M;
      const lg = [...Object.keys(PS.TYPO).map(t => [TYPO_PRINT[t], PS.TYPO[t].l, 'sq']), ...(O.positions ? Object.keys(STAT).map(s => [STAT[s], 'Section ' + s.toLowerCase(), 'ci']) : [])];
      lg.forEach(([c, l, sh]) => { doc.setFillColor(c); sh === 'sq' ? doc.rect(lx, y - 2.6, 3, 3, 'F') : doc.circle(lx + 1.5, y - 1.1, 1.4, 'F'); doc.text(clean(l), lx + 4.5, y); lx += doc.getTextWidth(clean(l)) + 9 }); y += 8;
    }
    if (O.tableau) {
      if (y > 215) { doc.addPage(); head(PS.terrLabel(u)) }
      h2('Tableau de bord');
      const rows = [['Inscrits', nf(u.inscrits)], ['Rang du parti', PS.RANG[u.rang].l], ['Évolution du score', `${(u.score - u.scorePrev) >= 0 ? '+' : ''}${(u.score - u.scorePrev).toFixed(1)} pt`], ['1er concurrent', clean(PS.U.pct(u.rival, 1))], ['Population', nf(u.pop)], ['Densité', `${nf(u.densite)} hab./km²`], ['Communes', nf(u.communes)], ['Sections inactives (> 90 j)', nf(u.inactives)], ['Membres pour 10 000 hab.', String(u.membres10k).replace('.', ',')], ['Actions (30 j)', nf(u.actions30)], ['Tendance d\'activité (90 j)', `${u.activityTrend > 0 ? '+' : ''}${u.activityTrend} %`], ['Indice d\'accessibilité', String(u.access).replace('.', ',')]];
      const half = Math.ceil(rows.length / 2);
      doc.autoTable({ startY: y, margin: { left: M, right: M }, theme: 'grid', styles: { fontSize: 8.5, cellPadding: 1.6, lineColor: PAL.line }, headStyles: { fillColor: PAL.teal }, head: [['Indicateur', 'Valeur', 'Indicateur', 'Valeur']], body: rows.slice(0, half).map((r, i) => [clean(r[0]), clean(r[1]), clean((rows[half + i] || ['', ''])[0]), clean((rows[half + i] || ['', ''])[1])]), columnStyles: { 1: { halign: 'right', fontStyle: 'bold' }, 3: { halign: 'right', fontStyle: 'bold' } } });
      y = doc.lastAutoTable.finalY + 8;
      const tc = { bastion: 0, concurrentielle: 0, renforcer: 0, conquerir: 0 }; (kids.length ? kids : [u]).forEach(c => tc[PS.typo(c)]++);
      doc.setFontSize(9); doc.text(clean(`Typologie des ${kids.length ? (u.level === 'nat' ? 'régions' : u.level === 'reg' ? 'départements' : 'communes') : 'territoires'} : ` + Object.keys(tc).map(k => `${PS.TYPO[k].l} ${tc[k]}`).join(' - ')), M, y); y += 8;
    }
    if (O.sous && kids.length) {
      if (y > 230) { doc.addPage(); head(PS.terrLabel(u)) }
      h2(`Indicateurs des ${u.level === 'nat' ? 'régions' : u.level === 'reg' ? 'départements' : 'communes'}`);
      doc.autoTable({ startY: y, margin: { left: M, right: M }, theme: 'striped', styles: { fontSize: 8, cellPadding: 1.4 }, headStyles: { fillColor: PAL.teal }, head: [['Territoire', 'Typologie', 'Score', 'Rang', 'Particip.', 'Couv.', 'Sections', 'Membres', 'Priorité']],
        body: [...kids].sort((a, b) => PS.priority(b) - PS.priority(a)).map(c => [clean(c.n), clean(PS.TYPO[PS.typo(c)].l), clean(PS.U.pct(c.score, 1)), PS.RANG[c.rang].l, clean(PS.U.pct(c.participation, 0)), `${c.couv} %`, nf(c.sections), nf(c.membres), String(PS.priority(c))]),
        columnStyles: { 2: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right', fontStyle: 'bold' } },
        didParseCell: d => { if (d.section === 'body' && d.column.index === 1) { const k = Object.keys(PS.TYPO).find(t => clean(PS.TYPO[t].l) === d.cell.raw); if (k) d.cell.styles.textColor = TYPO_PRINT[k] === '#a3aead' ? '#5c6866' : TYPO_PRINT[k] } } });
      y = doc.lastAutoTable.finalY + 8;
    }
    if (O.sections || O.positions) {
      const secs = PS.sectionsOf(u);
      doc.addPage(); head(PS.terrLabel(u));
      h2(`Sections et antennes (${secs.length}) - positions`);
      doc.autoTable({ startY: y, margin: { left: M, right: M }, theme: 'striped', styles: { fontSize: 7.5, cellPadding: 1.2 }, headStyles: { fillColor: PAL.teal }, head: [['Section', 'Commune', 'Niveau', 'Statut', 'Responsable', 'Membres', 'Latitude', 'Longitude']],
        body: secs.slice(0, 600).map(s => [clean(s.name), clean(s.communeName), clean(s.level), clean(s.statut), PS.canSeePII(s) ? clean(s.resp) : '-', nf(s.membres), s.lat.toFixed(5), s.lng.toFixed(5)]),
        columnStyles: { 5: { halign: 'right' }, 6: { halign: 'right', font: 'courier' }, 7: { halign: 'right', font: 'courier' } },
        didParseCell: d => { if (d.section === 'body' && d.column.index === 3) d.cell.styles.textColor = STAT[{ 'Active': 'Active', 'A relancer': 'À relancer', 'Inactive': 'Inactive' }[d.cell.raw] || 'À relancer'] } });
      y = doc.lastAutoTable.finalY + 8;
      const inU = c => u.level === 'nat' || c.r === u.n || (u.level === 'dep' && c.dep === u.n) || (u.level === 'com' && c.dep === u.dep);
      const co = [PS.D.hq, ...PS.D.coordsReg, ...PS.D.coordsDep].filter(c => u.level === 'nat' ? true : u.level === 'reg' ? c.r === u.n : inU(c));
      if (co.length) { if (y > 250) { doc.addPage(); head(PS.terrLabel(u)) } h2('Siège et coordinations'); doc.autoTable({ startY: y, margin: { left: M, right: M }, theme: 'striped', styles: { fontSize: 8, cellPadding: 1.3 }, headStyles: { fillColor: PAL.rail }, head: [['Structure', 'Type', 'Responsable', 'Latitude', 'Longitude']], body: co.map(c => [clean(c.name), clean(c.type), clean(c.resp), c.lat.toFixed(4), c.lng.toFixed(4)]) }); y = doc.lastAutoTable.finalY + 8 }
    }
    if (O.histo) {
      const hs = PS.histOf(u).filter(a => a.end >= -180);
      if (y > 230) { doc.addPage(); head(PS.terrLabel(u)) }
      h2(`Actions terminées - 6 derniers mois (${hs.length})`);
      if (!hs.length) { doc.setFontSize(9); doc.text(clean('Aucune action terminée sur ce territoire depuis six mois.'), M, y); y += 8 }
      else {
        doc.autoTable({ startY: y, margin: { left: M, right: M }, theme: 'striped', styles: { fontSize: 7.8, cellPadding: 1.4 }, headStyles: { fillColor: PAL.teal }, head: [['Terminée le', 'Action', 'Type', 'Objectif', 'Réalisé', 'Atteinte', 'Bilan']],
          body: hs.slice(0, 80).map(a => { const b = a.bilan || {}; const res = b.favorables != null ? `${b.favorables} favorables, ${b.indecis} indécis, ${b.refus} refus, ${b.absents} absents` : b.cartes != null ? `${b.cartes} cartes placées` : b.participants != null ? `${b.participants} participants` : 'à saisir'; return [clean(dayFmt(a.end)), clean(a.t), clean(a.type), nf(a.obj), nf(a.done), `${a.obj ? Math.round(a.done / a.obj * 100) : 0} %`, clean(res + (b.resume ? '. ' + b.resume : ''))] }),
          columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right', fontStyle: 'bold' }, 6: { cellWidth: 62 } } });
        y = doc.lastAutoTable.finalY + 8;
      }
    }
    if (O.recos) {
      if (y > 240) { doc.addPage(); head(PS.terrLabel(u)) }
      h2('Recommandations');
      const pool = (kids.length ? kids : [u]).map(c => ({ c, p: PS.priority(c) })).sort((a, b) => b.p - a.p).slice(0, 6);
      doc.setFontSize(9);
      for (const { c, p } of pool) { const r = PS.recos(c); const txt = clean(`${c.n} (priorité ${p}/100) : ${r.length ? r.map(x => x[1]).join(' ') : 'maintenir l\'effort actuel.'}`); const lines = doc.splitTextToSize(txt, W - 2 * M - 4); if (y + lines.length * 4.4 > 282) { doc.addPage(); head(PS.terrLabel(u)) } doc.setFillColor(PAL.amber); doc.rect(M, y - 3, 1.2, lines.length * 4.4, 'F'); doc.text(lines, M + 4, y); y += lines.length * 4.4 + 3 }
    }
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor('#7a8a87'); doc.text(clean('PoliScope (c) CEGIT - démonstration, données du parti simulées - limites GADM v4.1 (provisoire)'), M, 291); doc.text(`${i} / ${n}`, W - M, 291, { align: 'right' }) }
    const name = `PoliScope_rapport_${PS.terrLabel(u).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_')}.pdf`;
    try { doc.save(name); PS.log(`a généré le rapport PDF « ${PS.terrLabel(u)} »`); PS.toast(`Rapport ${name} généré (${n} pages).`); return n } catch (e) { PS.toast('Le navigateur a bloqué le téléchargement du PDF.'); return 0 }
  }
  PS.buildPDF = buildPDF;

  /* ---------- Exports ---------- */
  const csv = rows => rows.map(r => r.map(v => { v = String(v ?? ''); return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v }).join(';')).join('\n');
  function download(name, txt, type) { try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: type + ';charset=utf-8' })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); PS.log(`a exporté ${name}`); PS.toast(`Export ${name} téléchargé.`) } catch (e) { PS.toast('Téléchargement bloqué par le navigateur.') } }
  function doExport(k) {
    const u = PS.unit(S.report.terr || 'nat'), slug = PS.terrLabel(u).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_');
    if (k === 'csv-sub') { const ks = childrenOf(u); download(`poliscope_${slug}_indicateurs.csv`, csv([['territoire', 'niveau', 'region', 'departement', 'population', 'inscrits', 'participation', 'score', 'rang', 'couverture', 'sections', 'membres', 'cartes', 'priorite', 'typologie'], ...ks.map(c => [c.n, c.level, c.r, c.dep || '', c.pop, c.inscrits, c.participation, c.score, c.rang, c.couv, c.sections, c.membres, c.cartes, PS.priority(c), PS.TYPO[PS.typo(c)].l])]), 'text/csv') }
    if (k === 'geo-com') { const cs = PS.communesOf(u); download(`poliscope_${slug}_communes.geojson`, JSON.stringify({ type: 'FeatureCollection', features: cs.map(c => ({ type: 'Feature', properties: { commune: c.n, departement: c.dep, region: c.r, score: c.score, rang: c.rang, participation: c.participation, section_active: c.couv > 0, membres: c.membres, priorite: PS.priority(c), typologie: PS.TYPO[PS.typo(c)].l }, geometry: c.geom })) }), 'application/geo+json') }
    if (k === 'geo-sec') { const ss = PS.sectionsOf(u); download(`poliscope_${slug}_sections.geojson`, JSON.stringify({ type: 'FeatureCollection', features: ss.map(s => ({ type: 'Feature', properties: { nom: 'Section ' + s.name, niveau: s.level, commune: s.communeName, departement: s.dep, statut: s.statut, responsable: PS.canSeePII(s) ? s.resp : null, membres: s.membres }, geometry: { type: 'Point', coordinates: [s.lng, s.lat] } })) }, null, 1), 'application/geo+json') }
    if (k === 'csv-act') download(`poliscope_${slug}_actions.csv`, csv([['action', 'type', 'departement', 'statut', 'equipe', 'objectif', 'realise'], ...PS.ACTIONS().filter(a => PS.inUnit(a, u)).map(a => [a.t, a.type, a.dep, a.st, a.team, a.obj, a.done])]), 'text/csv');
  }
})(window.PS);
