# Projet QField « PoliScope terrain »

Projet QGIS (`poliscope_terrain.qgz`) à préparer par le CEGIT pour chaque territoire, puis à publier sur **QFieldCloud** (open source, auto-hébergeable).

## Couches

| Couche | Source | Géométrie | Édition sur le terrain |
|---|---|---|---|
| `sections` | PostGIS `maillage.structure` (filtrée sur le département de l'équipe) | Point | Oui : position, responsable, effectifs, photo de la permanence |
| `zones_action` | PostGIS `terrain.action` | Polygone | Non (préparées sur la carte PoliScope) |
| `remontees_pap` | PostGIS `terrain.remontee` | Point | Oui : formulaire porte-à-porte |
| `communes` | Limites administratives CEGIT | Polygone | Non |
| Fond OSM | Tuiles hors ligne (MBTiles du secteur) | — | — |

## Formulaire `remontees_pap` (Attributs → Formulaire de saisie)

| Champ | Widget | Contrainte |
|---|---|---|
| `resultat` | Liste : favorable, indécis, pas intéressé, absent | obligatoire |
| `sujets` | Liste multiple : emploi, santé, éducation, eau, électricité, transport, sécurité | — |
| `consentement` | Case à cocher | doit être cochée si un numéro est saisi |
| `telephone` | Texte | `regexp_match("telephone", '^(7[05678])[0-9]{7}$')` |
| `photo` | Pièce jointe (appareil photo) | facultatif |
| `collecte_le` | Date/heure, valeur par défaut `now()` | — |
| `agent` | Valeur par défaut `@cloud_username` | — |

## Préparation

1. Dans QGIS, ajouter les couches PostGIS avec un filtre `code_departement = '<code>'`.
2. Configurer les formulaires ci-dessus et les styles (statuts des sections : vert, orange, rouge).
3. Extension **QFieldSync** : « Configurer le projet pour QFieldCloud ». Mode « hors ligne » pour les couches éditables.
4. Publier sur QFieldCloud et inviter les comptes des bénévoles.
