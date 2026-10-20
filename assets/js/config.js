/* PoliScope — configuration : rôles, comptes de démonstration, indicateurs, typologie.
   En production, les comptes et rôles sont gérés par Keycloak (OIDC) et les permissions
   appliquées côté API et base (PostgreSQL Row-Level Security). Voir docs/roles-permissions.md. */
window.PS = window.PS || {};
(function (PS) {
  'use strict';

  /* ---------- Modules de l'application ---------- */
  PS.MODULES = [
    ['Pilotage', [['tableau', 'Tableau de bord'], ['carte', 'Carte stratégique'], ['priorites', 'Priorisation']]],
    ['Organisation', [['maillage', 'Maillage & antennes'], ['contacts', 'Contacts & membres']]],
    ['Mobilisation', [['actions', 'Actions terrain'], ['terrain', 'Collecte terrain'], ['messages', 'Messages'], ['benevoles', 'Bénévoles'], ['agenda', 'Agenda']]],
    ['Gouvernance', [['rapports', 'Rapports PDF & exports'], ['admin', 'Administration']]]
  ];

  /* ---------- Rôles ----------
     voir   : périmètre de consultation de la carte et des indicateurs
     edit   : périmètre de modification (national | region | departement | aucun)
     pii    : accès aux contacts nominatifs (limité au périmètre de modification)  */
  PS.ROLES = {
    admin_general: {
      label: 'Administrateur général', court: 'Admin général',
      desc: 'Direction nationale : tous les modules, modification sur tout le territoire, gestion des comptes.',
      edit: 'national', pii: true,
      modules: ['tableau', 'carte', 'priorites', 'maillage', 'contacts', 'actions', 'terrain', 'messages', 'benevoles', 'agenda', 'rapports', 'admin']
    },
    admin_regional: {
      label: 'Administrateur régional', court: 'Admin régional',
      desc: 'Coordination régionale : voit tout le Sénégal, modifie les sections, contacts et actions de sa région.',
      edit: 'region', pii: true,
      modules: ['tableau', 'carte', 'priorites', 'maillage', 'contacts', 'actions', 'terrain', 'messages', 'benevoles', 'agenda', 'rapports', 'admin']
    },
    admin_section: {
      label: 'Chef de section / coordinateur', court: 'Admin section',
      desc: 'Voit l’intégralité du territoire sénégalais ; ne modifie que les sections, contacts et actions de son département.',
      edit: 'departement', pii: true,
      modules: ['tableau', 'carte', 'priorites', 'maillage', 'contacts', 'actions', 'terrain', 'messages', 'benevoles', 'agenda', 'rapports']
    },
    analyste: {
      label: 'Analyste / lecteur', court: 'Lecteur',
      desc: 'Consultation des cartes, indicateurs et rapports. Aucune donnée nominative, aucune modification.',
      edit: 'aucun', pii: false,
      modules: ['tableau', 'carte', 'priorites', 'maillage', 'rapports']
    },
    benevole: {
      label: 'Bénévole terrain', court: 'Bénévole',
      desc: 'Collecte terrain et actions de sa section ; consultation de la carte.',
      edit: 'departement', pii: false,
      modules: ['carte', 'actions', 'terrain', 'benevoles', 'agenda']
    }
  };

  /* ---------- Comptes de démonstration (fictifs) ----------
     Aucun mot de passe réel : l'authentification du prototype est simulée côté navigateur. */
  PS.DEMO_PASSWORD = 'demo';
  PS.USERS = [
    { login: 'admin.national', nom: 'Fatou Diop', role: 'admin_general', perimetre: { type: 'national' } },
    { login: 'coord.thies', nom: 'Aliou Sarr', role: 'admin_regional', perimetre: { type: 'region', nom: 'Thiès' } },
    { login: 'section.mbour', nom: 'Moussa Ba', role: 'admin_section', perimetre: { type: 'departement', nom: 'Mbour' } },
    { login: 'analyste', nom: 'Awa Ndiaye', role: 'analyste', perimetre: { type: 'national' } },
    { login: 'benevole.pikine', nom: 'Modou Fall', role: 'benevole', perimetre: { type: 'departement', nom: 'Pikine' } }
  ];

  /* ---------- Typologie des territoires ---------- */
  PS.TYPO = {
    bastion: { l: 'Bastion', c: '--teal', d: 'Score fort et réseau structuré' },
    concurrentielle: { l: 'Zone concurrentielle', c: '--ink-3', d: 'Score moyen, réseau en place' },
    renforcer: { l: 'À renforcer', c: '--amber', d: 'Potentiel élevé, couverture faible' },
    conquerir: { l: 'À conquérir', c: '--peri', d: 'Score faible, implantation à construire' }
  };

  /* ---------- Critères du score de priorité ---------- */
  PS.DEFAULT_WEIGHTS = { poids: 3, marge: 2, particip: 2, deficit: 3, activite: 1, access: 1 };

  /* ---------- Indicateurs cartographiques ----------
     desc   : ce que l'indicateur renseigne (affiché dans la carte)
     calcul : mode de calcul
     source : provenance de la donnée
     usage  : comment s'en servir pour décider */
  PS.INDICATORS = {
    typo: {
      l: 'Typologie des territoires', cat: true,
      desc: 'Classe chaque territoire dans l’une des quatre situations stratégiques en croisant la performance électorale du parti et la solidité de son implantation.',
      calcul: 'Bastion : score ≥ 38 % et couverture ≥ 50 %. À renforcer : couverture < 50 % avec score ≥ 30 % ou participation ≥ 63 %. Zone concurrentielle : score entre 28 et 38 % avec réseau en place. À conquérir : score < 28 %. Contour pointillé « À surveiller » : activité en baisse d’au moins 22 % et recul électoral d’au moins 1,5 point.',
      source: 'Résultats CivicScope + maillage PoliScope',
      usage: 'Choisir la bonne stratégie : consolider, renforcer, conquérir ou relancer.'
    },
    priorite: {
      l: 'Score de priorité', u: '/100', ramp: ['--land-0', '--amber'], min: 0, max: 100,
      desc: 'Note de 0 à 100 indiquant où un effort militant supplémentaire a le plus de chances de rapporter des voix et des adhérents.',
      calcul: 'Moyenne pondérée de six critères normalisés : poids électoral (inscrits), marge de progression, participation, déficit de couverture, recul d’activité, accessibilité. Les poids se règlent dans le module Priorisation.',
      source: 'Calcul PoliScope (CivicScope, maillage, activité, isochrones)',
      usage: 'Classer les territoires et répartir équipes, budget et tournées.'
    },
    score: {
      l: 'Score électoral du parti', u: ' %', ramp: ['--land-0', '--teal'], min: 5, max: 60,
      desc: 'Part des suffrages exprimés obtenue par le parti ou la coalition au scrutin de référence.',
      calcul: 'Voix du parti ÷ suffrages exprimés, agrégés des bureaux de vote vers la commune, le département et la région. L’évolution est calculée par rapport au scrutin précédent.',
      source: 'CivicScope (résultats bureau par bureau)',
      usage: 'Repérer les zones de force et de faiblesse électorale.'
    },
    rang: {
      l: 'Rang du parti', cat: true,
      desc: 'Position du parti ou de la coalition dans le classement des listes ou candidats au scrutin de référence.',
      calcul: 'Classement des listes par nombre de voix dans le territoire : 1er, 2e, 3e ou au-delà.',
      source: 'CivicScope',
      usage: 'Distinguer les territoires gagnés, disputés et perdus.'
    },
    couv: {
      l: 'Couverture communale', u: ' %', ramp: ['--land-0', '--teal'], min: 0, max: 100,
      desc: 'Part des communes du territoire où le parti dispose d’au moins une section en activité. À l’échelle communale : présence ou absence de section.',
      calcul: 'Communes avec au moins une section active ou à relancer ÷ nombre total de communes.',
      source: 'Maillage PoliScope',
      usage: 'Identifier les « zones blanches » où ouvrir des antennes.'
    },
    participation: {
      l: 'Participation', u: ' %', ramp: ['--land-0', '--peri'], min: 42, max: 80,
      desc: 'Part des électeurs inscrits qui ont voté au scrutin de référence.',
      calcul: 'Votants ÷ inscrits.',
      source: 'CivicScope',
      usage: 'Une forte participation avec un score faible signale un électorat mobilisé à convaincre.'
    },
    membres10k: {
      l: 'Membres pour 10 000 hab.', u: '', ramp: ['--land-0', '--teal'], min: 0, max: 60,
      desc: 'Densité militante : nombre de membres encartés rapporté à la population, comparable entre territoires de tailles différentes.',
      calcul: 'Membres ÷ population × 10 000 (population RGPH-5, ANSD 2023).',
      source: 'Fichier des membres PoliScope + ANSD',
      usage: 'Comparer la force organisationnelle d’une région à l’autre.'
    },
    activite: {
      l: 'Tendance d’activité (90 j)', u: ' %', div: true, min: -45, max: 35,
      desc: 'Évolution du nombre d’actions terrain (porte-à-porte, réunions, phoning, caravanes…) sur les 90 derniers jours par rapport aux 90 jours précédents.',
      calcul: '(Actions des 90 derniers jours − actions des 90 jours précédents) ÷ actions des 90 jours précédents.',
      source: 'Actions et remontées terrain PoliScope (QField, KoboToolbox, ODK)',
      usage: 'Détecter l’essoufflement d’une section avant qu’il ne se traduise dans les urnes.'
    }
  };
  PS.RANG = { 1: { l: '1er', c: '--teal' }, 2: { l: '2e', c: '--amber' }, 3: { l: '3e et au-delà', c: '--peri' } };

  PS.LEVELS = { reg: 'Régions', dep: 'Départements', com: 'Communes' };
})(window.PS);
