/*
 * LEXINODE — jeu d'icônes vectorielles maison (24×24, trait 1,6, extrémités arrondies).
 * Une icône = une couleur à plat (currentColor) : la couleur vient du type de node, du langage, ou du texte (monochrome).
 */
(function (LX) {
  'use strict';
  const dot = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r || 1.1}" fill="currentColor" stroke="none"/>`;
  const mono = (letter) => `<circle cx="12" cy="12" r="9.2"/><text x="12" y="16.2" text-anchor="middle" font-size="11.5" font-family="Georgia, 'Times New Roman', serif" font-style="italic" fill="currentColor" stroke="none">${letter}</text>`;

  const I = {
    // ---- types de nodes
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/>' + dot(12, 12, 1.4),
    compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5 13.4 13.4 8.5 15.5 10.6 10.6z"/>',
    note: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 12h6M9 16h6"/>',
    calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>' + dot(9, 14.5, 1) + dot(13, 14.5, 1),
    bars: '<path d="M4 20h16"/><path d="M7 20v-6M12 20V8M17 20v-10"/>',
    speech: '<path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M8 9.5h8M8 12.5h5"/>',
    sliders: '<path d="M6 4v7M6 15v5M12 4v2M12 10v10M18 4v9M18 17v3"/><circle cx="6" cy="13" r="2"/><circle cx="12" cy="8" r="2"/><circle cx="18" cy="15" r="2"/>',
    prism: '<path d="M12 4.5 20 19H4z"/><path d="M1.5 13h6.3"/><path d="M15.4 11.2 22 9M15.9 12.9 22 13.6M16.4 14.6 21.5 18"/>',
    decode: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 20.5 20.5"/><path d="M7.5 9h6M7.5 12h4"/>',
    scales: '<path d="M12 4v16M8 20h8M5 7h14"/><path d="M2.5 13a2.5 2.5 0 0 0 5 0L5 7z"/><path d="M16.5 13a2.5 2.5 0 0 0 5 0L19 7z"/>',
    scatter: '<path d="M4 4v16h16"/>' + dot(8, 15.5) + dot(10.5, 12.5) + dot(13.5, 13.5) + dot(15.5, 9.5) + dot(18.5, 7) + '<path d="M6.5 17.5 20 6" stroke-dasharray="1.8 2.2"/>',
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2V16h5v-.2c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3z"/>',
    debate: '<path d="M4 4.5h10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H8l-3 2.5v-2.5H4a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1z"/><path d="M17.5 8.5H20a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-1v2.5l-3-2.5h-4a1 1 0 0 1-1-1v-1"/>',
    robot: '<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 8V5.5"/><circle cx="12" cy="4.2" r="1.2"/>' + dot(9.5, 13, 1.1) + dot(14.5, 13, 1.1) + '<path d="M10 16.3h4M3 12.5v3M21 12.5v3"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.9 1.8-1.9 0-.5-.2-.9-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/>' + dot(7.5, 11.5, 1.1) + dot(9.8, 7.5, 1.1) + dot(14.5, 7.3, 1.1),
    film: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9.3v5.4l4.6-2.7z"/><path d="M3 8.5h2M3 15.5h2M19 8.5h2M19 15.5h2"/>',
    clapper: '<path d="M4 10h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M4 10 3.4 6.6a1 1 0 0 1 .8-1.2l13.8-2.4a1 1 0 0 1 1.2.8L19.7 7z"/><path d="M8.2 5.6l2.4 3.6M13.2 4.7l2.4 3.6"/>',
    die: '<rect x="4" y="4" width="16" height="16" rx="3.5"/>' + dot(8.6, 8.6, 1.3) + dot(12, 12, 1.3) + dot(15.4, 15.4, 1.3),
    // ---- interface
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    save: '<path d="M5 4h11l3 3v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
    download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
    doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 11h6M9 14.5h6M9 18h4"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
    play: '<path d="M7 5v14l11-7z" fill="currentColor"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    prev: '<path d="M6 5v14M19 5 9 12l10 7z"/>',
    next: '<path d="M18 5v14M5 5l10 7-10 7z"/>',
    book: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/>',
    settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1.1.9-1.1 1.6v.4"/>' + dot(12, 16.9, 1),
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/>' + dot(12, 7.8, 1),
    fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx=".6"/><path d="M9.5 3v3M14.5 3v3M9.5 18v3M14.5 18v3M3 9.5h3M3 14.5h3M18 9.5h3M18 14.5h3"/>',
    sparkle: '<path d="M11 3.5l1.7 4.8 4.8 1.7-4.8 1.7L11 16.5l-1.7-4.8L4.5 10l4.8-1.7z"/><path d="M18 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    frame: '<rect x="7" y="3" width="10" height="18" rx="2"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
    monitor: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>',
    camera: '<rect x="3" y="7" width="13" height="10" rx="2"/><path d="m16 11 5-3v8l-5-3z"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    layers: '<path d="M12 3 3 8l9 5 9-5z"/><path d="m3 13 9 5 9-5"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
    alert: '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4.5"/>' + dot(12, 17.3, 1),
    music: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
    crosshair: '<circle cx="12" cy="12" r="8"/><path d="M12 2.5v4.5M12 17v4.5M2.5 12H7M17 12h4.5"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.6L20 9"/><path d="M20 4v5h-5"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2"/>',
    spawn: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 20.5 20.5"/>',
    pen: '<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="m14 6 3 3"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
    bulbIdea: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2V16h5v-.2c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3z"/>',
    // ---- langages (métiers)
    'lx-politique': '<path d="M3 9.5 12 4l9 5.5z"/><path d="M6.5 11.5v6.5M10 11.5v6.5M14 11.5v6.5M17.5 11.5v6.5M4.5 20h15"/>',
    'lx-journalisme': '<path d="M5 4h12v15a1.5 1.5 0 0 0 1.5 1.5H6.5A1.5 1.5 0 0 1 5 19z"/><path d="M17 8h2v11a1.5 1.5 0 0 1-1.5 1.5"/><path d="M8 8h6M8 11.5h6M8 15h4"/>',
    'lx-defense': '<path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.2 7.5 9.5 4.4-1.3 7.5-4.9 7.5-9.5V6z"/>',
    'lx-medecine': '<path d="M9.5 3.5h5v6h6v5h-6v6h-5v-6h-6v-5h6z"/>',
    'lx-science': '<path d="M9 3h6M10 3v6l-5.5 9.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3"/><path d="M7.2 15h9.6"/>',
    'lx-droit': '<path d="M14.5 3.5l6 6-2.5 2.5-6-6z"/><path d="M14 9.5 5.5 18"/><path d="M3 21h10"/>',
    'lx-mode': '<path d="M12 7.5a2 2 0 1 1 2-2"/><path d="M12 7.5v1.5L3.5 15.2a1.4 1.4 0 0 0 .8 2.6h15.4a1.4 1.4 0 0 0 .8-2.6L12 9"/>',
    'lx-marketing': '<path d="M4 10v4a1 1 0 0 0 1 1h2l8 4V5L7 9H5a1 1 0 0 0-1 1z"/><path d="M7 15l1.5 5h2.5L10 16.5"/><path d="M18.5 9.5a3.5 3.5 0 0 1 0 5"/>',
    'lx-sport': '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V10M10 3h4M12 3v3M18.5 7l1.5-1.5"/>',
    'lx-audiovisuel': '<rect x="3" y="7" width="13" height="10" rx="2"/><path d="m16 11 5-3v8l-5-3z"/>',
    'lx-tech': '<path d="m8 7-5 5 5 5M16 7l5 5-5 5M13.5 4.5l-3 15"/>',
    'lx-management': '<rect x="9" y="3" width="6" height="4.5" rx="1"/><rect x="3" y="16.5" width="6" height="4.5" rx="1"/><rect x="15" y="16.5" width="6" height="4.5" rx="1"/><path d="M12 7.5V12M6 16.5V12h12v4.5"/>',
    'lx-finance': '<path d="M4 4v16h16"/><path d="m7 15 4-4 3 3 6-6"/><path d="M16 8h4v4"/>',
    'lx-ecologie': '<path d="M5 19c0-8 5-14 15-15-1 10-7 15-15 15z"/><path d="M5 19 14 10"/>',
    'lx-education': '<path d="M2.5 9.5 12 5l9.5 4.5L12 14z"/><path d="M6.5 11.5v4.5c3 2.3 8 2.3 11 0v-4.5"/><path d="M21.5 9.5v5"/>',
    'lx-neutre': '<circle cx="12" cy="12" r="8" stroke-dasharray="3 3"/>',
    // ---- grilles sociologiques (monogrammes)
    'lx-bourdieu': mono('B'), 'lx-goffman': mono('G'), 'lx-durkheim': mono('D'),
    'lx-weber': mono('W'), 'lx-foucault': mono('F'), 'lx-latour': mono('L'),
  };

  const NS = 'http://www.w3.org/2000/svg';
  function svgString(name, cls) {
    let body = I[name];
    if (!body && /^lx-/.test(name)) body = mono(name.slice(3, 4).toUpperCase());
    return `<svg class="ico${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body || I.target}</svg>`;
  }
  // élément DOM : <span class="icw"><svg …/></span>, couleur à plat optionnelle
  function el(name, color, cls) {
    const span = document.createElement('span');
    span.className = 'icw' + (cls ? ' ' + cls : '');
    span.innerHTML = svgString(name);
    if (color) span.style.setProperty('--ic', color);
    return span;
  }
  const lexName = (lx) => (lx ? 'lx-' + lx.id : 'lx-neutre');
  const lexEl = (lx, cls) => el(lexName(lx), lx ? lx.couleur : null, cls);

  LX.ICONS = I;
  LX.icon = { svg: svgString, el, lex: lexEl, lexName, NS };
})(window.LX = window.LX || {});
