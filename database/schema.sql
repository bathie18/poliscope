-- =====================================================================
-- PoliScope — schéma PostgreSQL 16 / PostGIS 3 (cible de production)
-- CEGIT. Données en EPSG:4326 (stockage) ; calculs métriques en EPSG:32628.
-- Les limites administratives proviennent des couches PostGIS du CEGIT.
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS ref;       -- référentiels territoriaux
CREATE SCHEMA IF NOT EXISTS elec;      -- résultats importés de CivicScope
CREATE SCHEMA IF NOT EXISTS maillage;  -- organisation du parti
CREATE SCHEMA IF NOT EXISTS crm;       -- contacts et membres
CREATE SCHEMA IF NOT EXISTS terrain;   -- actions et remontées
CREATE SCHEMA IF NOT EXISTS audit;     -- journal
CREATE SCHEMA IF NOT EXISTS poliscope; -- fonctions de sécurité, indicateurs

-- ---------------------------------------------------------------------
-- Référentiel territorial (alimenté par les limites administratives CEGIT)
-- ---------------------------------------------------------------------
CREATE TABLE ref.region (
  code        text PRIMARY KEY,                 -- ex. SN.TH
  nom         text NOT NULL,
  population  integer,                          -- RGPH-5 (ANSD)
  geom        geometry(MultiPolygon, 4326) NOT NULL
);
CREATE TABLE ref.departement (
  code        text PRIMARY KEY,                 -- ex. SN.TH.MB
  code_region text NOT NULL REFERENCES ref.region(code),
  nom         text NOT NULL,
  population  integer,
  geom        geometry(MultiPolygon, 4326) NOT NULL
);
CREATE TABLE ref.commune (
  code              text PRIMARY KEY,
  code_departement  text NOT NULL REFERENCES ref.departement(code),
  nom               text NOT NULL,
  population        integer,
  geom              geometry(MultiPolygon, 4326) NOT NULL
);
CREATE INDEX ON ref.region USING gist (geom);
CREATE INDEX ON ref.departement USING gist (geom);
CREATE INDEX ON ref.commune USING gist (geom);

-- ---------------------------------------------------------------------
-- Résultats électoraux (import CivicScope)
-- ---------------------------------------------------------------------
CREATE TABLE elec.scrutin (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  libelle     text NOT NULL,                    -- ex. Législatives 2024
  type        text NOT NULL CHECK (type IN ('presidentielle','legislatives','locales','referendum')),
  date_tour   date NOT NULL,
  tour        smallint NOT NULL DEFAULT 1,
  reference   boolean NOT NULL DEFAULT false    -- scrutin de référence affiché
);
CREATE TABLE elec.resultat_commune (
  scrutin_id     uuid REFERENCES elec.scrutin(id) ON DELETE CASCADE,
  code_commune   text REFERENCES ref.commune(code),
  inscrits       integer NOT NULL,
  votants        integer NOT NULL,
  exprimes       integer NOT NULL,
  blancs_nuls    integer NOT NULL,
  voix_parti     integer NOT NULL,              -- parti ou coalition suivi
  voix_premier_concurrent integer,
  rang_parti     smallint,
  source_maj     timestamptz NOT NULL DEFAULT now(),  -- horodatage de la synchronisation CivicScope
  PRIMARY KEY (scrutin_id, code_commune)
);

-- ---------------------------------------------------------------------
-- Maillage du parti
-- ---------------------------------------------------------------------
CREATE TYPE maillage.niveau AS ENUM ('siege','coordination_regionale','coordination_departementale','section_communale','sous_section','antenne');
CREATE TABLE maillage.structure (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  niveau            maillage.niveau NOT NULL,
  nom               text NOT NULL,
  code_commune      text REFERENCES ref.commune(code),
  code_departement  text NOT NULL REFERENCES ref.departement(code),
  responsable_id    uuid,                       -- crm.contact(id)
  membres           integer NOT NULL DEFAULT 0,
  cartes_annee      integer NOT NULL DEFAULT 0,
  derniere_activite date,
  valide            boolean NOT NULL DEFAULT false,   -- proposition validée par la coordination
  geom              geometry(Point, 4326),
  cree_le           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON maillage.structure USING gist (geom);
CREATE INDEX ON maillage.structure (code_departement);
-- Statut calculé à la lecture (dépend de la date du jour)
CREATE VIEW maillage.v_structure WITH (security_invoker = true) AS
SELECT s.*,
       CASE WHEN derniere_activite IS NULL THEN 'inactive'
            WHEN derniere_activite >= current_date - 30 THEN 'active'
            WHEN derniere_activite >= current_date - 90 THEN 'a_relancer'
            ELSE 'inactive' END AS statut
FROM maillage.structure s;

-- ---------------------------------------------------------------------
-- CRM (données personnelles minimisées)
-- ---------------------------------------------------------------------
CREATE TABLE crm.contact (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prenom            text NOT NULL,
  nom               text NOT NULL,
  telephone         text,                       -- chiffré au repos (pgcrypto) en production
  statut            text NOT NULL CHECK (statut IN ('militant','sympathisant','benevole','responsable')),
  structure_id      uuid REFERENCES maillage.structure(id),
  code_departement  text NOT NULL REFERENCES ref.departement(code),
  etiquettes        text[] NOT NULL DEFAULT '{}',
  carte_annee       smallint,
  source            text,                       -- qfield, kobo, odk, saisie, formulaire
  consentement      boolean NOT NULL,
  consentement_le   timestamptz NOT NULL,
  cree_le           timestamptz NOT NULL DEFAULT now(),
  CHECK (consentement)                          -- aucun enregistrement sans accord explicite
);
CREATE VIEW crm.v_contact WITH (security_invoker = true) AS
SELECT c.*, c.consentement_le + interval '24 months' AS consentement_fin,
       c.consentement_le + interval '24 months' < now() + interval '30 days' AS consentement_a_renouveler
FROM crm.contact c;

-- ---------------------------------------------------------------------
-- Actions terrain et remontées
-- ---------------------------------------------------------------------
CREATE TABLE terrain.action (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intitule          text NOT NULL,
  type              text NOT NULL CHECK (type IN ('porte_a_porte','phoning','reunion','caravane','tractage','consultation','meeting','placement_cartes')),
  statut            text NOT NULL DEFAULT 'a_planifier' CHECK (statut IN ('a_planifier','planifiee','en_cours','terminee')),
  code_departement  text NOT NULL REFERENCES ref.departement(code),
  equipe            text,
  objectif          integer,
  debut             date,
  fin               date,
  zone              geometry(Polygon, 4326),    -- secteur dessiné sur la carte
  cree_par          text NOT NULL
);
CREATE TABLE terrain.remontee (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id         uuid REFERENCES terrain.action(id),
  outil             text NOT NULL CHECK (outil IN ('qfield','kobo','odk','pwa')),
  formulaire        text NOT NULL,
  resultat          text,                       -- favorable, indecis, refus, absent…
  code_departement  text NOT NULL REFERENCES ref.departement(code),
  geom              geometry(Point, 4326),
  collecte_le       timestamptz NOT NULL,
  synchronise_le    timestamptz NOT NULL DEFAULT now(),
  donnees           jsonb NOT NULL DEFAULT '{}'
);

-- ---------------------------------------------------------------------
-- Journal d'audit
-- ---------------------------------------------------------------------
CREATE TABLE audit.journal (
  id        bigserial PRIMARY KEY,
  quand     timestamptz NOT NULL DEFAULT now(),
  qui       text NOT NULL DEFAULT current_setting('poliscope.utilisateur', true),
  tableau   text NOT NULL,
  operation text NOT NULL,
  cle       text,
  avant     jsonb,
  apres     jsonb
);
CREATE OR REPLACE FUNCTION audit.tracer() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO audit.journal(tableau, operation, cle, avant, apres)
  VALUES (TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, TG_OP,
          COALESCE(NEW.id, OLD.id)::text,
          CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
          CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END);
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER t_audit AFTER INSERT OR UPDATE OR DELETE ON maillage.structure FOR EACH ROW EXECUTE FUNCTION audit.tracer();
CREATE TRIGGER t_audit AFTER INSERT OR UPDATE OR DELETE ON crm.contact       FOR EACH ROW EXECUTE FUNCTION audit.tracer();
CREATE TRIGGER t_audit AFTER INSERT OR UPDATE OR DELETE ON terrain.action    FOR EACH ROW EXECUTE FUNCTION audit.tracer();

-- ---------------------------------------------------------------------
-- Sécurité : périmètre de l'utilisateur (positionné par l'API à chaque transaction)
--   SET LOCAL poliscope.role = 'admin_section';
--   SET LOCAL poliscope.perimetre = 'SN.TH.MB';  -- 'SN' = national
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION poliscope.dans_perimetre(code_dep text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT CASE current_setting('poliscope.role', true)
    WHEN 'admin_general'  THEN true
    WHEN 'admin_regional' THEN EXISTS (SELECT 1 FROM ref.departement d WHERE d.code = code_dep AND d.code_region = current_setting('poliscope.perimetre', true))
    WHEN 'admin_section'  THEN code_dep = current_setting('poliscope.perimetre', true)
    WHEN 'benevole'       THEN code_dep = current_setting('poliscope.perimetre', true)
    ELSE false END
$$;

ALTER TABLE maillage.structure ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.contact        ENABLE ROW LEVEL SECURITY;
ALTER TABLE terrain.action     ENABLE ROW LEVEL SECURITY;
ALTER TABLE terrain.remontee   ENABLE ROW LEVEL SECURITY;

-- Maillage : lecture pour tous, écriture dans le périmètre
CREATE POLICY structure_lecture  ON maillage.structure FOR SELECT USING (true);
CREATE POLICY structure_ecriture ON maillage.structure FOR INSERT WITH CHECK (poliscope.dans_perimetre(code_departement) AND current_setting('poliscope.role', true) <> 'benevole');
CREATE POLICY structure_maj      ON maillage.structure FOR UPDATE USING (poliscope.dans_perimetre(code_departement) AND current_setting('poliscope.role', true) <> 'benevole');
-- Contacts : tout est limité au périmètre ; les bénévoles et analystes n'y ont pas accès
CREATE POLICY contact_perimetre  ON crm.contact FOR ALL
  USING (poliscope.dans_perimetre(code_departement) AND current_setting('poliscope.role', true) IN ('admin_general','admin_regional','admin_section'))
  WITH CHECK (poliscope.dans_perimetre(code_departement) AND current_setting('poliscope.role', true) IN ('admin_general','admin_regional','admin_section'));
-- Actions : lecture pour tous les profils connectés, écriture dans le périmètre
CREATE POLICY action_lecture  ON terrain.action FOR SELECT USING (true);
CREATE POLICY action_ecriture ON terrain.action FOR ALL USING (poliscope.dans_perimetre(code_departement)) WITH CHECK (poliscope.dans_perimetre(code_departement));
CREATE POLICY remontee_perimetre ON terrain.remontee FOR ALL USING (poliscope.dans_perimetre(code_departement)) WITH CHECK (poliscope.dans_perimetre(code_departement));

-- ---------------------------------------------------------------------
-- Indicateurs communaux (vue matérialisée, rafraîchie après chaque import)
-- ---------------------------------------------------------------------
CREATE MATERIALIZED VIEW poliscope.indicateurs_commune AS
WITH ref_scrutin AS (SELECT id FROM elec.scrutin WHERE reference ORDER BY date_tour DESC LIMIT 1),
res AS (
  SELECT r.code_commune, r.inscrits, r.votants, r.exprimes, r.voix_parti, r.rang_parti
  FROM elec.resultat_commune r JOIN ref_scrutin s ON s.id = r.scrutin_id),
sec AS (
  SELECT code_commune, count(*) AS sections,
         count(*) FILTER (WHERE statut IN ('active','a_relancer')) AS sections_vivantes,
         sum(membres) AS membres, sum(cartes_annee) AS cartes
  FROM maillage.v_structure WHERE valide GROUP BY code_commune),
act AS (
  SELECT c.code AS code_commune,
         count(*) FILTER (WHERE r.collecte_le >= now() - interval '90 days') AS act_90,
         count(*) FILTER (WHERE r.collecte_le <  now() - interval '90 days' AND r.collecte_le >= now() - interval '180 days') AS act_90_prec
  FROM ref.commune c LEFT JOIN terrain.remontee r ON ST_Intersects(c.geom, r.geom)
  GROUP BY c.code)
SELECT c.code, c.nom, c.code_departement, c.population,
       res.inscrits,
       round(100.0 * res.votants / NULLIF(res.inscrits, 0), 1)   AS participation,
       round(100.0 * res.voix_parti / NULLIF(res.exprimes, 0), 1) AS score,
       res.rang_parti                                            AS rang,
       CASE WHEN COALESCE(sec.sections_vivantes, 0) > 0 THEN 100 ELSE 0 END AS couverture,
       COALESCE(sec.sections, 0) AS sections,
       COALESCE(sec.membres, 0)  AS membres,
       round(10000.0 * COALESCE(sec.membres, 0) / NULLIF(c.population, 0), 1) AS membres_10k,
       round(100.0 * (act.act_90 - act.act_90_prec) / NULLIF(act.act_90_prec, 0)) AS tendance_activite,
       c.geom
FROM ref.commune c
LEFT JOIN res ON res.code_commune = c.code
LEFT JOIN sec ON sec.code_commune = c.code
LEFT JOIN act ON act.code_commune = c.code;
CREATE UNIQUE INDEX ON poliscope.indicateurs_commune (code);
CREATE INDEX ON poliscope.indicateurs_commune USING gist (geom);
-- Les vues départementales et régionales agrègent cette vue (somme des effectifs,
-- moyennes pondérées par les inscrits, couverture = communes couvertes / communes).
