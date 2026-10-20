"""Construit les couches GeoJSON du prototype PoliScope (régions, départements, communes).

Source provisoire : GADM v4.1, via le paquet R `mapSenegal` (fichiers inst/rds/*.rds),
populations RGPH-5 (ANSD, 2023) pour les régions et départements.
En production, ces couches sont remplacées par les limites administratives PostGIS du CEGIT
(voir docs/donnees-geographiques.md).

Usage :
    pip install rdata shapely pyproj
    python tools/build_geodata.py <dossier_rds> assets/data
"""
import json, math, sys, warnings
from pathlib import Path

import rdata
from pyproj import Transformer
from shapely.geometry import MultiPolygon, Polygon, mapping
from shapely.ops import transform

warnings.filterwarnings("ignore")
SRC, OUT = Path(sys.argv[1]), Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)
to_wgs84 = Transformer.from_crs("EPSG:32628", "EPSG:4326", always_xy=True).transform


def load(name):
    return rdata.conversion.convert(rdata.parser.parse_file(SRC / f"{name}.rds"), default_encoding="utf8")


def geom(g):
    """sfg MULTIPOLYGON (liste de polygones, chacun liste d'anneaux) -> shapely en WGS84."""
    polys = []
    for p in g:
        rings = [[(float(x), float(y)) for x, y in r] for r in p]
        polys.append(Polygon(rings[0], rings[1:]))
    utm = MultiPolygon(polys).buffer(0)
    return utm.area / 1e6, transform(to_wgs84, utm)


def rnd(gj, nd=4):
    def r(c):
        return [round(c[0], nd), round(c[1], nd)] if isinstance(c[0], float) else [r(x) for x in c]
    return {"type": gj["type"], "coordinates": r(gj["coordinates"])}


def write(name, feats):
    fc = {"type": "FeatureCollection", "name": name, "features": feats}
    (OUT / f"{name}.geojson").write_text(json.dumps(fc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(name, len(feats), round((OUT / f"{name}.geojson").stat().st_size / 1024), "Ko")


reg, dep, com = load("regions"), load("departements"), load("communes")
reg_name = dict(zip(reg["GID_1"], reg["NAME"]))
dep_name = dict(zip(dep["GID_2"], dep["NAME"]))
dep_pop = dict(zip(dep["GID_2"], dep["POP_RGPH5"]))

feats = []
for _, r in reg.iterrows():
    km2, g = geom(r["geometry"])
    c = g.representative_point()
    feats.append({"type": "Feature", "properties": {"code": r["GID_1"], "nom": r["NAME"], "pop": int(r["POP_RGPH5"]),
                  "km2": round(km2), "lat": round(c.y, 4), "lng": round(c.x, 4)},
                  "geometry": rnd(mapping(g.simplify(0.004, preserve_topology=True)))})
write("regions", feats)

feats = []
for _, d in dep.iterrows():
    km2, g = geom(d["geometry"])
    c = g.representative_point()
    feats.append({"type": "Feature", "properties": {"code": d["GID_2"], "nom": d["NAME"], "region": reg_name[d["GID_1"]],
                  "pop": int(d["POP_RGPH5"]), "km2": round(km2), "lat": round(c.y, 4), "lng": round(c.x, 4)},
                  "geometry": rnd(mapping(g.simplify(0.003, preserve_topology=True)))})
write("departements", feats)

# Communes : la population n'est pas fournie par la source ; elle est répartie (estimation)
# au sein du département selon la surface^0.3, à remplacer par les données ANSD par commune.
rows = []
for _, c in com.iterrows():
    km2, g = geom(c["geometry"])
    rows.append((c, km2, g))
w = {}
for c, km2, g in rows:
    w[c["GID_2"]] = w.get(c["GID_2"], 0) + km2 ** 0.3
feats = []
for c, km2, g in rows:
    p = g.representative_point()
    pop = dep_pop[c["GID_2"]] * km2 ** 0.3 / w[c["GID_2"]]
    feats.append({"type": "Feature", "properties": {"code": c["GID_4"], "nom": c["NAME"].replace("/ ", "/").replace(" -", "-"),
                  "departement": dep_name[c["GID_2"]], "region": reg_name[c["GID_1"]], "pop_estimee": int(round(pop, -2)),
                  "km2": round(km2, 1), "lat": round(p.y, 4), "lng": round(p.x, 4)},
                  "geometry": rnd(mapping(g.simplify(0.0015, preserve_topology=True)))})
write("communes", feats)
