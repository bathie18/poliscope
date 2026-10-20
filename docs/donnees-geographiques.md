# Données géographiques

## Couches du prototype

| Fichier | Objets | Attributs | Système |
|---|---|---|---|
| `assets/data/regions.geojson` | 14 régions | `code`, `nom`, `pop` (RGPH-5), `km2`, `lat`, `lng` | WGS84 (EPSG:4326) |
| `assets/data/departements.geojson` | 45 départements | `code`, `nom`, `region`, `pop` (RGPH-5), `km2`, `lat`, `lng` | WGS84 |
| `assets/data/communes.geojson` | 433 communes | `code`, `nom`, `departement`, `region`, `pop_estimee`, `km2`, `lat`, `lng` | WGS84 |

`lat` et `lng` sont un point intérieur garanti (`representative_point`), utilisé pour les étiquettes.

## Sources et limites

- **Géométries** : GADM v4.1, extraites du paquet R [`mapSenegal`](https://cran.r-project.org/package=mapSenegal) (projection d'origine UTM 28N, EPSG:32628), reprojetées puis simplifiées (tolérance d'environ 150 m pour les communes).
- **Statut provisoire** : la licence GADM n'autorise que l'usage non commercial et interdit la redistribution sans autorisation. Ces couches servent uniquement à la démonstration. **En production, PoliScope utilise les couches PostGIS des limites administratives sénégalaises du CEGIT**, les mêmes que CivicScope.
- **Découpage** : GADM compte 45 départements (avant la création de Keur Massar) et 433 communes, alors que le découpage en vigueur en compte davantage. Les couches du CEGIT corrigeront ce point.
- **Population** : régions et départements d'après le RGPH-5 2023 (ANSD). La population communale est une estimation : la population du département est répartie entre ses communes au prorata de la surface^0,3. Elle sera remplacée par les données ANSD par commune.

## Régénérer les couches

```bash
pip install rdata shapely pyproj
# dossier contenant regions.rds, departements.rds, communes.rds (paquet mapSenegal, inst/rds/)
python tools/build_geodata.py /chemin/vers/rds assets/data
```

## Remplacer par les couches PostGIS du CEGIT

1. Exporter les trois couches depuis PostGIS en GeoJSON WGS84, avec les attributs ci-dessus :
   ```bash
   ogr2ogr -f GeoJSON -t_srs EPSG:4326 -lco COORDINATE_PRECISION=4 -simplify 0.0015 \
     assets/data/communes.geojson PG:"dbname=cegit" \
     -sql "SELECT code, nom, departement, region, population AS pop_estimee, ST_Area(geom::geography)/1e6 AS km2, ST_Y(ST_PointOnSurface(geom)) AS lat, ST_X(ST_PointOnSurface(geom)) AS lng, geom FROM ref.v_communes"
   ```
2. Garder les mêmes noms de champs. L'application n'a pas besoin d'autre modification.
3. En production, les couches sont servies en tuiles vectorielles (Martin) au lieu de fichiers GeoJSON.

## Fond de plan

- **OpenStreetMap** : tuiles `tile.openstreetmap.org` (© contributeurs OpenStreetMap, ODbL). Le serveur public d'OSM est réservé à un usage modéré. En production, PoliScope utilisera des tuiles auto-hébergées, par exemple OpenMapTiles + Martin, ou un serveur de tuiles du CEGIT.
- **Fond blanc** : aucun fond, seules les limites administratives et les indicateurs sont affichés. Pratique pour l'impression et les connexions lentes.
