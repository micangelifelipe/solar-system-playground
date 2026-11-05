'use strict';

/* =========================================================================
 * Sistema Solar 3D — JavaScript puro + Canvas 2D (sin librerías).
 * Proyección en perspectiva propia, iluminación por fases, anillos,
 * lunas, cinturón de asteroides, troyanos de Júpiter y cinturón de Kuiper.
 * ========================================================================= */

const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const J2000 = Date.UTC(2000, 0, 1, 12);
const DAY_MS = 86400000;
const NEAR = 2;

// Generador pseudoaleatorio con semilla: la escena es igual en cada carga.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261104);
function gauss() {
  let u = 0;
  while (!u) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rand());
}

/* ----------------------------- Datos ----------------------------------- */
// Distancias y tamaños están comprimidos para que todo quepa en pantalla;
// los periodos orbitales, inclinaciones y longitudes iniciales son reales.

const SUN = {
  name: 'Sol', type: 'sun', r: 26, x: 0, y: 0, z: 0,
  swatch: '#ffc247',
  desc: 'Estrella enana amarilla que contiene el 99,86 % de la masa del sistema solar.',
  facts: [['Tipo', 'G2V'], ['Radio', '696.340 km'], ['Temperatura superficial', '5.500 °C'], ['Edad', '4.600 millones de años']],
};

const PLANETS = [
  {
    name: 'Mercurio', r: 3, dist: 55, period: 87.969, L0: 252.25, inc: 7.0, node: 48.3,
    color: ['#ece6dc', '#8a8279'],
    desc: 'El planeta más pequeño y cercano al Sol; casi sin atmósfera y con temperaturas extremas.',
    facts: [['Radio', '2.440 km'], ['Distancia media', '0,39 UA'], ['Año', '88 días'], ['Día solar', '176 días'], ['Lunas', '0']],
  },
  {
    name: 'Venus', r: 5.6, dist: 80, period: 224.701, L0: 181.98, inc: 3.39, node: 76.7,
    color: ['#fff4d6', '#d4a95c'],
    desc: 'Cubierto por densas nubes de ácido sulfúrico; es el planeta más caliente (464 °C).',
    facts: [['Radio', '6.052 km'], ['Distancia media', '0,72 UA'], ['Año', '225 días'], ['Día sidéreo', '243 días (retrógrado)'], ['Lunas', '0']],
  },
  {
    name: 'Tierra', r: 6, dist: 110, period: 365.256, L0: 100.46, inc: 0, node: 0,
    color: ['#b4e1ff', '#1d5bb8'], atmo: 'rgba(110,175,255,',
    bands: [[1.15, 'cap', '#ffffff', 0.85], [-1.2, 'cap', '#ffffff', 0.85]],
    desc: 'Nuestro hogar: el único mundo conocido con vida y océanos de agua líquida.',
    facts: [['Radio', '6.371 km'], ['Distancia media', '1,00 UA'], ['Año', '365,25 días'], ['Día', '24 horas'], ['Lunas', '1']],
  },
  {
    name: 'Marte', r: 4.2, dist: 145, period: 686.98, L0: 355.45, inc: 1.85, node: 49.6,
    color: ['#ffc39b', '#b0412a'],
    bands: [[1.2, 'cap', '#ffffff', 0.75]],
    desc: 'El planeta rojo; alberga el Monte Olimpo, el volcán más alto del sistema solar.',
    facts: [['Radio', '3.390 km'], ['Distancia media', '1,52 UA'], ['Año', '687 días'], ['Día', '24 h 37 min'], ['Lunas', '2']],
  },
  {
    name: 'Júpiter', r: 16, dist: 290, period: 4332.59, L0: 34.4, inc: 1.3, node: 100.5,
    color: ['#f7e8cf', '#c29766'],
    bands: [[-0.62, 0.1, '#9c6b45', 0.45], [-0.3, 0.13, '#a3704a', 0.6], [0.02, 0.07, '#fff4e0', 0.45],
            [0.27, 0.14, '#94603c', 0.6], [0.58, 0.09, '#b0855e', 0.45], [-0.38, 0.05, '#c8553a', 0.5]],
    desc: 'El gigante gaseoso; su Gran Mancha Roja es una tormenta más grande que la Tierra.',
    facts: [['Radio', '69.911 km'], ['Distancia media', '5,20 UA'], ['Año', '11,86 años'], ['Día', '9 h 56 min'], ['Lunas', '95']],
  },
  {
    name: 'Saturno', r: 13, dist: 390, period: 10759.22, L0: 49.94, inc: 2.49, node: 113.7,
    color: ['#fcefcc', '#cca968'],
    bands: [[-0.45, 0.12, '#b48f58', 0.35], [0.12, 0.1, '#c4a067', 0.35], [0.5, 0.12, '#b48f58', 0.3]],
    ring: {
      tilt: 26.7,
      bands: [[1.24, 1.52, 'rgba(190,170,135,0.28)'], [1.53, 1.95, 'rgba(232,212,172,0.85)'], [2.03, 2.27, 'rgba(208,188,150,0.7)']],
    },
    desc: 'Famoso por su espectacular sistema de anillos formados por hielo y roca.',
    facts: [['Radio', '58.232 km'], ['Distancia media', '9,54 UA'], ['Año', '29,46 años'], ['Día', '10 h 33 min'], ['Lunas', '146']],
  },
  {
    name: 'Urano', r: 9, dist: 480, period: 30688.5, L0: 313.23, inc: 0.77, node: 74.0,
    color: ['#e0fdff', '#76c0d1'],
    ring: { tilt: 97.8, bands: [[1.6, 1.66, 'rgba(200,230,240,0.35)'], [1.95, 2.02, 'rgba(200,230,240,0.5)']] },
    desc: 'Gigante de hielo que gira "acostado": su eje está inclinado casi 98°.',
    facts: [['Radio', '25.362 km'], ['Distancia media', '19,19 UA'], ['Año', '84 años'], ['Día', '17 h 14 min (retrógrado)'], ['Lunas', '28']],
  },
  {
    name: 'Neptuno', r: 8.6, dist: 560, period: 60182, L0: 304.88, inc: 1.77, node: 131.8,
    color: ['#a3c1ff', '#2a49c2'],
    bands: [[-0.25, 0.08, '#3a5dd0', 0.45], [-0.45, 0.04, '#1c2f8a', 0.6]],
    desc: 'El planeta más lejano, con los vientos más rápidos del sistema solar (2.100 km/h).',
    facts: [['Radio', '24.622 km'], ['Distancia media', '30,07 UA'], ['Año', '164,8 años'], ['Día', '16 h 6 min'], ['Lunas', '16']],
  },
];

const MOONS = [
  { name: 'Luna', parent: 'Tierra', r: 1.6, dist: 12, period: 27.32, color: ['#f2f2f2', '#858585'] },
  { name: 'Fobos', parent: 'Marte', r: 0.6, dist: 6.5, period: 0.319, color: ['#c9b9a6', '#6b5d4f'] },
  { name: 'Deimos', parent: 'Marte', r: 0.5, dist: 8.5, period: 1.263, color: ['#d6c8b6', '#776858'] },
  { name: 'Ío', parent: 'Júpiter', r: 1.5, dist: 23, period: 1.769, color: ['#fff3a0', '#c6a136'] },
  { name: 'Europa', parent: 'Júpiter', r: 1.3, dist: 28, period: 3.551, color: ['#f6f0e6', '#a69884'] },
  { name: 'Ganímedes', parent: 'Júpiter', r: 2.1, dist: 34, period: 7.155, color: ['#dbd2c6', '#7a6f63'] },
  { name: 'Calisto', parent: 'Júpiter', r: 1.9, dist: 42, period: 16.689, color: ['#b8ab9b', '#584e46'] },
  { name: 'Titán', parent: 'Saturno', r: 2, dist: 42, period: 15.945, color: ['#ffd68f', '#bd8737'] },
  { name: 'Titania', parent: 'Urano', r: 1.1, dist: 24, period: 8.706, color: ['#d9d3cc', '#77706a'] },
  { name: 'Tritón', parent: 'Neptuno', r: 1.4, dist: 17, period: -5.877, color: ['#f3e6e0', '#8f7d78'] },
  { name: 'Caronte', parent: 'Plutón', r: 0.8, dist: 4.5, period: 6.387, color: ['#d8d2cc', '#6f6862'] },
];

// Datos físicos reales (usados por el laboratorio de impactos).
// a: semieje mayor (UA); mass: kg; radius: km; atm: densidad atmosférica relativa a la Tierra
// (Infinity = gigante gaseoso, sin superficie sólida).
const PHYS = {
  Sol: { mass: 1.989e30, radius: 695700, atm: Infinity, kind: 'star' },
  Mercurio: { a: 0.387, mass: 3.301e23, radius: 2439.7, atm: 0, kind: 'rocky' },
  Venus: { a: 0.723, mass: 4.867e24, radius: 6051.8, atm: 90, kind: 'rocky' },
  Tierra: { a: 1.0, mass: 5.972e24, radius: 6371, atm: 1, kind: 'rocky' },
  Marte: { a: 1.524, mass: 6.417e23, radius: 3389.5, atm: 0.006, kind: 'rocky' },
  'Júpiter': { a: 5.203, mass: 1.898e27, radius: 69911, atm: Infinity, kind: 'gas' },
  Saturno: { a: 9.537, mass: 5.683e26, radius: 58232, atm: Infinity, kind: 'gas' },
  Urano: { a: 19.19, mass: 8.681e25, radius: 25362, atm: Infinity, kind: 'gas' },
  Neptuno: { a: 30.07, mass: 1.024e26, radius: 24622, atm: Infinity, kind: 'gas' },
  Ceres: { mass: 9.39e20, radius: 469.7, atm: 0, kind: 'ice' },
  'Plutón': { mass: 1.303e22, radius: 1188.3, atm: 1e-5, kind: 'ice' },
  Haumea: { mass: 4.006e21, radius: 780, atm: 0, kind: 'ice' },
  Makemake: { mass: 3.1e21, radius: 715, atm: 0, kind: 'ice' },
  Eris: { mass: 1.66e22, radius: 1163, atm: 0, kind: 'ice' },
};
// Distancia orbital real de las lunas (km).
const MOON_KM = {
  Luna: 384400, Fobos: 9376, Deimos: 23460, 'Ío': 421700, Europa: 671034, 'Ganímedes': 1070412,
  Calisto: 1882709, 'Titán': 1221870, Titania: 435910, 'Tritón': 354759, Caronte: 19591,
};
// Masa (kg) y radio (km) reales de las lunas.
const MOON_PHYS = {
  Luna: [7.342e22, 1737.4], Fobos: [1.07e16, 11.3], Deimos: [1.48e15, 6.2], 'Ío': [8.93e22, 1821.6],
  Europa: [4.8e22, 1560.8], 'Ganímedes': [1.48e23, 2634.1], Calisto: [1.076e23, 2410.3], 'Titán': [1.345e23, 2574.7],
  Titania: [3.4e21, 788.9], 'Tritón': [2.14e22, 1353.4], Caronte: [1.586e21, 606],
};

/* ------------------- Escala de distancias y órbitas keplerianas ------------------- */
// Convierte UA reales a unidades de escena (compresión logarítmica por tramos,
// alineada con las distancias comprimidas de los planetas).
const AU_KNOTS = [
  [0.39, 55], [0.72, 80], [1, 110], [1.52, 145], [2.1, 175], [3.3, 235], [5.2, 290], [9.54, 390],
  [19.19, 480], [30.07, 560], [40, 660], [50, 760], [100, 950], [300, 1250], [1000, 1600],
];
function mapAU(au) {
  if (au <= AU_KNOTS[0][0]) return (au / AU_KNOTS[0][0]) * AU_KNOTS[0][1];
  let k = 1;
  while (k < AU_KNOTS.length - 1 && AU_KNOTS[k][0] < au) k++;
  const [a0, r0] = AU_KNOTS[k - 1], [a1, r1] = AU_KNOTS[k];
  return r0 + ((r1 - r0) * Math.log(au / a0)) / Math.log(a1 / a0);
}

// Factor de expansión de todas las órbitas: cuando el Sol pierde masa lentamente,
// el semieje mayor crece como 1/M (lo usa la evolución estelar del laboratorio).
let orbitScale = 1;

// Vector heliocéntrico en UA (ejes de escena) -> posición en escena.
function mapVec(x, y, z, out) {
  const r = Math.hypot(x, y, z);
  const s = r > 1e-12 ? mapAU(r) / r : 0;
  out.x = x * s; out.y = y * s; out.z = z * s;
}

const dateToDays = (y, m, d) => (Date.UTC(y, m - 1, d) - J2000) / DAY_MS;

// Elementos orbitales aproximados: a (UA), e, i, nodo, argumento del perihelio (°), fecha del perihelio.
const DWARFS = [
  {
    name: 'Ceres', r: 1.3, a: 2.767, e: 0.0785, i: 10.59, node: 80.27, peri: 73.6, Tp: dateToDays(2022, 12, 7),
    color: ['#d4cdc4', '#69635c'],
    desc: 'El objeto más grande del cinturón de asteroides y el único planeta enano del sistema solar interior.',
    facts: [['Radio', '470 km'], ['Lunas', '0']],
  },
  {
    name: 'Plutón', r: 1.7, a: 39.48, e: 0.2488, i: 17.16, node: 110.3, peri: 113.83, Tp: dateToDays(1989, 9, 5),
    color: ['#f3dfc8', '#97704f'],
    desc: 'Fue el noveno planeta hasta 2006; tiene un enorme glaciar de nitrógeno con forma de corazón.',
    facts: [['Radio', '1.188 km'], ['Lunas', '5']],
  },
  {
    name: 'Haumea', r: 1.4, a: 43.12, e: 0.195, i: 28.2, node: 122.0, peri: 239.0, Tp: dateToDays(2133, 1, 1),
    color: ['#f6f6f6', '#9aa0a8'],
    desc: 'Gira tan rápido (3,9 horas) que tiene forma de elipsoide alargado; posee un anillo.',
    facts: [['Radio', '~780 km'], ['Lunas', '2']],
  },
  {
    name: 'Makemake', r: 1.4, a: 45.43, e: 0.161, i: 28.98, node: 79.6, peri: 294.8, Tp: dateToDays(1880, 6, 1),
    color: ['#f2cbad', '#a2654a'],
    desc: 'Uno de los objetos más brillantes del cinturón de Kuiper, cubierto de hielo de metano.',
    facts: [['Radio', '715 km'], ['Lunas', '1']],
  },
  {
    name: 'Eris', r: 1.7, a: 67.86, e: 0.4361, i: 44.04, node: 35.95, peri: 151.64, Tp: dateToDays(2257, 1, 1),
    color: ['#f8f8f8', '#a2a2a2'],
    desc: 'Su descubrimiento en 2005 llevó a redefinir qué es un planeta; está cerca de su afelio (~96 UA).',
    facts: [['Radio', '1.163 km'], ['Lunas', '1']],
  },
];

const COMETS = [
  { name: 'Halley', a: 17.83, e: 0.967, i: 162.26, node: 58.42, peri: 111.33, Tp: dateToDays(1986, 2, 9),
    desc: 'El cometa más famoso: visible a simple vista cada ~76 años. Su próxima visita será en 2061.' },
  { name: 'Encke', a: 2.215, e: 0.848, i: 11.78, node: 334.57, peri: 186.55, Tp: dateToDays(2023, 10, 22),
    desc: 'El cometa de periodo más corto conocido (3,3 años); origen de la lluvia de meteoros Táuridas.' },
  { name: '67P/Churyumov-Gerasimenko', a: 3.46, e: 0.641, i: 7.04, node: 50.14, peri: 12.78, Tp: dateToDays(2021, 11, 2),
    desc: 'Visitado por la sonda Rosetta, que en 2014 posó el módulo Philae sobre su núcleo.' },
  { name: 'Tempel-Tuttle', a: 10.33, e: 0.906, i: 162.49, node: 235.27, peri: 172.5, Tp: dateToDays(1998, 2, 28),
    desc: 'Progenitor de la lluvia de meteoros de las Leónidas (noviembre).' },
  { name: 'Swift-Tuttle', a: 26.09, e: 0.963, i: 113.45, node: 139.38, peri: 152.98, Tp: dateToDays(1992, 12, 12),
    desc: 'Progenitor de las Perseidas (agosto); su núcleo mide unos 26 km.' },
  { name: 'Hale-Bopp', a: 186, e: 0.995, i: 89.43, node: 282.47, peri: 130.59, Tp: dateToDays(1997, 4, 1),
    desc: 'El Gran Cometa de 1997, visible a simple vista durante un récord de 18 meses.' },
  { name: 'NEOWISE', a: 358, e: 0.99918, i: 128.94, node: 61.01, peri: 37.28, Tp: dateToDays(2020, 7, 3),
    desc: 'El gran cometa de 2020, visible a simple vista desde ambos hemisferios.' },
];

function setupKepler(o) {
  o.P = 365.256 * Math.pow(o.a, 1.5);
  o.n = TAU / o.P;
  o.b = o.a * Math.sqrt(1 - o.e * o.e);
  const N = o.node * DEG, inc = o.i * DEG, w = o.peri * DEG;
  const cN = Math.cos(N), sN = Math.sin(N), ci = Math.cos(inc), si = Math.sin(inc), cw = Math.cos(w), sw = Math.sin(w);
  // Vectores del plano orbital (P hacia el perihelio, Q perpendicular) en coordenadas eclípticas.
  o.Px = cN * cw - sN * sw * ci; o.Py = sN * cw + cN * sw * ci; o.Pz = sw * si;
  o.Qx = -cN * sw - sN * cw * ci; o.Qy = -sN * sw + cN * cw * ci; o.Qz = cw * si;
  o.live = true;
  o.x = o.y = o.z = 0;
}

// Punto de la órbita para una anomalía excéntrica E, en UA. Eclíptica X,Y,Z -> ejes de escena x,z,y.
function keplerPointAU(o, E, out) {
  const xv = o.a * orbitScale * (Math.cos(E) - o.e), yv = o.b * orbitScale * Math.sin(E);
  out.x = xv * o.Px + yv * o.Qx;
  out.z = xv * o.Py + yv * o.Qy;
  out.y = xv * o.Pz + yv * o.Qz;
  out.au = Math.hypot(xv, yv);
}

// Igual, pero ya proyectado a coordenadas de escena.
function keplerPoint(o, E, out) {
  keplerPointAU(o, E, out);
  mapVec(out.x, out.y, out.z, out);
}

function solveKepler(M, e) {
  let E = e < 0.8 ? M : Math.PI;
  for (let k = 0; k < 50; k++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-10) break;
  }
  return E;
}

function keplerAtAU(o, days, out) {
  let M = (o.n * (days - o.Tp)) % TAU;
  if (M < 0) M += TAU;
  keplerPointAU(o, solveKepler(M, o.e), out);
}

function keplerAt(o, days, out) {
  keplerAtAU(o, days, out);
  const au = out.au;
  mapVec(out.x, out.y, out.z, out);
  out.au = au;
}

function buildKeplerOrbit(o) {
  const n = o.e > 0.9 ? 720 : 360;
  o.orbitN = n;
  o.orbit = new Float32Array((n + 1) * 3);
  const pt = {};
  for (let i = 0; i <= n; i++) {
    keplerPoint(o, (i / n) * TAU, pt);
    o.orbit[i * 3] = pt.x; o.orbit[i * 3 + 1] = pt.y; o.orbit[i * 3 + 2] = pt.z;
  }
}

const fmtNum = (v, d = 2) => v.toLocaleString('es-CL', { maximumFractionDigits: d });
const fmtYears = (days) => {
  const y = days / 365.256;
  return y < 1000 ? `${fmtNum(y, 1)} años` : `~${fmtNum(Math.round(y / 100) * 100, 0)} años`;
};
const longDate = new Intl.DateTimeFormat('es-CL', { year: 'numeric', month: 'long', day: 'numeric' });

for (const d of DWARFS) {
  setupKepler(d);
  buildKeplerOrbit(d);
  d.type = 'dwarf';
  d.swatch = d.color[1];
  d.facts = [...d.facts, ['Semieje mayor', `${fmtNum(d.a)} UA`], ['Periodo orbital', fmtYears(d.P)], ['Excentricidad', fmtNum(d.e, 3)]];
}
for (const c of COMETS) {
  setupKepler(c);
  buildKeplerOrbit(c);
  c.type = 'comet';
  c.r = 1.2;
  c.swatch = '#8fd0ff';
  c.color = ['#ffffff', '#9fc8ff'];
  c.facts = [
    ['Periodo orbital', fmtYears(c.P)],
    ['Perihelio', `${fmtNum(c.a * (1 - c.e))} UA`],
    ['Afelio', `${fmtNum(c.a * (1 + c.e), 1)} UA`],
    ['Excentricidad', fmtNum(c.e, 4)],
    ['Inclinación', `${fmtNum(c.i, 1)}°${c.i > 90 ? ' (retrógrada)' : ''}`],
    ['Próximo perihelio', () => longDate.format(new Date(J2000 + (c.Tp + Math.ceil((sim.days - c.Tp) / c.P) * c.P) * DAY_MS))],
  ];
}

for (const p of PLANETS) {
  p.type = 'planet';
  p.swatch = p.color[1];
  p.x = p.y = p.z = 0;
}
// Estado heliocéntrico (UA, UA/día, ejes de escena) y datos físicos.
for (const b of [SUN, ...PLANETS, ...DWARFS, ...COMETS]) {
  b.hp = { x: 0, y: 0, z: 0 };
  b.hv = { x: 0, y: 0, z: 0 };
  b.r0 = b.r;
  if (PHYS[b.name]) Object.assign(b, PHYS[b.name]);
}
for (const m of MOONS) {
  m.type = 'moon';
  m.parentBody = [...PLANETS, ...DWARFS].find((p) => p.name === m.parent);
  m.phase0 = rand() * TAU;
  m.x = m.y = m.z = 0;
  m.desc = `Satélite natural de ${m.parent}.`;
  m.facts = [['Orbita a', m.parent], ['Periodo orbital', `${Math.abs(m.period).toLocaleString('es-CL')} días${m.period < 0 ? ' (retrógrado)' : ''}`]];
  m.realKm = MOON_KM[m.name];
  [m.mass, m.radius] = MOON_PHYS[m.name];
  m.r0 = m.r;
}
// Listas dinámicas: el laboratorio de impactos agrega y quita cuerpos.
const BODIES = [SUN, ...PLANETS, ...DWARFS, ...MOONS, ...COMETS];
const KEPLERIAN = [...DWARFS, ...COMETS];
// Cuerpos con estado heliocéntrico propio (se integran en modo N-cuerpos).
const HELIO = [SUN, ...PLANETS, ...DWARFS, ...COMETS];

// Posición en una órbita circular ligeramente inclinada.
function orbitXYZ(dist, ang, sinInc, node, out) {
  out.x = dist * Math.cos(ang);
  out.z = dist * Math.sin(ang);
  out.y = dist * Math.sin(ang - node) * sinInc;
}

const ORBIT_SEG = 256;
function buildPlanetOrbit(p) {
  p.orbit = p.orbit || new Float32Array((ORBIT_SEG + 1) * 3);
  p.orbitN = ORBIT_SEG;
  const o = {};
  for (let i = 0; i <= ORBIT_SEG; i++) {
    orbitXYZ(p.a * orbitScale, (i / ORBIT_SEG) * TAU, p.sinInc, p.nodeRad, o);
    mapVec(o.x, o.y, o.z, o);
    p.orbit[i * 3] = o.x; p.orbit[i * 3 + 1] = o.y; p.orbit[i * 3 + 2] = o.z;
  }
}
for (const p of PLANETS) {
  p.sinInc = Math.sin(p.inc * DEG);
  p.nodeRad = p.node * DEG;
  buildPlanetOrbit(p);
}
// Recalcula las órbitas dibujadas cuando cambia orbitScale.
function rebuildOrbits() {
  for (const p of PLANETS) buildPlanetOrbit(p);
  for (const o of KEPLERIAN) buildKeplerOrbit(o);
}

// Posiciones analíticas en UA (sin perturbaciones).
function planetAU(p, days, out) {
  orbitXYZ(p.a * orbitScale, p.L0 * DEG + (TAU * days) / p.period, p.sinInc, p.nodeRad, out);
}
function analyticAU(b, days, out) {
  if (b.type === 'planet') planetAU(b, days, out);
  else keplerAtAU(b, days, out);
}

/* --------------------------- Partículas -------------------------------- */
// Grupos: 0 = cinturón principal, 1 = troyanos de Júpiter, 2 = Kuiper.
const SHADES = [
  'rgba(150,138,124,0.95)', 'rgba(182,168,148,0.95)', 'rgba(118,108,98,0.95)', 'rgba(205,192,170,0.95)',
  'rgba(170,150,118,0.9)', 'rgba(196,176,140,0.9)', 'rgba(140,122,98,0.9)', 'rgba(214,198,166,0.9)',
  'rgba(120,150,178,0.55)', 'rgba(160,185,210,0.55)', 'rgba(96,120,146,0.55)', 'rgba(195,212,228,0.55)',
];
const N_STATIC_SHADES = SHADES.length;
// Paleta de partículas dinámicas (eyecta, escombros, discos). Las marcadas con
// "add" se dibujan con mezcla aditiva para que brillen.
const DYN_SHADES = [
  ['rgba(255,255,240,0.95)', true],  // 0 blanco incandescente
  ['rgba(255,220,120,0.9)', true],   // 1 amarillo
  ['rgba(255,140,50,0.85)', true],   // 2 naranja
  ['rgba(200,60,30,0.8)', true],     // 3 rojo
  ['rgba(150,132,116,0.9)', false],  // 4 roca fría
  ['rgba(105,95,88,0.85)', false],   // 5 roca oscura
  ['rgba(200,230,255,0.85)', true],  // 6 hielo / vapor
  ['rgba(170,205,255,0.9)', true],   // 7 disco caliente (azul)
  ['rgba(255,170,90,0.75)', true],   // 8 disco templado (naranja)
  ['rgba(95,70,55,0.85)', false],    // 9 penacho oscuro (gigantes gaseosos)
  ['rgba(255,90,170,0.7)', true],    // 10 nebulosa: hidrógeno alfa (magenta)
  ['rgba(90,220,255,0.6)', true],    // 11 nebulosa: oxígeno (turquesa)
];
for (const [c] of DYN_SHADES) SHADES.push(c);
const SHADE_ADD = [...new Array(N_STATIC_SHADES).fill(false), ...DYN_SHADES.map((d) => d[1])];
const NSH = SHADES.length;
const groupOn = [true, true, true];

const N_BELT = 7000, N_TROJ = 900, N_KUIPER = 4000;
const NP = N_BELT + N_TROJ + N_KUIPER;
const DYN_MAX = 24000; // máximo de partículas dinámicas por cuadro
const pAU = new Float32Array(NP);    // semieje (UA)
const pTh = new Float32Array(NP);    // anomalía inicial (J2000)
const pN = new Float32Array(NP);     // movimiento medio (rad/día)
const pE = new Float32Array(NP);     // excentricidad
const pPeri = new Float32Array(NP);  // perihelio
const pNode = new Float32Array(NP);  // nodo ascendente
const pSinI = new Float32Array(NP);  // seno de la inclinación
const pSize = new Float32Array(NP);
const pShade = new Uint8Array(NP);
const pGroup = new Uint8Array(NP);
// Estado N-cuerpos de los cinturones (lo crea el laboratorio de impactos cuando hace falta).
const beltState = { on: false, x: null, y: null, z: null, vx: null, vy: null, vz: null };
// Buffers por cuadro (partículas estáticas + dinámicas)
const NTOT = NP + DYN_MAX;
const pSx = new Float32Array(NTOT), pSy = new Float32Array(NTOT), pSz = new Float32Array(NTOT);
const pKey = new Int32Array(NTOT);
const pOrder = new Int32Array(NTOT);

const KIRKWOOD = [2.5, 2.82, 2.95, 3.27]; // huecos de Kirkwood (resonancias con Júpiter)
const JUP = PLANETS[4];

(function initParticles() {
  let i = 0;
  // Cinturón principal: 2,1–3,3 UA con huecos de Kirkwood.
  while (i < N_BELT) {
    const au = 2.1 + rand() * 1.2;
    if (KIRKWOOD.some((g) => Math.abs(au - g) < 0.035) && rand() < 0.92) continue;
    pAU[i] = au;
    pN[i] = TAU / (Math.pow(au, 1.5) * 365.256);
    pTh[i] = rand() * TAU;
    pE[i] = Math.abs(gauss()) * 0.06;
    pPeri[i] = rand() * TAU;
    pNode[i] = rand() * TAU;
    pSinI[i] = Math.sin(Math.abs(gauss()) * 7 * DEG);
    pSize[i] = 0.5 + Math.pow(rand(), 3) * 1.4;
    pShade[i] = (rand() * 4) | 0;
    pGroup[i] = 0;
    i++;
  }
  // Troyanos: comparten la órbita de Júpiter, 60° por delante (L4) y por detrás (L5).
  for (let k = 0; k < N_TROJ; k++, i++) {
    const lead = k % 2 === 0 ? 1 : -1;
    pAU[i] = JUP.a + gauss() * 0.12;
    pN[i] = TAU / JUP.period;
    pTh[i] = JUP.L0 * DEG + lead * 60 * DEG + gauss() * 11 * DEG;
    pE[i] = Math.abs(gauss()) * 0.04;
    pPeri[i] = rand() * TAU;
    pNode[i] = rand() * TAU;
    pSinI[i] = Math.sin(Math.abs(gauss()) * 10 * DEG);
    pSize[i] = 0.55 + Math.pow(rand(), 3) * 1.3;
    pShade[i] = 4 + ((rand() * 4) | 0);
    pGroup[i] = 1;
  }
  // Cinturón de Kuiper: 30–50 UA, más disperso e inclinado.
  for (let k = 0; k < N_KUIPER; k++, i++) {
    const au = 30 + Math.pow(rand(), 0.8) * 20;
    pAU[i] = au;
    pN[i] = TAU / (Math.pow(au, 1.5) * 365.256);
    pTh[i] = rand() * TAU;
    pE[i] = Math.abs(gauss()) * 0.08;
    pPeri[i] = rand() * TAU;
    pNode[i] = rand() * TAU;
    pSinI[i] = Math.sin(Math.abs(gauss()) * 12 * DEG);
    pSize[i] = 0.8 + Math.pow(rand(), 3) * 1.8;
    pShade[i] = 8 + ((rand() * 4) | 0);
    pGroup[i] = 2;
  }
})();

// Posición analítica (UA) de la partícula i del cinturón en la fecha dada.
function beltAU(i, days, out) {
  const th = pTh[i] + pN[i] * days;
  const rr = pAU[i] * (1 - pE[i] * Math.cos(th - pPeri[i]));
  out.x = rr * Math.cos(th);
  out.z = rr * Math.sin(th);
  out.y = rr * Math.sin(th - pNode[i]) * pSinI[i];
}

/* ---------------------------- Estrellas -------------------------------- */
const STAR_LEVELS = [
  { color: 'rgba(170,185,220,0.45)', size: 1, dirs: [] },
  { color: 'rgba(220,228,255,0.75)', size: 1.3, dirs: [] },
  { color: 'rgba(255,250,235,0.95)', size: 1.8, dirs: [] },
];
(function initStars() {
  const tilt = 62 * DEG, ct = Math.cos(tilt), st = Math.sin(tilt);
  for (let i = 0; i < 2600; i++) {
    let x, y, z;
    if (i < 1100) {
      // Banda de la Vía Láctea: estrellas concentradas cerca de un plano inclinado.
      const a = rand() * TAU, off = gauss() * 0.12;
      const bx = Math.cos(a), bz = Math.sin(a), by = off;
      x = bx; y = by * ct - bz * st; z = by * st + bz * ct;
    } else {
      const u = rand() * 2 - 1, a = rand() * TAU, s = Math.sqrt(1 - u * u);
      x = s * Math.cos(a); y = u; z = s * Math.sin(a);
    }
    const len = Math.hypot(x, y, z);
    const r = rand();
    const lvl = r < 0.72 ? 0 : r < 0.95 ? 1 : 2;
    STAR_LEVELS[lvl].dirs.push(x / len, y / len, z / len);
  }
  for (const l of STAR_LEVELS) l.dirs = new Float32Array(l.dirs);
})();

/* ----------------------------- Estado ---------------------------------- */
const opts = { orbits: true, labels: true, stars: true, rotate: false, comets: true, dwarfs: true };
function isHidden(b) {
  if (b.destroyed) return true;
  if (b.type === 'comet') return !opts.comets;
  if (b.type === 'dwarf') return !opts.dwarfs;
  if (b.type === 'moon') return b.parentBody.type === 'dwarf' && !opts.dwarfs;
  return false;
}
// nbody: true cuando las órbitas se integran numéricamente (tras un evento que las perturba).
const sim = { days: (Date.now() - J2000) / DAY_MS, speed: 10, paused: false, nbody: false };
const cam = {
  yaw: -0.6, pitch: 0.48, dist: 2600, tdist: 950,
  tx: 0, ty: 0, tz: 0,
  follow: null, blend: 1, from: { x: 0, y: 0, z: 0 },
};

let W = 0, H = 0, DPR = 1, cx = 0, cy = 0, focal = 1;
let cyaw = 1, syaw = 0, cpit = 1, spit = 0;

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  cx = W / 2; cy = H / 2;
  focal = H / (2 * Math.tan(25 * DEG)); // campo de visión vertical de 50°
}
window.addEventListener('resize', resize);
resize();

/* --------------------------- Proyección -------------------------------- */
const V = { x: 0, y: 0, z: 0 };
// Mundo -> coordenadas de cámara (x derecha, y arriba, z profundidad).
function toView(x, y, z) {
  x -= cam.tx; y -= cam.ty; z -= cam.tz;
  const x1 = x * cyaw - z * syaw;
  const z1 = x * syaw + z * cyaw;
  V.x = x1;
  V.y = y * cpit + z1 * spit;
  V.z = -y * spit + z1 * cpit + cam.dist;
}

/* ---------------------------- Simulación ------------------------------- */
const tmp = {};
function updateBodies(days) {
  // Sin perturbaciones las posiciones son analíticas; en modo N-cuerpos las
  // integra el laboratorio de impactos y aquí solo se proyectan a la escena.
  if (!sim.nbody) {
    for (const p of PLANETS) planetAU(p, days, p.hp);
    for (const o of KEPLERIAN) keplerAtAU(o, days, o.hp);
  }
  for (const b of HELIO) {
    const h = b.hp;
    mapVec(h.x, h.y, h.z, b);
    if (b.type !== 'sun') b.au = Math.hypot(h.x - SUN.hp.x, h.y - SUN.hp.y, h.z - SUN.hp.z);
    // Desplazamiento visual que se desvanece (evita saltos al cambiar de escala).
    const o = b.visOff;
    if (o) {
      const k = Math.exp(-(days - o.t0) / o.tau);
      if (k < 0.002) b.visOff = null;
      else { b.x += o.x * k; b.y += o.y * k; b.z += o.z * k; }
    }
  }
  // Posición un día antes: da la dirección del movimiento para curvar la cola de polvo.
  for (const c of COMETS) {
    if (sim.nbody) mapVec(c.hp.x - c.hv.x, c.hp.y - c.hv.y, c.hp.z - c.hv.z, tmp);
    else keplerAt(c, days - 1, tmp);
    c.prevX = tmp.x; c.prevY = tmp.y; c.prevZ = tmp.z;
  }
  for (const m of MOONS) {
    if (m.free) continue; // lunas liberadas: se mueven como cuerpos heliocéntricos
    const ang = m.phase0 + (TAU * days) / m.period;
    const par = m.parentBody;
    m.x = par.x + m.dist * Math.cos(ang);
    m.z = par.z + m.dist * Math.sin(ang);
    m.y = par.y + m.dist * Math.sin(ang) * 0.05;
  }
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function updateCamera(dt) {
  if (opts.rotate && !drag.active) cam.yaw += dt * 0.05;
  if (cam.follow) {
    cam.blend = Math.min(1, cam.blend + dt / 1.1);
    const e = ease(cam.blend), f = cam.follow;
    cam.tx = cam.from.x + (f.x - cam.from.x) * e;
    cam.ty = cam.from.y + (f.y - cam.from.y) * e;
    cam.tz = cam.from.z + (f.z - cam.from.z) * e;
  }
  cam.dist += (cam.tdist - cam.dist) * Math.min(1, dt * 4);
  cyaw = Math.cos(cam.yaw); syaw = Math.sin(cam.yaw);
  cpit = Math.cos(cam.pitch); spit = Math.sin(cam.pitch);
}

function minDist() {
  const f = cam.follow;
  if (!f) return 20;
  return f.r * (f.ring ? 3.2 : 2.4);
}

/* ---------------------------- Render: cuerpos -------------------------- */
function projectBodies() {
  for (const b of BODIES) {
    toView(b.x, b.y, b.z);
    b.vx = V.x; b.vy = V.y; b.vz = V.z;
    b.visible = V.z > NEAR + b.r && !isHidden(b);
    if (!b.visible) continue;
    const s = focal / V.z;
    b.sx = cx + V.x * s;
    b.sy = cy - V.y * s;
    b.sr = b.r * s;
  }
  // Dirección de la luz (hacia el Sol) en espacio de cámara, relativa a la línea de visión.
  const light = (SUN.destroyed && Impacts.lightSource()) || SUN;
  for (const b of BODIES) {
    if (!b.visible || b.type === 'sun' || b === light) continue;
    let lx = light.vx - b.vx, ly = light.vy - b.vy, lz = light.vz - b.vz;
    let l = Math.hypot(lx, ly, lz) || 1;
    lx /= l; ly /= l; lz /= l;
    const vl = Math.hypot(b.vx, b.vy, b.vz) || 1;
    const dx = b.vx / vl, dy = b.vy / vl, dz = b.vz / vl;
    const d = lx * dx + ly * dy + lz * dz; // >0: el Sol está detrás del cuerpo
    b.lz = d;
    b.la = Math.atan2(-(ly - d * dy), lx - d * dx); // ángulo en pantalla (y hacia abajo)
  }
  for (const p of PLANETS) if (p.ring && p.visible) prepareRing(p);
  for (const c of COMETS) if (c.visible) prepareComet(c);
}

// Actividad del cometa según su distancia al Sol: la coma y las colas crecen
// al acercarse. La cola de iones apunta en dirección opuesta al Sol; la de
// polvo se curva hacia atrás a lo largo de la órbita.
function prepareComet(c) {
  const act = Math.pow(Math.max(0, Math.min(1, (4.5 - c.au) / 4)), 1.5);
  c.act = act;
  c.comaR = Math.max(1.2, Math.min(40, ((1 + 4 * act) * focal) / c.vz));
  c.tail = false;
  if (act < 0.01) return;
  const L = 110 * act;
  const rx = c.x - SUN.x, ry = c.y - SUN.y, rz = c.z - SUN.z;
  const d = Math.hypot(rx, ry, rz) || 1;
  const ax = rx / d, ay = ry / d, az = rz / d;
  toView(c.x + ax * L, c.y + ay * L, c.z + az * L);
  if (V.z < NEAR) return;
  c.isx = cx + (V.x * focal) / V.z; c.isy = cy - (V.y * focal) / V.z;

  let vx = c.x - c.prevX, vy = c.y - c.prevY, vz = c.z - c.prevZ;
  const vl = Math.hypot(vx, vy, vz) || 1;
  vx /= vl; vy /= vl; vz /= vl;
  const dx = ax - vx * 0.6, dy = ay - vy * 0.6, dz = az - vz * 0.6;
  const Ld = (L * 0.75) / (Math.hypot(dx, dy, dz) || 1);
  // Punto de control a media cola, más cerca de la dirección antisolar, para curvarla.
  toView(c.x + ax * L * 0.4, c.y + ay * L * 0.4, c.z + az * L * 0.4);
  if (V.z < NEAR) return;
  c.dcx = cx + (V.x * focal) / V.z; c.dcy = cy - (V.y * focal) / V.z;
  toView(c.x + dx * Ld, c.y + dy * Ld, c.z + dz * Ld);
  if (V.z < NEAR) return;
  c.dsx = cx + (V.x * focal) / V.z; c.dsy = cy - (V.y * focal) / V.z;
  c.tail = true;
}

// Cola como un abanico que se ensancha y se desvanece desde la cabeza.
function drawTail(x0, y0, qx, qy, x1, y1, w0, spread, col, alpha) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
  if (len < 2) return;
  const nx = -dy / len, ny = dx / len, w1 = w0 + len * spread, wm = (w0 + w1) / 2;
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, col + alpha + ')');
  g.addColorStop(0.3, col + alpha * 0.45 + ')');
  g.addColorStop(1, col + '0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x0 + nx * w0, y0 + ny * w0);
  ctx.quadraticCurveTo(qx + nx * wm, qy + ny * wm, x1 + nx * w1, y1 + ny * w1);
  ctx.lineTo(x1 - nx * w1, y1 - ny * w1);
  ctx.quadraticCurveTo(qx - nx * wm, qy - ny * wm, x0 - nx * w0, y0 - ny * w0);
  ctx.closePath();
  ctx.fill();
}

function drawComet(c) {
  const { sx, sy, comaR, act } = c;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  if (c.tail) {
    drawTail(sx, sy, c.dcx, c.dcy, c.dsx, c.dsy, comaR * 0.7, 0.16, 'rgba(255,232,190,', 0.05 + 0.25 * act);
    drawTail(sx, sy, (sx + c.isx) / 2, (sy + c.isy) / 2, c.isx, c.isy, comaR * 0.35, 0.03, 'rgba(110,180,255,', 0.08 + 0.35 * act);
  }
  const R = comaR * 2.2;
  const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, R);
  g.addColorStop(0, `rgba(225,242,255,${0.5 + 0.45 * act})`);
  g.addColorStop(0.25, `rgba(140,200,255,${0.15 + 0.3 * act})`);
  g.addColorStop(1, 'rgba(80,150,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(sx, sy, R, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(sx, sy, Math.max(0.8, c.sr * 0.6), 0, TAU); ctx.fill();
}

// Región iluminada de un disco: semicírculo hacia la luz + semielipse del terminador.
function litPath(sx, sy, sr, a, lz) {
  ctx.beginPath();
  ctx.arc(sx, sy, sr, a - Math.PI / 2, a + Math.PI / 2, false);
  const rx = Math.max(0, Math.min(1, Math.abs(lz))) * sr;
  if (lz < 0) ctx.ellipse(sx, sy, rx, sr, a, Math.PI / 2, Math.PI * 1.5, false);
  else ctx.ellipse(sx, sy, rx, sr, a, Math.PI / 2, -Math.PI / 2, true);
  ctx.closePath();
}

function drawBands(b) {
  const { sx, sy, sr } = b;
  const p = cam.pitch, sp = Math.sin(p), cpp = Math.cos(p);
  const a0 = p >= 0 ? 0 : Math.PI, a1 = p >= 0 ? Math.PI : TAU;
  for (const [lat, w, color, alpha] of b.bands) {
    const rho = Math.cos(lat) * sr;
    const cyb = sy - Math.sin(lat) * sr * cpp;
    ctx.globalAlpha = alpha;
    if (w === 'cap') {
      // Casquete polar: se rellena el círculo de latitud si ese polo mira a la cámara.
      if (Math.sign(lat) === Math.sign(sp) && Math.abs(sp) > 0.05) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(sx, cyb, rho, rho * Math.abs(sp), 0, 0, TAU);
        ctx.fill();
      }
      continue;
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(0.5, w * sr);
    ctx.beginPath();
    ctx.ellipse(sx, cyb, rho, Math.max(0.01, rho * Math.abs(sp)), 0, a0, a1);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawSphere(b) {
  const { sx, sy, sr } = b;
  if (sr < 1.4) {
    const lit = 0.35 + 0.65 * (1 - b.lz) / 2;
    ctx.globalAlpha = lit;
    ctx.fillStyle = b.color[0];
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(sr, 0.9), 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    return;
  }
  const hx = Math.cos(b.la), hy = Math.sin(b.la);

  // Atmósfera
  if (b.atmo && sr > 3) {
    const g = ctx.createRadialGradient(sx, sy, sr * 0.95, sx, sy, sr * 1.25);
    g.addColorStop(0, b.atmo + '0.45)');
    g.addColorStop(1, b.atmo + '0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(sx, sy, sr * 1.25, 0, TAU); ctx.fill();
  }

  ctx.save();
  const g = ctx.createRadialGradient(sx + hx * sr * 0.4, sy + hy * sr * 0.4, sr * 0.05, sx, sy, sr * 1.05);
  g.addColorStop(0, b.color[0]);
  g.addColorStop(1, b.color[1]);
  ctx.beginPath();
  ctx.arc(sx, sy, sr, 0, TAU);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();

  if (b.bands && sr > 4) drawBands(b);
  // Efectos de impacto iluminados por el Sol (cráteres, polvo, manchas).
  if (b.fx) Impacts.drawSurface(b, 'lit');

  // Lado nocturno con penumbra suave
  const sa = b.la + Math.PI, slz = -b.lz;
  ctx.fillStyle = 'rgba(2,4,12,0.35)';
  litPath(sx, sy, sr * 1.01, sa, Math.max(-1, slz - 0.18));
  ctx.fill();
  ctx.fillStyle = 'rgba(2,4,12,0.72)';
  litPath(sx, sy, sr * 1.01, sa, slz);
  ctx.fill();

  // Oscurecimiento del limbo
  const lg = ctx.createRadialGradient(sx, sy, sr * 0.6, sx, sy, sr);
  lg.addColorStop(0, 'rgba(0,0,0,0)');
  lg.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = lg;
  ctx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
  // Efectos que emiten luz propia (lava, cráteres incandescentes, ondas de choque).
  if (b.fx) Impacts.drawSurface(b, 'emit');
  ctx.restore();
}

const SUN_PALETTE = { c: ['#fffef2', '#ffe68f', '#ffb238', '#ff8a1c'], glow: '255,190,90' };
function drawSun(b) {
  const { sx, sy, sr } = b;
  const t = performance.now() / 1000;
  const pulse = 1 + Math.sin(t * 1.7) * 0.03 + Math.sin(t * 3.1) * 0.02;
  // La paleta cambia con la temperatura de la superficie (evolución estelar).
  const P = b.palette || SUN_PALETTE;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const gr = sr * (P.glowMul || 7) * pulse;
  let g = ctx.createRadialGradient(sx, sy, sr * 0.6, sx, sy, gr);
  g.addColorStop(0, `rgba(${P.glow},0.55)`);
  g.addColorStop(0.18, `rgba(${P.glow},0.2)`);
  g.addColorStop(0.5, `rgba(${P.glow},0.05)`);
  g.addColorStop(1, `rgba(${P.glow},0)`);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(sx, sy, gr, 0, TAU); ctx.fill();
  ctx.restore();

  g = ctx.createRadialGradient(sx - sr * 0.15, sy - sr * 0.15, 0, sx, sy, sr);
  g.addColorStop(0, P.c[0]);
  g.addColorStop(0.45, P.c[1]);
  g.addColorStop(0.85, P.c[2]);
  g.addColorStop(1, P.c[3]);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(sx, sy, sr, 0, TAU); ctx.fill();
  if (b.fx) {
    // Fulguraciones y ondas de impactos sobre la fotosfera.
    ctx.save();
    ctx.clip();
    Impacts.drawSurface(b, 'emit');
    ctx.restore();
    Impacts.drawAfter(b);
  }
}

/* ----------------------------- Anillos --------------------------------- */
const RING_SEG = 120;
function prepareRing(b) {
  const ring = b.ring, nb = ring.bands.length;
  if (!ring.px) {
    const n = nb * 2 * (RING_SEG + 1);
    ring.px = new Float32Array(n); ring.py = new Float32Array(n); ring.pz = new Float32Array(n);
    ring.back = new Uint8Array(RING_SEG);
    const t = ring.tilt * DEG;
    ring.ct = Math.cos(t); ring.st = Math.sin(t);
  }
  ring.ok = true;
  for (let j = 0; j < nb; j++) {
    for (let e = 0; e < 2; e++) {
      const R = ring.bands[j][e] * b.r;
      const base = (j * 2 + e) * (RING_SEG + 1);
      for (let i = 0; i <= RING_SEG; i++) {
        const t = (i / RING_SEG) * TAU;
        const lx = R * Math.cos(t), lz = R * Math.sin(t);
        toView(b.x + lx, b.y + lz * ring.st, b.z + lz * ring.ct);
        if (V.z < NEAR) ring.ok = false;
        const s = focal / V.z;
        ring.px[base + i] = cx + V.x * s;
        ring.py[base + i] = cy - V.y * s;
        ring.pz[base + i] = V.z;
      }
    }
  }
  const ob = (nb * 2 - 1) * (RING_SEG + 1);
  for (let i = 0; i < RING_SEG; i++) {
    ring.back[i] = (ring.pz[ob + i] + ring.pz[ob + i + 1]) / 2 > b.vz ? 1 : 0;
  }
}

function drawRing(b, wantBack) {
  const ring = b.ring;
  if (!ring.ok) return;
  const want = wantBack ? 1 : 0, N = RING_SEG, flags = ring.back;
  let allSame = true;
  for (let i = 1; i < N; i++) if (flags[i] !== flags[0]) { allSame = false; break; }
  if (allSame && flags[0] !== want) return;

  for (let j = 0; j < ring.bands.length; j++) {
    const inner = j * 2 * (N + 1), outer = (j * 2 + 1) * (N + 1);
    ctx.beginPath();
    if (allSame) {
      for (let i = 0; i <= N; i++) i ? ctx.lineTo(ring.px[outer + i], ring.py[outer + i]) : ctx.moveTo(ring.px[outer], ring.py[outer]);
      ctx.closePath();
      for (let i = N; i >= 0; i--) i === N ? ctx.moveTo(ring.px[inner + i], ring.py[inner + i]) : ctx.lineTo(ring.px[inner + i], ring.py[inner + i]);
      ctx.closePath();
    } else {
      for (let s = 0; s < N; s++) {
        if (flags[s] !== want || flags[(s - 1 + N) % N] === want) continue;
        let len = 0;
        while (len < N && flags[(s + len) % N] === want) len++;
        for (let k = 0; k <= len; k++) {
          const i = (s + k) % N;
          k ? ctx.lineTo(ring.px[outer + i], ring.py[outer + i]) : ctx.moveTo(ring.px[outer + i], ring.py[outer + i]);
        }
        for (let k = len; k >= 0; k--) {
          const i = (s + k) % N;
          ctx.lineTo(ring.px[inner + i], ring.py[inner + i]);
        }
        ctx.closePath();
      }
    }
    ctx.fillStyle = ring.bands[j][2];
    ctx.fill('evenodd');
  }
}

function drawBody(b) {
  if (b.type === 'sun') return drawSun(b);
  if (b.type === 'comet') return drawComet(b);
  if (b.type === 'blackhole' || b.type === 'projectile') return Impacts.drawBody(b);
  if (b.ring) drawRing(b, true);
  drawSphere(b);
  if (b.ring) drawRing(b, false);
  if (b.fx) Impacts.drawAfter(b);
}

/* --------------------------- Render: fondo ----------------------------- */
function drawStars() {
  for (const lvl of STAR_LEVELS) {
    const d = lvl.dirs, sz = lvl.size;
    ctx.fillStyle = lvl.color;
    ctx.beginPath();
    for (let i = 0; i < d.length; i += 3) {
      const x = d[i], y = d[i + 1], z = d[i + 2];
      const x1 = x * cyaw - z * syaw, z1 = x * syaw + z * cyaw;
      const vy = y * cpit + z1 * spit, vz = -y * spit + z1 * cpit;
      if (vz < 0.05) continue;
      const sx = cx + (x1 / vz) * focal, sy = cy - (vy / vz) * focal;
      if (sx < 0 || sy < 0 || sx > W || sy > H) continue;
      ctx.rect(sx, sy, sz, sz);
    }
    ctx.fill();
  }
}

function strokePolyline(pts, n, style, width) {
  ctx.beginPath();
  let pen = false;
  for (let i = 0; i <= n; i++) {
    toView(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
    if (V.z < NEAR) { pen = false; continue; }
    const s = focal / V.z, sx = cx + V.x * s, sy = cy - V.y * s;
    pen ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy);
    pen = true;
  }
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  ctx.stroke();
}

const ORBIT_STYLE = {
  planet: 'rgba(140,165,220,0.22)', comet: 'rgba(110,200,255,0.16)', dwarf: 'rgba(190,160,255,0.16)', moon: 'rgba(200,200,200,0.16)',
};
function drawOrbits() {
  // En modo N-cuerpos se dibuja la órbita osculante (la elipse instantánea),
  // que muestra cómo las perturbaciones deforman cada órbita.
  for (const b of HELIO) {
    if (b.type === 'sun' || b.type === 'blackhole' || isHidden(b)) continue;
    const pts = sim.nbody ? b.osc : b.orbit;
    if (!pts) continue;
    const sel = cam.follow === b;
    strokePolyline(pts, sim.nbody ? b.oscN : b.orbitN, sel ? 'rgba(255,200,120,0.6)' : ORBIT_STYLE[b.type], sel ? 1.5 : 1);
  }
  Impacts.drawTrails();
  // Órbitas de las lunas cuando el planeta se ve suficientemente grande.
  ctx.strokeStyle = 'rgba(140,165,220,0.18)';
  ctx.lineWidth = 1;
  for (const m of MOONS) {
    const par = m.parentBody;
    if (m.free || m.destroyed || !par.visible || par.sr < 5) continue;
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i <= 72; i++) {
      const a = (i / 72) * TAU;
      toView(par.x + m.dist * Math.cos(a), par.y + m.dist * Math.sin(a) * 0.05, par.z + m.dist * Math.sin(a));
      if (V.z < NEAR) { pen = false; continue; }
      const s = focal / V.z;
      pen ? ctx.lineTo(cx + V.x * s, cy - V.y * s) : ctx.moveTo(cx + V.x * s, cy - V.y * s);
      pen = true;
    }
    ctx.stroke();
  }
}

/* ------------------------ Render: partículas --------------------------- */
// Las partículas se agrupan en "capas" entre cuerpos ordenados por profundidad,
// así los asteroides quedan correctamente delante o detrás de cada planeta.
let binStart = new Int32Array(1);
function processParticles(days, zs, nb) {
  const nKeys = (nb + 1) * NSH;
  if (binStart.length < nKeys + 1) binStart = new Int32Array(nKeys + 1);
  const counts = binStart;
  counts.fill(0, 0, nKeys + 1);
  const tx = cam.tx, ty = cam.ty, tz = cam.tz, dist = cam.dist;
  const nb3 = beltState.on;
  const dyn = Impacts.dyn;
  const total = NP + dyn.n;
  for (let i = 0; i < total; i++) {
    let x, y, z, size, shade;
    if (i < NP) {
      if (!groupOn[pGroup[i]]) { pKey[i] = -1; continue; }
      // Posición heliocéntrica en UA (analítica o integrada) -> escena.
      let ax, ay, az;
      if (nb3) {
        ax = beltState.x[i]; ay = beltState.y[i]; az = beltState.z[i];
      } else {
        const th = pTh[i] + pN[i] * days;
        const rr = pAU[i] * orbitScale * (1 - pE[i] * Math.cos(th - pPeri[i]));
        ax = rr * Math.cos(th); az = rr * Math.sin(th);
        ay = rr * Math.sin(th - pNode[i]) * pSinI[i];
      }
      const r = Math.hypot(ax, ay, az);
      const m = r > 1e-9 ? mapAU(r) / r : 0;
      x = ax * m - tx; y = ay * m - ty; z = az * m - tz;
      size = pSize[i]; shade = pShade[i];
    } else {
      const j = i - NP;
      x = dyn.x[j] - tx; y = dyn.y[j] - ty; z = dyn.z[j] - tz;
      size = dyn.size[j]; shade = N_STATIC_SHADES + dyn.shade[j];
    }
    const x1 = x * cyaw - z * syaw, z1 = x * syaw + z * cyaw;
    const vy = y * cpit + z1 * spit, vz = -y * spit + z1 * cpit + dist;
    if (vz < NEAR * 0.25) { pKey[i] = -1; continue; }
    const sc = focal / vz;
    const sx = cx + x1 * sc, sy = cy - vy * sc;
    if (sx < -4 || sy < -4 || sx > W + 4 || sy > H + 4) { pKey[i] = -1; continue; }
    let bin = 0;
    while (bin < nb && zs[bin] > vz) bin++;
    const k = bin * NSH + shade;
    pKey[i] = k;
    counts[k + 1]++;
    pSx[i] = sx; pSy[i] = sy;
    const d = size * sc * 0.9;
    pSz[i] = d < 0.6 ? 0.6 : d > 3.5 ? 3.5 : d;
  }
  for (let k = 1; k <= nKeys; k++) counts[k] += counts[k - 1];
  // Ordenamiento por conteo (usa una copia temporal de los inicios).
  const fillPos = binStart.slice(0, nKeys);
  for (let i = 0; i < total; i++) {
    const k = pKey[i];
    if (k >= 0) pOrder[fillPos[k]++] = i;
  }
}

function drawBin(bin) {
  for (let s = 0; s < NSH; s++) {
    const k = bin * NSH + s;
    const from = binStart[k], to = binStart[k + 1];
    if (from === to) continue;
    ctx.fillStyle = SHADES[s];
    if (SHADE_ADD[s]) ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath();
    for (let j = from; j < to; j++) {
      const i = pOrder[j], d = pSz[i];
      ctx.rect(pSx[i] - d / 2, pSy[i] - d / 2, d, d);
    }
    ctx.fill();
    if (SHADE_ADD[s]) ctx.globalCompositeOperation = 'source-over';
  }
}

/* ------------------------------ Etiquetas ------------------------------ */
function drawLabels(sorted) {
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  // Prioridad: cuerpo seguido, Sol, planetas y luego lunas; se omiten etiquetas que se solapan.
  const RANK = { sun: 1, blackhole: 1, planet: 2, dwarf: 3, comet: 3, moon: 4 };
  const rank = (b) => (b === cam.follow ? 0 : RANK[b.type]);
  const placed = [];
  for (const b of [...sorted].filter((b) => RANK[b.type]).sort((a, c) => rank(a) - rank(c))) {
    if (b.type === 'moon' && !b.free && (b.parentBody.sr < 12 || b.sr < 0.8)) continue;
    const y = b.sy - Math.max(b.sr, 2) - (b.type === 'sun' ? 10 : 6);
    if (b.sx < -50 || b.sx > W + 50 || y < 0 || y > H + 20) continue;
    const w = ctx.measureText(b.name).width + 6;
    const box = { x0: b.sx - w / 2, x1: b.sx + w / 2, y0: y - 14, y1: y };
    if (placed.some((p) => box.x0 < p.x1 && box.x1 > p.x0 && box.y0 < p.y1 && box.y1 > p.y0)) continue;
    placed.push(box);
    ctx.fillStyle = cam.follow === b ? '#ffd28a' : b.type === 'moon' ? 'rgba(200,210,230,0.65)' : 'rgba(235,240,255,0.85)';
    ctx.fillText(b.name, b.sx, y);
  }
}

/* -------------------------------- Bucle -------------------------------- */
let sortedBodies = [];
function draw() {
  const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.75);
  bg.addColorStop(0, '#070a18');
  bg.addColorStop(1, '#010208');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  if (opts.stars) drawStars();
  projectBodies();
  if (opts.orbits) drawOrbits();

  sortedBodies = BODIES.filter((b) => b.visible).sort((a, b) => b.vz - a.vz);
  const zs = sortedBodies.map((b) => b.vz);
  processParticles(sim.days, zs, zs.length);

  drawBin(0);
  for (let k = 0; k < sortedBodies.length; k++) {
    drawBody(sortedBodies[k]);
    drawBin(k + 1);
  }
  Impacts.drawOverlay();
  if (opts.labels) drawLabels(sortedBodies);
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  // Durante un impacto el laboratorio impone cámara lenta.
  const speed = Impacts.timeScale() ?? sim.speed;
  let dDays = sim.paused ? 0 : speed * dt;
  if (sim.nbody && dDays > 0) dDays = Impacts.advance(dDays);
  sim.days += dDays;
  updateBodies(sim.days);
  Impacts.update(dt, dDays);
  updateCamera(dt);
  draw();
  updateHud();
  requestAnimationFrame(frame);
}

/* ------------------------------ Interfaz ------------------------------- */
const $ = (id) => document.getElementById(id);
const dateEl = $('date'), speedLabel = $('speed-label');
const dateFmt = new Intl.DateTimeFormat('es-CL', { year: 'numeric', month: 'long', day: 'numeric' });
let lastDayShown = null;

function updateHud() {
  const day = Math.floor(sim.days);
  // Durante la evolución estelar el reloj muestra la edad del Sol en lugar de la fecha.
  const evo = Impacts.hudOverride();
  if (evo) {
    if (dateEl.textContent !== evo.date) dateEl.textContent = evo.date;
    if (speedLabel.textContent !== evo.speed) speedLabel.textContent = evo.speed;
    lastDayShown = null;
    return;
  }
  if (day !== lastDayShown) {
    lastDayShown = day;
    const d = new Date(J2000 + sim.days * DAY_MS);
    dateEl.textContent = isNaN(d) ? 'fuera de rango' : dateFmt.format(d);
    for (const { el, fn } of liveFacts) el.textContent = fn();
  }
  if (infoBody && infoBody.live && !$('info').hidden) {
    $('info-live').textContent = `${fmtNum(infoBody.au)} UA`;
  }
  const slow = Impacts.timeScale();
  const label = sim.paused ? 'En pausa'
    : slow != null ? `Cámara lenta · ${fmtSpeed(slow)}`
    : `Velocidad: ${fmtSpeed(sim.speed)}`;
  if (speedLabel.textContent !== label) speedLabel.textContent = label;
}

function speedFromSlider(v) {
  return 0.02 * Math.pow(10, v / 20); // 0,02 – 2000 días/s
}
function fmtSpeed(d) {
  if (d < 1 / 24) return `${(d * 1440).toFixed(1)} min/s`;
  if (d < 1) return `${(d * 24).toFixed(1)} horas/s`;
  if (d < 60) return `${d.toFixed(1)} días/s`;
  if (d < 730) return `${(d / 30.44).toFixed(1)} meses/s`;
  return `${(d / 365.25).toFixed(1)} años/s`;
}
function refreshSpeed() {
  sim.speed = speedFromSlider(+$('speed').value);
}
$('speed').addEventListener('input', refreshSpeed);

function togglePause() {
  sim.paused = !sim.paused;
  $('pause').textContent = sim.paused ? '▶ Reanudar' : '⏸ Pausa';
  $('pause').classList.toggle('active', sim.paused);
  refreshSpeed();
}
$('pause').addEventListener('click', togglePause);
$('today').addEventListener('click', () => { sim.days = (Date.now() - J2000) / DAY_MS; });

const bindCheck = (id, fn) => {
  const el = $(id);
  el.addEventListener('change', () => fn(el.checked));
};
bindCheck('opt-orbits', (v) => (opts.orbits = v));
bindCheck('opt-labels', (v) => (opts.labels = v));
bindCheck('opt-stars', (v) => (opts.stars = v));
bindCheck('opt-rotate', (v) => (opts.rotate = v));
bindCheck('opt-belt', (v) => (groupOn[0] = v));
bindCheck('opt-trojans', (v) => (groupOn[1] = v));
bindCheck('opt-kuiper', (v) => (groupOn[2] = v));
bindCheck('opt-comets', (v) => (opts.comets = v));
bindCheck('opt-dwarfs', (v) => (opts.dwarfs = v));

// Selector de planetas enanos y cometas
const others = $('others');
for (const [label, list] of [['Planetas enanos', DWARFS], ['Cometas', COMETS]]) {
  const group = document.createElement('optgroup');
  group.label = label;
  for (const b of list) group.appendChild(new Option(b.name, b.name));
  others.appendChild(group);
}
others.addEventListener('change', () => {
  const b = KEPLERIAN.find((o) => o.name === others.value);
  if (b) {
    // Al elegir un objeto oculto, se vuelve a mostrar su grupo.
    const id = b.type === 'comet' ? 'opt-comets' : 'opt-dwarfs';
    $(id).checked = true;
    opts[b.type === 'comet' ? 'comets' : 'dwarfs'] = true;
    focusOn(b);
  }
  others.value = '';
});

// Barra de planetas
const bar = $('planet-bar');
const barButtons = new Map();
for (const b of [SUN, ...PLANETS]) {
  const btn = document.createElement('button');
  btn.innerHTML = `<span class="dot" style="background:${b.swatch}"></span>${b.name}`;
  btn.addEventListener('click', () => focusOn(b));
  bar.appendChild(btn);
  barButtons.set(b, btn);
}

// Datos que cambian con la fecha simulada (p. ej. el próximo perihelio).
let infoBody = null;
const liveFacts = [];

function showInfo(b) {
  infoBody = b;
  liveFacts.length = 0;
  $('info').hidden = false;
  $('info-name').textContent = b.name;
  $('info-desc').textContent = b.desc;
  const dl = $('info-facts');
  dl.innerHTML = '';
  const addRow = (k, v) => {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    dl.append(dt, dd);
    return dd;
  };
  if (b.live) addRow('Distancia al Sol', '').id = 'info-live';
  for (const [k, v] of b.facts) {
    if (typeof v === 'function') liveFacts.push({ el: addRow(k, v()), fn: v });
    else addRow(k, v);
  }
}

function setFollow(b) {
  cam.from = { x: cam.tx, y: cam.ty, z: cam.tz };
  cam.follow = b;
  cam.blend = 0;
  for (const [body, btn] of barButtons) btn.classList.toggle('active', body === b && b !== null && !overview);
}

let overview = true;
function focusOn(b) {
  overview = false;
  setFollow(b);
  cam.tdist = b.type === 'sun' ? 220
    : b.type === 'comet' ? 90
    : b.r * (b.ring ? 9 : b.type === 'planet' ? 10 : 14);
  showInfo(b);
}

function resetView() {
  overview = true;
  setFollow(SUN);
  cam.tdist = 950;
  cam.pitch = Math.max(cam.pitch, 0.35);
  $('info').hidden = true;
}
$('reset').addEventListener('click', resetView);
$('info-close').addEventListener('click', () => { $('info').hidden = true; });

/* ------------------------------ Controles ------------------------------ */
const drag = { active: false, moved: 0, x: 0, y: 0, pan: false };
const pointers = new Map();
let pinchDist = 0;

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
  }
  drag.active = true;
  drag.moved = 0;
  drag.x = e.clientX; drag.y = e.clientY;
  drag.pan = e.button === 2 || e.shiftKey;
  canvas.classList.add('dragging');
});

canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinchDist > 0) zoomBy(pinchDist / d);
    pinchDist = d;
    drag.moved += 10;
    return;
  }
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.x = e.clientX; drag.y = e.clientY;
  drag.moved += Math.abs(dx) + Math.abs(dy);
  if (drag.pan) {
    // Desplazar el objetivo en el plano de la cámara (deja de seguir cuerpos).
    if (cam.follow) { cam.follow = null; for (const btn of barButtons.values()) btn.classList.remove('active'); }
    const k = cam.dist / focal;
    const rx = cyaw, rz = -syaw;                           // vector derecha
    const ux = syaw * spit, uy = cpit, uz = cyaw * spit;   // vector arriba
    cam.tx += (-rx * dx + ux * dy) * k;
    cam.ty += uy * dy * k;
    cam.tz += (-rz * dx + uz * dy) * k;
  } else {
    cam.yaw -= dx * 0.005;
    cam.pitch = Math.max(-1.5, Math.min(1.5, cam.pitch + dy * 0.005));
  }
});

function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  pinchDist = 0;
  if (pointers.size > 0) return;
  drag.active = false;
  canvas.classList.remove('dragging');
  if (drag.moved < 5 && e.type === 'pointerup') pick(e.clientX, e.clientY);
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

function zoomBy(f) {
  cam.tdist = Math.max(minDist(), Math.min(4500, cam.tdist * f));
}
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoomBy(Math.exp(e.deltaY * 0.0012));
}, { passive: false });

function pick(x, y) {
  let best = null;
  // Recorremos de cerca a lejos: el primero que coincide es el que está delante.
  for (let i = sortedBodies.length - 1; i >= 0; i--) {
    const b = sortedBodies[i];
    if (b.noPick) continue;
    const r = Math.max(b.sr, 8) + 4;
    if ((b.sx - x) ** 2 + (b.sy - y) ** 2 <= r * r) { best = b; break; }
  }
  if (best) focusOn(best);
}

// Quitar el foco de los controles para que Espacio no los active de nuevo.
document.addEventListener('click', (e) => e.target.closest?.('button')?.blur());
document.addEventListener('change', (e) => e.target.blur?.());

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); togglePause(); }
  else if (e.key === 'Escape') resetView();
  else if (/^[0-8]$/.test(e.key)) focusOn(e.key === '0' ? SUN : PLANETS[+e.key - 1]);
});

refreshSpeed();
// Permite abrir directamente un cuerpo con un enlace, p. ej. index.html#Saturno
const initial = BODIES.find((b) => b.name === decodeURIComponent(location.hash.slice(1)));
if (initial) {
  focusOn(initial);
  cam.blend = 1;
  cam.dist = cam.tdist;
}
// Se arranca cuando ya cargaron todos los scripts (impacts.js incluido).
window.addEventListener('DOMContentLoaded', () => requestAnimationFrame(frame));
