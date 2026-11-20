# Secret Santa — Protocole Zero-Knowledge sur GitHub Pages

Application web statique et open source permettant d'organiser un Secret Santa sans serveur tiers, sans base de données et sans création de compte pour les participants.

## Architecture et confidentialité

1. **Chiffrement côté client (`Web Crypto API`) :** Lors de son inscription, chaque participant choisit un mot de passe personnel. Le navigateur génère une paire de clés asymétriques (`ECDH P-256`), chiffre la clé privée localement (`PBKDF2` + `AES-GCM`), et transmet uniquement le jeton public sur un canal éphémère open source (`ntfy.sh`) isolé par le nom du dépôt.
2. **Tirage automatisé (`GitHub Actions`) :** Un workflow vérifie périodiquement les inscriptions reçues. Dès que le quota de participants est atteint (ou lors d'un déclenchement manuel), le script exécute un dérangement aléatoire (`crypto.randomInt`), chiffre chaque attribution avec la clé publique du donneur, et publie le fichier `tirage.json`.
3. **Révélation locale :** Une fois le tirage publié, le participant sélectionne son nom et saisit son mot de passe pour déchiffrer localement son attribution. Personne (pas même l'organisateur) ne peut consulter les résultats.

---

## Déployer votre propre instance (Guide pas à pas)

Aucune compétence en programmation ni aucun compte externe n'est requis.

### 1. Dupliquer le dépôt
* Cliquez sur le bouton vert **Use this template** (ou **Fork**) en haut à droite de cette page pour créer une copie sur votre compte GitHub.

### 2. Activer et autoriser GitHub Actions
* Allez dans l'onglet **Actions** de votre dépôt et cliquez sur le bouton vert pour activer les workflows (désactivés par défaut sur les copies).
* Allez ensuite dans **Settings > Actions > General**, descendez tout en bas jusqu'à la section *Workflow permissions*, cochez **Read and write permissions**, puis cliquez sur **Save**.

### 3. Activer l'hébergement web (GitHub Pages)
* Allez dans **Settings > Pages**.
* Sous *Build and deployment > Branch*, sélectionnez la branche **`main`** (dossier `/root`) et cliquez sur **Save**.
* L'URL de votre site apparaîtra en haut de cette page après 1 minute (`https://votre-pseudo.github.io/votre-depot/`).

### 4. Configurer le nombre de participants
* Ouvrez le fichier `.github/workflows/tirage.yml` dans votre dépôt et cliquez sur l'icône crayon (Modifier).
* Remplacez `"6"` à la ligne `NB_PARTICIPANTS: "6"` par le nombre exact de participants de votre groupe.
* Cliquez sur **Commit changes**.

---

## Déroulement du tirage

1. **Inscriptions (fenêtre de 12 heures) :** Partagez l'URL de votre site à votre groupe. Chaque participant entre son prénom et choisit son mot de passe. *(Note : le canal temporaire `ntfy.sh` conserve les inscriptions pendant 12 heures ; lancez les inscriptions dans une même journée).*
2. **Tirage automatique :** Dès que le dernier participant est inscrit, le robot GitHub détecte que le quota est atteint (vérification automatique toutes les 30 minutes) et génère le fichier `tirage.json`.
   * *Déclenchement immédiat :* Si tout le monde est inscrit et que vous ne souhaitez pas attendre, allez dans **Actions > Secret Santa Auto-Draw > Run workflow**.
3. **Révélation :** Dès que `tirage.json` est publié, le site bascule automatiquement sur l'écran de connexion. Chacun sélectionne son prénom et entre son mot de passe pour découvrir sa cible.

## Réinitialiser pour une nouvelle édition

Pour remettre le site à zéro et relancer un nouveau tirage :
1. Supprimez le fichier `tirage.json` à la racine de votre dépôt GitHub (cliquez sur le fichier > icône `...` > **Delete file** > **Commit changes**).
2. Assurez-vous qu'aucune inscription de moins de 12 heures n'est encore active sur le canal `ntfy.sh` (ou renommez simplement votre dépôt GitHub dans **Settings > General** pour repartir sur un canal vierge).