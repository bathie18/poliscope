# Contribuer à PoliScope

## Organisation du code

- Aucune étape de compilation : le prototype tourne avec `python3 -m http.server`.
- Un fichier par responsabilité dans `assets/js/` : configuration, données, application, carte, rapports.
- Les couleurs passent par les variables CSS (`:root`) : thème clair et thème sombre.
- Les textes de l'interface sont en français, écrits pour l'utilisateur (pas de jargon technique).

## Règles

1. **Open source uniquement** : toute dépendance ajoutée doit avoir une licence open source. Elle est embarquée dans `assets/vendor/` et déclarée dans `THIRD_PARTY_NOTICES.md`.
2. **Pas de secret dans le dépôt** : mots de passe et jetons vont dans `deploy/.env`, qui est ignoré par Git.
3. **Pas de donnée personnelle réelle** : le jeu de démonstration reste fictif.
4. **Droits** : toute nouvelle action de modification doit passer par `PS.canEdit()` et être tracée avec `PS.log()`.

## Branches et messages

- `main` est publiée automatiquement sur GitHub Pages.
- Travailler sur une branche `fonction/<sujet>` puis ouvrir une demande de fusion.
- Messages de commit en français, à l'impératif : « Ajoute l'échelle communale ».
