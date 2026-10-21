# Guide utilisateur

## Se connecter

Ouvrez l'application, puis saisissez l'identifiant et le mot de passe remis par l'administrateur de votre parti. En démonstration, les comptes de test sont listés dans le README (par exemple `admin` / `admin`). Le bandeau du haut affiche ensuite votre nom, votre profil et votre périmètre. Le bouton **Se déconnecter** ferme la session.

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

## Priorisation

1. Choisissez le territoire et l'échelle (départements ou communes).
2. Choisissez une **stratégie** (Équilibrée, Conquête électorale, Implantation, Relance du réseau, Mobilisation avant scrutin) ou réglez les six curseurs. « Enregistrer ces poids… » conserve une pondération personnalisée.
3. Lisez le **classement** : la colonne « Évol. » montre les places gagnées ou perdues par rapport à la stratégie Équilibrée.
4. Sur la **matrice**, les territoires les plus prioritaires sont cerclés et numérotés.
5. **Voir sur la carte** ouvre la carte stratégique avec l'indicateur « Score de priorité ».

La **légende** de la carte est en bas à droite ; le chevron la replie ou la déplie.

## Administration (administrateur général)

- **Comptes** : créer un compte (nom, identifiant, mot de passe, rôle, périmètre), le modifier, le désactiver ou le supprimer. Il reste toujours au moins un administrateur général actif.
- **Tester ce profil** : ouvre l'application avec les droits du compte choisi, pour vérifier ce qu'il voit et peut modifier. Un bandeau jaune rappelle la session de test ; « Revenir à mon compte » la termine.
- **Rôles et permissions** : cochez les modules accessibles à chaque rôle, choisissez son périmètre de modification (tout le Sénégal, sa région, son département, aucun) et l'accès aux données nominatives, puis **Enregistrez**. « Créer un rôle » part d'un rôle existant. Le rôle Administrateur général est verrouillé.
- **Journal** : toutes les connexions, modifications, clôtures, imports et exports.

Un administrateur régional consulte ces écrans sans pouvoir les modifier.

## Actions terrain : suivi, clôture et historique

- **Suivi en cours** : tableau par étape (à planifier, planifiée, en cours, terminée depuis 30 jours).
- **Clôturer** une action en cours ouvre la **fiche bilan** : réalisé, favorables, indécis, pas intéressés, absents (ou participants, ou cartes placées), points à retenir, difficultés. Pour le porte-à-porte, la fiche est pré-remplie à partir des remontées terrain validées.
- **Historique et bilans** : toutes les actions terminées, filtrables par territoire, période et type, avec les chiffres clés (personnes touchées, atteinte des objectifs, accueil favorable) et un export CSV.
- La fiche de chaque territoire, sur la carte, rappelle ses actions des six derniers mois. Le rapport PDF peut inclure la section « Actions terminées ».

## Collecte terrain

- **Appli terrain** : choisissez l'action, saisissez les résultats porte par porte ou appel par appel (hors connexion), puis **Synchroniser**. Le réalisé de l'action avance et les fiches apparaissent sur la carte.
- **Remontées** : toutes les fiches, filtrables par action, contrôle, commune ou collecteur.
- **À valider** : fiches signalées par les contrôles (doublon possible, consentement manquant, hors périmètre), à valider ou rejeter.
- **Importer un fichier** : export CSV de KoboToolbox ou d'ODK, ou couche GeoJSON de QField. Un fichier d'exemple est téléchargeable pour essayer.
- **Collecteurs** : nombre de fiches, accueil favorable et fiches à vérifier par collecteur.
- Sur la carte, la couche **Remontées terrain** affiche chaque fiche selon son résultat.

## Messages et canal vocal

Choisissez le canal **SMS**, **WhatsApp** ou **Vocal** (icône micro), puis la cible (statut, étiquette). Seuls les contacts consentants sont comptés.

Pour un message vocal :
1. Choisissez le **mode de diffusion** : *appel vocal automatisé* (le serveur vocal appelle chaque contact et diffuse l'enregistrement ; fonctionne sur tous les téléphones, sans internet, et convient aux publics non lecteurs ; touche 1 pour confirmer) ou *note vocale WhatsApp*.
2. Choisissez la **langue** de l'enregistrement.
3. **Sur ordinateur** : cliquez sur le micro, autorisez l'accès au micro du PC ou du casque, parlez, puis cliquez à nouveau pour arrêter (90 secondes au maximum). Vous pouvez aussi **importer un fichier audio** enregistré avec un téléphone (MP3, WAV, M4A, OGG).
4. Écoutez l'enregistrement, puis **Programmez l'envoi**. Le champ « Script » sert d'aide à la lecture et n'est pas envoyé.

## Le rapport PDF territorial

Menu **Rapports** :
1. Choisissez l'**échelle** (régions, départements ou communes), puis **recherchez** la localité. Les raccourcis « Sénégal entier » et « Mon périmètre » sont aussi disponibles.
2. Choisissez le **modèle** : rapport complet, fiche de synthèse (une page), rapport maillage, ou bilan d'activité terrain. « Ajuster le contenu » permet de cocher ou décocher chaque partie.
3. Contrôlez l'aperçu de la carte, puis cliquez sur **Générer le PDF**. Les rapports produits restent listés dans « Rapports générés » pendant la session et peuvent être régénérés.

Le rapport ne contient les noms des responsables que pour les sections de votre périmètre.

## Exports

Les exports CSV et GeoJSON s'ouvrent directement dans QGIS ou un tableur. Leur contenu respecte votre profil : pas de nom pour un analyste, par exemple.
