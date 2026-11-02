#!/usr/bin/env node
/* Construit l'installateur Windows : desktop/dist/Lexinode-Setup-<version>.exe
 *   1. prépare build/ : l'appli (sans données ni outils), node.exe, l'icône, le lanceur compilé par le csc de Windows
 *   2. compile lexinode.iss avec Inno Setup (paquet npm innosetup-compiler, installé dans desktop/node_modules)
 * Usage : cd desktop && npm install && node build.js */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BUILD = path.join(__dirname, 'build');
const version = require(path.join(ROOT, 'package.json')).version;
const ISCC = path.join(__dirname, 'node_modules', 'innosetup-compiler', 'bin', 'ISCC.exe');
const CSC = path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
for (const f of [ISCC, CSC]) {
  if (!fs.existsSync(f)) { console.error('Introuvable : ' + f + (f === ISCC ? '\nLancez d’abord « npm install » dans desktop/.' : '')); process.exit(1); }
}

// 1. l'application : seulement ce qui sert à l'exécution (les données de l'utilisateur vivent dans %APPDATA%\Lexinode)
fs.rmSync(BUILD, { recursive: true, force: true });
const app = path.join(BUILD, 'app');
fs.mkdirSync(app, { recursive: true });
for (const f of ['server.js', 'vault.js', 'package.json']) fs.copyFileSync(path.join(ROOT, f), path.join(app, f));
for (const d of ['public', 'data/lexicons', 'data/topics', 'data/examples']) fs.cpSync(path.join(ROOT, d), path.join(app, d), { recursive: true });

// Node embarqué : celui qui fait tourner ce script (même version que celle testée)
const nodeDir = path.join(BUILD, 'node');
fs.mkdirSync(nodeDir);
fs.copyFileSync(process.execPath, path.join(nodeDir, 'node.exe'));
// licence de Node (MIT et licences tierces) : à distribuer avec node.exe. Fichier tiré du dépôt nodejs/node, même version.
fs.copyFileSync(path.join(__dirname, 'LICENSE-node.txt'), path.join(nodeDir, 'LICENSE-node.txt'));

// 2. icône et lanceur
const ico = path.join(BUILD, 'lexinode.ico');
execFileSync(process.execPath, [path.join(__dirname, 'make-icon.js'), ico], { stdio: 'inherit' });
execFileSync(CSC, ['/nologo', '/target:winexe', '/optimize+', '/out:' + path.join(BUILD, 'Lexinode.exe'), '/win32icon:' + ico,
  '/reference:System.dll', '/reference:System.Windows.Forms.dll', '/reference:System.Management.dll', path.join(__dirname, 'Lexinode.cs')], { stdio: 'inherit' });

// 3. installateur
execFileSync(ISCC, ['/Q', '/DAppVersion=' + version, path.join(__dirname, 'lexinode.iss')], { stdio: 'inherit', cwd: __dirname });
const out = path.join(__dirname, 'dist', `Lexinode-Setup-${version}.exe`);
console.log(`\nInstallateur : ${out} (${(fs.statSync(out).size / 1048576).toFixed(1)} Mo)`);
