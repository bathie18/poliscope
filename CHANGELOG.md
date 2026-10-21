# Journal des versions

## 0.3.1 — 21 octobre 2026
- **Priorisation** : cinq stratégies prêtes à l'emploi et stratégies personnelles enregistrables ; matrice mettant en évidence et numérotant les territoires les plus prioritaires ; colonne « Évol. » (places gagnées ou perdues par rapport à la stratégie Équilibrée) ; bouton « Voir sur la carte ».
- **Carte** : la légende passe en bas à droite, repliable, et reste visible quand une fiche est ouverte ; zoom et échelle en bas à gauche.
- Correction : l'ouverture d'une fiche étirait la zone de carte au-delà de l'écran.

## 0.3.0 — 21 octobre 2026
- **Accueil** : carte du Sénégal en fond, encart de connexion au centre, description du produit ; les profils de démonstration ne sont plus affichés.
- **Administration** : gestion des comptes (création, modification, désactivation, suppression), des rôles et des permissions (modules, périmètre, données nominatives, nouveaux rôles), « Tester ce profil » avec retour au compte administrateur, journal.
- **Actions** : clôture avec fiche bilan, onglet « Historique et bilans » filtrable avec export CSV, historique sur la fiche des territoires, section « Actions terminées » dans le PDF ; les changements d'état sont conservés.
- **Collecte terrain** : appli reliée aux actions, liste des remontées, file de validation, import de fichiers KoboToolbox / ODK (CSV) et QField (GeoJSON) avec fichier d'exemple, statistiques par collecteur, couche « Remontées terrain » sur la carte.
- **Rapports** : menu renommé ; choix de l'échelle (régions, départements, communes) et recherche de la localité, quatre modèles, historique des rapports générés.
- **Messages** : icônes de canal ; canal vocal avec enregistrement au micro ou import d'un fichier audio, appel automatisé ou note vocale WhatsApp, choix de la langue.

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
