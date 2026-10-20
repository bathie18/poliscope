# Déploiement

## 1. Prototype : GitHub Pages

Le prototype est une application statique, sans étape de compilation.

1. Dans le dépôt GitHub, ouvrez **Settings → Pages**.
2. Choisissez **Source : Deploy from a branch**, branche `main`, dossier `/ (root)`.
3. L'application est publiée à l'adresse `https://bathie18.github.io/poliscope/`.

Le fichier `.nojekyll` désactive le traitement Jekyll : les dossiers sont servis tels quels.

En local :

```bash
python3 -m http.server 8000      # puis http://localhost:8000
```

## 2. Production : Docker Compose

Le dossier [`deploy/`](../deploy/) contient le squelette de la plateforme complète :

| Service | Image | Rôle |
|---|---|---|
| `db` | `postgis/postgis:16-3.4` | Base PostGIS (schéma `database/schema.sql`) |
| `keycloak` | `quay.io/keycloak/keycloak:25.0` | Identité, rôles, périmètres |
| `api` | construite depuis `api/` | API FastAPI |
| `tiles` | `ghcr.io/maplibre/martin` | Tuiles vectorielles des communes et sections |
| `minio` | `minio/minio` | Photos et pièces jointes |
| `web` | `nginx:alpine` | Interface (contenu de ce dépôt) et proxy inverse |

```bash
cd deploy
cp .env.example .env        # renseigner les mots de passe (jamais versionnés)
docker compose up -d
docker compose exec db psql -U poliscope -f /schema/schema.sql
```

## 3. Avant la mise en service

- [ ] Remplacer les couches GADM par les limites administratives PostGIS du CEGIT ([donnees-geographiques.md](donnees-geographiques.md)).
- [ ] Brancher le connecteur CivicScope et choisir le scrutin de référence.
- [ ] Créer le realm Keycloak, les rôles et les comptes (double facteur pour les administrateurs).
- [ ] Déployer le serveur de tuiles OSM auto-hébergé.
- [ ] Accomplir les formalités auprès de la CDP ([protection-donnees.md](protection-donnees.md)).
- [ ] Mettre en place les sauvegardes (pgBackRest) et la supervision.
- [ ] Tester sur un territoire pilote ([feuille-de-route.md](feuille-de-route.md)).
