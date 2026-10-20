# Indicateurs

PoliScope affiche huit indicateurs sur la carte, aux trois échelles (régions, départements, communes). Les indicateurs électoraux proviennent de **CivicScope**, qui fournit pour chaque scrutin les résultats d'un parti ou d'une coalition, son score et son rang. Les autres proviennent du maillage et de l'activité enregistrés dans PoliScope, et de la population (RGPH-5, ANSD).

Dans l'application, la description de chaque indicateur s'affiche dans le panneau **Couches** de la carte. Le lien « Calcul et usage de l'indicateur » donne la fiche complète. Les définitions sont centralisées dans `assets/js/config.js` (`PS.INDICATORS`).

## Synthèse

| Indicateur | Ce qu'il renseigne | Source | Échelles |
|---|---|---|---|
| Typologie des territoires | La situation stratégique du territoire : bastion, zone concurrentielle, à renforcer, à conquérir | CivicScope + maillage | R · D · C |
| Score de priorité | Où un effort militant supplémentaire rapporte le plus (0 à 100) | Calcul PoliScope | R · D · C |
| Score électoral du parti | Part des suffrages exprimés obtenue par le parti ou la coalition | CivicScope | R · D · C |
| Rang du parti | Position du parti dans le classement des listes | CivicScope | R · D · C |
| Couverture communale | Part des communes où le parti a au moins une section en activité | Maillage PoliScope | R · D · C* |
| Participation | Part des inscrits qui ont voté | CivicScope | R · D · C |
| Membres pour 10 000 hab. | Densité militante, comparable entre territoires | Membres + ANSD | R · D · C |
| Tendance d'activité (90 j) | Dynamique des actions terrain | Actions et collecte terrain | R · D · C |

\* À l'échelle communale, la couverture vaut « oui » (100 %) ou « non » (0 %).

## Fiches détaillées

### Typologie des territoires
- **Ce qu'elle renseigne** : la situation stratégique du territoire, obtenue en croisant la performance électorale et la solidité de l'implantation.
- **Règles** (évaluées dans cet ordre) :
  | Classe | Condition | Lecture |
  |---|---|---|
  | Bastion | score ≥ 38 % **et** couverture ≥ 50 % | Consolider, fidéliser, former |
  | À renforcer | couverture < 50 % **et** (score ≥ 30 % **ou** participation ≥ 63 %) | Potentiel réel, réseau insuffisant : ouvrir des antennes |
  | Zone concurrentielle | score entre 28 et 38 %, réseau en place | Mobiliser au porte-à-porte, cibler les indécis |
  | À conquérir | score < 28 % | Implanter progressivement, repérer des relais |
- **Signal « À surveiller »** (contour pointillé rouge) : activité en baisse d'au moins 22 % sur 90 jours **et** recul électoral d'au moins 1,5 point.
- **Usage** : choisir la stratégie adaptée à chaque territoire.

### Score de priorité (0–100)
- **Ce qu'il renseigne** : où un effort militant supplémentaire (équipes, budget, tournées) a le plus de chances de rapporter des voix et des adhérents.
- **Calcul** : moyenne pondérée de six critères normalisés entre 0 et 1.

  | Critère | Normalisation | Poids par défaut |
  |---|---|---|
  | Poids électoral | inscrits ÷ maximum des inscrits à la même échelle | 3 |
  | Marge de progression | 1 − score ÷ 60 | 2 |
  | Participation | (participation − 48) ÷ 28, borné à [0 ; 1] | 2 |
  | Déficit de couverture | 1 − couverture ÷ 100 | 3 |
  | Recul d'activité | − tendance ÷ 45, borné à [0 ; 1] | 1 |
  | Accessibilité | indice 0–1 tiré des isochrones | 1 |

  `priorité = 100 × Σ(poids × critère) ÷ Σ poids`
- **Réglage** : les poids se modifient dans le module **Priorisation**. Le classement, la matrice score × couverture et la carte se mettent à jour.
- **Usage** : classer les territoires et répartir les moyens.

### Score électoral du parti
- **Ce qu'il renseigne** : la part des suffrages exprimés obtenue par le parti ou la coalition au scrutin de référence, et son évolution depuis le scrutin précédent.
- **Calcul** : voix du parti ÷ suffrages exprimés, agrégés des bureaux de vote vers la commune, le département et la région.
- **Source** : CivicScope.
- **Usage** : repérer les zones de force et de faiblesse électorale.

### Rang du parti
- **Ce qu'il renseigne** : la position du parti ou de la coalition dans le classement des listes ou candidats.
- **Classes** : 1er, 2e, 3e et au-delà.
- **Source** : CivicScope.
- **Usage** : distinguer les territoires gagnés, disputés et perdus.

### Couverture communale
- **Ce qu'elle renseigne** : la part des communes du territoire où le parti dispose d'au moins une section active ou à relancer. Les sections inactives depuis plus de 90 jours ne comptent pas.
- **Calcul** : communes couvertes ÷ communes du territoire.
- **Source** : maillage PoliScope (sections géolocalisées avec QField ou KoboToolbox).
- **Usage** : repérer les « zones blanches » où ouvrir des antennes.

### Participation
- **Ce qu'elle renseigne** : la mobilisation de l'électorat au scrutin de référence.
- **Calcul** : votants ÷ inscrits.
- **Source** : CivicScope.
- **Usage** : une participation forte avec un score faible signale un électorat mobilisé, qu'il reste à convaincre.

### Membres pour 10 000 habitants
- **Ce qu'il renseigne** : la densité militante, comparable entre des territoires de tailles très différentes.
- **Calcul** : membres encartés ÷ population × 10 000. Population RGPH-5 2023 (ANSD) pour les régions et départements, estimée pour les communes.
- **Usage** : comparer la force organisationnelle d'un territoire à l'autre.

### Tendance d'activité (90 jours)
- **Ce qu'elle renseigne** : la dynamique des équipes locales.
- **Calcul** : (actions des 90 derniers jours − actions des 90 jours précédents) ÷ actions des 90 jours précédents. Les actions comptées sont le porte-à-porte, les réunions, le phoning, les caravanes et le placement de cartes.
- **Source** : module Actions et remontées terrain (QField, KoboToolbox, ODK, appli PoliScope).
- **Usage** : détecter l'essoufflement d'une section avant qu'il ne se voie dans les urnes.

## Autres mesures affichées

| Mesure | Définition |
|---|---|
| Statut d'une section | Active : activité depuis moins de 30 jours ; À relancer : 30 à 90 jours ; Inactive : plus de 90 jours |
| Objectif de cartes | 0,9 % des inscrits du territoire, paramétrable |
| Zones desservies (~30 min) | Zone atteignable en 30 minutes depuis une section : environ 2,5 km en milieu urbain, 12 km en milieu rural dans le prototype. En production, isochrones calculées sur le réseau routier (pgRouting / OSRM). |
| Ménages d'une zone d'action | Surface × densité de la commune ÷ 8,7 personnes par ménage (ordre de grandeur) |
