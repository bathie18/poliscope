# Feuille de route

Le principe : commencer par la valeur opérationnelle, puis enrichir progressivement.

| Version | Contenu | État du prototype |
|---|---|---|
| **V1 — Maillage & diagnostic** | Carte des sections, fiches antennes, données électorales (CivicScope), population, filtres, trois échelles, exports, rôles et périmètres | Démontré |
| **V2 — Mobilisation** | Actions terrain, zones d'action, affectations, collecte QField / Kobo / ODK, phoning, messages, événements, suivi des bénévoles | Démontré (simulation) |
| **V3 — Décision avancée** | Score de priorité paramétrable, scénarios d'ouverture d'antennes, alertes, rapports PDF territoriaux ; ensuite : isochrones réelles (pgRouting), recommandations automatiques, ciblage au bureau de vote | Partiellement démontré |

## Étapes proposées

1. **Valider les parcours** avec des responsables nationaux et locaux d'un parti partenaire.
2. **Définir les indicateurs** réellement disponibles et fiables au Sénégal : fichiers de membres existants, qualité des positions des sections.
3. **Brancher les socles** : couches PostGIS du CEGIT, connecteur CivicScope, Keycloak.
4. **Pilote sur un territoire** (par exemple une région) pendant 2 à 3 mois, avec formation des coordinateurs et des bénévoles à QField / KoboToolbox.
5. **Déploiement national** après bilan du pilote.

## Évolutions envisagées

- Application mobile PWA hors ligne pour les bénévoles.
- Isochrones calculées sur le réseau routier OSM (pgRouting ou OSRM).
- Tableau de bord des coalitions (plusieurs partis, partage contrôlé).
- Comparaison multi-scrutins et projection des reports de voix.
- Adaptation aux pays de la sous-région (référentiels administratifs paramétrables).
