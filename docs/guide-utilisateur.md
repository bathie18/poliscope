# Guide utilisateur

## Se connecter

Ouvrez l'application, puis saisissez votre identifiant et votre mot de passe. En démonstration, les identifiants fictifs sont affichés sous chaque profil (par exemple `admin` / `admin`) ; on peut aussi cliquer directement sur un profil. Le bandeau du haut affiche ensuite votre nom, votre profil et votre périmètre. Le bouton **Se déconnecter** permet de changer de profil.

## La carte stratégique

La carte s'ouvre sur votre périmètre. Le bouton **Sénégal** affiche tout le pays.

- **Panneau Couches** (en haut à gauche) :
  - **Fond de plan** : OpenStreetMap ou fond blanc.
  - **Échelle** : régions, départements ou communes.
  - **Indicateur** : son descriptif et sa source s'affichent juste en dessous. Le lien « Calcul et usage » ouvre la fiche complète.
  - **Couches** : siège et coordinations, sections, zones desservies, zones d'action, noms. Seules les couches utiles au démarrage sont cochées.
- **Légende** (en bas à gauche) : elle s'adapte à l'indicateur et aux couches affichés.
- **Fiche** : cliquez sur un territoire ou une section. La fiche donne les résultats (CivicScope), l'implantation, le contexte, les recommandations et, pour un département, un **scénario** d'ouverture d'antennes. Depuis une région ou un département, des boutons font descendre à l'échelle inférieure.
- **Zone d'action** : dessinez un secteur de porte-à-porte (clics successifs, puis « Terminer »). PoliScope estime le nombre de ménages et prépare l'action. La zone doit être dans votre périmètre.

## Parcours par profil

| Profil | Ce que vous faites |
|---|---|
| **Administrateur général** | Suivre tout le pays, régler la pondération des priorités, gérer les comptes, produire les rapports nationaux. |
| **Administrateur régional** | Piloter les départements de votre région, valider les antennes proposées, organiser les actions régionales. Le reste du pays est en lecture seule. |
| **Chef de section / coordinateur** | Mettre à jour les fiches de vos sections, enregistrer les contacts (avec consentement), planifier le porte-à-porte et les réunions. Vous voyez tout le Sénégal, mais ne modifiez que votre département. |
| **Analyste / lecteur** | Consulter cartes, indicateurs et classements, produire des rapports sans données nominatives. |
| **Bénévole terrain** | Consulter vos actions, collecter avec QField, KoboToolbox ou l'appli, synchroniser au retour du réseau. |

Une action hors de votre périmètre affiche un **cadenas** avec le message « lecture seule » et le périmètre que vous pouvez modifier.

## Le rapport PDF territorial

Menu **Rapports PDF & exports** :
1. Choisissez le territoire : Sénégal, une région, un département ou une commune.
2. Cochez les contenus : carte, positions des sections et coordinations, tableau de bord, sous-territoires, liste géolocalisée des sections, recommandations.
3. Contrôlez l'aperçu de la carte, puis cliquez sur **Générer le PDF**.

Le rapport ne contient les noms des responsables que pour les sections de votre périmètre.

## Exports

Les exports CSV et GeoJSON s'ouvrent directement dans QGIS ou un tableur. Leur contenu respecte votre profil : pas de nom pour un analyste, par exemple.
