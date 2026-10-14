# STIB-MIVB

**Connecteur non officiel, sans lien avec la STIB-MIVB.** Il amène les métros,
trams et bus bruxellois dans Gladys via les données ouvertes de la STIB-MIVB
publiées sur le [portail de données ouvertes Belgian Mobility](https://data.belgianmobility.io/).
STIB-MIVB est une marque de la Société des Transports Intercommunaux de
Bruxelles. Source des données : STIB-MIVB – Open Data (CC BY 4.0).

## Ce que vous obtenez

| Surface                                | Contenu                                                                                                                                                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Un appareil par **quai d'arrêt suivi** | minutes avant le prochain métro, tram ou bus, et pour chacun des prochains départs (3 par défaut) : le compte à rebours et une ligne de texte « 92 → Schaerbeek Gare » ; le message STIB de l'arrêt (« Dernier passage ») |
| L'appareil **Réseau STIB**             | le nombre d'avis aux voyageurs sur le réseau et pour vos arrêts et lignes, l'avis principal pour vos arrêts                                                                                                               |
| Déclencheurs de scène                  | **véhicule imminent** (1 à 15 minutes avant l'arrivée, éventuellement pour une ligne), **dernier passage du jour**, **ligne perturbée** et **perturbation levée** (un avis publié ou retiré)                              |
| Action de scène                        | **prochains départs** d'un arrêt (liste, prochaine ligne, destination, compte à rebours, message STIB)                                                                                                                    |
| Widgets                                | **Départs STIB** (un arrêt) et **Réseau STIB** (les avis pour vos arrêts et lignes, ou les lignes choisies)                                                                                                               |

Un arrêt STIB a un quai par direction (et par mode aux grands arrêts) :
`LOUISE` a le métro vers Simonis / Roi Baudouin (`8321`), le métro vers
Elisabeth (`8322`) et deux quais de tram. Chaque quai est un appareil :
ajoutez les directions que vous prenez.

## Installation

1. Recommandé : créez un compte gratuit sur le
   [portail développeur Belgian Mobility](https://api-management-opendata-production.developer.azure-api.net/signup),
   abonnez-vous à l'offre gratuite et collez la clé primaire dans **Clé
   d'abonnement**. Sans clé, le portail autorise 100 requêtes par jour :
   l'intégration ne lit alors les départs que toutes les 20 minutes, trop
   lentement pour le déclencheur « véhicule imminent ».
2. Installez l'intégration. Chaque quai des arrêts les plus proches de votre
   maison (la position de la maison dans Gladys) est proposé dans
   **Découverte** : ajoutez ceux que vous utilisez.
3. Pour suivre d'autres arrêts, saisissez-les dans **Arrêts à suivre**,
   séparés par des virgules : un nom (`Louise` et `Louiza` fonctionnent tous
   deux) ou un identifiant de quai (`3518B`). Le bouton **Chercher des
   arrêts** liste les quais d'un arrêt avec leur identifiant et leurs lignes.
4. Facultatif, par arrêt : un **filtre de lignes** après `@` ne garde que ces
   lignes (`Louise@2|6`), et un **nom personnalisé** après `:` nomme les
   appareils (`...:Métro du matin`). Enregistrez, puis rouvrez **Découverte**
   et ajoutez les appareils.
5. Placez le widget **Départs STIB** sur un tableau de bord et choisissez un
   arrêt.

Avec une clé, chaque arrêt suivi est lu toutes les 30 secondes, tous en une
requête (option **Intervalle de rafraîchissement**, 20 secondes au minimum),
les avis toutes les 5 minutes et la liste des arrêts une fois par jour. Sans
clé : les départs toutes les 20 minutes, les avis toutes les 2 heures.

## Scènes

- **Véhicule imminent** : choisissez l'arrêt, le nombre de minutes et,
  facultativement, la ligne telle que la STIB l'écrit (`92`, `T81`) ; la
  scène s'exécute quand un véhicule atteint ce seuil. Variables : la ligne,
  la destination, les minutes restantes, l'heure prévue.
- **Dernier passage du jour** : la STIB signale le dernier passage d'une
  ligne à l'arrêt ; la scène s'exécute une fois par ligne et direction.
- **Ligne perturbée** / **perturbation levée** : la STIB a publié ou retiré
  un avis aux voyageurs (perturbation, travaux, déviation) pour une ligne.
  Nécessite l'appareil Réseau STIB. Filtrez sur une ligne, ou sur les avis
  concernant vos arrêts et lignes. Variables : la ligne, l'avis, les lignes
  concernées.

L'action **prochains départs** donne `{{list}}` (un départ par ligne) et
`{{next_line}}`, `{{next_destination}}`, `{{next_minutes}}`, `{{message}}`
pour un message ou une condition.

## Dépannage

- **Un arrêt n'est pas trouvé** : la STIB écrit ses arrêts en capitales, en
  français et en néerlandais ; utilisez **Chercher des arrêts** avec une
  partie du nom.
- **« Sans clé d'abonnement »** dans le statut : ajoutez une clé (étape 1).
- **« Request quota exceeded »** : le quota anonyme est partagé par tout ce
  qui appelle le portail sans clé depuis votre connexion ; ajoutez une clé.
- **Aucun départ annoncé** la nuit : la STIB affiche son propre message à la
  place (« Dernier passage », « Service terminé ») dans la fonctionnalité
  message.
- Logs : le niveau de log de l'intégration se règle avec la variable
  `LOG_LEVEL`.

## Confidentialité

L'intégration n'envoie au portail que les identifiants des quais qu'elle lit,
et la clé d'abonnement dans un en-tête. La position de la maison sert, dans
l'intégration, à choisir les arrêts les plus proches et ne la quitte jamais.
