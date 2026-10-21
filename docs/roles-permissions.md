# Rôles et permissions

## Principe

**Tout le monde voit le Sénégal entier ; chacun ne modifie que son périmètre.**

- La carte, les indicateurs agrégés et les fiches des sections sont consultables par tous les profils.
- Seul le périmètre du profil est modifiable : sections, contacts, actions, campagnes.
- Les **données nominatives** (contacts, téléphones des responsables) ne sont visibles que dans le périmètre de modification.

## Profils

| Rôle (code) | Libellé | Périmètre de modification | Données nominatives | Modules |
|---|---|---|---|---|
| `admin_general` | Administrateur général | National | Oui, partout | Tous, y compris la gestion des comptes |
| `admin_regional` | Administrateur régional | Sa région | Oui, dans sa région | Tous ; administration en consultation |
| `admin_section` | Chef de section / coordinateur | Son département (ses sections) | Oui, dans son département | Tous sauf administration |
| `analyste` | Analyste / lecteur | Aucun | Non | Tableau de bord, carte, priorisation, maillage, rapports |
| `benevole` | Bénévole terrain | Les actions de son département | Non | Carte, actions, collecte terrain, bénévoles, agenda |

Le prototype définit ces profils dans `assets/js/config.js` (`PS.ROLES`, `PS.USERS`). La règle de modification est la fonction `PS.canEdit()` de `assets/js/app.js`.

## Matrice des droits

● modification dans le périmètre · ◐ consultation · ○ aucun accès

| Module | Admin général | Admin régional | Admin section | Analyste | Bénévole |
|---|---|---|---|---|---|
| Tableau de bord | ● | ● | ● | ◐ | ○ |
| Carte stratégique | ● | ● | ● | ◐ | ◐ |
| Priorisation (poids) | ● | ● | ● | ◐ | ○ |
| Maillage & antennes | ● | ● région | ● département | ◐ | ○ |
| Contacts & membres | ● | ● région | ● département | ○ | ○ |
| Actions terrain | ● | ● région | ● département | ○ | ● département |
| Collecte terrain | ● | ● | ● | ○ | ● |
| Messages | ● | ● région | ● département | ○ | ○ |
| Rapports | ● | ● | ● | ◐ (sans nominatif) | ○ |
| Administration | ● | ◐ | ○ | ○ | ○ |

## Console d'administration

L'administrateur général gère, dans **Administration** :
- les **comptes** : création, modification, désactivation, suppression, réinitialisation du mot de passe ;
- les **rôles et permissions** : modules accessibles, périmètre de modification, accès aux données nominatives, création de rôles ;
- le **test d'un profil** (« Tester ce profil ») pour vérifier ce qu'un compte voit, avec retour à son propre compte.

Dans le prototype, ces réglages sont enregistrés dans le navigateur (« Réinitialiser la démo » rétablit l'état d'origine). En production, ils sont écrits dans Keycloak et appliqués par l'API et la base.

## Production : Keycloak + Row-Level Security

1. **Keycloak** porte les rôles (realm roles) et un attribut utilisateur `perimetre`. Il vaut `SN` pour le niveau national, sinon le code de la région ou du département.
2. L'**API** vérifie le jeton OIDC et ouvre chaque transaction avec :
   ```sql
   SET LOCAL poliscope.role = 'admin_section';
   SET LOCAL poliscope.perimetre = 'SN.TH.MB';   -- département de Mbour
   ```
3. Les **politiques RLS** de PostgreSQL appliquent la règle, même si une requête de l'API était mal écrite :
   ```sql
   -- lecture des sections : tout le monde
   CREATE POLICY section_lecture ON maillage.section FOR SELECT USING (true);
   -- écriture : uniquement dans le périmètre
   CREATE POLICY section_ecriture ON maillage.section FOR ALL
     USING (poliscope.dans_perimetre(code_departement))
     WITH CHECK (poliscope.dans_perimetre(code_departement));
   -- contacts : lecture et écriture limitées au périmètre
   CREATE POLICY contact_perimetre ON crm.contact FOR ALL
     USING (poliscope.dans_perimetre(code_departement));
   ```
   Le schéma complet est dans [`database/schema.sql`](../database/schema.sql).
4. Le **journal** (`audit.journal`) enregistre l'auteur, l'action, l'objet et la date de chaque modification. Il est alimenté par des triggers.

## Bonnes pratiques

- Authentification à deux facteurs obligatoire pour `admin_general` et `admin_regional`.
- Revue trimestrielle des comptes et désactivation des comptes inactifs.
- Exports nominatifs réservés aux administrateurs et tracés.
