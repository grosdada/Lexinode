'use strict';
/*
 * LEXINODE — coffre de clés API (serveur uniquement, sans dépendance)
 *  - chiffrement AES-256-GCM ; la clé est dérivée de LEXINODE_MASTER_KEY par HMAC-SHA256
 *  - un coffre par installation (pas de comptes) : la clé maîtresse reste dans .env, le coffre dans data/vault/
 *  - les valeurs ne sortent jamais par l'API : seul le serveur les déchiffre pour appeler les fournisseurs
 *  - sans LEXINODE_MASTER_KEY, le coffre est désactivé et l'appli garde son fonctionnement d'origine
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const IDS = ['anthropic', 'openai', 'gemini', 'deepseek', 'compatible', 'tavily', 'brave', 'fal', 'minimax', 'dashscope'];
const CONTEXT = 'lexinode-vault-v1';

function create({ file, master }) {
  let keys = {};
  let key = null;
  let enabled = false;
  let locked = false;
  let error = '';

  function encrypt(obj) {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', key, iv);
    c.setAAD(Buffer.from(CONTEXT));
    const data = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
    return JSON.stringify({ v: 1, algorithm: 'aes-256-gcm', iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') });
  }
  function decrypt(text) {
    const j = JSON.parse(text);
    const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(j.iv, 'base64'));
    d.setAAD(Buffer.from(CONTEXT));
    d.setAuthTag(Buffer.from(j.tag, 'base64'));
    return JSON.parse(Buffer.concat([d.update(Buffer.from(j.data, 'base64')), d.final()]).toString('utf8'));
  }
  function write(obj) {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, encrypt(obj), { mode: 0o600 });
    fs.renameSync(tmp, file);
  }

  if (master) {
    if (String(master).length < 16) {
      error = 'LEXINODE_MASTER_KEY est trop courte (16 caractères minimum ; par exemple : openssl rand -hex 32).';
    } else {
      key = crypto.createHmac('sha256', String(master)).update(CONTEXT).digest();
      enabled = true;
      if (fs.existsSync(file)) {
        try { keys = decrypt(fs.readFileSync(file, 'utf8')); } catch (e) {
          // On ne touche à rien : écraser le fichier détruirait des clés récupérables avec la bonne clé maîtresse.
          locked = true;
          error = 'Coffre illisible : clé maîtresse modifiée ou fichier altéré. Le fichier n’a pas été modifié.';
        }
      }
    }
  }

  const usable = () => enabled && !locked;

  return {
    IDS,
    get enabled() { return enabled; },
    get locked() { return locked; },
    get: (id) => (usable() ? keys[id] : undefined),
    status: () => ({ enabled, locked, error, keys: usable() ? Object.keys(keys) : [] }),
    // set : { id: valeur } (valeur vide = retrait) ; remove : [id]. Écrit sur disque avant de remplacer l'état mémoire.
    update({ set, remove } = {}) {
      if (!enabled) throw new Error('Coffre désactivé : définissez LEXINODE_MASTER_KEY dans .env (openssl rand -hex 32) puis relancez le serveur.');
      if (locked) throw new Error(error);
      const next = Object.assign({}, keys);
      for (const [id, v] of Object.entries(set || {})) {
        if (!IDS.includes(id)) throw new Error(`Clé inconnue : ${id}`);
        const val = String(v == null ? '' : v).trim();
        if (!val) delete next[id];
        else if (val.length > 2000 || /[\r\n]/.test(val)) throw new Error(`Valeur invalide pour ${id}`);
        else next[id] = val;
      }
      for (const id of remove || []) delete next[id];
      write(next);
      keys = next;
      return this.status();
    },
  };
}

module.exports = { create, IDS };
