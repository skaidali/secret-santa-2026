# 🎄 Secret Santa - Tirage au sort en ligne

Application web statique permettant aux participants d'un Secret Santa de découvrir secrètement à qui ils doivent offrir un cadeau, en s'authentifiant avec adresse e-mail étudiante (Zimbra).

🔗 **Accéder au site :** `https://skaidali.github.io/secret-santa-2026/`

---

## Fonctionnement

1. **Authentification sans mot de passe (Magic Link) :** Le participant saisit son identifiant étudiant. Un lien de connexion unique lui est envoyé directement sur sa messagerie Zimbra.
2. **Confidentialité :** Une fois le lien cliqué, l'application interroge la base de données sécurisée et affiche uniquement le nom de la personne attribuée. Personne (pas même l'organisateur) ne peut consulter le tirage global.

---

## Stack Technique

* **Frontend :** HTML5, CSS3, JavaScript (Vanilla ES Modules)
* **Hébergement :** GitHub Pages
* **Authentification :** Firebase Authentication (Email Link / Passwordless)
* **Base de données & Sécurité :** Cloud Firestore avec règles d'accès strictes par adresse e-mail authentifiée

---

## Sécurité des données

L'accès aux résultats du tirage est verrouillé côté serveur via les règles de sécurité Firestore :
* Un utilisateur authentifié ne peut lire **que** le document correspondant à son propre e-mail vérifié.
* Toute écriture ou modification depuis le web est désactivée après l'initialisation du tirage.