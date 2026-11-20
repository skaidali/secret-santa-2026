# Secret Santa — Protocole Zero-Knowledge sur GitHub Pages

Application web statique et autonome permettant d'organiser un Secret Santa sans serveur tiers, sans base de données et sans que l'organisateur ne puisse connaître les attributions.

## Fonctionnement cryptographique

1. **Inscription :** Chaque participant choisit un mot de passe personnel. Le navigateur génère une paire de clés asymétriques (`ECDH P-256`), chiffre la clé privée localement via `PBKDF2` + `AES-GCM`, et soumet uniquement le jeton public via une GitHub Issue.
2. **Tirage automatisé :** Dès que le quota de participants est atteint (ou à la date limite configurée), un workflow GitHub Actions exécute un dérangement aléatoire (`crypto.randomInt`), chiffre chaque cible avec la clé publique du donneur, écrit `tirage.json` et ferme les Issues.
3. **Révélation :** Le participant s'authentifie avec son mot de passe pour déchiffrer localement son attribution.

## Déployer votre propre instance

1. Cliquez sur **Use this template** (ou **Fork**) en haut de ce dépôt.
2. Allez dans **Settings > Actions > General** et activez **Read and write permissions** sous *Workflow permissions*.
3. Allez dans **Settings > Pages**, sélectionnez la branche `main` et enregistrez.
4. Éditez le fichier `.github/workflows/tirage.yml` pour définir votre nombre de participants (`NB_PARTICIPANTS`) et la date limite (`cron`).
5. Partagez l'URL GitHub Pages à votre groupe.