/* PoliScope — jeu de données de démonstration.
   Réel   : limites administratives (provisoires, GADM v4.1) et population RGPH-5 2023 (ANSD) des régions et départements.
   Simulé : parti fictif, résultats électoraux, sections, membres, contacts, actions (graine fixe, reproductible).
   En production, ces données proviennent de PostGIS (maillage, CRM), de CivicScope (résultats) et des
   formulaires terrain (QField, KoboToolbox, ODK). */
window.PS = window.PS || {};
(function (PS) {
  'use strict';
  function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) } return h >>> 0 }
  function rng(seed) { let a = seed >>> 0; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const slug = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  function inRing(pt, ring) { let x = pt[0], y = pt[1], ins = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) ins = !ins } return ins }
  function inPoly(pt, c) { if (!inRing(pt, c[0])) return false; for (let k = 1; k < c.length; k++) if (inRing(pt, c[k])) return false; return true }
  function inGeom(pt, g) { return g.type === 'Polygon' ? inPoly(pt, g.coordinates) : g.coordinates.some(c => inPoly(pt, c)) }
  function bbox(g) { const a = [180, 90, -180, -90]; const ps = g.type === 'Polygon' ? [g.coordinates] : g.coordinates; for (const p of ps) for (const [x, y] of p[0]) { a[0] = Math.min(a[0], x); a[1] = Math.min(a[1], y); a[2] = Math.max(a[2], x); a[3] = Math.max(a[3], y) } return a }

  const REG = {
    'Dakar': { cap: [14.693, -17.447], bias: -2 }, 'Thiès': { cap: [14.791, -16.926], bias: 6 },
    'Diourbel': { cap: [14.655, -16.231], bias: -4 }, 'Saint-Louis': { cap: [16.026, -16.489], bias: 3 },
    'Kaolack': { cap: [14.152, -16.073], bias: 8 }, 'Louga': { cap: [15.618, -16.224], bias: 1 },
    'Tambacounda': { cap: [13.770, -13.667], bias: -3 }, 'Kolda': { cap: [12.894, -14.941], bias: -6 },
    'Fatick': { cap: [14.339, -16.411], bias: 9 }, 'Kaffrine': { cap: [14.106, -15.550], bias: 4 },
    'Matam': { cap: [15.656, -13.255], bias: -1 }, 'Ziguinchor': { cap: [12.566, -16.272], bias: -8 },
    'Sédhiou': { cap: [12.708, -15.557], bias: -5 }, 'Kédougou': { cap: [12.557, -12.174], bias: -2 }
  };
  const PF = ['Aminata', 'Fatou', 'Awa', 'Khady', 'Ndèye', 'Mariama', 'Coumba', 'Seynabou', 'Astou', 'Rokhaya', 'Aïssatou', 'Bineta', 'Dieynaba', 'Marième', 'Oumou', 'Yacine', 'Adja', 'Sokhna'];
  const PH = ['Moussa', 'Ousmane', 'Mamadou', 'Ibrahima', 'Cheikh', 'Abdoulaye', 'Modou', 'Alioune', 'Pape', 'Babacar', 'Serigne', 'Lamine', 'Mouhamed', 'Assane', 'Souleymane', 'Omar', 'El Hadji', 'Malick'];
  const NOMS = ['Ndiaye', 'Diop', 'Fall', 'Sow', 'Ba', 'Diallo', 'Faye', 'Sarr', 'Gueye', 'Mbaye', 'Ndour', 'Cissé', 'Sy', 'Kane', 'Thiam', 'Seck', 'Diouf', 'Camara', 'Badji', 'Sané', 'Mendy', 'Coly', 'Touré', 'Kébé', 'Niang', 'Dieng', 'Wade', 'Ly', 'Sène', 'Mbengue'];
  const TAGS = ['Jeunesse', 'Femmes', 'Commerçants', 'Enseignants', 'Diaspora', 'Étudiants', 'Agriculteurs', 'Pêcheurs', 'Transporteurs', 'Artisans', 'Santé'];
  const TYPES = { 'Porte-à-porte': 'PAP', 'Phoning': 'TEL', 'Réunion de section': 'RÉU', 'Caravane': 'CAR', 'Tractage': 'TRA', 'Consultation citoyenne': 'CON', 'Meeting': 'MTG', 'Placement de cartes': 'ADH' };

  PS.buildData = function (geo) {
    const R = rng(20261020);
    const pick = (a, r = R) => a[Math.floor(r() * a.length)];
    const person = (r = R) => { const f = r() < 0.47; return { prenom: pick(f ? PF : PH, r), nom: pick(NOMS, r), f } };
    const maskPhone = (r = R) => `${pick(['77', '78', '76', '70', '75'], r)} ••• •• ${String(Math.floor(r() * 90) + 10)}`;

    /* ---------- Communes (unité de base) ---------- */
    const deptBias = {};
    const communes = geo.communes.features.map(f => {
      const p = f.properties, r = rng(hash(p.code));
      if (!(p.departement in deptBias)) { const rd = rng(hash('dep' + p.departement)); deptBias[p.departement] = rd() * 10 - 5 }
      const db = deptBias[p.departement], reg = REG[p.region] || { bias: 0 };
      const urban = p.region === 'Dakar' || p.km2 < 60;
      const c = {
        id: 'c-' + slug(p.code), code: p.code, level: 'com', n: p.nom, dep: p.departement, r: p.region,
        geom: f.geometry, lat: p.lat, lng: p.lng, km2: p.km2, pop: p.pop_estimee, popEstimee: true, communes: 1, urban
      };
      c.score = +clamp(17 + r() * 21 + reg.bias + db, 4, 62).toFixed(1);
      c.scorePrev = +clamp(c.score + (r() * 12 - 6), 4, 64).toFixed(1);
      c.participation = +clamp(50 + r() * 21 + (urban ? -3 : 0), 42, 80).toFixed(1);
      c.rival = +clamp(64 - c.score - r() * 16, 10, 58).toFixed(1);
      c.inscrits = Math.round(c.pop * (0.44 + r() * 0.06) / 10) * 10;
      const pSec = clamp(0.22 + c.score / 75 + (p.region === 'Dakar' ? 0.35 : 0) + db / 40, 0.08, 0.95);
      c._nsec = r() < pSec ? 1 + Math.floor(r() * (p.region === 'Dakar' ? 4 : (c.pop > 60000 ? 3 : 2))) : 0;
      c.activityTrend = Math.round(clamp(r() * 80 - 45 + db * 2, -60, 45));
      c.access = +clamp(urban ? 0.85 + r() * 0.13 : 0.45 + r() * 0.45 - c.km2 / 3500, 0.1, 0.98).toFixed(2);
      c._r = r;
      return c;
    });

    /* ---------- Sections (dans le polygone de leur commune) ---------- */
    const sections = []; let sid = 1;
    const LEVELS = ['Section communale', 'Section communale', 'Sous-section de quartier', 'Antenne villageoise'];
    for (const c of communes) {
      const r = c._r, bb = bbox(c.geom), inact = clamp(-c.activityTrend / 60, 0, 0.75);
      let k = 0, guard = 0;
      while (k < c._nsec && guard < 3000) {
        guard++;
        const x = bb[0] + r() * (bb[2] - bb[0]), y = bb[1] + r() * (bb[3] - bb[1]);
        if (!inGeom([x, y], c.geom)) continue;
        k++;
        const pr = person(r), u = r();
        const last = u < inact * 0.5 ? 95 + Math.floor(r() * 120) : (u < 0.22 + inact * 0.5 ? 31 + Math.floor(r() * 55) : Math.floor(r() * 29));
        const membres = Math.round(30 + r() * (c.r === 'Dakar' ? 300 : 170));
        sections.push({
          id: 's' + (sid++), name: c._nsec > 1 ? `${c.n} ${k}` : c.n,
          level: c.r === 'Dakar' ? (k > 1 ? 'Sous-section de quartier' : 'Section communale') : (k > 1 ? pick(LEVELS, r) : 'Section communale'),
          commune: c.id, communeName: c.n, dep: c.dep, r: c.r, lat: +y.toFixed(5), lng: +x.toFixed(5),
          resp: `${pr.prenom} ${pr.nom}`, tel: maskPhone(r), membres, cartes: Math.round(membres * (0.35 + r() * 0.5)),
          last, statut: last <= 30 ? 'Active' : (last <= 90 ? 'À relancer' : 'Inactive'), creee: 2014 + Math.floor(r() * 12)
        });
      }
    }
    function fillCounts(u, ss) {
      u.sections = ss.length; u.actives = ss.filter(s => s.statut === 'Active').length; u.inactives = ss.filter(s => s.statut === 'Inactive').length;
      u.membres = ss.reduce((a, s) => a + s.membres, 0); u.cartes = ss.reduce((a, s) => a + s.cartes, 0);
    }
    for (const c of communes) {
      fillCounts(c, sections.filter(s => s.commune === c.id));
      c.couv = c.sections - c.inactives > 0 ? 100 : 0;
      c.objCartes = Math.max(10, Math.round(c.inscrits * 0.009 / 10) * 10);
      c.actions30 = Math.round(c.actives * (0.5 + c._r() * 1.4));
    }

    /* ---------- Agrégation (départements, régions) ---------- */
    function aggregate(id, level, n, r, dep, children, geom, extra) {
      const s = k => children.reduce((a, d) => a + d[k], 0);
      const ins = s('inscrits'); const w = k => children.reduce((a, d) => a + d[k] * d.inscrits, 0) / ins;
      const pop = extra.pop || s('pop');
      const u = Object.assign({
        id, level, n, r, dep, geom, children, pop, km2: s('km2'), inscrits: ins, communes: s('communes'),
        participation: +w('participation').toFixed(1), score: +w('score').toFixed(1), scorePrev: +w('scorePrev').toFixed(1), rival: +w('rival').toFixed(1),
        access: +w('access').toFixed(2), activityTrend: Math.round(w('activityTrend')),
        sections: s('sections'), actives: s('actives'), inactives: s('inactives'), membres: s('membres'), cartes: s('cartes'), objCartes: s('objCartes'), actions30: s('actions30')
      }, extra);
      const comm = level === 'dep' ? children : children.flatMap(d => d.children);
      u.couv = Math.round(comm.filter(c => c.couv > 0).length / comm.length * 100);
      return u;
    }
    const depts = geo.departements.features.map(f => {
      const p = f.properties; const ch = communes.filter(c => c.dep === p.nom && c.r === p.region);
      const d = aggregate('d-' + slug(p.nom), 'dep', p.nom, p.region, p.nom, ch, f.geometry, { pop: p.pop, lat: p.lat, lng: p.lng, code: p.code });
      d.km2 = p.km2; ch.forEach(c => c.parent = d.id); return d;
    });
    // population communale : recalée sur la population RGPH-5 du département
    for (const d of depts) { const t = d.children.reduce((a, c) => a + c.pop, 0); d.children.forEach(c => { c.pop = Math.round(c.pop * d.pop / t / 100) * 100 }) }
    const regions = geo.regions.features.map(f => {
      const p = f.properties; const ch = depts.filter(d => d.r === p.nom);
      const g = aggregate('r-' + slug(p.nom), 'reg', p.nom, p.nom, null, ch, f.geometry, { pop: p.pop, lat: (REG[p.nom] || {}).cap?.[0] ?? p.lat, lng: (REG[p.nom] || {}).cap?.[1] ?? p.lng, code: p.code });
      g.km2 = p.km2; ch.forEach(d => d.parent = g.id); return g;
    });
    for (const u of [...communes, ...depts, ...regions]) {
      u.densite = Math.round(u.pop / Math.max(u.km2, 0.1));
      u.membres10k = +(u.membres / u.pop * 10000).toFixed(1);
      const others = 100 - u.score - u.rival;
      u.rang = u.score >= u.rival ? 1 : (u.score >= others * 0.55 ? 2 : 3);
      if (u.level !== 'com') u.objCartes = Math.round(u.inscrits * 0.009 / 10) * 10;
      delete u._r;
    }
    for (const c of communes) delete c._nsec;

    /* ---------- Coordinations ---------- */
    const hq = { id: 'hq', type: 'Siège national', name: 'Siège national — Dakar', r: 'Dakar', dep: 'Dakar', lat: 14.7167, lng: -17.4677, resp: 'Secrétariat national', tel: '33 ••• •• 40' };
    const coordsReg = regions.map(g => { const p = person(); return { id: 'cr-' + g.id, type: 'Coordination régionale', name: 'Coordination régionale de ' + g.n, r: g.n, dep: null, lat: g.lat, lng: g.lng, resp: `${p.prenom} ${p.nom}`, tel: maskPhone() } });
    const coordsDep = depts.filter(d => d.n !== d.r).map(d => { const p = person(); return { id: 'cd-' + d.id, type: 'Coordination départementale', name: 'Coordination départementale de ' + d.n, r: d.r, dep: d.n, lat: d.lat, lng: d.lng, resp: `${p.prenom} ${p.nom}`, tel: maskPhone() } });

    /* ---------- Contacts ---------- */
    const ROLES = ['Militant', 'Militant', 'Sympathisant', 'Sympathisant', 'Sympathisant', 'Responsable de section', 'Bénévole', 'Bénévole'];
    const SOURCES = ['Porte-à-porte (QField)', 'Porte-à-porte (KoboToolbox)', 'Phoning', 'Meeting', 'Formulaire en ligne', 'Réunion de section', 'Caravane (ODK Collect)'];
    const contacts = [];
    const favored = sections.filter(s => ['Mbour', 'Thiès', 'Pikine', 'Kaolack'].includes(s.dep));
    for (let i = 0; i < 180; i++) {
      const s = i % 3 === 0 && favored.length ? pick(favored) : pick(sections); const p = person(); const role = pick(ROLES);
      contacts.push({
        id: 'ct' + (i + 1), prenom: p.prenom, nom: p.nom, role, tags: [...new Set([pick(TAGS), R() < 0.45 ? pick(TAGS) : null].filter(Boolean))],
        dep: s.dep, r: s.r, commune: s.communeName, section: s.name, tel: maskPhone(),
        consent: R() < 0.78 ? 'Oui' : (R() < 0.5 ? 'Non' : 'À renouveler'),
        carte: role === 'Sympathisant' ? (R() < 0.2 ? '2026' : '—') : (R() < 0.75 ? '2026' : '2025'),
        source: pick(SOURCES), last: Math.floor(R() * 120), engagement: Math.round(R() * 100)
      });
    }

    /* ---------- Actions ---------- */
    const actions = [
      { t: 'Porte-à-porte — Mbour, communes côtières', type: 'Porte-à-porte', dep: 'Mbour', st: 'En cours', obj: 1200, done: 742, team: 'Équipe Mbour Jeunesse', vol: 14, date: -6, end: 9 },
      { t: 'Phoning de relance — sympathisants Pikine', type: 'Phoning', dep: 'Pikine', st: 'En cours', obj: 900, done: 388, team: 'Cellule phoning QG', vol: 8, date: -3, end: 5 },
      { t: 'Caravane départementale Kédougou – Saraya', type: 'Caravane', dep: 'Saraya', st: 'Planifiée', obj: 3000, done: 0, team: 'Coordination Kédougou', vol: 22, date: 6, end: 8 },
      { t: 'Assemblée générale des sections de Kaolack', type: 'Réunion de section', dep: 'Kaolack', st: 'Planifiée', obj: 180, done: 0, team: 'Coordination Kaolack', vol: 6, date: 4, end: 4 },
      { t: 'Placement des cartes 2026 — Diourbel', type: 'Placement de cartes', dep: 'Diourbel', st: 'En cours', obj: 2500, done: 1310, team: 'Secrétariat à l’organisation', vol: 18, date: -20, end: 25 },
      { t: 'Consultation citoyenne sur l’emploi des jeunes', type: 'Consultation citoyenne', dep: 'Thiès', st: 'Terminée', obj: 600, done: 648, team: 'Commission Jeunesse', vol: 11, date: -30, end: -12 },
      { t: 'Tractage marché central — Ziguinchor', type: 'Tractage', dep: 'Ziguinchor', st: 'Terminée', obj: 4000, done: 3650, team: 'Section Ziguinchor', vol: 9, date: -15, end: -15 },
      { t: 'Ouverture d’antenne : repérage dans le Ferlo', type: 'Réunion de section', dep: 'Ranérou Ferlo', st: 'À planifier', obj: 60, done: 0, team: 'À affecter', vol: 0, date: 12, end: 12 },
      { t: 'Porte-à-porte — Guédiawaye', type: 'Porte-à-porte', dep: 'Guédiawaye', st: 'Planifiée', obj: 1500, done: 0, team: 'Équipe Guédiawaye', vol: 16, date: 2, end: 16 },
      { t: 'Phoning femmes commerçantes — Kaolack', type: 'Phoning', dep: 'Kaolack', st: 'Terminée', obj: 500, done: 471, team: 'Commission Femmes', vol: 7, date: -25, end: -18 },
      { t: 'Meeting régional de Saint-Louis', type: 'Meeting', dep: 'Saint-Louis', st: 'Planifiée', obj: 5000, done: 0, team: 'Coordination régionale Saint-Louis', vol: 40, date: 18, end: 18 },
      { t: 'Relance des sections inactives — Vélingara', type: 'Réunion de section', dep: 'Vélingara', st: 'À planifier', obj: 12, done: 0, team: 'À affecter', vol: 0, date: 9, end: 20 },
      { t: 'Tournée de proximité — Podor, villages du Walo', type: 'Caravane', dep: 'Podor', st: 'En cours', obj: 2200, done: 860, team: 'Coordination Podor', vol: 12, date: -4, end: 6 },
      { t: 'Porte-à-porte — Rufisque', type: 'Porte-à-porte', dep: 'Rufisque', st: 'À planifier', obj: 1000, done: 0, team: 'À affecter', vol: 0, date: 14, end: 28 },
      { t: 'Réunion des responsables de section — Mbour', type: 'Réunion de section', dep: 'Mbour', st: 'À planifier', obj: 25, done: 0, team: 'Coordination Mbour', vol: 0, date: 7, end: 7 }
    ].map((a, i) => ({ id: 'a' + (i + 1), ...a, r: (depts.find(d => d.n === a.dep) || {}).r }));

    /* ---------- Historique : actions terminées sur les six derniers mois, avec bilan ---------- */
    const RH = rng(777);
    const HT = [['Porte-à-porte', 'Porte-à-porte', 600, 1600], ['Phoning', 'Phoning', 300, 900], ['Réunion de section', 'Réunion de section', 20, 120], ['Caravane', 'Caravane', 800, 3000], ['Tractage', 'Tractage', 1500, 5000], ['Placement de cartes', 'Placement de cartes', 300, 1800], ['Meeting', 'Meeting', 800, 4000], ['Consultation citoyenne', 'Consultation citoyenne', 200, 700]];
    const activeDeps = depts.filter(d => d.actives > 0);
    const QUALIF = ['Bonne mobilisation des jeunes', 'Accueil favorable dans les quartiers périphériques', 'Forte attente sur l’emploi et l’eau', 'Difficulté d’accès en fin de journée', 'Équipe réduite, à renforcer', 'Plusieurs absences : prévoir un second passage le week-end', 'Demande de réunion publique avec les élus'];
    for (let i = 0; i < 26; i++) {
      const d = i < 5 ? depts.find(x => x.n === ['Mbour', 'Thiès', 'Pikine', 'Kaolack', 'Mbour'][i]) : activeDeps[Math.floor(RH() * activeDeps.length)];
      const [ty, , mn, mx] = HT[Math.floor(RH() * HT.length)];
      const obj = Math.round((mn + RH() * (mx - mn)) / 10) * 10, done = Math.round(obj * (0.62 + RH() * 0.5));
      const end = -(14 + Math.floor(RH() * 170)), start = end - (ty === 'Meeting' || ty === 'Réunion de section' ? 0 : 3 + Math.floor(RH() * 14));
      const com = d.children[Math.floor(RH() * d.children.length)];
      actions.push({ id: 'h' + (i + 1), t: `${ty} — ${com.n}`, type: ty, dep: d.n, r: d.r, commune: com.n, st: 'Terminée', obj, done, team: `Équipe ${d.n}`, vol: 4 + Math.floor(RH() * 30), date: start, end, histo: true });
    }
    function makeBilan(a, r) {
      const b = { realise: a.done, resume: QUALIF[Math.floor(r() * QUALIF.length)], difficultes: r() < 0.4 ? 'Transport des équipes et disponibilité des bénévoles en semaine.' : '' };
      if (a.type === 'Porte-à-porte' || a.type === 'Phoning') { const fav = Math.round(a.done * (0.28 + r() * 0.22)), ind = Math.round(a.done * (0.18 + r() * 0.12)), opp = Math.round(a.done * (0.08 + r() * 0.1)); Object.assign(b, { favorables: fav, indecis: ind, refus: opp, absents: Math.max(0, a.done - fav - ind - opp), nouveauxContacts: Math.round(fav * (0.35 + r() * 0.3)) }) }
      else if (a.type === 'Placement de cartes') b.cartes = a.done;
      else b.participants = a.done;
      return b;
    }
    actions.filter(a => a.st === 'Terminée').forEach(a => { a.bilan = makeBilan(a, rng(hash(a.id))) });

    /* ---------- Remontées terrain (QField, KoboToolbox, ODK, appli), rattachées aux actions ---------- */
    const remontees = []; const RR = rng(4242);
    const OUTILS = ['QField', 'KoboToolbox', 'ODK Collect', 'Appli PoliScope'];
    const RES = ['Favorable', 'Favorable', 'Indécis', 'Pas intéressé', 'Absent', 'Favorable', 'Indécis', 'Absent'];
    const collect = {};
    function ptIn(geom, r) { const bb = bbox(geom); for (let k = 0; k < 400; k++) { const x = bb[0] + r() * (bb[2] - bb[0]), y = bb[1] + r() * (bb[3] - bb[1]); if (inGeom([x, y], geom)) return [+y.toFixed(5), +x.toFixed(5)] } return null }
    for (const a of actions.filter(x => (x.type === 'Porte-à-porte' || x.type === 'Phoning' || x.type === 'Caravane') && x.done > 0)) {
      const d = depts.find(x => x.n === a.dep); if (!d) continue;
      if (!collect[a.dep]) collect[a.dep] = Array.from({ length: 4 }, () => { const p = person(RR); return `${p.prenom} ${p.nom}` });
      const n = Math.min(40, Math.max(8, Math.round(a.done / 40)));
      const coms = a.commune ? d.children.filter(c => c.n === a.commune) : d.children.filter(c => c.couv > 0).concat(d.children).slice(0, 4);
      for (let k = 0; k < n; k++) {
        const c = coms[Math.floor(RR() * coms.length)], pt = ptIn(c.geom, RR); if (!pt) continue;
        const u = RR(), statut = u < 0.03 ? 'Doublon possible' : u < 0.055 ? 'Consentement manquant' : u < 0.07 ? 'Hors périmètre' : 'Validée';
        const dayOff = a.st === 'Terminée' ? a.end - Math.floor(RR() * Math.max(1, a.end - a.date)) : -Math.floor(RR() * 10);
        remontees.push({ id: 'rm' + remontees.length, action: a.id, actionT: a.t, type: a.type === 'Phoning' ? 'Phoning' : 'Porte-à-porte', dep: a.dep, r: a.r, commune: c.n, lat: pt[0], lng: pt[1], resultat: a.type === 'Phoning' ? ['Viendra', 'À rappeler', 'Refus', 'Pas de réponse'][Math.floor(RR() * 4)] : RES[Math.floor(RR() * RES.length)], outil: a.type === 'Phoning' ? 'Appli PoliScope' : OUTILS[Math.floor(RR() * 3)], collecteur: collect[a.dep][Math.floor(RR() * 4)], jour: dayOff, statut, consent: statut !== 'Consentement manquant' && RR() < 0.55 });
      }
    }

    const campaigns = [
      { id: 'm1', nom: 'Invitation meeting Saint-Louis', canal: 'WhatsApp', cible: 'Sympathisants + militants — Saint-Louis', r: 'Saint-Louis', env: 4820, deliv: 4610, rep: 612, st: 'Envoyée', date: -2 },
      { id: 'm2', nom: 'Rappel renouvellement des cartes 2026', canal: 'SMS', cible: 'Militants carte 2025 — national', r: null, env: 11240, deliv: 10802, rep: 1390, st: 'Envoyée', date: -9 },
      { id: 'm3', nom: 'Consultation emploi des jeunes : résultats', canal: 'WhatsApp', cible: 'Tag Jeunesse — Thiès', r: 'Thiès', env: 2310, deliv: 2265, rep: 404, st: 'Envoyée', date: -11 },
      { id: 'm4', nom: 'Annonce caravane Kédougou', canal: 'Message vocal', cible: 'Contacts Kédougou (wolof, pulaar, malinké)', r: 'Kédougou', env: 0, deliv: 0, rep: 0, st: 'Programmée', date: 5 }
    ];
    const events = [
      { t: 'Assemblée générale des sections de Kaolack', type: 'Réunion de section', lieu: 'Kaolack, salle municipale', d: 4, ins: 142, cap: 180 },
      { t: 'Caravane Kédougou – Saraya', type: 'Caravane', lieu: 'Départ : Kédougou centre', d: 6, ins: 22, cap: 30 },
      { t: 'Réunion des responsables de section — Mbour', type: 'Réunion de section', lieu: 'Mbour, permanence du parti', d: 7, ins: 19, cap: 25 },
      { t: 'Formation des responsables de section (module QField)', type: 'Formation', lieu: 'Siège national, Dakar', d: 10, ins: 38, cap: 40 },
      { t: 'Causerie Femmes et entrepreneuriat', type: 'Causerie', lieu: 'Mbour, maison des femmes', d: 13, ins: 64, cap: 120 },
      { t: 'Meeting régional de Saint-Louis', type: 'Meeting', lieu: 'Saint-Louis, place publique', d: 18, ins: 1240, cap: 5000 },
      { t: 'Séminaire des coordinateurs régionaux', type: 'Séminaire', lieu: 'Thiès', d: 27, ins: 14, cap: 14 }
    ];
    const volunteers = [];
    for (let i = 0; i < 16; i++) { const p = person(); const d = pick(depts.filter(x => x.actives > 0)); volunteers.push({ nom: `${p.prenom} ${p.nom}`, dep: i < 3 ? 'Mbour' : d.n, r: i < 3 ? 'Thiès' : d.r, portes: Math.round(80 + R() * 520), appels: Math.round(R() * 380), evts: Math.round(R() * 9) }) }
    volunteers.forEach(v => v.pts = v.portes * 2 + v.appels * 3 + v.evts * 40); volunteers.sort((a, b) => b.pts - a.pts);
    const audit = [
      { t: '09:42', u: 'Aliou Sarr (admin régional Thiès)', a: 'a modifié la fiche de la section Sindia (responsable)' },
      { t: '09:15', u: 'Synchronisation QFieldCloud', a: 'a intégré 214 remontées porte-à-porte (Pikine)' },
      { t: '08:57', u: 'Fatou Diop (admin général)', a: 'a généré le rapport PDF « Région de Kaolack »' },
      { t: 'hier', u: 'Moussa Ba (chef de section Mbour)', a: 'a ajouté 6 contacts avec consentement recueilli' },
      { t: 'hier', u: 'Connecteur CivicScope', a: 'a synchronisé les résultats du scrutin de référence (régions, départements, communes)' },
      { t: '18 oct.', u: 'Import KoboToolbox', a: 'a intégré 58 fiches « recensement des antennes » (Kaolack)' },
      { t: '17 oct.', u: 'Système', a: 'a signalé 9 consentements arrivant à échéance' }
    ];

    const all = [...regions, ...depts, ...communes];
    const byId = Object.fromEntries(all.map(u => [u.id, u]));
    return { REG, regions, depts, communes, sections, hq, coordsReg, coordsDep, contacts, actions, remontees, makeBilan, campaigns, events, volunteers, audit, TAGS, TYPES, byId, inGeom, bbox, hash, rng };
  };
})(window.PS);
