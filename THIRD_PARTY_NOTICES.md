# Composants tiers

Tous les composants embarqués dans ce dépôt sont open source. Les licences complètes sont fournies à côté des fichiers.

| Composant | Version | Licence | Emplacement |
|---|---|---|---|
| Leaflet | 1.9.4 | BSD-2-Clause | `assets/vendor/leaflet/` (`LICENSE`) |
| jsPDF | 2.5.1 | MIT | `assets/vendor/jspdf/` (`LICENSE-jspdf`) |
| jsPDF-AutoTable | 3.8.2 | MIT | `assets/vendor/jspdf/` (`LICENSE-autotable`) |
| Schibsted Grotesk | 5.0.12 (Fontsource) | SIL OFL 1.1 | `assets/fonts/` |
| Source Sans 3 | 5.0.20 (Fontsource) | SIL OFL 1.1 | `assets/fonts/` |
| IBM Plex Mono | 5.0.13 (Fontsource) | SIL OFL 1.1 | `assets/fonts/` |

## Données

| Donnée | Source | Licence / conditions |
|---|---|---|
| Limites administratives (prototype) | GADM v4.1, via le paquet R `mapSenegal` (GPL-3) | Usage non commercial, redistribution soumise à autorisation. **Provisoire**, à remplacer par les couches du CEGIT. |
| Population régions et départements | RGPH-5 2023, ANSD | Donnée publique, citer la source |
| Fond de plan | © contributeurs OpenStreetMap | ODbL 1.0, attribution affichée sur la carte |

## Outils cités (non embarqués)

PostgreSQL, PostGIS, FastAPI, Keycloak, Martin, MinIO, Nginx, Asterisk, QField / QFieldCloud, KoboToolbox, ODK Central, WeasyPrint, pgBackRest : tous sous licence open source (voir [docs/architecture.md](docs/architecture.md)).
