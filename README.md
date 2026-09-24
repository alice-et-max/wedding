# Site de mariage Alice & Maxime

Site d'une seule page (pensé pour smartphone), hébergé gratuitement sur GitHub Pages. Le faire-part papier renvoie vers lui par un lien et un QR code.

Ce qu'il contient : compte à rebours, présentation, confirmation de présence (avec accès au dîner par mot de passe), liste de voeux avec montant restant en direct, plan de table (à venir), photos du mariage.

## Comment ça marche

- Le site lui-même est statique (HTML, CSS, JavaScript) : dossier `src/` + `assets/`.
- Les réponses et les participations sont envoyées à un petit programme Google (Apps Script) lié à un Google Sheet. Il enregistre chaque envoi dans le Sheet et vous prévient par email.
- Tout ce qui reste à compléter est écrit entre crochets, par exemple `[IBAN CH À COMPLÉTER]`, et apparaît en pointillés sur le site.

Tant que l'URL de l'Apps Script n'est pas renseignée, le site fonctionne en **mode démo** : rien n'est envoyé, un bandeau « Mode démo » est affiché.

## 1. Mettre en place l'Apps Script (une seule fois)

1. Créez un nouveau Google Sheet (par exemple « Mariage Alice & Maxime »).
2. Menu **Extensions > Apps Script**. Supprimez le code présent et collez tout le contenu de `apps-script/Code.gs`.
3. En haut du fichier, remplacez :
   - `NOTIFY_EMAILS` : vos deux adresses email (elles recevront un message à chaque réponse et chaque participation) ;
   - `SITE_BASE_URL` : l'adresse du site publié, terminée par `/`, par exemple `https://alice-et-max.github.io/wedding/`. Elle sert à lire les prix dans `data/voeux.json` (voir plus bas). Vous pouvez la remplir après la première mise en ligne.
4. Cliquez sur **Déployer > Nouveau déploiement**, type **Application Web** :
   - Exécuter en tant que : **Moi**
   - Qui a accès : **Tout le monde**
5. Autorisez l'accès quand Google le demande (Google affiche « application non vérifiée » : **Paramètres avancés > Accéder au projet**). C'est ce qui permet d'écrire dans le Sheet et d'envoyer les emails.
6. Copiez l'**URL de l'application Web** (elle se termine par `/exec`) et collez-la dans `src/config.js`, à la ligne `APPS_SCRIPT_URL`.
7. Test : dans l'éditeur Apps Script, choisissez la fonction `testRsvp` puis **Exécuter**. Vous devez voir apparaître l'onglet « Réponses » avec une ligne « Test Essai » et recevoir un email. Faites de même avec `testVoeu` (onglet « Voeux »). Supprimez ensuite ces lignes de test dans le Sheet.

Attention : après toute modification de `Code.gs`, il faut **Déployer > Gérer les déploiements > Modifier > Nouvelle version**, sinon l'ancienne version reste active. L'URL ne change pas.

## 2. Mot de passe du dîner

Le site ne stocke pas le mot de passe, seulement son empreinte SHA-256. Pour la calculer (dans un terminal) :

```
printf 'motdepasse' | sha256sum
```

Copiez les 64 caractères obtenus dans `src/config.js`, à la ligne `DINNER_PASSWORD_SHA256`. Le mot de passe est comparé sans espaces autour, majuscules et minuscules comptent. La valeur actuelle correspond au mot de passe de test `mariage-test` : à changer avant d'envoyer les faire-part.

Ce n'est qu'un filtre léger : quelqu'un de très motivé pourrait le contourner, car la vérification se fait dans le navigateur. Il ne protège pas un vrai secret.

## 3. Modifier la liste de voeux

La liste est le fichier `src/data/voeux.json`. Chaque cadeau ressemble à ceci :

```json
{
  "id": "voyage-vols",
  "title": "Vols pour la lune de miel",
  "description": "Une contribution aux billets d'avion.",
  "price": 400
}
```

- `id` : identifiant **unique et stable** (lettres minuscules, chiffres, tirets). Il relie les participations du Sheet au cadeau. Ne le changez jamais après la mise en ligne, et **ne réutilisez jamais** l'identifiant d'un cadeau supprimé.
- `price` : prix en francs suisses, nombre entier. Modifier le prix change simplement le « reste à financer » (le total déjà promis ne bouge pas).
- Pas d'image : la liste est volontairement épurée (titre, description, prix, reste à financer).
- Les 6 cadeaux actuels sont des **exemples** (repérables au texte `[EXEMPLE À REMPLACER]`) : remplacez-les.

Le programme Google relit ce fichier sur le site publié (via `SITE_BASE_URL`) pour connaître les prix, et refuse toute participation supérieure au reste à financer. Il se met à jour tout seul (au plus une heure de décalage). Pour forcer la mise à jour après une modification : dans l'éditeur Apps Script, exécutez la fonction `syncPricesFromSite`.

Si `SITE_BASE_URL` n'est pas rempli ou injoignable, le programme se rabat sur le prix annoncé par la page web : moins fiable, à éviter en production.

## 4. Participations (promesses) et paiements réels

Pour participer, l'invité indique seulement un montant et son nom (pas d'email ni de message). Colonnes de l'onglet « Voeux » : date, item_id, item_titre, montant, nom, Reçu. Si vous aviez déjà lancé des tests avec une version antérieure, supprimez les onglets « Réponses » et « Voeux » avant de redéployer : ils seront recréés avec les nouvelles colonnes.

Sur le site, « Participer » enregistre une **promesse** : aucun argent n'est prélevé. Le don réel se fait ensuite par Twint ou par virement, en indiquant le nom du cadeau en référence (les coordonnées sont affichées sous la liste).

- Onglet **Voeux** du Sheet : une ligne par promesse.
- Colonne **Reçu** : cochez la case quand le paiement est arrivé. Elle n'a aucun effet sur le site : le compteur public reflète les montants promis.
- Pour annuler une promesse, supprimez sa ligne : le reste à financer est recalculé automatiquement (au plus 30 secondes plus tard).

## 5. Informations à compléter

```
grep -rn "\[.*\]" src/config.js
grep -rn "À COMPLÉTER\|EXEMPLE" src
```

Dans `src/config.js` : date et lieu du mariage, URL de l'Apps Script, empreinte du mot de passe, numéro Twint, IBAN suisse et français, titulaire du compte, contact, URL du site. Dans `apps-script/Code.gs` : `NOTIFY_EMAILS` et `SITE_BASE_URL`.

La date limite de réponse est fixée au 1er mars 2027 (`RSVP_DEADLINE`). Après cette date, le formulaire reste utilisable mais un message invite à nous contacter.

## 6. Tester en local

```
scripts/dev.sh
```

Le script copie `src/` et `assets/` dans `_site/` et lance un petit serveur local ; l'adresse s'affiche dans le terminal. Ouvrez-la dans un navigateur, de préférence en mode affichage smartphone.

## 7. QR code

Une fois le site en ligne :

```
python scripts/make_qr.py https://alice-et-max.github.io/wedding/
```

L'image du QR code est générée dans `assets/`. Scannez-la avec un téléphone avant d'imprimer.

## Déploiement (GitHub Pages)

1. Poussez le dépôt sur GitHub.
2. Dans le dépôt : **Settings > Pages > Source : GitHub Actions**.
3. Chaque envoi sur la branche principale lance le workflow `.github/workflows/pages.yml`, qui assemble `src/` et `assets/` et publie le site.
4. L'adresse du site apparaît dans l'onglet **Actions** puis dans **Settings > Pages**. Reportez-la dans `SITE_URL` (`src/config.js`) et dans `SITE_BASE_URL` (`Code.gs`).
