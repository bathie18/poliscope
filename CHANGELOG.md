# Journal des versions

## 0.2.0 — 20 octobre 2026
- Écran de connexion et cinq profils : administrateur général, administrateur régional, chef de section (`admin_section`), analyste, bénévole. Chaque profil voit tout le Sénégal et ne modifie que son périmètre.
- Carte : fond OpenStreetMap ou blanc, **échelle communale** (433 communes), panneaux **Couches** et **Légende** intégrés à la carte, couches non cochées par défaut.
- Descriptif, calcul, source et usage de chaque indicateur ; nouvel indicateur « Rang du parti » (CivicScope).
- Population réelle RGPH-5 (ANSD 2023) pour les régions et départements.
- Module « Collecte terrain » : QField, KoboToolbox, ODK ; formulaires XLSForm fournis.
- **Rapport PDF territorial** : carte du territoire, positions des sections et coordinations, tableau de bord, statistiques, recommandations.
- Bibliothèques et polices embarquées (aucun CDN).
- Documentation complète, schéma PostGIS avec Row-Level Security, contrat OpenAPI, squelette Docker Compose.

## 0.1.0 — 20 octobre 2026
- Premier prototype : tableau de bord, carte (régions et départements), priorisation, maillage, contacts, actions, appli terrain, messages, bénévoles, agenda, exports, administration.
