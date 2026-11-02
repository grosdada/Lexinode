# Banque de topics (node « 🎲 Topic aléatoire »)

Fichiers : `data/topics/*.json` (tous fusionnés au chargement). Validation : `node scripts/validate-topics.js`.

```jsonc
{
  "sujets": [
    {
      "t": "les ventes de pantoufles en Irlande dans les années 80", // groupe nominal AVEC article, sans point final
      "a": "Que racontent ces pantoufles de l’Irlande de l’époque ?",  // angle : une question
      "c": "insolite",                                                // catégorie (liste ci-dessous)
      "f": 4,                                                         // folie : 1 = sérieux … 5 = complètement absurde
      "q": "Combien de paires de pantoufles ont été vendues en Irlande entre 1980 et 1989 ?", // facultatif : question chiffrable
      "u": "paires"                                                   // facultatif : unité de la donnée
    }
  ],
  "paires": [
    { "a": "les ventes de glaces à Marseille", "b": "le nombre de noyades en Méditerranée", "f": 2,
      "pourquoi": "Cas d’école de variable cachée : la chaleur estivale fait monter les deux." }
  ],
  "generateur": {
    "listes": { "objets": ["pantoufles", "parapluies"], "lieux": ["en Irlande", "au Japon"], "periodes": ["dans les années 80"] },
    "gabarits": [
      { "t": "les ventes de {objets} {lieux} {periodes}", "a": "Que disent les ventes de {objets} {lieux} {periodes} ?",
        "q": "Combien de {objets} ont été vendus {lieux} {periodes} ?", "c": "absurde", "f": 4 }
    ]
  }
}
```

Catégories : `insolite`, `histoire`, `science`, `nature`, `societe`, `economie`, `tech`, `culture`, `sport`, `alimentation`, `corps`, `absurde`.

Règles éditoriales :
- **variété** : pas deux topics sur la même idée ; des échelles différentes (un objet, une ville, un siècle, la planète) ;
- **précision** : un topic précis et concret vaut mieux qu’un thème vague (« la fabrication des boules à neige » plutôt que « les souvenirs ») ;
- **prudence factuelle** : un titre ne doit pas affirmer un fait douteux. Un fait incertain se formule en question dans l’angle ;
- **respect** : pas de personne privée, pas de moquerie de victimes, de drames récents ou de groupes, pas de contenu sexuel ou gore, pas de conseil médical.
