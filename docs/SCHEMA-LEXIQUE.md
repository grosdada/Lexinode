# Schéma d'un lexique (fiche d'éléments de langage)

Chaque fichier `data/lexicons/<id>.json` décrit **un corps de métier** (`famille: "metier"`) ou **une grille de lecture sociologique** (`famille: "sociologie"`).
Le moteur de Lexinode s'en sert de deux façons :

1. **Moteur local (sans IA)** : il pioche dans `formules`, `structures[].etapes[].gabarits`, `vocabulaire`, `substitutions`, `euphemismes`, `cadres`… et remplit les *placeholders* pour produire un raisonnement.
2. **Moteur IA (Claude, OpenAI, Gemini, Ollama…)** : la fiche est résumée et injectée dans le prompt système de l'agent comme « charte d'éléments de langage ».

Tout le contenu textuel est **en français**, sauf les champs `*_en` (anglais, pour les prompts vidéo).

## Placeholders autorisés (et SEULEMENT ceux-là)

| Placeholder    | Remplacé par | Exemple de valeur |
|----------------|--------------|-------------------|
| `{sujet}`      | le thème, groupe nominal AVEC son article | « la vente de pantoufles en Irlande » |
| `{element}`    | un fait / un élément discuté, groupe nominal avec article | « la hausse des naissances » |
| `{chiffre}`    | un nombre avec son unité | « 12 000 paires » |
| `{evenement}`  | un événement, groupe nominal avec article | « la fermeture de l'usine de Cork » |
| `{a}` / `{b}`  | les deux termes d'une comparaison, groupes nominaux avec article | « les pantoufles irlandaises », « les girafons de Melbourne » |
| `{conclusion}` | une proposition complète SANS point final | « les deux courbes évoluent en parallèle » |
| `{terme}`      | un terme du vocabulaire du lexique (choisi par le moteur) | « balance bénéfice-risque » |
| `{public}`     | le public visé, groupe nominal avec article | « les citoyens » |

Règles d'écriture des gabarits / formules :
- Une phrase complète, terminée par un point (ou `:` / `?` / `!`).
- Les placeholders sont des groupes nominaux **qui portent déjà leur article** : écrire « Concernant {sujet}, … », « s'agissant de {sujet} », « {sujet} constitue… ». **Ne jamais** écrire « le {sujet} », « du {sujet} », « au {sujet} », « un {element} ».
- Pas d'autres accolades que les placeholders ci-dessus.
- Une formule peut ne contenir aucun placeholder (ex. « Il faut être très clair. »).

## Rôles autorisés pour les étapes de structure

`contexte`, `faits`, `analyse`, `tension`, `hypothese`, `decision`, `projection`, `conclusion`

Le moteur local y range les blocs de l'utilisateur : les événements « précédents » vont en `contexte`, les données en `faits`/`analyse`, les comparaisons en `analyse`/`tension`, la conclusion des comparaisons en `conclusion`.

## Structure complète

```jsonc
{
  "id": "medecine",                    // slug ascii minuscule = nom du fichier sans .json
  "nom": "Médecine",
  "famille": "metier",                 // "metier" | "sociologie"
  "categorie": "Santé",                // libellé de regroupement libre
  "icone": "🩺",                        // un emoji
  "couleur": "#2E86AB",                // hex
  "description": "2 à 3 phrases : de quoi parle cette fiche.",
  "posture": "1 à 2 phrases : posture énonciative (qui parle, depuis quelle autorité, avec quelle prudence).",
  "valeurs": ["5 à 8 valeurs / sources de légitimité invoquées"],

  "vocabulaire": [                     // 35 à 50 entrées
    { "terme": "balance bénéfice-risque", "sens": "définition courte", "usage": "courte phrase d'exemple" }
  ],
  "formules": [                        // 25 à 35 phrases-types (« éléments de langage » au sens strict)
    "Il convient de rester prudent s'agissant de {sujet}."
  ],
  "connecteurs": ["Sur le plan clinique,", "À ce stade,"],   // 10 à 15 transitions typiques (avec ponctuation finale)
  "euphemismes": [                     // 10 à 20 : mot cru -> élément de langage
    { "brut": "mourir", "edl": "décéder", "commentaire": "pourquoi / où on l'entend" }
  ],
  "substitutions": [                   // 15 à 30 : mot courant (minuscule) -> mot du métier, pour « traduire » un texte
    { "de": "problème", "vers": "complication" }
  ],
  "cadres": [                          // 5 à 8 grilles de lecture
    { "nom": "Facteurs de risque", "question": "Quels facteurs augmentent la probabilité de {element} ?", "explication": "1 phrase" }
  ],
  "structures": [                      // 2 à 3 structures argumentatives typiques du métier
    {
      "nom": "Démarche clinique",
      "description": "1 phrase",
      "etapes": [                      // 4 à 6 étapes
        {
          "titre": "Anamnèse",
          "role": "contexte",          // voir rôles autorisés
          "consigne": "Instruction pour un LLM : ce que cette étape doit faire.",
          "gabarits": ["2 à 3 phrases-gabarits utilisant les placeholders."]
        }
      ]
    }
  ],
  "rapport_aux_chiffres": {
    "posture": "1 à 2 phrases sur la façon dont le métier manie les chiffres.",
    "unites": ["incidence pour 100 000 habitants", "…"],
    "formulations": ["5 à 8 gabarits chiffrés, ex. « {a} présente une incidence de {chiffre}, à comparer à {b}. »"]
  },
  "metaphores": ["8 à 12 images / métaphores récurrentes"],
  "pieges": ["6 à 10 dérives, critiques, travers de ce langage (langue de bois, jargon, biais)"],
  "registres": {
    "institutionnel": "1 phrase : comment ça sonne en communication officielle",
    "technique": "1 phrase : entre pairs",
    "vulgarisation": "1 phrase : pour le grand public",
    "critique": "1 phrase : comment ses détracteurs le parodient / le dénoncent"
  },
  "visuel": {                          // pour les prompts de shorts animés
    "palette": ["#hex", "#hex", "#hex", "#hex", "#hex"],
    "motifs": [ { "fr": "schéma anatomique en coupe", "en": "anatomical cross-section diagram" } ],   // 8 à 12
    "pictogrammes": [ { "fr": "stéthoscope", "en": "stethoscope" } ],                               // 8 à 12
    "typographie": "1 phrase",
    "style_motion": "1 à 2 phrases (FR) décrivant le style d'un film institutionnel animé de ce métier",
    "style_motion_en": "same in English, usable as a video-model prompt fragment"
  },
  "exemples": [                        // 2 à 4 exemples réels ou typiques d'éléments de langage, avec contexte
    { "contexte": "Communication de crise hospitalière", "texte": "« … »" }
  ],
  "sources": [                         // 4 à 10 sources réelles, vérifiées
    { "titre": "…", "auteur": "…", "url": "https://…", "apport": "ce que la source a apporté à la fiche" }
  ]
}
```

Vérification : `node scripts/validate-lexicons.js data/lexicons/<id>.json` (ou sans argument pour tout valider).
