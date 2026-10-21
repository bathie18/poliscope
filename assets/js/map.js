/* PoliScope — carte stratégique (Leaflet).
   Fonds : OpenStreetMap ou fond blanc. Échelles : régions, départements, communes.
   Panneaux « Couches » et « Légende » intégrés à la carte. */
window.PS = window.PS || {};
(function (PS) {
  'use strict';
  const { $, $$, esc, fmt, pct, css, ago, dayFmt } = PS.U;
  const S = PS.S;
  const M = { m: null, base: null, g: {}, layerById: {} };
  const RCOL = { 'Favorable': '--teal', 'Viendra': '--teal', 'Indécis': '--amber', 'À rappeler': '--amber', 'Pas intéressé': '--coral', 'Refus': '--coral', 'Absent': '--ink-3', 'Pas de réponse': '--ink-3' };
  const ST = { 'Active': 's-ok', 'À relancer': 's-warn', 'Inactive': 's-bad' };
  const statCol = s => css({ 'Active': '--teal', 'À relancer': '--amber', 'Inactive': '--coral' }[s]);
  const unitsAt = lvl => lvl === 'reg' ? PS.D.regions : lvl === 'dep' ? PS.D.depts : PS.D.communes;
  const wide = () => window.innerWidth > 980;

  PS.mapDestroy = function () { if (M.m) { try { M.m.remove() } catch (e) { } M.m = null } };

  PS.VIEWS.carte = {
    html() {
      if (S.map.sel && S.map.sel.t !== 'sec' && !PS.D.byId[S.map.sel.id]) S.map.sel = null;
      const canDraw = PS.role.edit !== 'aucun' && PS.canModule('actions');
      return `<div class="mapview ${S.map.sel ? '' : 'nodetail'}" id="mapview">
        <div class="mapwrap">
          <div id="map" aria-label="Carte stratégique du Sénégal"></div>
          <div class="mp-col">
            <details class="mp mp-layers" ${wide() ? 'open' : ''}><summary>Couches</summary><div class="mpb" id="mpLayers"></div></details>
            <details class="mp mp-legend" ${wide() ? 'open' : ''}><summary>Légende</summary><div class="mpb" id="mpLegend"></div></details>
          </div>
          <div class="mp mp-tools">${canDraw ? '<button class="btn sm" id="drawBtn" title="Délimiter un secteur de porte-à-porte">✎ Zone d’action</button>' : ''}<button class="btn sm" id="fitBtn">⌖ Mon périmètre</button><button class="btn sm" id="natBtn">Sénégal</button></div>
          <div id="mapHint"></div>
        </div>
        <aside class="detail" id="detail"></aside>
      </div>`;
    },
    bind() {
      renderLayersPanel(); renderLegend();
      $('#fitBtn').addEventListener('click', fitPerimeter);
      $('#natBtn').addEventListener('click', () => M.m.fitBounds(L.geoJSON({ type: 'FeatureCollection', features: PS.D.regions.map(r => ({ type: 'Feature', geometry: r.geom })) }).getBounds(), { padding: [10, 10] }));
      const db = $('#drawBtn'); if (db) db.addEventListener('click', startDraw);
      buildMap();
      refreshDetail();
    }
  };

  /* ---------------- Panneau Couches ---------------- */
  function renderLayersPanel() {
    const I = PS.INDICATORS[S.map.ind], L_ = S.map.layers;
    const nSec = PS.D.sections.length, nCo = PS.D.coordsReg.length + PS.D.coordsDep.length + 1;
    $('#mpLayers').innerHTML = `
      <div class="grpbox"><div class="label">Fond de plan</div><div class="seg" id="baseSeg">${[['osm', 'OpenStreetMap'], ['blank', 'Fond blanc']].map(([k, l]) => `<button data-base="${k}" aria-pressed="${S.map.base === k}">${l}</button>`).join('')}</div></div>
      <div class="grpbox"><div class="label">Échelle</div><div class="seg" id="lvlSeg">${Object.entries(PS.LEVELS).map(([k, l]) => `<button data-lvl="${k}" aria-pressed="${S.map.level === k}">${l}</button>`).join('')}</div></div>
      <div class="grpbox"><label class="label" for="indSel">Indicateur</label><select id="indSel">${Object.entries(PS.INDICATORS).map(([k, v]) => `<option value="${k}" ${k === S.map.ind ? 'selected' : ''}>${v.l}</option>`).join('')}</select>
        <div class="ind-desc">${esc(I.desc)}<span class="src">Source : ${esc(I.source)}</span></div>
        <button class="linkbtn" data-info="${S.map.ind}" style="align-self:flex-start">Calcul et usage de l’indicateur</button></div>
      <div class="grpbox"><div class="label">Couches</div>
        ${[['coords', `Siège et coordinations (${nCo})`], ['sections', `Sections et antennes (${nSec})`], ['iso', 'Zones desservies (~30 min)'], ['zones', 'Zones d’action dessinées'], ['remontees', `Remontées terrain (${PS.REMONTEES().length})`], ['labels', 'Noms des territoires']].map(([k, l]) => `<label class="opt"><input type="checkbox" id="ly-${k}" data-layer="${k}" ${L_[k] ? 'checked' : ''}> ${l}</label>`).join('')}
      </div>`;
    $('#baseSeg').addEventListener('click', e => { const b = e.target.closest('[data-base]'); if (!b) return; S.map.base = b.dataset.base; renderLayersPanel(); drawBase(); drawChoro() });
    $('#lvlSeg').addEventListener('click', e => { const b = e.target.closest('[data-lvl]'); if (!b) return; S.map.level = b.dataset.lvl; renderLayersPanel(); renderLegend(); drawChoro(); drawLabels() });
    $('#indSel').addEventListener('change', e => { S.map.ind = e.target.value; renderLayersPanel(); renderLegend(); drawChoro() });
    $$('[data-layer]').forEach(c => c.addEventListener('change', () => { S.map.layers[c.dataset.layer] = c.checked; renderLegend(); drawOverlays(); drawLabels() }));
  }

  /* ---------------- Légende ---------------- */
  function renderLegend() {
    const k = S.map.ind, I = PS.INDICATORS[k], L_ = S.map.layers;
    let h = `<div class="legend"><h4>${esc(I.l)} · ${esc(PS.LEVELS[S.map.level].toLowerCase())}</h4>`;
    if (k === 'typo') h += Object.keys(PS.TYPO).map(t => `<div class="li"><span class="sw" style="background:${css(PS.TYPO[t].c)}"></span>${PS.TYPO[t].l}</div>`).join('') + `<div class="li"><span class="sw" style="background:transparent;border:2px dashed ${css('--coral')}"></span>À surveiller (contour)</div>`;
    else if (k === 'rang') h += Object.values(PS.RANG).map(r => `<div class="li"><span class="sw" style="background:${css(r.c)}"></span>${r.l}</div>`).join('');
    else if (I.div) h += `<div class="ramp" style="background:linear-gradient(90deg,${css('--coral')},${css('--land-0')},${css('--teal')})"></div><div class="ramp-l"><span>−45 %</span><span>0</span><span>+35 %</span></div>`;
    else h += `<div class="ramp" style="background:linear-gradient(90deg,${PS.U.mix(css(I.ramp[0]), css(I.ramp[1]), .08)},${css(I.ramp[1])})"></div><div class="ramp-l"><span>${I.min}${I.u}</span><span>${I.max}${I.u}</span></div>`;
    if (L_.coords) h += `<h4>Organisation</h4><div class="li"><span class="hq-icon" style="width:18px;height:16px;font-size:8px">QG</span>Siège national</div><div class="li"><span class="hq-icon" style="width:16px;height:16px;font-size:8px">R</span>Coordination régionale</div><div class="li"><span class="coord-icon" style="width:11px;height:11px;margin:0 3px"></span>Coordination départementale</div>`;
    if (L_.sections) h += `<h4>Sections</h4>${['Active', 'À relancer', 'Inactive'].map(s => `<div class="li"><span class="sdot" style="background:${statCol(s)}"></span>${s}${s === 'Active' ? ' (< 30 j)' : s === 'Inactive' ? ' (> 90 j)' : ' (30–90 j)'}</div>`).join('')}`;
    if (L_.iso) h += `<div class="li"><span class="sw" style="background:${css('--teal')};opacity:.3;border-radius:50%"></span>Desserte ~30 min d’une section</div>`;
    if (L_.zones) h += `<div class="li"><span class="sw" style="background:transparent;border:2px dashed ${css('--amber')}"></span>Zone d’action</div>`;
    if (L_.remontees) h += `<h4>Remontées terrain</h4>${[['Favorable / viendra', '--teal'], ['Indécis / à rappeler', '--amber'], ['Pas intéressé / refus', '--coral'], ['Absent / pas de réponse', '--ink-3']].map(([l, c]) => `<div class="li"><span class="sdot" style="background:${css(c)};width:7px;height:7px"></span>${l}</div>`).join('')}`;
    h += `<p class="small muted" style="margin:6px 0 0">Limites : GADM v4.1 (provisoire). Données du parti simulées.</p></div>`;
    $('#mpLegend').innerHTML = h;
  }

  /* ---------------- Carte ---------------- */
  function buildMap() {
    M.m = L.map('map', { zoomSnap: 0.25, minZoom: 6, maxZoom: 16, zoomControl: false, attributionControl: true });
    M.m.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
    M.m.setView([14.4, -14.6], 7, { animate: false });
    L.control.zoom({ position: 'bottomright' }).addTo(M.m);
    L.control.scale({ metric: true, imperial: false, position: 'bottomright' }).addTo(M.m);
    M.g = { choro: L.featureGroup().addTo(M.m), remontees: L.layerGroup().addTo(M.m), iso: L.layerGroup().addTo(M.m), zones: L.layerGroup().addTo(M.m), sections: L.layerGroup().addTo(M.m), coords: L.layerGroup().addTo(M.m), labels: L.layerGroup().addTo(M.m), draw: L.layerGroup().addTo(M.m) };
    M.m.createPane('iso'); M.m.getPane('iso').style.zIndex = 420;
    drawBase(); drawChoro(); drawOverlays();
    M.m.on('zoomend', drawLabels);
    M.m.on('click', e => { if (S.map.drawing) { S.map.drawing.pts.push([+e.latlng.lat.toFixed(5), +e.latlng.lng.toFixed(5)]); drawSketch() } });
    if (S.map.sel) zoomToSel(); else fitPerimeter();
    drawLabels();
    setTimeout(() => { if (!M.m) return; M.m.invalidateSize(); if (S.map.sel) zoomToSel(); else fitPerimeter() }, 120);
  }
  function drawBase() {
    if (M.base) { M.m.removeLayer(M.base); M.base = null }
    if (S.map.base === 'osm') M.base = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">contributeurs OpenStreetMap</a>' }).addTo(M.m);
    M.m.attributionControl.addAttribution('Limites : GADM v4.1');
  }
  function styleOf(u) {
    const sel = S.map.sel && S.map.sel.id === u.id;
    const surv = S.map.ind === 'typo' && PS.surveiller(u);
    const osm = S.map.base === 'osm';
    return { color: sel ? css('--ink') : (surv ? css('--coral') : (osm ? '#ffffff' : css('--surface'))), weight: sel ? 3 : (surv ? 2 : (S.map.level === 'com' ? 0.6 : 1)), dashArray: surv && !sel ? '5 4' : null, fillColor: PS.indColor(S.map.ind, u), fillOpacity: osm ? 0.62 : 0.9 };
  }
  function drawChoro() {
    M.g.choro.clearLayers(); M.layerById = {};
    // contour des régions toujours visible pour se repérer
    for (const u of unitsAt(S.map.level)) {
      const lyr = L.geoJSON({ type: 'Feature', geometry: u.geom }, { style: styleOf(u) });
      lyr.bindTooltip(() => `<b>${esc(u.n)}</b>${u.level !== 'reg' ? ` <span style="opacity:.75">· ${esc(u.level === 'com' ? u.dep : u.r)}</span>` : ''}<br>${esc(PS.INDICATORS[S.map.ind].l)} : <b>${esc(PS.indText(S.map.ind, u))}</b>`, { className: 'ps-tip', sticky: true });
      lyr.on('click', e => { if (S.map.drawing) return; L.DomEvent.stopPropagation(e); select({ t: 'unit', id: u.id }) });
      lyr.addTo(M.g.choro); M.layerById[u.id] = lyr;
    }
    if (S.map.level !== 'reg') L.geoJSON({ type: 'FeatureCollection', features: PS.D.regions.map(r => ({ type: 'Feature', geometry: r.geom })) }, { interactive: false, style: { color: css('--rail'), weight: 1.6, fill: false, opacity: .7 } }).addTo(M.g.choro);
  }
  function restyle() { for (const u of unitsAt(S.map.level)) { const l = M.layerById[u.id]; if (l) l.setStyle(styleOf(u)) } }
  function drawLabels() {
    if (!M.m) return; M.g.labels.clearLayers(); if (!S.map.layers.labels) return;
    const z = M.m.getZoom(), lvl = S.map.level, b = M.m.getBounds().pad(0.1);
    let us = unitsAt(lvl);
    if (lvl === 'com' && z < 9.5) us = z >= 8 ? PS.D.depts : PS.D.regions;
    if (lvl === 'dep' && z < 7.5) us = us.filter(d => d.km2 > 3500);
    for (const u of us) { const c = u.level === 'reg' ? [u.lat, u.lng] : [u.lat, u.lng]; if (!b.contains(c)) continue; L.tooltip({ permanent: true, direction: 'center', className: 'ps-lbl', interactive: false }).setLatLng(c).setContent(esc(u.n)).addTo(M.g.labels) }
  }
  function drawOverlays() {
    const L_ = S.map.layers;
    ['iso', 'zones', 'sections', 'coords', 'remontees'].forEach(k => M.g[k].clearLayers());
    if (L_.remontees) PS.REMONTEES().filter(r => r.statut !== 'Hors périmètre').forEach(r => L.circleMarker([r.lat, r.lng], { radius: 3.5, weight: 0.8, color: '#fff', fillColor: css(RCOL[r.resultat] || '--ink-3'), fillOpacity: 0.95 }).bindTooltip(`<b>${esc(r.resultat)}</b> · ${esc(r.type)}<br>${esc(r.commune)} · ${esc(PS.U.dayFmt(r.jour))} · ${esc(r.outil)}<br><span style="opacity:.75">${esc(r.actionT)}</span>`, { className: 'ps-tip' }).addTo(M.g.remontees));
    if (L_.iso) PS.D.sections.filter(s => s.statut !== 'Inactive').forEach(s => L.circle([s.lat, s.lng], { pane: 'iso', radius: s.r === 'Dakar' ? 2500 : 12000, interactive: false, stroke: false, fillColor: css('--teal'), fillOpacity: 0.16 }).addTo(M.g.iso));
    if (L_.zones) PS.ACTIONS().filter(a => a.zone).forEach(a => L.polygon(a.zone, { color: css('--amber'), weight: 2, dashArray: '6 4', fillColor: css('--amber'), fillOpacity: 0.18 }).bindTooltip(`<b>${esc(a.t)}</b><br>${esc(a.type)} · ${esc(a.st)}`, { className: 'ps-tip', sticky: true }).addTo(M.g.zones));
    if (L_.sections) PS.D.sections.forEach(s => {
      const sel = S.map.sel && S.map.sel.id === s.id;
      const mk = L.circleMarker([s.lat, s.lng], { radius: sel ? 8 : 5, color: '#fff', weight: 1.5, fillColor: statCol(s.statut), fillOpacity: 1 });
      mk.bindTooltip(`<b>Section ${esc(s.name)}</b><br>${esc(s.communeName)} · ${esc(s.statut)} · ${fmt(s.membres)} membres`, { className: 'ps-tip' });
      mk.on('click', e => { L.DomEvent.stopPropagation(e); if (S.map.drawing) { S.map.drawing.pts.push([+e.latlng.lat.toFixed(5), +e.latlng.lng.toFixed(5)]); drawSketch(); return } select({ t: 'sec', id: s.id }) });
      mk.addTo(M.g.sections);
    });
    if (L_.coords) {
      const mk = (p, html, cls, size) => L.marker([p.lat, p.lng], { icon: L.divIcon({ className: '', html: `<div class="${cls}">${html}</div>`, iconSize: size, iconAnchor: [size[0] / 2, size[1] / 2] }) }).bindTooltip(`<b>${esc(p.name)}</b><br>${esc(p.resp)}`, { className: 'ps-tip' });
      PS.D.coordsDep.forEach(c => mk(c, '', 'coord-icon', [14, 14]).addTo(M.g.coords));
      PS.D.coordsReg.forEach(c => mk(c, 'R', 'hq-icon', [22, 22]).addTo(M.g.coords));
      mk(PS.D.hq, 'QG', 'hq-icon', [26, 22]).addTo(M.g.coords);
    }
  }
  function boundsOf(geoms) { return L.geoJSON({ type: 'FeatureCollection', features: geoms.map(g => ({ type: 'Feature', geometry: g })) }).getBounds() }
  function fitPerimeter() {
    const p = PS.user.perimetre;
    const gs = p.type === 'national' ? PS.D.regions.map(r => r.geom) : p.type === 'region' ? [PS.D.regions.find(r => r.n === p.nom).geom] : [PS.D.depts.find(d => d.n === p.nom).geom];
    M.m.fitBounds(boundsOf(gs), { padding: [16, 16] });
  }
  function zoomToSel() {
    const s = S.map.sel; if (!s) return;
    if (s.t === 'sec') { const x = PS.D.sections.find(y => y.id === s.id); if (x) M.m.setView([x.lat, x.lng], 11); return }
    const u = PS.D.byId[s.id]; if (u) M.m.fitBounds(boundsOf([u.geom]), { padding: [30, 30], maxZoom: 12 });
  }
  function select(sel) {
    S.map.sel = sel;
    const mv = $('#mapview'); const was = mv.classList.contains('nodetail');
    mv.classList.toggle('nodetail', !sel);
    restyle(); if (S.map.layers.sections) drawOverlays();
    refreshDetail();
    if (was !== !sel) setTimeout(() => M.m && M.m.invalidateSize(), 30);
  }
  PS.mapSelect = select;

  /* ---------------- Fiche de détail ---------------- */
  function refreshDetail() {
    const el = $('#detail'); if (!el) return;
    el.innerHTML = detailHTML(); el.scrollTop = 0;
    $$('[data-close-detail]', el).forEach(b => b.addEventListener('click', () => select(null)));
    $$('[data-sel]', el).forEach(b => b.addEventListener('click', () => { const id = b.dataset.sel; const u = PS.D.byId[id]; if (u && u.level !== S.map.level) { S.map.level = u.level; renderLayersPanel(); renderLegend(); drawChoro(); drawLabels() } select(u ? { t: 'unit', id } : { t: 'sec', id }); zoomToSel() }));
    $$('[data-hact]', el).forEach(b => b.addEventListener('click', () => PS.actionCard(PS.ACTIONS().find(a => a.id === b.dataset.hact), refreshDetail)));
    const ha = $('[data-hall]', el); if (ha) ha.addEventListener('click', () => { S.actTab = 'historique'; S.hist = { per: '180', terr: S.map.sel.id, type: '', q: '' }; PS.go('actions') });
    $$('[data-drill]', el).forEach(b => b.addEventListener('click', () => { S.map.level = b.dataset.drill; renderLayersPanel(); renderLegend(); drawChoro(); drawLabels(); zoomToSel() }));
    const es = $('[data-edit-sec]', el); if (es) es.addEventListener('click', () => PS.editSection(es.dataset.editSec, () => { drawOverlays(); refreshDetail() }));
    const sim = $('#simN', el);
    if (sim) {
      const u = PS.D.byId[S.map.sel.id];
      const upd = () => {
        const n = +sim.value; $('#simOut').textContent = n;
        const nc = Math.min(100, Math.round((u.communes * u.couv / 100 + n) / u.communes * 100));
        const d2 = { ...u, couv: nc, activityTrend: Math.min(35, u.activityTrend + n * 6) };
        $('#simRes').innerHTML = `<div><div class="k">Couverture après</div><div class="v">${nc} % <span class="small" style="color:${css('--ok')}">+${nc - u.couv}</span></div></div><div><div class="k">Membres attendus</div><div class="v">+${fmt(n * (u.r === 'Dakar' ? 140 : 85))}</div></div><div><div class="k">Priorité après</div><div class="v">${PS.priority(d2)}<span class="muted" style="font-size:13px"> / ${PS.priority(u)}</span></div></div><div><div class="k">Typologie après</div><div class="v" style="font-size:13px">${PS.typoChip(PS.typo(d2))}</div></div>`;
      };
      sim.addEventListener('input', upd); upd();
    }
  }
  function detailHTML() {
    const s = S.map.sel; if (!s) return '';
    if (s.t === 'sec') {
      const x = PS.D.sections.find(y => y.id === s.id); if (!x) return '';
      const ed = PS.canEdit(x);
      return `<div class="dh"><button class="close" data-close-detail aria-label="Fermer la fiche">×</button><div class="label">${esc(x.level)}</div><h2>Section ${esc(x.name)}</h2><div class="row"><span class="chip ${ST[x.statut]}">${x.statut}</span><span class="small muted">${esc(x.communeName)} · ${esc(x.dep)} · ${esc(x.r)}</span></div></div>
      <div class="sec"><div class="kv"><div><div class="k">Membres</div><div class="v">${fmt(x.membres)}</div></div><div><div class="k">Cartes 2026</div><div class="v">${fmt(x.cartes)}</div></div><div><div class="k">Dernière activité</div><div class="v" style="font-size:14px">${ago(x.last)}</div></div><div><div class="k">Créée en</div><div class="v">${x.creee}</div></div></div></div>
      <div class="sec"><div class="label">Responsable</div><div><b>${esc(x.resp)}</b>${ed && PS.role.pii ? `<div class="small muted mono">${esc(x.tel)}</div>` : '<div class="small muted">Coordonnées réservées aux responsables du périmètre</div>'}</div>
        <div class="small muted">Position : <span class="mono">${x.lat.toFixed(5)}, ${x.lng.toFixed(5)}</span> (relevé QField)</div></div>
      <div class="sec">${ed ? `<div class="row"><button class="btn primary sm" data-edit-sec="${x.id}">Modifier la fiche</button><button class="btn sm" data-new-action data-dep="${esc(x.dep)}" data-type="${x.statut === 'Active' ? 'Porte-à-porte' : 'Réunion de section'}">+ Planifier une action</button></div>` : PS.lockHTML('Fiche en lecture seule')}
        <button class="btn sm" data-sel="${PS.D.byId[x.commune].id}" style="align-self:flex-start">Fiche de la commune</button></div>`;
    }
    const u = PS.D.byId[s.id]; if (!u) return '';
    const t = PS.typo(u), P = PS.priority(u), diff = u.score - u.scorePrev, others = +(100 - u.score - u.rival).toFixed(1), ed = PS.canEdit(u);
    const W = 300, bar = (v, c) => `<rect x="0" y="0" width="${v / 100 * W}" height="16" fill="${c}"/>`;
    const lvlLbl = { reg: 'Région', dep: 'Département · ' + u.r, com: 'Commune · ' + u.dep + ' · ' + u.r }[u.level];
    let kids = '';
    if (u.level === 'reg') kids = `<div class="sec"><div class="label">Départements</div><div class="mini-list">${u.children.map(d => `<button data-sel="${d.id}"><span style="flex:1">${esc(d.n)}</span>${PS.typoChip(PS.typo(d))}</button>`).join('')}</div><button class="btn sm" data-drill="dep" style="align-self:flex-start">Afficher l’échelle départementale</button></div>`;
    if (u.level === 'dep') kids = `<div class="sec"><div class="label">Communes (${u.children.length}) · par priorité</div><div class="mini-list">${[...u.children].sort((a, b) => PS.priority(b) - PS.priority(a)).map(c => `<button data-sel="${c.id}"><span class="num" style="width:26px;font-weight:600">${PS.priority(c)}</span><span style="flex:1">${esc(c.n)}</span>${PS.typoChip(PS.typo(c))}</button>`).join('')}</div><button class="btn sm" data-drill="com" style="align-self:flex-start">Afficher l’échelle communale</button></div>`;
    if (u.level === 'com') { const ss = PS.D.sections.filter(x => x.commune === u.id); kids = `<div class="sec"><div class="label">Sections (${ss.length})</div>${ss.length ? `<div class="mini-list">${ss.map(x => `<button data-sel="${x.id}"><span class="sdot" style="background:${statCol(x.statut)}"></span><span style="flex:1">Section ${esc(x.name)}</span><span class="small muted">${fmt(x.membres)} m.</span></button>`).join('')}</div>` : '<span class="small muted">Aucune section : commune en « zone blanche ».</span>'}</div>` }
    const sim = u.level === 'dep' && ed ? `<div class="sec"><div class="label">Scénario : ouvrir de nouvelles antennes</div>
      <div class="w-row"><label for="simN">Antennes à ouvrir</label><output id="simOut" class="num">2</output><input type="range" id="simN" min="0" max="${Math.max(3, u.communes - Math.round(u.communes * u.couv / 100))}" value="2"></div><div class="kv" id="simRes"></div></div>` : '';
    const rec = PS.recos(u);
    return `<div class="dh"><button class="close" data-close-detail aria-label="Fermer la fiche">×</button><div class="label">${esc(lvlLbl)}</div><h2>${esc(u.n)}</h2>
      <div class="row">${PS.typoChip(t)}${PS.surveiller(u) ? PS.survChip : ''}<span class="chip s-neutral">Priorité ${P}/100</span></div></div>
    <div class="sec"><div class="label">Scrutin de référence · CivicScope (simulé)</div>
      <svg viewBox="0 0 ${W} 16" width="100%" height="16" preserveAspectRatio="none" role="img" aria-label="Répartition des voix">${bar(100, css('--line'))}<g>${bar(u.score, css('--teal'))}</g><g transform="translate(${u.score / 100 * W},0)">${bar(u.rival, css('--peri'))}</g></svg>
      <div class="row small" style="justify-content:space-between"><span><b style="color:${css('--teal')}">Notre parti ${pct(u.score, 1)}</b> (${diff >= 0 ? '+' : ''}${diff.toFixed(1)} pt)</span><span style="color:${css('--peri')}">1er concurrent ${pct(u.rival, 1)}</span><span class="muted">Autres ${pct(others, 1)}</span></div>
      <div class="kv"><div><div class="k">Rang</div><div class="v">${PS.RANG[u.rang].l}</div></div><div><div class="k">Participation</div><div class="v">${pct(u.participation, 1)}</div></div><div><div class="k">Inscrits</div><div class="v">${fmt(u.inscrits)}</div></div></div></div>
    <div class="sec"><div class="label">Implantation</div><div class="kv">
      <div><div class="k">Sections (actives)</div><div class="v">${u.sections} <span class="muted" style="font-size:13px">(${u.actives})</span></div></div>
      <div><div class="k">${u.level === 'com' ? 'Section active' : 'Couverture communale'}</div><div class="v">${u.level === 'com' ? (u.couv ? 'Oui' : 'Non') : u.couv + ' %'}</div></div>
      <div><div class="k">Membres / 10 000 hab.</div><div class="v">${u.membres10k}</div></div>
      <div><div class="k">Cartes / objectif</div><div class="v">${Math.round(u.cartes / Math.max(1, u.objCartes) * 100)} %</div></div>
      <div><div class="k">Actions (30 j)</div><div class="v">${u.actions30}</div></div>
      <div><div class="k">Tendance activité</div><div class="v" style="color:${u.activityTrend < 0 ? css('--coral') : css('--ok')}">${u.activityTrend > 0 ? '+' : ''}${u.activityTrend} %</div></div></div></div>
    <div class="sec"><div class="label">Contexte territorial</div><div class="kv">
      <div><div class="k">Population ${u.level === 'com' ? '(estimée)' : '(RGPH-5)'}</div><div class="v">${fmt(u.pop)}</div></div><div><div class="k">Densité (hab./km²)</div><div class="v">${fmt(u.densite)}</div></div>
      <div><div class="k">Superficie</div><div class="v">${fmt(u.km2)} km²</div></div><div><div class="k">Accessibilité</div><div class="v">${u.access.toLocaleString('fr-FR')}</div></div></div></div>
    <div class="sec"><div class="label">Recommandations</div>${rec.map(r => `<div class="reco"><span class="ic">${r[0]}</span><div style="flex:1">${esc(r[1])}</div></div>`).join('') || '<span class="small muted">Aucune action prioritaire détectée.</span>'}
      ${ed && u.level !== 'reg' && PS.canModule('actions') ? `<button class="btn primary sm" style="align-self:flex-start" data-new-action data-dep="${esc(u.level === 'dep' ? u.n : u.dep)}" data-type="${rec[0] ? rec[0][2] : 'Porte-à-porte'}">+ Planifier une action ici</button>` : (ed ? '' : PS.lockHTML('Territoire en lecture seule'))}</div>
    ${histSec(u)}${sim}${kids}`;
  }

  function histSec(u) {
    const h = PS.histOf(u).filter(a => a.end >= -180), cur = PS.ACTIONS().filter(a => a.st !== 'Terminée' && PS.inUnit(a, u));
    if (!h.length && !cur.length) return `<div class="sec"><div class="label">Actions terrain</div><span class="small muted">Aucune action enregistrée sur ce territoire depuis six mois.</span></div>`;
    const tot = h.reduce((s, a) => s + a.done, 0);
    return `<div class="sec"><div class="label">Actions terrain · 6 derniers mois</div>
      <div class="small">${h.length} action${h.length > 1 ? 's' : ''} terminée${h.length > 1 ? 's' : ''}, ${fmt(tot)} personnes touchées${cur.length ? ` · ${cur.length} en cours ou prévue${cur.length > 1 ? 's' : ''}` : ''}</div>
      <div class="mini-list">${h.slice(0, 5).map(a => `<button data-hact="${a.id}"><span class="mono small muted" style="width:52px">${dayFmt(a.end)}</span><span style="flex:1">${esc(a.t)}</span><span class="small ${a.bilan ? 'muted' : ''}" style="${a.bilan ? '' : 'color:var(--amber)'}">${a.obj ? Math.round(a.done / a.obj * 100) + ' %' : ''}</span></button>`).join('')}</div>
      ${PS.canModule('actions') ? '<button class="linkbtn" data-hall style="align-self:flex-start">Historique complet du territoire →</button>' : ''}</div>`;
  }

  /* ---------------- Dessin d'une zone d'action ---------------- */
  function startDraw() {
    S.map.drawing = { pts: [] }; M.m.getContainer().style.cursor = 'crosshair'; drawSketch();
    PS.toast('Cliquez sur la carte pour placer les sommets de la zone, puis « Terminer ».');
  }
  function drawSketch() {
    M.g.draw.clearLayers(); const d = S.map.drawing; const h = $('#mapHint');
    if (!d) { h.innerHTML = ''; M.m.getContainer().style.cursor = ''; return }
    if (d.pts.length) L.polygon(d.pts, { color: css('--amber'), weight: 2, fillOpacity: 0.15, interactive: false }).addTo(M.g.draw);
    d.pts.forEach(p => L.circleMarker(p, { radius: 4, color: css('--amber'), fillOpacity: 1, interactive: false }).addTo(M.g.draw));
    h.innerHTML = `<div class="map-hint" role="status"><span>Sommets placés : ${d.pts.length}</span><button class="btn sm primary" id="drawEnd" ${d.pts.length < 3 ? 'disabled' : ''}>Terminer</button><button class="btn sm" id="drawCancel">Annuler</button></div>`;
    $('#drawCancel').addEventListener('click', () => { S.map.drawing = null; drawSketch() });
    $('#drawEnd').addEventListener('click', finishDraw);
  }
  function finishDraw() {
    const pts = S.map.drawing.pts; S.map.drawing = null; drawSketch();
    const lat = pts.reduce((a, p) => a + p[0], 0) / pts.length, lng = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    const c = PS.D.communes.find(x => PS.D.inGeom([lng, lat], x.geom));
    if (!c) { PS.toast('La zone doit être tracée à l’intérieur du Sénégal.'); return }
    if (!PS.canEdit(c)) { PS.toast(`Zone refusée : ${c.n} (${c.dep}) est hors de votre périmètre de modification.`); return }
    let A = 0; const kx = 111.32 * Math.cos(lat * Math.PI / 180), ky = 110.57;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) A += (pts[j][1] * kx) * (pts[i][0] * ky) - (pts[i][1] * kx) * (pts[j][0] * ky);
    const km2 = Math.abs(A / 2), menages = Math.round(Math.min(km2 * c.densite / 8.7, c.pop / 8.7));
    S.map.layers.zones = true;
    PS.actionForm({ dep: c.dep, commune: c.n, type: 'Porte-à-porte', zone: pts, km2, menages });
  }
})(window.PS);
