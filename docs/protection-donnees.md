# Protection des données personnelles

Un fichier de militants et de sympathisants est un traitement de données personnelles sensibles, puisqu'il révèle une proximité politique. PoliScope est conçu pour faciliter la conformité. La responsabilité du traitement reste au parti utilisateur.

## Cadre

- **Loi n° 2008-12 du 25 janvier 2008** sur la protection des données à caractère personnel (Sénégal).
- **Commission de protection des données personnelles (CDP)** : formalités préalables (déclaration ou demande d'autorisation) avant la mise en service.
- Pour les membres de la diaspora en Europe, le RGPD peut s'appliquer.

> Ce document décrit des choix de conception. Il ne constitue pas un avis juridique. La qualification du traitement et les formalités doivent être validées avec un juriste et la CDP.

## Mesures intégrées

| Principe | Mise en œuvre dans PoliScope |
|---|---|
| Consentement | Case obligatoire à la saisie (application, QField, Kobo, ODK). Date enregistrée, échéance de 24 mois, alerte de renouvellement. Sans consentement, pas d'enregistrement (`CHECK` en base). |
| Minimisation | Aucun champ pour l'opinion déclarée, l'ethnie ou la religion. Téléphone masqué à l'affichage. |
| Cloisonnement | Données nominatives visibles uniquement dans le périmètre du profil. Contrôle par l'API et par PostgreSQL Row-Level Security. |
| Traçabilité | Journal de toutes les modifications et de tous les exports (qui, quoi, quand). |
| Sécurité | Authentification Keycloak, double facteur pour les administrateurs, chiffrement en transit (TLS) et au repos, sauvegardes chiffrées. |
| Messages | Envoi uniquement aux contacts consentants. Lien ou mot-clé de désinscription. |
| Droits des personnes | Accès, rectification, opposition et suppression traités depuis la fiche contact. La suppression est tracée. |
| Hébergement | Option d'hébergement au Sénégal. Pas de transfert vers un service tiers sans base légale. |
| Conservation | Contacts inactifs anonymisés après la durée fixée par le parti. |
