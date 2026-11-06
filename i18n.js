'use strict';

/* =========================================================================
 * Idiomas: inglés (por defecto) y español.
 *
 *  - El idioma se elige con ?lang=en|es en la URL o con el selector EN | ES;
 *    la elección se recuerda en localStorage.
 *  - Los textos fijos de index.html llevan data-i18n="clave" (contenido) o
 *    data-i18n-attr="atributo:clave;..." y se traducen al cargar.
 *  - En el código, los textos se escriben con L('English', 'Español').
 *  - Cambiar de idioma recarga la página (la simulación vuelve a empezar),
 *    así todo —registro, fichas, estimaciones— queda en el idioma elegido.
 * ========================================================================= */

const LANGS = ['en', 'es'];
const LANG = (() => {
  const q = new URLSearchParams(location.search).get('lang');
  if (LANGS.includes(q)) {
    try { localStorage.setItem('ssp-lang', q); } catch (e) { /* almacenamiento no disponible */ }
    return q;
  }
  try {
    const saved = localStorage.getItem('ssp-lang');
    if (LANGS.includes(saved)) return saved;
  } catch (e) { /* almacenamiento no disponible */ }
  return 'en';
})();
const LOCALE = LANG === 'es' ? 'es-CL' : 'en-US';

// Texto en el idioma activo.
const L = (en, es) => (LANG === 'es' ? es : en);

// Textos fijos de la interfaz (index.html).
const UI_TEXT = {
  en: {
    'doc.title': 'Solar System LAB — Interactive 3D Solar System Simulation',
    'app.name': 'Solar System LAB',
    'canvas.aria': 'Interactive 3D simulation of the Solar System',
    'lang.aria': 'Language',
    'panel.toggle': '⚙ Controls',
    'tab.view': 'View',
    'tab.lab': '☄ Impacts',
    'speed': 'Speed',
    'pause': '⏸ Pause',
    'today': 'Today',
    'type.meteor': 'Meteor',
    'type.asteroid': 'Asteroid',
    'type.comet': 'Comet',
    'type.bh': 'Black hole',
    'type.sn': '☀ Supernova',
    'type.evo': '🌅 Sun’s evolution',
    'lab.preset': 'Scenario',
    'lab.custom': 'Custom',
    'lab.target': 'Target',
    'lab.size': 'Diameter',
    'lab.speed': 'Impact speed',
    'lab.angle': 'Entry angle',
    'lab.frags': 'Fragments',
    'lab.launch': '🚀 Launch',
    'lab.reset': '↺ Reset system',
    'opt.orbits': 'Orbits',
    'opt.labels': 'Names',
    'opt.belt': 'Asteroid belt',
    'opt.trojans': 'Jupiter’s Trojans',
    'opt.kuiper': 'Kuiper belt',
    'opt.dwarfs': 'Dwarf planets',
    'opt.comets': 'Comets',
    'opt.stars': 'Stars',
    'opt.rotate': 'Auto-rotate',
    'others.aria': 'Go to a dwarf planet or comet',
    'others.placeholder': 'Go to dwarf planet / comet…',
    'galaxy.go': '🌌 See the Milky Way',
    'view.reset': 'Overview',
    'log.title': 'Timeline',
    'log.hide': 'Hide',
    'info.close': 'Close',
    'zoom.group': 'Zoom',
    'zoom.in': 'Zoom in',
    'zoom.out': 'Zoom out',
    'help': 'Drag: rotate · Wheel / pinch: zoom · Right-click or Shift+drag: pan · Click a body: follow it · Space: pause · Esc: overview · G: Milky Way',
    'welcome.title': '🌌 Welcome to Solar System LAB',
    'welcome.sub': 'Explore, experiment and discover the universe',
    'welcome.p1': 'Solar System LAB is an interactive space created for education and science outreach, where you can explore the Solar System, interact with celestial bodies and experiment with different astronomical phenomena.',
    'welcome.p2': 'The idea is to learn through curiosity, observation and experimentation, in a fun way that is accessible to everyone.',
    'welcome.end': 'The universe is in your hands! Dare to experiment.',
    'welcome.start': '🚀 Start exploring',
    'welcome.lab': '☄ Go to the lab',
    'welcome.hide': 'Don’t show again',
    'welcome.disclaimer': '⚠ <strong>An important note:</strong> this is an educational simulation. Some scales, motions, interactions and physical phenomena have been simplified to make them easier to understand. Therefore, the results should not be interpreted as exact scientific representations or predictions.',
  },
  es: {
    'doc.title': 'Sistema Solar LAB — Simulación 3D interactiva del Sistema Solar',
    'app.name': 'Sistema Solar LAB',
    'canvas.aria': 'Simulación 3D interactiva del Sistema Solar',
    'lang.aria': 'Idioma',
    'panel.toggle': '⚙ Controles',
    'tab.view': 'Vista',
    'tab.lab': '☄ Impactos',
    'speed': 'Velocidad',
    'pause': '⏸ Pausa',
    'today': 'Hoy',
    'type.meteor': 'Meteoro',
    'type.asteroid': 'Asteroide',
    'type.comet': 'Cometa',
    'type.bh': 'Agujero negro',
    'type.sn': '☀ Supernova',
    'type.evo': '🌅 Evolución del Sol',
    'lab.preset': 'Escenario',
    'lab.custom': 'Personalizado',
    'lab.target': 'Objetivo',
    'lab.size': 'Diámetro',
    'lab.speed': 'Velocidad de impacto',
    'lab.angle': 'Ángulo de entrada',
    'lab.frags': 'Fragmentos',
    'lab.launch': '🚀 Lanzar',
    'lab.reset': '↺ Restablecer sistema',
    'opt.orbits': 'Órbitas',
    'opt.labels': 'Nombres',
    'opt.belt': 'Cinturón de asteroides',
    'opt.trojans': 'Troyanos de Júpiter',
    'opt.kuiper': 'Cinturón de Kuiper',
    'opt.dwarfs': 'Planetas enanos',
    'opt.comets': 'Cometas',
    'opt.stars': 'Estrellas',
    'opt.rotate': 'Rotación automática',
    'others.aria': 'Ir a planeta enano o cometa',
    'others.placeholder': 'Ir a planeta enano / cometa…',
    'galaxy.go': '🌌 Ver la Vía Láctea',
    'view.reset': 'Vista general',
    'log.title': 'Evolución',
    'log.hide': 'Ocultar',
    'info.close': 'Cerrar',
    'zoom.group': 'Zoom',
    'zoom.in': 'Acercar',
    'zoom.out': 'Alejar',
    'help': 'Arrastrar: rotar · Rueda / pellizcar: zoom · Clic derecho o Shift+arrastrar: desplazar · Clic en un cuerpo: seguirlo · Espacio: pausa · Esc: vista general · G: Vía Láctea',
    'welcome.title': '🌌 Bienvenido a Sistema Solar LAB',
    'welcome.sub': 'Explora, experimenta y descubre el universo',
    'welcome.p1': 'Sistema Solar LAB es un espacio interactivo creado con fines educativos y de divulgación científica, donde podrás explorar el Sistema Solar, interactuar con cuerpos celestes y experimentar con distintos fenómenos astronómicos.',
    'welcome.p2': 'La idea es aprender a través de la curiosidad, la observación y la experimentación, de una forma entretenida y accesible para todos.',
    'welcome.end': '¡El universo está en tus manos! Atrévete a experimentar.',
    'welcome.start': '🚀 Comenzar a explorar',
    'welcome.lab': '☄ Ir al laboratorio',
    'welcome.hide': 'No volver a mostrar',
    'welcome.disclaimer': '⚠ <strong>Una aclaración importante:</strong> esta es una simulación educativa. Algunas escalas, movimientos, interacciones y fenómenos físicos han sido simplificados para facilitar su comprensión. Por lo tanto, los resultados no deben interpretarse como representaciones o predicciones científicas exactas.',
  },
};

// Texto fijo por clave.
const T = (key) => UI_TEXT[LANG][key] ?? UI_TEXT.en[key] ?? key;

// Cambia de idioma: guarda la elección y recarga con ?lang= (enlace compartible; conserva el #).
function setLang(lang) {
  if (!LANGS.includes(lang) || lang === LANG) return;
  try { localStorage.setItem('ssp-lang', lang); } catch (e) { /* almacenamiento no disponible */ }
  const url = new URL(location.href);
  url.searchParams.set('lang', lang);
  location.href = url.toString();
}

// Traduce el HTML estático (los scripts se cargan al final del <body>, el DOM ya existe).
(function applyStaticText() {
  document.documentElement.lang = LANG;
  document.title = T('doc.title');
  for (const el of document.querySelectorAll('[data-i18n]')) el.innerHTML = T(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of el.dataset.i18nAttr.split(';')) {
      const [attr, key] = pair.split(':');
      if (attr && key) el.setAttribute(attr.trim(), T(key.trim()));
    }
  }
  for (const btn of document.querySelectorAll('[data-lang]')) {
    const active = btn.dataset.lang === LANG;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
    btn.addEventListener('click', () => setLang(btn.dataset.lang));
  }
})();
