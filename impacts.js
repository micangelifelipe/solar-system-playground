'use strict';

/* =========================================================================
 * Laboratorio de impactos
 *
 * Física (en unidades reales):
 *  - La energía cinética del proyectil se compara con la energía de ligadura
 *    gravitatoria del planeta, U = 3GM²/(5R); el cociente q = E/U decide el
 *    resultado (cráter, extinción, océano de magma ... destrucción total).
 *  - Diámetro del cráter: leyes de escala de Collins, Melosh y Marcus (2005).
 *  - Explosiones aéreas para cuerpos pequeños en planetas con atmósfera.
 *  - Agujeros negros: radio de marea r_t = R·(M_bh/M_p)^(1/3). Si el agujero
 *    es menos masivo que el planeta lo atraviesa y deposita energía por
 *    fricción dinámica (Chandrasekhar); si no, lo despedaza por marea.
 *  - Cuando hay escombros libres o un agujero negro, todo el sistema pasa a
 *    integrarse numéricamente (N-cuerpos con leapfrog).
 *
 * Escalas: los planetas se dibujan mucho más grandes que en la realidad, así
 * que la eyecta cercana se simula en un marco local adimensional (longitud =
 * radio del planeta, tiempo = √(R³/GM)) y, cuando escapa, se transfiere al
 * marco heliocéntrico.
 * ========================================================================= */

const Impacts = (() => {
  /* --------------------------- Constantes ------------------------------ */
  const G = 6.674e-11;            // m³/(kg·s²)
  const G_KM = 6.674e-20;         // km³/(kg·s²)
  const C_LIGHT = 2.998e8;        // m/s
  const AU_KM = 1.495978707e8;
  const DAY_S = 86400;
  const YEAR = 365.25;
  const K2 = 2.9591220828e-4;     // G·M☉ en UA³/día²
  const M_SUN = 1.989e30;
  const KMS_AUD = DAY_S / AU_KM;  // km/s -> UA/día
  const MT = 4.184e15;            // julios por megatón de TNT
  const HIROSHIMA = 6.3e13;
  const CHICXULUB = 4.2e23;
  const R_SUN_AU = 0.00465;
  const L_SUN = 3.828e26;         // luminosidad solar (W)
  let sunMu = K2;                 // gravedad del Sol (cambia si el Sol es destruido)

  const SLOW = 0.003;             // días simulados por segundo en cámara lenta (~4 min/s)
  const APPROACH = 0.006;         // duración de la aproximación del proyectil (días)
  const ROCHE = 2.9;              // límite de Roche (radios planetarios) para escombros rocosos

  const TARGETS = [SUN, ...PLANETS, ...DWARFS];
  for (const b of [...TARGETS, ...MOONS]) { b.mass0 = b.mass; b.radius0 = b.radius; }

  /* ---------------------------- Utilidades ----------------------------- */
  const rnd = Math.random;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const logLerp = (a, b, t) => a * Math.pow(b / a, t);
  const invLogLerp = (a, b, v) => Math.log(v / a) / Math.log(b / a);
  function gaussR() { let u = 0; while (!u) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rnd()); }

  const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
  const add = (a, b) => v3(a.x + b.x, a.y + b.y, a.z + b.z);
  const sub = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
  const mul = (a, k) => v3(a.x * k, a.y * k, a.z * k);
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const cross = (a, b) => v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  const len = (a) => Math.hypot(a.x, a.y, a.z);
  const norm = (a) => { const l = len(a) || 1; return v3(a.x / l, a.y / l, a.z / l); };
  function perpBasis(n) {
    const ref = Math.abs(n.y) < 0.9 ? v3(0, 1, 0) : v3(1, 0, 0);
    const u = norm(cross(n, ref));
    return [u, cross(n, u)];
  }
  function randBall() { let p; do { p = v3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1); } while (dot(p, p) > 1); return p; }
  const randUnit = () => norm(v3(gaussR(), gaussR(), gaussR()));

  // Ejes de la cámara expresados en coordenadas de escena.
  function camBasis() {
    return {
      right: v3(cyaw, 0, -syaw),
      up: v3(syaw * spit, cpit, cyaw * spit),
      fwd: v3(syaw * cpit, -spit, cyaw * cpit),
    };
  }
  // Rota una dirección del mundo al espacio de cámara (sin traslación).
  function rotView(d, out) {
    const x1 = d.x * cyaw - d.z * syaw, z1 = d.x * syaw + d.z * cyaw;
    out.x = x1; out.y = d.y * cpit + z1 * spit; out.z = -d.y * spit + z1 * cpit;
    return out;
  }

  /* ---------------------------- Formatos ------------------------------- */
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  function sci(x) {
    if (!isFinite(x)) return '∞';
    if (x === 0) return '0';
    const e = Math.floor(Math.log10(Math.abs(x)));
    if (e >= -2 && e < 5) return fmtNum(x, x < 10 ? 2 : 0);
    const m = x / Math.pow(10, e);
    return `${fmtNum(m, 1)} × 10${String(e).split('').map((c) => SUP[c]).join('')}`;
  }
  function fmtLen(m) {
    if (m < 1e-9) return `${sci(m * 1e12)} pm`;
    if (m < 1e-6) return `${fmtNum(m * 1e9, 1)} nm`;
    if (m < 1e-3) return `${fmtNum(m * 1e6, 1)} µm`;
    if (m < 1) return `${fmtNum(m * 1e3, 1)} mm`;
    if (m < 1000) return `${fmtNum(m, m < 10 ? 1 : 0)} m`;
    return `${fmtNum(m / 1e3, m < 1e4 ? 1 : 0)} km`;
  }
  function fmtDur(s) {
    if (s < 1) return `${sci(s)} s`;
    if (s < 120) return `${fmtNum(s, 0)} s`;
    if (s < 7200) return `${fmtNum(s / 60, 0)} min`;
    if (s < 2 * DAY_S) return `${fmtNum(s / 3600, 1)} h`;
    if (s < 2 * YEAR * DAY_S) return `${fmtNum(s / DAY_S, 0)} días`;
    return `${sci(s / (YEAR * DAY_S))} años`;
  }
  // Severidad visual de un impacto en el Sol: según cuántos segundos de luminosidad solar libera.
  const solarSev = (E) => clamp((Math.log10(E / L_SUN) + 4) / 10, 0.05, 1);
  function fmtRel(d) {
    if (d < 1 / 1440) return 'ahora';
    if (d < 1 / 24) return `+${Math.round(d * 1440)} min`;
    if (d < 1) return `+${fmtNum(d * 24, 1)} h`;
    if (d < 60) return `+${fmtNum(d, 1)} días`;
    if (d < 730) return `+${fmtNum(d / 30.44, 1)} meses`;
    return `+${fmtNum(d / YEAR, 1)} años`;
  }
  function equiv(E) {
    if (E < 1e21) return `≈ ${sci(E / HIROSHIMA)} bombas de Hiroshima`;
    return `≈ ${sci(E / CHICXULUB)} × Chicxulub`;
  }
  const MASS_REFS = [
    [1.6e15, 'del monte Everest'], [9.39e20, 'de Ceres'], [7.35e22, 'de la Luna'],
    [5.97e24, 'de la Tierra'], [1.898e27, 'de Júpiter'], [M_SUN, 'del Sol'],
  ];
  function massEquiv(M) {
    let ref = MASS_REFS[0];
    for (const r of MASS_REFS) if (r[0] <= M * 1.0001) ref = r;
    const k = M / ref[0];
    return Math.abs(k - 1) < 0.05 ? `la masa ${ref[1]}` : `${sci(k)} veces la masa ${ref[1]}`;
  }

  /* ----------------------- Tipos y escenarios -------------------------- */
  // Tamaños en metros; densidades en kg/m³.
  const TYPES = {
    meteor: { name: 'Meteoro', rho: 3300, size: [0.5, 200], color: ['#b9ab9b', '#4d453e'] },
    asteroid: { name: 'Asteroide', rho: 3000, size: [50, 7e6], color: ['#b0a496', '#463e37'] },
    comet: { name: 'Cometa', rho: 600, size: [300, 2e5], color: ['#eef6ff', '#7d8fa3'] },
    bh: { name: 'Agujero negro', mass: [1e15, 2e31] },
    sn: { name: 'Supernova', energy: [1e42, 1e46] },
    evo: { name: 'Evolución del Sol' },
  };

  const PRESETS = [
    { name: 'Chelyabinsk (2013)', type: 'meteor', target: 'Tierra', L: 19, v: 19, angle: 18 },
    { name: 'Tunguska (1908)', type: 'meteor', target: 'Tierra', L: 55, v: 20, angle: 35 },
    { name: 'Chicxulub: fin de los dinosaurios', type: 'asteroid', target: 'Tierra', L: 10000, v: 20, angle: 60 },
    { name: 'Asteroide que hierve los océanos', type: 'asteroid', target: 'Tierra', L: 5e5, v: 20, angle: 45 },
    { name: 'Theia: origen de la Luna', type: 'asteroid', target: 'Tierra', L: 6.2e6, v: 12, angle: 45 },
    { name: 'Destruir la Tierra', type: 'asteroid', target: 'Tierra', L: 7e6, v: 70, angle: 80 },
    { name: 'Shoemaker-Levy 9 contra Júpiter (1994)', type: 'comet', target: 'Júpiter', L: 1500, v: 60, angle: 45, frags: 6 },
    { name: 'Cometa contra Marte', type: 'comet', target: 'Marte', L: 20000, v: 55, angle: 45 },
    { name: 'Destruir Ceres', type: 'asteroid', target: 'Ceres', L: 2e5, v: 15, angle: 70 },
    { name: 'Agujero negro primordial atraviesa la Tierra', type: 'bh', target: 'Tierra', M: 1e20, v: 200 },
    { name: 'Agujero negro de masa lunar', type: 'bh', target: 'Tierra', M: 7.35e22, v: 60 },
    { name: 'Agujero negro de masa joviana: disco de acreción', type: 'bh', target: 'Tierra', M: 1.898e27, v: 10 },
    { name: 'Agujero negro estelar (10 M☉) contra Júpiter', type: 'bh', target: 'Júpiter', M: 1.989e31, v: 100 },
    { name: 'Cometa rozador cae al Sol (familia de Kreutz)', type: 'comet', target: 'Sol', L: 2000, v: 620, angle: 30 },
    { name: 'Asteroide gigante contra el Sol', type: 'asteroid', target: 'Sol', L: 7e6, v: 650, angle: 60 },
    { name: 'Agujero negro atrapado dentro del Sol', type: 'bh', target: 'Sol', M: 2e27, v: 50 },
    { name: 'Agujero negro estelar (10 M☉) destroza el Sol', type: 'bh', target: 'Sol', M: 1.989e31, v: 100 },
    { name: 'El Sol explota como supernova (hipotético)', type: 'sn', target: 'Sol', E: 1e44, fej: 1 },
    { name: 'Supernova débil: expulsa solo el 30 % de la masa', type: 'sn', target: 'Sol', E: 1e43, fej: 0.3 },
    { name: 'Evolución real del Sol: gigante roja → enana blanca', type: 'evo', target: 'Sol' },
  ];

  /* ------------------------------ Física ------------------------------- */
  const vEsc = (b) => Math.sqrt((2 * G * b.mass) / (b.radius * 1e3)) / 1e3; // km/s
  const bindingEnergy = (b) => (0.6 * G * b.mass * b.mass) / (b.radius * 1e3);
  const sev = (q) => clamp((Math.log10(q) + 16) / 16, 0, 1.25); // severidad 0..1+
  const nm = (b) => (b.type === 'sun' ? 'el Sol' : b.name);
  const unitTime = (b) => Math.sqrt(b.radius ** 3 / (G_KM * b.mass)); // s

  function categorize(q, t, airburst) {
    if (q >= 1) return 'destroy';
    if (q >= 0.3) return 'partial';
    if (q >= 1e-3) return 'magma';
    if (airburst) return 'airburst';
    if (t.kind === 'gas') return q >= 1e-5 ? 'gasglobal' : 'gasscar';
    if (q >= 1e-5) return 'sterilize';
    if (q >= 1e-9) return 'extinction';
    if (q >= 1e-12) return 'regional';
    return 'local';
  }

  function analyze(P) {
    const t = P.target;
    const R = t.radius * 1e3, M = t.mass;
    const U = bindingEnergy(t);
    const g = (G * M) / (R * R);
    const A = { t, U, g, frags: P.frags || 1 };
    if (t.type === 'sun') return analyzeSun(P, A);
    if (P.type === 'bh') {
      const Mb = P.mass, v = P.v * 1e3;
      A.rs = (2 * G * Mb) / (C_LIGHT * C_LIGHT);
      A.rt = t.radius * Math.cbrt(Mb / M);
      A.tde = Mb >= M;
      if (A.tde) {
        A.E = U; A.q = Infinity; A.cat = 'tde';
      } else {
        const rho = M / ((4 / 3) * Math.PI * R ** 3);
        A.E = ((4 * Math.PI * G * G * Mb * Mb * rho * 10) / (v * v)) * 2 * R; // fricción dinámica, ln Λ ≈ 10
        const racc = (2 * G * Mb) / (v * v);
        A.accreted = Math.PI * racc * racc * rho * 2 * R; // acreción de Bondi-Hoyle durante el cruce
        A.q = A.E / U;
        A.cat = categorize(A.q, t, false);
        A.bhPass = true;
      }
      A.s = sev(A.q);
      return A;
    }
    const ty = TYPES[P.type];
    const v = P.v * 1e3;
    A.Lf = P.L / Math.cbrt(A.frags);                     // diámetro de cada fragmento
    A.mass = (Math.PI / 6) * P.L ** 3 * ty.rho;
    A.E = 0.5 * A.mass * v * v;
    A.q = A.E / U;
    A.Ef = A.E / A.frags;
    A.qf = A.Ef / U;
    const Lcrit = (P.type === 'comet' ? 150 : 60) * Math.sqrt(isFinite(t.atm) ? t.atm : 0);
    const airburst = t.kind !== 'gas' && t.atm > 0 && A.Lf < Lcrit && A.qf < 1e-12;
    // Cráter final (Collins et al. 2005), en km
    const rhoT = t.kind === 'ice' ? 1000 : 2700;
    const th = Math.max(5, P.angle) * DEG;
    const Dtc = 1.161 * Math.cbrt(ty.rho / rhoT) * A.Lf ** 0.78 * v ** 0.44 * g ** -0.22 * Math.cbrt(Math.sin(th));
    const Dc = 3200 * (9.81 / g);
    A.crater = (1.25 * Dtc < Dc ? 1.25 * Dtc : (1.17 * Dtc ** 1.13) / Dc ** 0.13) / 1e3;
    A.blastR = 26 * Math.cbrt(A.Ef / MT / 12);          // radio arrasado (km), escalado desde Tunguska
    A.scarKm = 60 * Math.cbrt(A.Ef / MT);               // mancha en gigantes gaseosos, escalada desde SL9
    A.cat = categorize(A.qf, t, airburst);
    A.s = sev(A.qf);
    return A;
  }

  // El Sol: nada que podamos lanzar se acerca a su energía de ligadura, así que
  // la escala útil es la luminosidad solar (cuántos segundos de brillo libera).
  function analyzeSun(P, A) {
    const t = A.t;
    if (P.type === 'bh') {
      const Mb = P.mass;
      A.rs = (2 * G * Mb) / (C_LIGHT * C_LIGHT);
      A.rt = t.radius * Math.cbrt(Mb / t.mass);
      A.tde = Mb >= t.mass;
      if (A.tde) {
        A.E = A.U; A.q = Infinity; A.cat = 'suntde'; A.s = 1;
        return A;
      }
      const R = t.radius * 1e3;
      const rho = t.mass / ((4 / 3) * Math.PI * R ** 3);
      const vLoc = Math.sqrt(P.v ** 2 + vEsc(t) ** 2) * 1e3; // velocidad al llegar a la superficie
      A.E = ((4 * Math.PI * G * G * Mb * Mb * rho * 10) / (vLoc * vLoc)) * 2 * R;
      const racc = (2 * G * Mb) / (vLoc * vLoc);
      A.accreted = Math.PI * racc * racc * rho * 2 * R;
      A.captured = A.E > 0.5 * Mb * (P.v * 1e3) ** 2;
      A.eatYears = 4.5e7 * Math.log(t.mass / Mb); // crecimiento limitado por Eddington (tiempo de Salpeter)
      A.q = A.E / A.U; A.Ls = A.E / L_SUN; A.s = solarSev(A.E);
      A.cat = 'solarpass'; A.bhPass = true;
      return A;
    }
    const ty = TYPES[P.type];
    const v = P.v * 1e3;
    A.Lf = P.L / Math.cbrt(A.frags);
    A.mass = (Math.PI / 6) * P.L ** 3 * ty.rho;
    A.E = 0.5 * A.mass * v * v;
    A.Ef = A.E / A.frags;
    A.q = A.qf = A.E / A.U;
    A.Ls = A.E / L_SUN;
    A.s = solarSev(A.Ef);
    A.comet = P.type === 'comet';
    A.cat = 'solar';
    return A;
  }

  const CATS = {
    solar: ['Impacto contra el Sol', '#ffd166', (A) => `${A.comet ? 'Un cometa rozador suele evaporarse antes de tocar la fotosfera. ' : ''}Libera la energía que el Sol emite en ${fmtDur(A.Ls)}: un destello, un terremoto solar y una lluvia de plasma. Para el Sol es ${A.Ls < DAY_S ? 'apenas un parpadeo' : 'un aumento de brillo pasajero'}.`],
    solarpass: ['Atraviesa el Sol', '#ffd166', (A) => (A.captured
      ? `La fricción dinámica lo frena tanto que queda atrapado dentro del Sol: se hundirá al núcleo y lo devorará desde dentro en ~${sci(A.eatYears)} años.`
      : `Cruza el Sol y sale por el otro lado; deposita la energía que el Sol emite en ${fmtDur(A.Ls)}.`)],
    supernova: ['Supernova (hipotética)', '#ff6bd6', () => 'El Sol tiene muy poca masa para explotar así: solo las estrellas de más de ~8 M☉ terminan en supernova (el Sol acabará como enana blanca). Este escenario imagina que lo hiciera. Daño estimado suponiendo que cada cuerpo absorbe ~10 % de la energía que intercepta.'],
    suntde: ['Disrupción del Sol', '#b388ff', () => 'El agujero negro es más masivo que el Sol y lo despedaza por marea. Los planetas pierden la gravedad y la luz de su estrella: quedan atrapados por el agujero negro o salen despedidos.'],
    local: ['Cráter local', '#7fc8ff', (A) => `Cráter de ~${fmtLen(A.crater * 1e3)}; efectos limitados a la zona del impacto.`],
    regional: ['Devastación regional', '#ffd166', (A) => `Cráter de ~${fmtLen(A.crater * 1e3)}; terremotos, incendios y lluvia de eyecta en cientos de kilómetros.`],
    extinction: ['Extinción masiva', '#ff9f43', (A) => `Cráter de ~${fmtLen(A.crater * 1e3)}. El polvo y el hollín bloquean la luz solar durante años: invierno de impacto.`],
    sterilize: ['Esterilización global', '#ff6b4a', () => 'La energía vaporiza los océanos y funde la corteza: la superficie queda inhabitable durante siglos.'],
    magma: ['Océano de magma + disco de escombros', '#ff4d6d', () => 'Toda la superficie se funde; parte del material queda en órbita y puede formar un anillo o una nueva luna.'],
    partial: ['Disrupción parcial', '#e04cff', () => 'El planeta pierde una fracción importante de su masa; el resto queda fundido y rodeado de escombros.'],
    destroy: ['Destrucción total', '#ff2e63', () => 'La energía supera la energía de ligadura gravitatoria: el planeta se desintegra en un enjambre de fragmentos.'],
    airburst: ['Explosión aérea', '#9be37a', (A) => `El objeto se desintegra en la atmósfera; la onda expansiva arrasa un radio de ~${fmtNum(A.blastR, 0)} km.`],
    gasscar: ['Impacto atmosférico', '#9be37a', (A) => `Explota en las nubes y deja una mancha oscura de ~${fmtNum(A.scarKm, 0)} km que los vientos dispersan en semanas (como Shoemaker-Levy 9).`],
    gasglobal: ['Calentamiento atmosférico global', '#ff6b4a', () => 'La energía calienta toda la atmósfera superior; el planeta brilla en infrarrojo durante años.'],
    tde: ['Disrupción por marea', '#b388ff', () => 'La gravedad diferencial del agujero negro despedaza el planeta: parte de la materia forma un disco de acreción y el resto escapa.'],
  };

  /* ------------------------------ Estado ------------------------------- */
  const state = {
    projectiles: [], bhs: [], systems: [], flashes: [], pending: [], log: [],
    slowUntil: -Infinity, wasSlow: false, anchor: 0, generated: [], sn: null,
    timers: { monitor: 0, osc: 0, ui: 0 },
  };
  const dyn = {
    n: 0,
    x: new Float32Array(DYN_MAX), y: new Float32Array(DYN_MAX), z: new Float32Array(DYN_MAX),
    size: new Float32Array(DYN_MAX), shade: new Uint8Array(DYN_MAX),
  };

  const isSlow = () => state.projectiles.length > 0 || sim.days < state.slowUntil;
  const timeScale = () => snSpeed() ?? (isSlow() ? SLOW : null);
  const isBusy = () => isSlow() || snSpeed() != null || !!(state.evo && !state.evo.finished);
  const holdSlow = (days) => { state.slowUntil = Math.max(state.slowUntil, sim.days + days); };

  function schedule(dtDays, text, fn) {
    state.pending.push({ t: sim.days + dtDays, text, fn });
    state.pending.sort((a, b) => a.t - b.t);
  }

  /* ----------------------- Elementos orbitales ------------------------- */
  // Estado (posición, velocidad) -> elipse de Kepler con vectores P (al pericentro) y Q.
  function stateToEl(x, y, z, vx, vy, vz, mu, out) {
    const r = Math.hypot(x, y, z), v2 = vx * vx + vy * vy + vz * vz;
    const hx = y * vz - z * vy, hy = z * vx - x * vz, hz = x * vy - y * vx;
    const h = Math.hypot(hx, hy, hz);
    if (h < 1e-12 || r < 1e-12) return false;
    const inva = 2 / r - v2 / mu;
    if (inva <= 0) return false;
    const a = 1 / inva;
    const ex = (vy * hz - vz * hy) / mu - x / r, ey = (vz * hx - vx * hz) / mu - y / r, ez = (vx * hy - vy * hx) / mu - z / r;
    let e = Math.hypot(ex, ey, ez);
    let Px, Py, Pz, E0;
    out.eRaw = e;
    if (e < 1e-7) {
      e = 0; Px = x / r; Py = y / r; Pz = z / r; E0 = 0;
    } else {
      Px = ex / e; Py = ey / e; Pz = ez / e;
      const cosE = (1 - r / a) / e, sinE = (x * vx + y * vy + z * vz) / (e * Math.sqrt(mu * a));
      E0 = Math.atan2(sinE, cosE);
    }
    if (e > 0.99999) e = 0.99999;
    const Wx = hx / h, Wy = hy / h, Wz = hz / h;
    out.Px = Px; out.Py = Py; out.Pz = Pz;
    out.Qx = Wy * Pz - Wz * Py; out.Qy = Wz * Px - Wx * Pz; out.Qz = Wx * Py - Wy * Px;
    out.a = a; out.e = e; out.b = a * Math.sqrt(1 - e * e);
    out.n = Math.sqrt(mu / (a * a * a));
    out.M0 = E0 - e * Math.sin(E0);
    out.h = h;
    return true;
  }

  /* ---------------------- Sistemas locales ------------------------------ */
  // Partículas alrededor de un cuerpo central en unidades adimensionales
  // (GM = 1). Fase 1: integración numérica (durante la cámara lenta).
  // Fase 2: órbitas de Kepler analíticas que se circularizan y aplanan con el
  // tiempo (colisiones), formando anillos, lunas o discos de acreción.
  class LocalSys {
    constructor(o) {
      this.center = o.center; this.Lkm = o.Lkm; this.Tu = o.Tu; this.vis = o.vis;
      this.rSurf = o.rSurf ?? 1; this.eps = o.eps ?? 0; this.accR = o.accR ?? 0;
      this.kind = o.kind; this.coolTau = o.coolTau ?? 0.012;
      this.tauC = o.tauC ?? 3; this.tauV = o.tauV ?? 150;
      this.onAccrete = o.onAccrete || null;
      const cap = (this.cap = o.cap);
      const F = () => new Float64Array(cap);
      this.x = F(); this.y = F(); this.z = F(); this.vx = F(); this.vy = F(); this.vz = F(); this.tb = F();
      this.st = new Uint8Array(cap);   // 0 muerta, 1 numérica, 2 cae, 3 disco/anillo, 4 disco de acreción, 5 enjambre
      this.flag = new Uint8Array(cap); // 1 = material de disco
      this.fate = new Uint8Array(cap); // 1 anillo, 2 luna, 3 se reagrupa en el centro
      this.temp = new Float32Array(cap); this.size = new Float32Array(cap); this.base = new Uint8Array(cap);
      this.n = 0; this.alive = 0; this.numeric = true; this.t0 = sim.days;
      this.moon = null; this.moonTotal = 0; this.moonAcc = 0; this.ringCount = 0;
    }

    add(px, py, pz, vx, vy, vz, flag, temp, size, base) {
      if (this.n >= this.cap) return;
      const i = this.n++;
      this.x[i] = px; this.y[i] = py; this.z[i] = pz;
      this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
      this.st[i] = 1; this.flag[i] = flag; this.temp[i] = temp;
      this.size[i] = size; this.base[i] = base; this.tb[i] = sim.days;
      this.alive++;
    }

    kill(i) { if (this.st[i]) { this.st[i] = 0; this.alive--; } }

    step(dDays) {
      const du = (dDays * DAY_S) / this.Tu;
      if (du <= 0) return;
      const nsub = Math.min(80, Math.max(1, Math.ceil(du / 0.015)));
      const h = du / nsub, hh = h / 2, eps2 = this.eps * this.eps;
      const { x, y, z, vx, vy, vz, st } = this;
      for (let s = 0; s < nsub; s++) {
        for (let i = 0; i < this.n; i++) {
          if (st[i] !== 1) continue;
          let px = x[i] + vx[i] * hh, py = y[i] + vy[i] * hh, pz = z[i] + vz[i] * hh;
          const r2 = px * px + py * py + pz * pz + eps2;
          const k = h / (r2 * Math.sqrt(r2));
          vx[i] -= px * k; vy[i] -= py * k; vz[i] -= pz * k;
          px += vx[i] * hh; py += vy[i] * hh; pz += vz[i] * hh;
          x[i] = px; y[i] = py; z[i] = pz;
          const r = Math.sqrt(px * px + py * py + pz * pz);
          if (this.rSurf > 0 && r < this.rSurf && px * vx[i] + py * vy[i] + pz * vz[i] < 0) { this.kill(i); continue; }
          if (this.accR > 0 && r < this.accR) { this.kill(i); if (this.onAccrete) this.onAccrete(); continue; }
          if (r > 4) {
            const E = 0.5 * (vx[i] * vx[i] + vy[i] * vy[i] + vz[i] * vz[i]) - 1 / Math.sqrt(r * r + eps2);
            if (E > 0) this.toHelio(i);
          }
        }
      }
    }

    // Transfiere una partícula que escapa al marco heliocéntrico (escombros libres).
    toHelio(i) {
      ensureNbody();
      // Una luna ligada a su planeta no tiene estado heliocéntrico propio: se usa el del planeta.
      const c = this.center.hp ? this.center : this.center.parentBody;
      const px = this.x[i], py = this.y[i], pz = this.z[i], vx = this.vx[i], vy = this.vy[i], vz = this.vz[i];
      const r = Math.hypot(px, py, pz), v2 = vx * vx + vy * vy + vz * vz;
      const E = 0.5 * v2 - 1 / Math.sqrt(r * r + this.eps * this.eps);
      const vinf = Math.sqrt(Math.max(2 * E, 0.01 * v2));
      const vl = Math.sqrt(v2) || 1;
      const kv = ((this.Lkm / this.Tu) * KMS_AUD * vinf) / vl;
      const kp = this.Lkm / AU_KM;
      addDebris(
        c.hp.x + px * kp, c.hp.y + py * kp, c.hp.z + pz * kp,
        c.hv.x + vx * kv, c.hv.y + vy * kv, c.hv.z + vz * kv,
        c, this.vis, this.Lkm, this.base[i], Math.max(0.3, this.size[i] * this.vis * 1.5), this.temp[i], this.tb[i],
      );
      this.kill(i);
    }

    // Fin de la cámara lenta: las partículas ligadas pasan a órbitas analíticas.
    settle() {
      if (!this.numeric) return;
      this.numeric = false;
      this.tS = sim.days;
      const { x, y, z, vx, vy, vz, st } = this;
      let hx = 0, hy = 0, hz = 0;
      for (let i = 0; i < this.n; i++) {
        if (st[i] !== 1) continue;
        const r = Math.hypot(x[i], y[i], z[i]);
        const E = 0.5 * (vx[i] ** 2 + vy[i] ** 2 + vz[i] ** 2) - 1 / Math.sqrt(r * r + this.eps * this.eps);
        if (E >= 0) { this.toHelio(i); continue; }
        hx += y[i] * vz[i] - z[i] * vy[i]; hy += z[i] * vx[i] - x[i] * vz[i]; hz += x[i] * vy[i] - y[i] * vx[i];
      }
      // Plano medio del disco = momento angular total de los escombros ligados.
      const Hn = v3(hx, hy, hz);
      const W = len(Hn) > 1e-12 ? norm(Hn) : v3(0, 1, 0);
      [this.U, this.Vv] = perpBasis(W);
      const n = this.n, F = () => new Float64Array(n);
      this.a = F(); this.e = F(); this.b = F(); this.mm = F(); this.M0 = F();
      this.Px = F(); this.Py = F(); this.Pz = F(); this.Qx = F(); this.Qy = F(); this.Qz = F();
      this.rc = F(); this.phi0 = F(); this.tdeath = F();
      const el = {}, U = this.U, Vv = this.Vv;
      let swarm = 0;
      for (let i = 0; i < n; i++) {
        if (st[i] !== 1) continue;
        if (!stateToEl(x[i], y[i], z[i], vx[i], vy[i], vz[i], 1, el)) { this.kill(i); continue; }
        this.a[i] = el.a; this.e[i] = el.e; this.b[i] = el.b; this.mm[i] = el.n; this.M0[i] = el.M0;
        this.Px[i] = el.Px; this.Py[i] = el.Py; this.Pz[i] = el.Pz;
        this.Qx[i] = el.Qx; this.Qy[i] = el.Qy; this.Qz[i] = el.Qz;
        const rc = el.h * el.h; // radio de la órbita circular con el mismo momento angular
        this.rc[i] = rc;
        this.phi0[i] = Math.atan2(x[i] * Vv.x + y[i] * Vv.y + z[i] * Vv.z, x[i] * U.x + y[i] * U.y + z[i] * U.z);
        if (this.kind === 'impact') {
          const rp = el.a * (1 - el.e);
          if ((this.flag[i] === 1 || rp > 1.02) && rc >= 1.05) {
            st[i] = 3;
            if (rc < ROCHE) {
              this.fate[i] = 1; this.ringCount++;
              this.tdeath[i] = sim.days + YEAR * 40 * -Math.log(1 - rnd() * 0.999);
            } else {
              this.fate[i] = 2; this.moonTotal++;
              this.tdeath[i] = sim.days + 20 + 200 * rnd();
            }
          } else st[i] = 2;
        } else if (this.kind === 'tde') {
          st[i] = 4;
        } else {
          st[i] = 5; this.fate[i] = 3; swarm++;
          this.tdeath[i] = sim.days + 5 + 55 * rnd();
        }
      }
      const c = this.center;
      if (this.kind === 'tde') {
        let bound = 0;
        for (let i = 0; i < n; i++) if (st[i] === 4) bound++;
        const pct = Math.round((100 * bound) / n);
        if (bound > n * 0.03) {
          addLog(`🌀 El ${pct} % de los restos queda ligado al agujero negro; el resto escapa en una corriente de escombros`);
          schedule(15, 'Las colisiones convierten los restos ligados en un disco de acreción caliente que brilla en rayos X');
          schedule(YEAR, 'El disco de acreción se va consumiendo: la materia cae al agujero negro');
        } else {
          addLog('🌀 La velocidad relativa era demasiado alta: casi todos los restos escapan y no se forma un disco de acreción');
        }
      }
      if (this.kind === 'impact' && this.ringCount > 25) {
        schedule(12, `💫 Los escombros dentro del límite de Roche forman un anillo alrededor de ${c.name}`);
      }
      if (this.kind === 'destroy' && swarm / this.n > 0.03) scheduleRemnant(c, swarm / this.n, 62);
    }

    updateAnalytic() {
      const dd = sim.days - this.tS;
      const tau = (dd * DAY_S) / this.Tu;
      const w = 1 - Math.exp(-dd / this.tauC);
      const shrink = Math.exp(-dd / this.tauV);
      const U = this.U, Vv = this.Vv, { x, y, z, st } = this;
      for (let i = 0; i < this.n; i++) {
        const s = st[i];
        if (s < 2) continue;
        if (this.tdeath[i] && sim.days > this.tdeath[i]) {
          this.kill(i);
          if (this.fate[i] === 2) growMoon(this);
          continue;
        }
        let M = (this.M0[i] + this.mm[i] * tau) % TAU;
        if (M < 0) M += TAU;
        const E = solveKepler(M, this.e[i]);
        const ax = this.a[i] * (Math.cos(E) - this.e[i]), bx = this.b[i] * Math.sin(E);
        let px = ax * this.Px[i] + bx * this.Qx[i];
        let py = ax * this.Py[i] + bx * this.Qy[i];
        let pz = ax * this.Pz[i] + bx * this.Qz[i];
        if (s === 2) {
          if (px * px + py * py + pz * pz < this.rSurf * this.rSurf) { this.kill(i); continue; }
        } else {
          let rc = this.rc[i];
          if (s === 4) {
            rc *= shrink; // el disco de acreción pierde momento angular y cae hacia el agujero
            if (rc < 0.08) { this.kill(i); if (this.onAccrete) this.onAccrete(); continue; }
          }
          const ph = this.phi0[i] + Math.pow(rc, -1.5) * tau;
          const c = Math.cos(ph) * rc, sn = Math.sin(ph) * rc;
          px += ((U.x * c + Vv.x * sn) - px) * w;
          py += ((U.y * c + Vv.y * sn) - py) * w;
          pz += ((U.z * c + Vv.z * sn) - pz) * w;
        }
        x[i] = px; y[i] = py; z[i] = pz;
      }
    }

    shadeOf(i) {
      if (this.kind === 'tde') {
        const r2 = this.x[i] ** 2 + this.y[i] ** 2 + this.z[i] ** 2;
        return r2 < 1.2 ? 7 : r2 < 10 ? 8 : this.base[i];
      }
      const tau = this.flag[i] ? this.coolTau * 80 : this.coolTau;
      const T = this.temp[i] * Math.exp(-(sim.days - this.tb[i]) / tau);
      return T > 0.8 ? 0 : T > 0.55 ? 1 : T > 0.35 ? 2 : T > 0.18 ? 3 : this.base[i];
    }

    fill(d) {
      const c = this.center, vis = this.vis;
      for (let i = 0; i < this.n; i++) {
        if (!this.st[i]) continue;
        if (d.n >= DYN_MAX) return;
        const j = d.n++;
        d.x[j] = c.x + this.x[i] * vis; d.y[j] = c.y + this.y[i] * vis; d.z[j] = c.z + this.z[i] * vis;
        d.size[j] = this.size[i] * vis;
        d.shade[j] = this.shadeOf(i);
      }
    }
  }

  /* ------------------ Escombros heliocéntricos -------------------------- */
  const DB = 12000;
  const db = {
    n: 0,
    x: new Float64Array(DB), y: new Float64Array(DB), z: new Float64Array(DB),
    vx: new Float64Array(DB), vy: new Float64Array(DB), vz: new Float64Array(DB),
    ref: new Array(DB), vis: new Float32Array(DB), lkm: new Float64Array(DB), kicked: new Uint8Array(DB),
    base: new Uint8Array(DB), size: new Float32Array(DB), temp: new Float32Array(DB), tb: new Float64Array(DB),
  };
  function addDebris(x, y, z, vx, vy, vz, ref, vis, lkm, base, size, temp, tb) {
    if (db.n >= DB) return;
    const i = db.n++;
    db.x[i] = x; db.y[i] = y; db.z[i] = z; db.vx[i] = vx; db.vy[i] = vy; db.vz[i] = vz;
    db.ref[i] = ref; db.vis[i] = vis; db.lkm[i] = lkm; db.base[i] = base; db.size[i] = size;
    db.temp[i] = temp; db.tb[i] = tb;
    db.kicked[i] = state.sn ? 1 : 0; // los escombros que nacen de la supernova ya llevan su empujón
  }
  // Separación visual exagerada cerca del cuerpo de origen, que se desvanece al alejarse.
  const gOff = (x) => (x < 4 ? x : (4 + 4 * (1 - Math.exp(-(x - 4) / 10))) * Math.exp(-(x - 4) / 400));

  function fillDebris(d) {
    const o = {}, refMap = new Map();
    for (let i = 0; i < db.n; i++) {
      if (d.n >= DYN_MAX) return;
      const ref = db.ref[i];
      let rm = refMap.get(ref);
      if (!rm) { rm = {}; mapVec(ref.hp.x, ref.hp.y, ref.hp.z, rm); refMap.set(ref, rm); }
      mapVec(db.x[i], db.y[i], db.z[i], o);
      const rx = db.x[i] - ref.hp.x, ry = db.y[i] - ref.hp.y, rz = db.z[i] - ref.hp.z;
      const dk = Math.hypot(rx, ry, rz);
      const k = dk > 0 ? (gOff((dk * AU_KM) / db.lkm[i]) * db.vis[i]) / dk : 0;
      const j = d.n++;
      d.x[j] = ref.x + (o.x - rm.x) + rx * k;
      d.y[j] = ref.y + (o.y - rm.y) + ry * k;
      d.z[j] = ref.z + (o.z - rm.z) + rz * k;
      d.size[j] = db.size[i];
      const T = db.temp[i] * Math.exp(-(sim.days - db.tb[i]) / 0.3);
      d.shade[j] = T > 0.55 ? 1 : T > 0.35 ? 2 : T > 0.18 ? 3 : db.base[i];
    }
  }

  /* ------------------------ Modo N-cuerpos ------------------------------ */
  function ensureNbody() {
    if (sim.nbody) return;
    const a = {}, b = {}, d = 0.01, t = sim.days;
    SUN.hp = v3(); SUN.hv = v3();
    for (const o of HELIO) {
      if (o.type !== 'planet' && o.type !== 'dwarf' && o.type !== 'comet') continue;
      analyticAU(o, t - d, a); analyticAU(o, t + d, b); analyticAU(o, t, o.hp);
      o.hv = v3((b.x - a.x) / (2 * d), (b.y - a.y) / (2 * d), (b.z - a.z) / (2 * d));
    }
    const F = () => new Float64Array(NP);
    Object.assign(beltState, { x: F(), y: F(), z: F(), vx: F(), vy: F(), vz: F() });
    const c = {};
    for (let i = 0; i < NP; i++) {
      beltAU(i, t - d, a); beltAU(i, t + d, b); beltAU(i, t, c);
      beltState.x[i] = c.x; beltState.y[i] = c.y; beltState.z[i] = c.z;
      beltState.vx[i] = (b.x - a.x) / (2 * d); beltState.vy[i] = (b.y - a.y) / (2 * d); beltState.vz[i] = (b.z - a.z) / (2 * d);
    }
    beltState.on = true;
    sim.nbody = true;
    $('today').disabled = true;
    $('today').title = 'No disponible mientras la simulación está perturbada';
    updateOsc();
  }

  const movers = () => HELIO.filter((b) => b.type !== 'sun' && b.type !== 'blackhole');

  function encInfo(bh, p) {
    const dx = bh.hp.x - p.hp.x, dy = bh.hp.y - p.hp.y, dz = bh.hp.z - p.hp.z;
    const dvx = bh.hv.x - p.hv.x, dvy = bh.hv.y - p.hv.y, dvz = bh.hv.z - p.hv.z;
    const d = Math.hypot(dx, dy, dz);
    return {
      dx, dy, dz, d, dKm: d * AU_KM,
      rEnc: bh.mass >= p.mass ? p.radius * Math.cbrt(bh.mass / p.mass) : p.radius,
      vrel: Math.hypot(dvx, dvy, dvz) / KMS_AUD,
      approaching: dx * dvx + dy * dvy + dz * dvz < 0,
    };
  }

  function stepMain(dt, list, bhs) {
    const h = dt / 2;
    const all = [SUN, ...bhs, ...list];
    for (const b of all) { b.hp.x += b.hv.x * h; b.hp.y += b.hv.y * h; b.hp.z += b.hv.z * h; }
    // Guiado: el agujero negro apunta al planeta objetivo hasta estar cerca.
    for (const bh of bhs) {
      const t = bh.homing;
      if (!t || t.destroyed) { bh.homing = null; continue; }
      const e = encInfo(bh, t);
      if (e.dKm < 40 * e.rEnc) { bh.homing = null; continue; }
      const k = -bh.vrel / e.d;
      bh.hv.x = t.hv.x + e.dx * k; bh.hv.y = t.hv.y + e.dy * k; bh.hv.z = t.hv.z + e.dz * k;
    }
    const S = SUN.hp;
    for (let i = 0; i < bhs.length; i++) {
      const bh = bhs[i];
      let dx = bh.hp.x - S.x, dy = bh.hp.y - S.y, dz = bh.hp.z - S.z;
      let r2 = dx * dx + dy * dy + dz * dz + R_SUN_AU * R_SUN_AU;
      let k = dt / (r2 * Math.sqrt(r2));
      if (!SUN.destroyed) { SUN.hv.x += dx * bh.mu * k; SUN.hv.y += dy * bh.mu * k; SUN.hv.z += dz * bh.mu * k; }
      if (!bh.homing) { bh.hv.x -= dx * sunMu * k; bh.hv.y -= dy * sunMu * k; bh.hv.z -= dz * sunMu * k; }
      for (let j = i + 1; j < bhs.length; j++) {
        const o = bhs[j];
        dx = o.hp.x - bh.hp.x; dy = o.hp.y - bh.hp.y; dz = o.hp.z - bh.hp.z;
        r2 = dx * dx + dy * dy + dz * dz + 1e-12;
        k = dt / (r2 * Math.sqrt(r2));
        bh.hv.x += dx * o.mu * k; bh.hv.y += dy * o.mu * k; bh.hv.z += dz * o.mu * k;
        o.hv.x -= dx * bh.mu * k; o.hv.y -= dy * bh.mu * k; o.hv.z -= dz * bh.mu * k;
      }
    }
    for (const b of list) {
      let dx = b.hp.x - S.x, dy = b.hp.y - S.y, dz = b.hp.z - S.z;
      let r2 = dx * dx + dy * dy + dz * dz + 2.5e-7;
      let k = (sunMu * snMuFrac(Math.sqrt(r2)) * dt) / (r2 * Math.sqrt(r2));
      b.hv.x -= dx * k; b.hv.y -= dy * k; b.hv.z -= dz * k;
      for (const bh of bhs) {
        dx = b.hp.x - bh.hp.x; dy = b.hp.y - bh.hp.y; dz = b.hp.z - bh.hp.z;
        const eps = b.radius ? b.radius / AU_KM : 1e-6; // suavizado: un planeta es un cuerpo extenso
        r2 = dx * dx + dy * dy + dz * dz + eps * eps;
        k = (bh.mu * dt) / (r2 * Math.sqrt(r2));
        b.hv.x -= dx * k; b.hv.y -= dy * k; b.hv.z -= dz * k;
      }
    }
    for (const b of all) { b.hp.x += b.hv.x * h; b.hp.y += b.hv.y * h; b.hp.z += b.hv.z * h; }
  }

  // Partículas de prueba (cinturones y escombros): pasos más gruesos con las
  // masas interpoladas entre el inicio y el final del cuadro.
  function integrateTest(adv, m0, m1) {
    const nb = Math.min(24, Math.max(1, Math.ceil(adv / 0.5)));
    const h = adv / nb, hh = h / 2;
    const sets = [];
    if (beltState.on) sets.push([beltState, NP]);
    if (db.n) sets.push([db, db.n]);
    const nbh = m0.b.length;
    // Supernova: empujón radial cuando la cáscara alcanza cada partícula. Para cuerpos
    // pequeños (R ≈ 5 km, ρ ≈ 2.000 kg/m³): Δv = 3·M·v / (16π r² R ρ), con tope de ½ v_eyecta.
    const sn = state.sn && state.sn.phase === 'boom' ? state.sn : null;
    let rShell = 0, Kk = 0, cap = 0;
    if (sn) {
      rShell = sn.vmeanAU * (sim.days - sn.t0);
      Kk = ((3 * sn.Mej * sn.vmean * 1e3) / (16 * Math.PI * 5e3 * 2000) / (AU_M * AU_M)) * (KMS_AUD / 1000);
      cap = 0.5 * sn.vmeanAU;
    }
    for (let s = 0; s < nb; s++) {
      const f = (s + 0.5) / nb;
      const sx = m0.s.x + (m1.s.x - m0.s.x) * f, sy = m0.s.y + (m1.s.y - m0.s.y) * f, sz = m0.s.z + (m1.s.z - m0.s.z) * f;
      const bp = m0.b.map((b, i) => [b.x + (m1.b[i].x - b.x) * f, b.y + (m1.b[i].y - b.y) * f, b.z + (m1.b[i].z - b.z) * f, b.mu]);
      for (const [A, n] of sets) {
        const { x, y, z, vx, vy, vz, kicked } = A;
        for (let i = 0; i < n; i++) {
          if (sn && kicked && !kicked[i]) {
            const ex = x[i] - sn.c0.x, ey = y[i] - sn.c0.y, ez = z[i] - sn.c0.z;
            const rr = Math.sqrt(ex * ex + ey * ey + ez * ez);
            if (rr < rShell && rr > 0) {
              kicked[i] = 1;
              const dv = Math.min(Kk / (rr * rr), cap) / rr;
              vx[i] += ex * dv; vy[i] += ey * dv; vz[i] += ez * dv;
            }
          }
          let px = x[i] + vx[i] * hh, py = y[i] + vy[i] * hh, pz = z[i] + vz[i] * hh;
          let dx = px - sx, dy = py - sy, dz = pz - sz;
          let r2 = dx * dx + dy * dy + dz * dz + 2.5e-7;
          let k = ((sn ? sunMu * snMuFrac(Math.sqrt(r2)) : sunMu) * h) / (r2 * Math.sqrt(r2));
          let ax = dx * k, ay = dy * k, az = dz * k;
          for (let j = 0; j < nbh; j++) {
            const B = bp[j];
            dx = px - B[0]; dy = py - B[1]; dz = pz - B[2];
            r2 = dx * dx + dy * dy + dz * dz + 1e-10;
            k = (B[3] * h) / (r2 * Math.sqrt(r2));
            ax += dx * k; ay += dy * k; az += dz * k;
          }
          vx[i] -= ax; vy[i] -= ay; vz[i] -= az;
          x[i] = px + vx[i] * hh; y[i] = py + vy[i] * hh; z[i] = pz + vz[i] * hh;
        }
      }
    }
  }

  // Posiciones de las masas; el final del cuadro usa los mismos agujeros negros
  // que el inicio, aunque alguno haya sido absorbido entretanto.
  const snapshot = (from) => ({
    s: { ...SUN.hp },
    b: (from ? from.b.map((o) => o.ref) : state.bhs).map((b) => ({ ref: b, x: b.hp.x, y: b.hp.y, z: b.hp.z, mu: b.mu })),
  });

  function advance(days) {
    const bhs = state.bhs;
    // No saltarse un encuentro: frena el tiempo justo antes y activa la cámara lenta.
    for (const bh of bhs) {
      const t = bh.target;
      if (!t || t.destroyed) continue;
      const e = encInfo(bh, t);
      if (!e.approaching) continue;
      const tte = (e.dKm - e.rEnc) / Math.max(e.vrel, 0.1) / DAY_S;
      if (tte < days + 0.012) {
        holdSlow(0.01);
        days = Math.min(days, Math.max(tte - 0.008, SLOW / 60));
      }
    }
    const list = movers();
    let dt = 0.5;
    for (const bh of bhs) {
      for (const b of [SUN, ...list]) {
        if (b.type === 'comet' || b.destroyed) continue;
        const dx = b.hp.x - bh.hp.x, dy = b.hp.y - bh.hp.y, dz = b.hp.z - bh.hp.z;
        const d = Math.hypot(dx, dy, dz);
        const dv = Math.hypot(b.hv.x - bh.hv.x, b.hv.y - bh.hv.y, b.hv.z - bh.hv.z);
        const lim = 0.03 * Math.min(d / (dv + 1e-12), Math.sqrt((d * d * d) / (bh.mu + (b === SUN ? sunMu : 0))));
        if (lim < dt) dt = lim;
      }
    }
    dt = Math.max(dt, 2e-7);
    let nsub = Math.ceil(days / dt), adv = days;
    if (nsub > 150) { nsub = 150; adv = 150 * dt; } else dt = days / nsub;
    const m0 = snapshot();
    for (let s = 0; s < nsub; s++) {
      stepMain(dt, list, bhs);
      checkEncounters();
    }
    integrateTest(adv, m0, snapshot(m0));
    return adv;
  }

  function checkEncounters() {
    for (const bh of state.bhs) {
      for (const p of TARGETS) {
        if (p.destroyed || bh.captured) continue;
        const dKm = Math.hypot(bh.hp.x - p.hp.x, bh.hp.y - p.hp.y, bh.hp.z - p.hp.z) * AU_KM;
        if (bh.mass >= p.mass) {
          if (dKm < p.radius * Math.cbrt(bh.mass / p.mass)) tde(bh, p);
        } else if (dKm < p.radius) {
          if (!bh.inside.has(p)) { bh.inside.add(p); passThrough(bh, p); }
        } else if (dKm > p.radius * 2) bh.inside.delete(p);
      }
    }
    // Agujeros atrapados dentro del Sol: se retiran (se modifican los arreglos en su lugar).
    for (const bh of state.bhs.filter((b) => b.captured)) {
      for (const list of [state.bhs, BODIES, HELIO]) list.splice(list.indexOf(bh), 1);
    }
  }

  // Detecta planetas expulsados o capturados (cada medio segundo).
  function monitor() {
    if (!sim.nbody) return;
    for (const b of TARGETS) {
      if (b.destroyed || b.type === 'sun') continue;
      const rx = b.hp.x - SUN.hp.x, ry = b.hp.y - SUN.hp.y, rz = b.hp.z - SUN.hp.z;
      const vx = b.hv.x - SUN.hv.x, vy = b.hv.y - SUN.hv.y, vz = b.hv.z - SUN.hv.z;
      const r = Math.hypot(rx, ry, rz);
      const muS = sunMu * snMuFrac(r);
      const E = 0.5 * (vx * vx + vy * vy + vz * vz) - muS / r;
      for (const bh of state.bhs) {
        const dx = b.hp.x - bh.hp.x, dy = b.hp.y - bh.hp.y, dz = b.hp.z - bh.hp.z;
        const d = Math.hypot(dx, dy, dz);
        const dvx = b.hv.x - bh.hv.x, dvy = b.hv.y - bh.hv.y, dvz = b.hv.z - bh.hv.z;
        const Eb = 0.5 * (dvx * dvx + dvy * dvy + dvz * dvz) - bh.mu / d;
        if (Eb < 0 && bh.mu / d > muS / r && !b.capLogged) {
          b.capLogged = true;
          addLog(`🕳 ${b.name} queda atrapado en órbita alrededor del agujero negro`);
        }
      }
      if (E > 0 && r > 1.5 && !b.escLogged && !b.capLogged) {
        b.escLogged = true;
        addLog(SUN.destroyed && !(state.sn && state.sn.rem > 0)
          ? `🚀 ${b.name} ya no está ligado a nada: vagará por la galaxia`
          : `🚀 ${b.name} supera la velocidad de escape: abandonará el sistema solar`);
      }
    }
  }

  // Órbitas osculantes: la elipse instantánea alrededor del Sol (o del
  // agujero negro, si el Sol ya no existe).
  function updateOsc() {
    const el = {}, o = {};
    const P = SUN.destroyed && state.bhs.length ? state.bhs[0] : SUN;
    const mu = P === SUN ? sunMu : P.mu;
    for (const b of HELIO) {
      if (b.type === 'sun' || b.type === 'blackhole' || b.destroyed) continue;
      const rx = b.hp.x - P.hp.x, ry = b.hp.y - P.hp.y, rz = b.hp.z - P.hp.z;
      const muB = P === SUN ? mu * snMuFrac(Math.hypot(rx, ry, rz)) : mu;
      const ok = muB > 0 && stateToEl(rx, ry, rz, b.hv.x - P.hv.x, b.hv.y - P.hv.y, b.hv.z - P.hv.z, muB, el);
      if (!ok || el.eRaw > 0.9995 || el.a > 3000) { b.osc = null; continue; }
      const n = el.e > 0.9 ? 360 : 180;
      const arr = b.osc && b.osc.length === (n + 1) * 3 ? b.osc : new Float32Array((n + 1) * 3);
      for (let k = 0; k <= n; k++) {
        const E = (k / n) * TAU;
        const ax = el.a * (Math.cos(E) - el.e), bx = el.b * Math.sin(E);
        mapVec(ax * el.Px + bx * el.Qx + P.hp.x, ax * el.Py + bx * el.Qy + P.hp.y, ax * el.Pz + bx * el.Qz + P.hp.z, o);
        arr[k * 3] = o.x; arr[k * 3 + 1] = o.y; arr[k * 3 + 2] = o.z;
      }
      b.osc = arr; b.oscN = n;
    }
  }

  /* ------------------------- Efectos en superficie ---------------------- */
  function fxOf(b) {
    return b.fx || (b.fx = { craters: [], shocks: [], heat: null, dust: null, lava: null });
  }
  function makeLava(fx) {
    if (fx.lava) return;
    fx.lava = [];
    for (let i = 0; i < 34; i++) fx.lava.push({ n: randUnit(), a: 0.06 + 0.2 * rnd(), k: 0.4 + 0.6 * rnd(), ph: rnd() * TAU });
  }
  function heatLevel(fx, t) {
    if (fx.heatFixed) return fx.heatFixed; // fijado por la evolución estelar
    const h = fx.heat;
    if (!h || t < h.t0) return 0;
    const dt = t - h.t0;
    return h.H0 * (1 - Math.exp(-dt / 0.004)) * Math.exp(-dt / h.tau);
  }
  function dustLevel(fx, t) {
    const d = fx.dust;
    if (!d || t < d.t0) return 0;
    const dt = t - d.t0;
    return d.D0 * (1 - Math.exp(-dt / 1.5)) * Math.exp(-dt / d.tau);
  }

  // Traza un casquete esférico (centro n, radio angular ang) proyectado sobre el disco del cuerpo.
  const _nv = {}, _e1 = {}, _e2 = {};
  function capPath(b, n, ang) {
    ang = Math.min(ang, Math.PI * 0.999);
    rotView(n, _nv);
    const sa = Math.sin(ang), ca = Math.cos(ang);
    if (_nv.z * ca - Math.sqrt(Math.max(0, 1 - _nv.z * _nv.z)) * sa > 0) return false; // todo en la cara oculta
    const [u, w] = perpBasis(n);
    rotView(u, _e1); rotView(w, _e2);
    const { sx, sy, sr } = b;
    ctx.beginPath();
    const K = 32;
    for (let k = 0; k <= K; k++) {
      const p = (k / K) * TAU, c = Math.cos(p) * sa, s = Math.sin(p) * sa;
      let dx = _nv.x * ca + _e1.x * c + _e2.x * s;
      let dy = _nv.y * ca + _e1.y * c + _e2.y * s;
      const dz = _nv.z * ca + _e1.z * c + _e2.z * s;
      if (dz > 0) { const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l; } // sobre el limbo
      const px = sx + dx * sr, py = sy - dy * sr;
      k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    return true;
  }

  function drawSurface(b, stage) {
    const fx = b.fx, t = sim.days, { sx, sy, sr } = b;
    const H = heatLevel(fx, t);
    if (stage === 'lit') {
      const D = dustLevel(fx, t);
      if (D > 0.01) {
        ctx.fillStyle = `rgba(150,132,110,${D})`;
        ctx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
      }
      for (const c of fx.craters) {
        const age = t - c.t0;
        if (age < 0) continue;
        if (c.kind === 'crater') {
          if (H > 0.6) continue; // la superficie fundida borra los cráteres
          const a = c.ang * Math.min(1, age / 0.002);
          if (!capPath(b, c.n, a * 1.6)) continue;
          ctx.fillStyle = 'rgba(225,215,195,0.18)'; // manto de eyecta
          ctx.fill();
          capPath(b, c.n, a);
          ctx.fillStyle = 'rgba(28,22,18,0.62)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(235,225,205,0.4)';
          ctx.lineWidth = Math.max(0.5, sr * a * 0.15);
          ctx.stroke();
        } else if (c.kind === 'scar') {
          const alpha = 0.75 * Math.exp(-age / 90);
          const a = c.ang * (1 + 1.5 * (1 - Math.exp(-age / 20)));
          if (alpha < 0.02 || !capPath(b, c.n, a)) continue;
          ctx.fillStyle = `rgba(45,28,20,${alpha})`;
          ctx.fill();
        } else if (c.kind === 'burn') {
          const alpha = 0.45 * Math.exp(-age / 400);
          if (alpha < 0.02 || !capPath(b, c.n, c.ang)) continue;
          ctx.fillStyle = `rgba(60,45,30,${alpha})`;
          ctx.fill();
        }
      }
      return;
    }
    // Emisivos: se dibujan sobre el lado nocturno también.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (H > 0.01) {
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
      g.addColorStop(0, `rgba(255,120,40,${0.5 * H})`);
      g.addColorStop(1, `rgba(255,50,10,${0.32 * H})`);
      ctx.fillStyle = g;
      ctx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
      const now = performance.now() / 1000;
      for (const l of fx.lava || []) {
        if (!capPath(b, l.n, l.a)) continue;
        ctx.fillStyle = `rgba(255,190,90,${0.45 * H * l.k * (0.75 + 0.25 * Math.sin(now * 2 + l.ph))})`;
        ctx.fill();
      }
    }
    for (const c of fx.craters) {
      if (c.kind !== 'flare' || t < c.t0) continue;
      const age = t - c.t0, a = Math.exp(-age / c.tau);
      if (a < 0.02 || !capPath(b, c.n, c.ang * (1 + Math.min(1, age / c.tau) * 0.6))) continue;
      ctx.fillStyle = `rgba(255,255,235,${0.9 * a})`;
      ctx.fill();
    }
    for (const c of fx.craters) {
      if (c.kind !== 'crater' || t < c.t0) continue;
      const hot = c.hot0 * Math.exp(-(t - c.t0) / c.hotTau);
      if (hot < 0.02) continue;
      const a = c.ang * Math.min(1, (t - c.t0) / 0.002);
      if (capPath(b, c.n, a * 0.9)) { ctx.fillStyle = `rgba(255,140,50,${hot * 0.85})`; ctx.fill(); }
      if (hot > 0.5 && capPath(b, c.n, a * 0.45)) { ctx.fillStyle = `rgba(255,240,200,${(hot - 0.5) * 1.6})`; ctx.fill(); }
    }
    for (const s of fx.shocks) {
      const age = t - s.t0;
      if (age < 0 || age > s.dur) continue;
      const f = age / s.dur;
      const ang = s.maxAng * (1 - (1 - f) * (1 - f));
      if (!capPath(b, s.n, ang)) continue;
      ctx.strokeStyle = `rgba(255,235,200,${0.85 * (1 - f)})`;
      ctx.lineWidth = Math.max(1, sr * 0.035 * (1 - f * 0.5));
      ctx.stroke();
    }
    ctx.restore();
  }

  // Halo rojizo alrededor de un planeta fundido (o brillo extra del Sol).
  function drawAfter(b) {
    if (b.type === 'sun') {
      const B = boostLevel(b.fx, sim.days);
      if (B < 0.01) return;
      const { sx, sy, sr } = b;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(sx, sy, sr * 0.8, sx, sy, sr * 3.5);
      g.addColorStop(0, `rgba(255,250,220,${0.6 * B})`);
      g.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(sx, sy, sr * 3.5, 0, TAU); ctx.fill();
      ctx.restore();
      return;
    }
    const H = heatLevel(b.fx, sim.days);
    if (H < 0.05 || b.sr < 2) return;
    const { sx, sy, sr } = b;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(sx, sy, sr * 0.95, sx, sy, sr * 1.4);
    g.addColorStop(0, `rgba(255,90,30,${0.35 * H})`);
    g.addColorStop(1, 'rgba(255,60,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(sx, sy, sr * 1.4, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function flash(body, n, alt, size, dur) {
    state.flashes.push({ body, n, alt, R: body.r, size, dur, t0: sim.days });
  }

  function drawOverlay() {
    const t = sim.days;
    drawSN();
    if (!state.flashes.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const f of state.flashes) {
      const age = t - f.t0;
      if (age < 0 || age > f.dur) continue;
      const b = f.body;
      toView(b.x + f.n.x * f.R * (1 + f.alt), b.y + f.n.y * f.R * (1 + f.alt), b.z + f.n.z * f.R * (1 + f.alt));
      if (V.z < NEAR) continue;
      const s = focal / V.z, px = cx + V.x * s, py = cy - V.y * s;
      const k = age / f.dur, a = Math.pow(1 - k, 1.5);
      const rad = Math.max(4, f.size * f.R * s * (0.35 + 0.65 * Math.sqrt(k)));
      const g = ctx.createRadialGradient(px, py, 0, px, py, rad);
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(0.2, `rgba(255,236,180,${0.85 * a})`);
      g.addColorStop(0.5, `rgba(255,150,60,${0.4 * a})`);
      g.addColorStop(1, 'rgba(255,90,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(px, py, rad, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  /* -------------------------- Impactos ---------------------------------- */
  function newImpactSys(b, cap) {
    return new LocalSys({
      center: b, Lkm: b.radius, Tu: unitTime(b), vis: b.r, rSurf: 1, kind: 'impact', cap, coolTau: 0.012, tauC: 3,
    });
  }

  // Eyecta: cortina cónica desde el punto de impacto, sesgada en la dirección
  // del movimiento del proyectil. Los impactos gigantes ponen material en órbita
  // (disco) y parte escapa del planeta.
  function spawnEjecta(b, o) {
    const { n, tdir, angle, sf, cat } = o;
    const gas = b.kind === 'gas';
    const N = Math.round(clamp(40 + 2600 * Math.pow(sf, 1.7), 30, 3000) / Math.sqrt(o.frags || 1));
    const sys = newImpactSys(b, N + 4);
    const down = mul(tdir, -1);
    const [u, w] = perpBasis(n);
    const fmax = Math.min(0.97, 0.1 + 0.95 * sf) * (gas ? 0.35 : 1);
    const escFrac = gas ? 0 : clamp((sf - 0.62) * 1.6, 0, 0.45);
    const diskFrac = cat === 'magma' ? 0.28 : cat === 'partial' ? 0.38 : 0;
    const base = gas ? 9 : b.kind === 'ice' ? 6 : 4;
    const vapor = o.comet ? 0.3 : 0;
    const bias = Math.cos(angle) * 0.6;
    for (let i = 0; i < N; i++) {
      const r = rnd();
      const sz = 0.006 + 0.012 * rnd();
      const shade = rnd() < vapor ? 6 : base + (base === 4 && rnd() < 0.4 ? 1 : 0);
      if (r < diskFrac) {
        // Radio circularizado resultante rc = rr·k²: entre ~1 y ~4 radios, parte más allá del límite de Roche.
        const rr = 1.05 + 0.55 * rnd();
        const pd = norm(add(n, add(mul(u, gaussR() * 0.35), mul(w, gaussR() * 0.35))));
        const tang = norm(sub(down, mul(pd, dot(pd, down))));
        const vc = (1 / Math.sqrt(rr)) * (0.95 + 0.6 * rnd());
        const vel = add(add(mul(tang, vc), mul(pd, 0.08 * rnd())), mul(randUnit(), 0.04));
        sys.add(pd.x * rr, pd.y * rr, pd.z * rr, vel.x, vel.y, vel.z, 1, 1, sz, shade);
        continue;
      }
      const f = r < diskFrac + escFrac ? 1.03 + 0.5 * rnd() : fmax * (0.2 + 0.8 * Math.pow(rnd(), 0.6));
      const beta = (25 + 35 * rnd()) * DEG, psi = rnd() * TAU;
      let d = add(mul(n, Math.cos(beta)), mul(add(mul(u, Math.cos(psi)), mul(w, Math.sin(psi))), Math.sin(beta)));
      d = norm(add(d, mul(down, bias)));
      if (dot(d, n) < 0.05) d = norm(add(d, mul(n, 0.2)));
      const jit = add(mul(u, gaussR() * 0.01), mul(w, gaussR() * 0.01));
      const p = add(mul(n, 1.002), jit);
      const sp = f * Math.SQRT2;
      sys.add(p.x, p.y, p.z, d.x * sp, d.y * sp, d.z * sp, 0, gas ? 0.6 : 1, sz, shade);
    }
    state.systems.push(sys);
  }

  // Penacho de plasma: sale por debajo de la velocidad de escape y vuelve a caer.
  function spawnSolarPlume(b, o) {
    const { n, sf } = o;
    const N = Math.round((150 + 1300 * sf) / Math.sqrt(o.frags || 1));
    const sys = newImpactSys(b, N + 4);
    sys.coolTau = 0.03;
    const [u, w] = perpBasis(n);
    for (let i = 0; i < N; i++) {
      const beta = 40 * rnd() * DEG, psi = rnd() * TAU;
      const d = add(mul(n, Math.cos(beta)), mul(add(mul(u, Math.cos(psi)), mul(w, Math.sin(psi))), Math.sin(beta)));
      const sp = Math.SQRT2 * (0.08 + 0.4 * sf) * (0.3 + 0.7 * rnd());
      const p = mul(n, 1.003);
      sys.add(p.x, p.y, p.z, d.x * sp, d.y * sp, d.z * sp, 0, 1, 0.003 + 0.006 * rnd(), 3);
    }
    state.systems.push(sys);
  }
  function boostLevel(fx, t) {
    const b = fx.boost;
    if (!b || t < b.t0) return 0;
    return b.B0 * Math.exp(-(t - b.t0) / b.tau);
  }

  // Aplica los efectos de un impacto sobre el cuerpo b en la dirección n.
  function applyImpact(b, o) {
    const fx = fxOf(b), t = sim.days;
    const { n, sf, cat, A } = o;
    if (b.type === 'sun') {
      // Destello, fulguración que se apaga, "terremoto solar" (onda en la fotosfera),
      // aumento de brillo pasajero y plasma que vuelve a caer (lluvia coronal).
      flash(b, n, 0.01, 0.1 + 0.9 * sf, 0.003 + 0.01 * sf);
      fx.shocks.push({ n, t0: t, maxAng: clamp(0.1 + 1.6 * sf, 0.1, 2.5), dur: 0.01 + 0.04 * sf });
      fx.craters.push({ kind: 'flare', n, ang: clamp(0.03 + 0.3 * sf, 0.03, 0.4), t0: t, tau: 0.01 + 1.5 * sf * sf });
      const B0 = clamp(0.1 + 0.9 * sf * sf, 0, 1);
      if (!fx.boost || B0 > boostLevel(fx, t)) fx.boost = { B0, t0: t, tau: 0.02 + 5 * sf * sf };
      spawnSolarPlume(b, o);
      return;
    }
    flash(b, n, cat === 'airburst' ? 0.05 : 0.01, 0.15 + 1.8 * sf, 0.003 + 0.015 * sf);
    fx.shocks.push({ n, t0: t, maxAng: clamp(0.15 + 3 * Math.pow(sf, 1.5), 0.1, 3.1), dur: 0.008 + 0.03 * sf });
    if (cat === 'airburst') {
      fx.craters.push({ kind: 'burn', n, ang: clamp((3 * A.blastR) / b.radius, 0.012, 0.5), t0: t });
      return;
    }
    if (cat === 'gasscar' || cat === 'gasglobal') {
      fx.craters.push({ kind: 'scar', n, ang: clamp((1.2 * (A.scarKm || b.radius * 0.1)) / b.radius, 0.04, 0.8), t0: t });
      if (cat === 'gasglobal') {
        fx.heat = { H0: clamp((sf - 0.69) / 0.3, 0.15, 0.8), t0: t, tau: YEAR * 8 };
        makeLava(fx);
      }
      spawnEjecta(b, o);
      return;
    }
    const ang = o.craterAng ?? clamp((1.5 * A.crater) / b.radius, 0.012, 0.9);
    fx.craters.push({ kind: 'crater', n, ang, t0: t, hot0: clamp(0.6 + sf, 0, 1), hotTau: 0.02 + 900 * Math.pow(sf, 5) });
    if (fx.craters.length > 40) fx.craters.shift();
    if (isFinite(b.atm) && b.atm > 0) {
      const D0 = clamp((sf - 0.38) / 0.22, 0, 0.75);
      if (D0 > 0 && D0 >= dustLevel(fx, t)) fx.dust = { D0, t0: t, tau: YEAR * (1.5 + 4 * D0) };
    }
    const H0 = clamp((sf - 0.6) / 0.2, 0, 1);
    if (H0 > 0 && H0 >= heatLevel(fx, t)) {
      fx.heat = { H0, t0: t, tau: YEAR * (20 + 600 * H0 * H0) };
      makeLava(fx);
    }
    if (cat === 'partial') {
      const lost = 0.35 * Math.min(1, o.q);
      b.r *= Math.cbrt(1 - lost);
      b.mass *= 1 - lost;
      b.radius *= Math.cbrt(1 - lost);
    }
    spawnEjecta(b, o);
  }

  // Línea de tiempo narrada para cada tipo de resultado.
  function narrate(b, cat, extra = {}) {
    const N = b.name;
    const ev = {
      regional: [[0.02, `La lluvia de eyecta cae a cientos de kilómetros del cráter en ${N}`], [1, 'Terremotos e incendios en la región; el polvo se dispersa']],
      extinction: [
        [0.02, 'La eyecta incandescente reingresa por todo el planeta: incendios globales'],
        [2, 'El polvo y el hollín cubren el cielo: comienza el invierno de impacto'],
        [120, 'La fotosíntesis se detiene; colapsan las cadenas alimenticias'],
        [YEAR * 4, 'El polvo se asienta y la luz del Sol vuelve poco a poco'],
      ],
      sterilize: [
        [0.03, 'Una nube de roca vaporizada envuelve todo el planeta'],
        [1, 'La atmósfera alcanza miles de grados: los océanos comienzan a hervir'],
        [60, 'La superficie queda completamente esterilizada'],
        [YEAR * 60, `La corteza de ${N} vuelve a solidificarse`],
      ],
      magma: [
        [0.02, 'La onda de choque recorre el planeta y funde la corteza'],
        [1, `Un océano de magma cubre toda la superficie de ${N}`],
        [8, 'Las colisiones aplanan los escombros en órbita en un disco'],
        [YEAR * 300, `Se forma una nueva corteza sólida sobre ${N}`],
      ],
      partial: [
        [0.02, `${N} pierde una parte importante de su manto`],
        [1, 'Lo que queda del planeta es una bola de roca fundida'],
        [8, 'Los escombros ligados forman un disco alrededor del planeta'],
      ],
      gasscar: [
        [0.5, `Aparece una mancha oscura en las nubes de ${N}`],
        [30, 'Los vientos estiran y dispersan la mancha'],
        [200, 'La mancha desaparece por completo'],
      ],
      gasglobal: [
        [1, 'La atmósfera superior se calienta: el planeta brilla en infrarrojo'],
        [YEAR * 10, 'La atmósfera recupera su temperatura habitual'],
      ],
      airburst: [[0.01, 'La onda expansiva recorre la región y derriba todo a su paso']],
      solar: [
        [0.008, 'Una onda sísmica recorre la fotosfera: un "terremoto solar" como los que observan las sondas'],
        [0.04, 'El plasma eyectado vuelve a caer siguiendo el campo magnético: lluvia coronal'],
        [1.5, 'El Sol recupera su brillo habitual'],
      ],
      destroy: [
        [0.05, 'Los fragmentos se alejan a más que la velocidad de escape'],
        [10, `La nube de escombros se estira a lo largo de la órbita de ${N}`],
        [extra.period || YEAR, 'Tras una vuelta al Sol, los restos forman un arco de escombros'],
        [(extra.period || YEAR) * 6, `Se ha formado un nuevo cinturón de escombros donde estaba ${N}`],
      ],
    }[cat];
    for (const [dt, text] of ev || []) schedule(dt, text);
  }

  // Desintegración: el planeta se convierte en un enjambre de fragmentos.
  function destroyPlanet(b, o) {
    ensureNbody();
    const fx = fxOf(b);
    fx.heat = null; fx.dust = null;
    b.destroyed = true;
    const sys = new LocalSys({
      center: b, Lkm: b.radius, Tu: unitTime(b), vis: b.r, rSurf: 0, eps: 0.8, kind: 'destroy', cap: 3300, coolTau: 0.05, tauC: 20,
    });
    const vk = Math.SQRT2 * (0.75 + 0.45 * Math.sqrt(Math.min(o.q, 30)));
    const push = mul(o.dirOut, -0.3);
    const base = b.kind === 'ice' ? 6 : b.kind === 'gas' ? 9 : 4;
    for (let i = 0; i < 3200; i++) {
      const p = randBall(), rr = len(p) || 0.01, pd = mul(p, 1 / rr);
      const sp = vk * (0.4 + 0.9 * rr) * (0.85 + 0.3 * rnd());
      sys.add(p.x, p.y, p.z, pd.x * sp + push.x, pd.y * sp + push.y, pd.z * sp + push.z, 0,
        0.6 + 0.4 * (1 - rr), 0.008 + 0.02 * rnd(), base + (base === 4 && rnd() < 0.5 ? 1 : 0));
    }
    state.systems.push(sys);
    flash(b, v3(0, 0, 0), 0, 4, 0.05);
    freeMoons(b);
    holdSlow(0.035);
    refreshTargets();
  }

  function scheduleRemnant(b, frac, dtDays) {
    schedule(dtDays, null, () => {
      if (!b.destroyed) return;
      b.destroyed = false;
      const k = clamp(Math.cbrt(frac), 0.25, 1);
      b.r = b.r0 * k; b.radius = b.radius0 * k; b.mass = b.mass0 * frac;
      const fx = fxOf(b);
      fx.craters = [];
      fx.heat = { H0: 1, t0: sim.days, tau: YEAR * 300 };
      makeLava(fx);
      addLog(`🪨 Los fragmentos que quedaron ligados se reagrupan: nace un cuerpo de escombros fundido con ~${fmtNum(frac * 100, 0)} % de la masa de ${b.name}`);
      refreshTargets();
    });
  }

  function growMoon(sys) {
    const p = sys.center;
    if (p.destroyed) return;
    if (!sys.moon) {
      const dKm = p.radius * 3.6;
      const period = (TAU * Math.sqrt(dKm ** 3 / (G_KM * p.mass))) / DAY_S;
      const m = {
        name: `Nueva luna de ${p.name}`, parent: p.name, parentBody: p, type: 'moon', generated: true,
        r: 0.05, r0: p.r * 0.3, dist: p.r * 3.6, period, phase0: rnd() * TAU, color: ['#e6d9c6', '#6c5d4e'], realKm: dKm,
        mass: p.mass * 0.012, radius: p.radius * 0.27, x: p.x, y: p.y, z: p.z,
        desc: 'Luna formada por acreción de los escombros que el impacto puso en órbita, como se cree que nació nuestra Luna.',
        facts: [['Orbita a', p.name], ['Distancia', `${fmtNum(dKm, 0)} km`], ['Periodo orbital', `${fmtNum(period * 24, 1)} horas`]],
      };
      MOONS.push(m); BODIES.push(m);
      state.generated.push(m);
      sys.moon = m;
      addLog(`🌑 Los escombros fuera del límite de Roche se aglutinan: nace una nueva luna alrededor de ${p.name}`);
    }
    sys.moonAcc++;
    sys.moon.r = Math.max(0.05, p.r * 0.3 * Math.cbrt(sys.moonAcc / Math.max(1, sys.moonTotal)));
    if (sys.moonAcc === sys.moonTotal) addLog(`🌕 La nueva luna de ${p.name} termina de formarse`);
  }

  // Las lunas de un planeta destruido quedan en órbita alrededor del Sol.
  function freeMoons(b) {
    for (const m of MOONS) {
      if (m.parentBody !== b || m.free || m.destroyed) continue;
      freeMoon(m);
      addLog(SUN.destroyed
        ? `🌑 ${m.name} pierde a su planeta y queda vagando sin rumbo`
        : `🌑 ${m.name} pierde a su planeta y queda en órbita alrededor del Sol`);
    }
  }

  // Da a una luna estado heliocéntrico propio (posición y velocidad reales respecto de su planeta).
  function freeMoon(m) {
    const b = m.parentBody;
    {
      ensureNbody();
      m.free = true;
      const rel = v3(m.x - b.x, m.y - b.y, m.z - b.z), dir = norm(rel);
      const dKm = m.realKm || b.radius * 5;
      const ang = m.phase0 + (TAU * sim.days) / m.period;
      const sg = Math.sign(m.period) || 1;
      const tang = v3(-Math.sin(ang) * sg, 0, Math.cos(ang) * sg);
      const vk = Math.sqrt((G_KM * b.mass) / dKm) * KMS_AUD;
      m.hp = v3(b.hp.x + (dir.x * dKm) / AU_KM, b.hp.y + (dir.y * dKm) / AU_KM, b.hp.z + (dir.z * dKm) / AU_KM);
      m.hv = v3(b.hv.x + tang.x * vk, b.hv.y + tang.y * vk, b.hv.z + tang.z * vk);
      m.visOff = { x: rel.x, y: rel.y, z: rel.z, t0: sim.days, tau: 25 };
      m.live = true;
      HELIO.push(m);
    }
  }

  /* ------------------------- Proyectiles -------------------------------- */
  function launch() {
    const P = readParams();
    const t = P.target;
    if (P.type === 'evo') return launchEvo();
    if (!t || t.destroyed || isBusy()) return;
    if (P.type === 'sn') return launchSN(P);
    const A = analyze(P);
    state.anchor = sim.days;
    if (P.type === 'bh') return launchBH(P, A);
    const ty = TYPES[P.type];
    focusOn(t);
    const big = ['magma', 'partial', 'destroy'].includes(A.cat);
    cam.tdist = t.r * (big ? 11 : 5.5);
    const { right, up, fwd } = camBasis();
    // Punto de impacto visible desde la cámara y del lado iluminado por el Sol.
    const toSun = norm(v3(SUN.x - t.x, SUN.y - t.y, SUN.z - t.z));
    const sunSide = norm(sub(toSun, mul(fwd, dot(toSun, fwd))));
    const n0 = norm(add(add(mul(fwd, -0.8), mul(sunSide, 0.55)), mul(up, 0.3)));
    const ang = P.angle * DEG;
    const t0 = sim.days + APPROACH;
    const frags = A.frags;
    for (let k = 0; k < frags; k++) {
      // Los fragmentos caen en fila a lo largo de la trayectoria (como SL9).
      const t1 = norm(sub(right, mul(n0, dot(n0, right))));
      const n = norm(sub(mul(n0, Math.cos(k * 0.08)), mul(t1, Math.sin(k * 0.08))));
      const tdir = norm(sub(right, mul(n, dot(n, right))));
      const dirOut = norm(add(mul(n, Math.sin(ang)), mul(tdir, Math.cos(ang))));
      const pr = {
        type: 'projectile', name: ty.name, noPick: true, kind: P.type, color: ty.color,
        target: t, n, tdir, dirOut, angle: ang, tImpact: t0 + k * 0.0015, P, A, idx: k,
        r: Math.max((t.r * (A.Lf / 1e3)) / (2 * t.radius), t.r * 0.025), x: t.x, y: t.y, z: t.z,
      };
      placeProjectile(pr);
      BODIES.push(pr);
      state.projectiles.push(pr);
    }
    const sizeTxt = fmtLen(P.L);
    addLog(`🚀 ${ty.name} de ${sizeTxt}${frags > 1 ? ` (${frags} fragmentos)` : ''} en ruta hacia ${nm(t)} a ${fmtNum(P.v, 1)} km/s`);
    refreshLabUI();
  }

  function placeProjectile(pr) {
    const t = pr.target, R = t.r;
    const u = clamp((pr.tImpact - sim.days) / APPROACH, 0, 1);
    const k = pr.r + u * R * 7;
    pr.x = t.x + pr.n.x * R + pr.dirOut.x * k;
    pr.y = t.y + pr.n.y * R + pr.dirOut.y * k;
    pr.z = t.z + pr.n.z * R + pr.dirOut.z * k;
  }

  function doImpact(pr) {
    BODIES.splice(BODIES.indexOf(pr), 1);
    state.projectiles.splice(state.projectiles.indexOf(pr), 1);
    const b = pr.target, A = pr.A, P = pr.P;
    if (b.destroyed) return;
    const sf = A.s, cat = A.cat;
    const o = { n: pr.n, tdir: pr.tdir, dirOut: pr.dirOut, angle: pr.angle, sf, cat, A, q: A.qf, frags: A.frags, comet: P.type === 'comet' };
    if (cat === 'destroy') destroyPlanet(b, o);
    else applyImpact(b, o);
    holdSlow(0.012 + 0.03 * Math.min(1, sf));
    if (pr.idx === 0) {
      const [label] = CATS[cat];
      addLog(`💥 Impacto en ${nm(b)}: ${sci(A.E)} J (${sci(A.E / MT)} Mt) — <b>${label}</b>`);
      narrate(b, cat, { period: b.period || b.P });
    }
  }

  function drawProjectile(pr) {
    const sr = Math.max(pr.sr, 1.6), { sx, sy } = pr;
    const u = clamp((pr.tImpact - sim.days) / APPROACH, 0, 1);
    const glow = 0.3 + 0.7 * (1 - u) * (1 - u);
    const R = pr.target.r;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (pr.kind === 'comet') {
      const as = norm(v3(pr.x - SUN.x, pr.y - SUN.y, pr.z - SUN.z));
      toView(pr.x + as.x * R * 4, pr.y + as.y * R * 4, pr.z + as.z * R * 4);
      if (V.z > NEAR) {
        const ex = cx + (V.x * focal) / V.z, ey = cy - (V.y * focal) / V.z;
        drawTail(sx, sy, (sx + ex) / 2, (sy + ey) / 2, ex, ey, sr * 1.4, 0.12, 'rgba(160,210,255,', 0.55);
      }
    }
    // Estela de plasma en la dirección de llegada
    toView(pr.x + pr.dirOut.x * R * 1.8, pr.y + pr.dirOut.y * R * 1.8, pr.z + pr.dirOut.z * R * 1.8);
    if (V.z > NEAR) {
      const ex = cx + (V.x * focal) / V.z, ey = cy - (V.y * focal) / V.z;
      drawTail(sx, sy, (sx + ex) / 2, (sy + ey) / 2, ex, ey, sr * 0.9, 0.04, 'rgba(255,170,90,', 0.55 * glow);
    }
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 4);
    const col = pr.kind === 'comet' ? '190,225,255' : '255,210,150';
    g.addColorStop(0, `rgba(${col},${0.7 * glow})`);
    g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(sx, sy, sr * 4, 0, TAU); ctx.fill();
    ctx.restore();
    if (pr.sr >= 1.4) drawSphere(pr);
    else { ctx.fillStyle = '#fff6e0'; ctx.beginPath(); ctx.arc(sx, sy, 1.4, 0, TAU); ctx.fill(); }
  }

  /* -------------------------- Agujeros negros --------------------------- */
  function launchBH(P, A) {
    ensureNbody();
    const t = P.target;
    const { right, up, fwd } = camBasis();
    const from = norm(add(add(mul(right, 0.8), mul(up, 0.35)), mul(fwd, -0.2)));
    const vrel = P.v * KMS_AUD, T = 2;
    const visR = clamp(0.4 + 0.25 * Math.log10(P.mass / 1e20), 0.3, 3.5);
    const rsTxt = fmtLen(A.rs);
    const bh = {
      type: 'blackhole', name: 'Agujero negro', mass: P.mass, mu: (K2 * P.mass) / M_SUN, r: visR, r0: visR,
      hp: v3(t.hp.x + from.x * vrel * T, t.hp.y + from.y * vrel * T, t.hp.z + from.z * vrel * T),
      hv: v3(t.hv.x - from.x * vrel, t.hv.y - from.y * vrel, t.hv.z - from.z * vrel),
      vrel, target: t, homing: t, inside: new Set(), trail: [], flare: 0, x: 0, y: 0, z: 0, live: true,
      // Estado de llegada (para conservar el momento si despedaza al Sol).
      dirIn: mul(from, -1), refV: { ...t.hv },
      color: ['#000', '#000'],
      desc: 'Un agujero negro: su gravedad es tan intensa que ni la luz escapa de su horizonte de sucesos. (Tamaño dibujado exagerado.)',
      facts: [['Masa', `${sci(P.mass)} kg`], ['Equivale a', massEquiv(P.mass)], ['Horizonte de sucesos', rsTxt], ['Velocidad relativa', `${fmtNum(P.v, 0)} km/s`]],
    };
    mapVec(bh.hp.x, bh.hp.y, bh.hp.z, bh);
    HELIO.push(bh); BODIES.push(bh); state.bhs.push(bh);
    focusOn(t);
    cam.tdist = t.r * (A.tde ? 22 : 7);
    addLog(`🕳 Un agujero negro de ${massEquiv(P.mass)} (horizonte: ${rsTxt}) se dirige a ${nm(t)} a ${fmtNum(P.v, 0)} km/s`);
    refreshLabUI();
  }

  // Escala visual del radio de marea (en radios dibujados del cuerpo despedazado).
  const tdeScale = (p) => (p.type === 'sun' ? 1.5 : 3);

  function tde(bh, p) {
    state.anchor = sim.days;
    const rt = p.radius * Math.cbrt(bh.mass / p.mass);
    const Tu = Math.sqrt(rt ** 3 / (G_KM * bh.mass));
    const visU = tdeScale(p) * p.r;
    const e = norm(v3(p.hp.x - bh.hp.x, p.hp.y - bh.hp.y, p.hp.z - bh.hp.z));
    const vrel = len(sub(p.hv, bh.hv)) / KMS_AUD;
    // La velocidad medida ya incluye la caída hacia el agujero: el exceso hiperbólico sale de la energía.
    const dKm = len(v3(p.hp.x - bh.hp.x, p.hp.y - bh.hp.y, p.hp.z - bh.hp.z)) * AU_KM;
    const vInf2 = Math.max(0, vrel * vrel - (2 * G_KM * bh.mass) / dKm);
    const { fwd } = camBasis();
    let tt = cross(fwd, e);
    if (len(tt) < 1e-3) tt = cross(v3(0, 1, 0), e);
    tt = norm(tt);
    // Velocidad en el radio de marea (unidades GM = r_t = 1): parabólica + exceso hiperbólico.
    // Si el exceso es grande, casi todo escapa y no se forma disco (como en la realidad).
    const vU = Math.sqrt(2 + (vInf2 * Tu * Tu) / (rt * rt));
    const Rp = clamp(Math.cbrt(p.mass / bh.mass), 0.06, 0.8);
    const sys = new LocalSys({
      center: bh, Lkm: rt, Tu, vis: visU, rSurf: 0, eps: 0.03, accR: 0.05, kind: 'tde', cap: 3200, tauC: 12, tauV: 160,
      onAccrete: () => { bh.flare = Math.min(4, bh.flare + 0.04); },
    });
    const star = p.type === 'sun';
    const base = star ? 2 : p.kind === 'ice' ? 6 : p.kind === 'gas' ? 9 : 4;
    for (let i = 0; i < 3000; i++) {
      const q = mul(randBall(), Rp);
      sys.add(e.x + q.x, e.y + q.y, e.z + q.z, tt.x * vU, tt.y * vU, tt.z * vU, 0, 0.4,
        (star ? 0.003 : 0.004) + 0.008 * rnd(), base + (base === 4 && rnd() < 0.4 ? 1 : 0));
    }
    state.systems.push(sys);
    bh.disk = sys;
    // Continuidad visual: el agujero queda a 1 r_t (escalado) del lugar donde estaba el planeta.
    const desired = v3(p.x - e.x * visU, p.y - e.y * visU, p.z - e.z * visU);
    const m = {};
    mapVec(bh.hp.x, bh.hp.y, bh.hp.z, m);
    bh.visOff = { x: desired.x - m.x, y: desired.y - m.y, z: desired.z - m.z, t0: sim.days, tau: 25 };
    bh.x = desired.x; bh.y = desired.y; bh.z = desired.z;
    bh.target = null; bh.homing = null;
    p.destroyed = true;
    flash(p, v3(0, 0, 0), 0, 3, 0.03);
    freeMoons(p);
    holdSlow(0.035);
    focusOn(bh);
    cam.tdist = visU * 9;
    if (star) {
      // Sin Sol: su gravedad desaparece; la mitad ligada termina en el agujero negro.
      // Conservación del momento (marco del centro de masa, velocidades asintóticas):
      // el agujero sigue su camino a v∞·(M/Mt)·(1 + ½M☉/(M + ½M☉)) respecto del Sol original.
      const Mt = bh.mass + p.mass;
      const k = (bh.mass / Mt) * (1 + (0.5 * p.mass) / (bh.mass + 0.5 * p.mass)) * bh.vrel;
      const ref = bh.refV || p.hv, dir = bh.dirIn || norm(sub(bh.hv, p.hv));
      bh.hv = v3(ref.x + dir.x * k, ref.y + dir.y * k, ref.z + dir.z * k);
      SUN.hv = v3(ref.x, ref.y, ref.z); // la mitad expulsada se aleja de donde estaba el Sol
      sunMu = 0;
      bh.mass += 0.5 * M_SUN;
      bh.mu += 0.5 * K2;
      addLog(`☀ Disrupción por marea del Sol: cruza el radio de marea (${fmtNum(rt, 0)} km) y es despedazado — <b>${CATS.suntde[0]}</b>`);
      const earth = PLANETS[2];
      if (!earth.destroyed) {
        const lightMin = (Math.hypot(earth.hp.x - p.hp.x, earth.hp.y - p.hp.y, earth.hp.z - p.hp.z) * AU_KM) / 299792.458 / 60;
        schedule(lightMin / 1440, `🌍 ${fmtNum(lightMin, 1)} min después, la luz del desastre llega a la Tierra: el Sol ya no está`);
      }
      schedule(1, 'Sin la gravedad del Sol, cada planeta sigue en línea recta a su velocidad orbital… salvo los que atrapa el agujero negro');
      schedule(30, 'Los planetas sin estrella se enfrían rápidamente: los océanos de la Tierra se congelarían en pocos años');
    } else {
      addLog(`🕳 Disrupción por marea: ${p.name} cruza el radio de marea (${fmtNum(rt, 0)} km) y es despedazado — <b>${CATS.tde[0]}</b>`);
    }
    refreshTargets();
  }

  // El Sol es mucho menos denso hacia afuera, pero en promedio frena al agujero
  // negro por fricción dinámica; si pierde su energía de llegada, queda atrapado.
  function solarPass(bh, p) {
    const vr = sub(bh.hv, p.hv);
    const vk = len(vr) / KMS_AUD;
    const R = p.radius * 1e3, v = vk * 1e3;
    const rho = p.mass / ((4 / 3) * Math.PI * R ** 3);
    const E = ((4 * Math.PI * G * G * bh.mass ** 2 * rho * 10) / (v * v)) * 2 * R;
    const vinf2 = Math.max(0, vk * vk - vEsc(p) ** 2) * 1e6;
    const captured = E > 0.5 * bh.mass * vinf2;
    const sf = solarSev(E);
    const nIn = norm(sub(bh.hp, p.hp)), vdir = norm(vr);
    const L = Math.max(0.2, -2 * dot(nIn, vdir));
    const nOut = norm(add(nIn, mul(vdir, L)));
    const crossS = (L * p.radius) / vk;
    const mk = (n) => ({ n, tdir: perpBasis(n)[0], angle: Math.PI / 2, sf, cat: 'solarpass', A: {}, q: 0 });
    applyImpact(p, mk(nIn));
    holdSlow(0.03);
    if (captured) {
      // Se hunde hasta el núcleo: deja de ser un cuerpo independiente (se retira en checkEncounters).
      bh.captured = true;
      sunMu += bh.mu;
      if (cam.follow === bh) focusOn(SUN);
      const years = 4.5e7 * Math.log(p.mass / bh.mass);
      addLog(`🕳 El agujero negro entra al Sol y la fricción dinámica (${sci(E)} J) lo frena: <b>queda atrapado</b> y se hunde hacia el núcleo`);
      schedule(1, 'El Sol sigue brillando como siempre: desde fuera nada parece haber cambiado');
      schedule(30, `Con acreción limitada por Eddington, el agujero negro tardaría ~${sci(years)} años en devorar el Sol desde dentro`);
    } else {
      schedule(crossS / DAY_S, null, () => applyImpact(p, mk(nOut)));
      addLog(`🕳 El agujero negro atraviesa el Sol en ${fmtDur(crossS)}: deposita ${sci(E)} J (lo que el Sol emite en ${fmtDur(E / L_SUN)}) y sale por el otro lado`);
    }
  }

  function passThrough(bh, p) {
    state.anchor = sim.days;
    if (p.type === 'sun') return solarPass(bh, p);
    const vr = sub(bh.hv, p.hv);
    const vk = len(vr) / KMS_AUD;
    const R = p.radius * 1e3, M = p.mass, v = vk * 1e3;
    const rho = M / ((4 / 3) * Math.PI * R ** 3);
    const E = ((4 * Math.PI * G * G * bh.mass ** 2 * rho * 10) / (v * v)) * 2 * R;
    const q = E / bindingEnergy(p);
    const sf = sev(q);
    const racc = (2 * G * bh.mass) / (v * v);
    const acc = Math.PI * racc * racc * rho * 2 * R;
    const nIn = norm(sub(bh.hp, p.hp)), vdir = norm(vr);
    const L = Math.max(0.2, -2 * dot(nIn, vdir));
    const nOut = norm(add(nIn, mul(vdir, L)));
    const cat = categorize(q, p, false);
    const crossS = (L * p.radius) / vk;
    const craterAng = clamp(0.03 + 0.35 * sf, 0.03, 0.5);
    const A = { q, crater: 0, scarKm: p.radius * (0.05 + 0.3 * sf) };
    const mk = (n) => ({ n, tdir: perpBasis(n)[0], angle: Math.PI / 2, sf, cat, A, q, craterAng });
    if (cat === 'destroy') destroyPlanet(p, { ...mk(nIn), dirOut: nIn });
    else {
      applyImpact(p, mk(nIn));
      schedule(crossS / DAY_S, null, () => { if (!p.destroyed) applyImpact(p, mk(nOut)); });
    }
    holdSlow(0.04);
    addLog(`🕳 El agujero negro atraviesa ${p.name} en ${fmtDur(crossS)}: deposita ${sci(E)} J por fricción dinámica y traga ~${sci(acc)} kg — <b>${CATS[cat][0]}</b>`);
    narrate(p, cat, { period: p.period || p.P });
  }

  function updateBH(bh) {
    const t = bh.target;
    if (t && !t.destroyed) {
      // Cerca del objetivo se usa la escala exagerada del planeta para que el
      // acercamiento se vea coherente con su tamaño dibujado.
      const e = encInfo(bh, t);
      const w = 1 - smooth(1.5, 25, e.dKm / e.rEnc);
      if (w > 0) {
        const ks = ((bh.mass >= t.mass ? tdeScale(t) : 1) * t.r) / e.rEnc;
        bh.x += (t.x + e.dx * AU_KM * ks - bh.x) * w;
        bh.y += (t.y + e.dy * AU_KM * ks - bh.y) * w;
        bh.z += (t.z + e.dz * AU_KM * ks - bh.z) * w;
      }
      if (!e.approaching && e.dKm > 30 * e.rEnc) bh.target = null;
    }
    bh.flare *= Math.exp(-0.016 * 1.2);
    const last = bh.trail[bh.trail.length - 1];
    if (!last || Math.hypot(bh.x - last[0], bh.y - last[1], bh.z - last[2]) > 1.5) {
      bh.trail.push([bh.x, bh.y, bh.z]);
      if (bh.trail.length > 400) bh.trail.shift();
    }
  }

  function drawBH(bh) {
    const { sx, sy } = bh;
    const R = Math.max(bh.sr, 2.5);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    let g = ctx.createRadialGradient(sx, sy, R, sx, sy, R * 5);
    g.addColorStop(0, 'rgba(150,120,255,0.35)');
    g.addColorStop(0.3, 'rgba(90,70,200,0.12)');
    g.addColorStop(1, 'rgba(40,30,120,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(sx, sy, R * 5, 0, TAU); ctx.fill();
    const glow = Math.min(1, bh.flare) + (bh.disk && bh.disk.alive > 0 ? 0.35 : 0);
    if (glow > 0.02) {
      const gr = R * (3 + 3 * Math.min(bh.flare, 3));
      g = ctx.createRadialGradient(sx, sy, R * 0.8, sx, sy, gr);
      g.addColorStop(0, `rgba(255,235,210,${0.8 * glow})`);
      g.addColorStop(0.3, `rgba(255,170,90,${0.35 * glow})`);
      g.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(sx, sy, gr, 0, TAU); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,215,170,0.85)';
    ctx.lineWidth = Math.max(1, R * 0.18);
    ctx.beginPath(); ctx.arc(sx, sy, R * 1.3, 0, TAU); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(sx, sy, R, 0, TAU); ctx.fill();
  }

  function drawTrails() {
    for (const bh of state.bhs) {
      const n = bh.trail.length;
      if (n < 2) continue;
      const pts = new Float32Array(n * 3);
      bh.trail.forEach((p, i) => { pts[i * 3] = p[0]; pts[i * 3 + 1] = p[1]; pts[i * 3 + 2] = p[2]; });
      strokePolyline(pts, n - 1, 'rgba(170,140,255,0.45)', 1.2);
    }
  }

  function drawBody(b) {
    if (b.type === 'blackhole') drawBH(b);
    else drawProjectile(b);
  }

  /* ------------------------------ Supernova ----------------------------- */
  // Escenario hipotético: el Sol tiene muy poca masa para explotar (hacen falta
  // ~8 M☉). La eyecta se expande como una cáscara con velocidades entre 0,4 y 1,5
  // veces la velocidad cuadrática media √(2E/M). Al pasar por un cuerpo:
  //  - la masa que ya quedó afuera deja de atraerlo (teorema de la cáscara),
  //  - recibe un empujón (momento interceptado ∝ sección eficaz),
  //  - absorbe ~10 % de la energía que intercepta (aproximación) → daño.
  const AU_M = AU_KM * 1e3;
  const ETA_SN = 0.1;
  const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

  function snKinematics(E, fej) {
    const Mej = fej * M_SUN;
    const vrms = Math.sqrt((2 * E) / Mej) / 1e3; // km/s
    return { Mej, vrms, vmin: 0.4 * vrms, vmax: 1.5 * vrms, vmean: 0.95 * vrms };
  }

  function snFate(b, E, fej, r) {
    const R = b.radius * 1e3, rm = r * AU_M;
    const Edep = (ETA_SN * E * R * R) / (4 * rm * rm);
    const kin = snKinematics(E, fej);
    const dv = (((kin.Mej * kin.vmean * 1e3) / (4 * Math.PI * rm * rm)) * Math.PI * R * R) / b.mass; // m/s
    return { Edep, q: Edep / bindingEnergy(b), dv };
  }

  function analyzeSN(P) {
    const A = snKinematics(P.E, P.fej);
    A.E = P.E; A.fej = P.fej; A.cat = 'supernova';
    A.Lpeak = (0.01 * P.E) / (30 * DAY_S) / L_SUN; // ~1 % de la energía sale como luz en un mes
    A.fates = TARGETS.filter((b) => b.type !== 'sun' && !b.destroyed)
      .map((b) => ({ b, ...snFate(b, P.E, P.fej, dist3(b.hp, SUN.hp) || b.a || 1) }));
    return A;
  }

  // Fracción de la masa solar que aún queda dentro del radio r (UA).
  function snMuFrac(r) {
    const sn = state.sn;
    if (!sn || sn.phase !== 'boom' || sn.gravDone) return 1;
    const tau = sim.days - sn.t0;
    if (tau <= 0) return 1;
    return sn.rem + (1 - sn.rem) * clamp((r / tau - sn.vminAU) / (sn.vmaxAU - sn.vminAU), 0, 1);
  }

  // Ritmo del tiempo: arranca lento y acelera exponencialmente para seguir a la onda.
  function snSpeed() {
    const sn = state.sn;
    if (!sn) return null;
    if (sn.phase === 'collapse') return SLOW;
    const tau = sim.days - sn.t0;
    return tau > 40 ? null : Math.max(0.012, tau * 0.45);
  }

  function launchSN(P) {
    if (SUN.destroyed || state.sn) return;
    ensureNbody();
    const A = analyzeSN(P);
    const N = 6000;
    const dirs = new Float32Array(N * 3), sp = new Float32Array(N), comp = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const d = randUnit();
      dirs[i * 3] = d.x; dirs[i * 3 + 1] = d.y; dirs[i * 3 + 2] = d.z;
      sp[i] = (A.vmin + (A.vmax - A.vmin) * rnd()) * KMS_AUD;
      comp[i] = rnd() < 0.5 ? 10 : rnd() < 0.6 ? 11 : 3; // Hα (magenta), oxígeno (turquesa), rojo
    }
    state.sn = {
      phase: 'collapse', tC: sim.days, E: P.E, fej: P.fej, rem: 1 - P.fej, Mej: A.Mej,
      vrms: A.vrms, vmean: A.vmean, vmeanAU: A.vmean * KMS_AUD, vminAU: A.vmin * KMS_AUD, vmaxAU: A.vmax * KMS_AUD,
      Lpeak: A.Lpeak, dirs, sp, comp, N, passed: new Set(), comets: 0,
    };
    beltState.kicked = new Uint8Array(NP);
    db.kicked.fill(0);
    state.anchor = sim.days;
    resetView();
    cam.tdist = 750;
    addLog('☀ El núcleo del Sol colapsa en una fracción de segundo… <b>Supernova (hipotética)</b>');
    refreshLabUI();
  }

  function snBoom() {
    const sn = state.sn;
    sn.phase = 'boom';
    sn.t0 = sim.days;
    sn.c0 = { ...SUN.hp };
    sn.real0 = performance.now();
    SUN.destroyed = true;
    SUN.r = SUN.r0;
    state.anchor = sim.days;
    addLog(`💥 Explosión: ${sci(sn.E)} J; el ${fmtNum(sn.fej * 100, 0)} % de la masa del Sol sale despedido a ~${fmtNum(sn.vrms, 0)} km/s`);
    addLog('Un pulso de ~10⁴⁶ J en neutrinos escapa del núcleo: incluso ellos, que casi nunca interactúan, darían una dosis letal a 1 UA');
    const earth = PLANETS[2];
    if (!earth.destroyed) {
      const r = dist3(earth.hp, sn.c0);
      schedule((r * 499.005) / DAY_S, `🌍 La luz de la supernova llega a la Tierra, ${fmtNum(r * 8.317, 1)} minutos después de la explosión`);
    }
    schedule(0.01, sn.fej > 0.5
      ? 'Al perder más de la mitad de su masa, el Sol ya no puede retener a los planetas: dejan de estar ligados a medida que pasa la onda'
      : `Queda un remanente compacto con el ${fmtNum(sn.rem * 100, 0)} % de la masa: los planetas siguen ligados, pero en órbitas más alargadas`);
    schedule(18, `La supernova alcanza su brillo máximo: ~${sci(sn.Lpeak)} veces el Sol, comparable a una galaxia entera`);
    schedule(YEAR, 'La nube en expansión se convierte en un remanente de supernova, como la Nebulosa del Cangrejo');
  }

  // La onda de choque alcanza un cuerpo.
  function snHit(b, r) {
    const sn = state.sn;
    const pos = b.type === 'moon' && !b.free ? b.parentBody.hp : b.hp;
    const rad = norm(sub(pos, sn.c0));
    const n = mul(rad, -1); // la cara que mira hacia la explosión
    if (b.type === 'comet') {
      b.destroyed = true;
      flash(b, v3(), 0, 8, 0.02);
      if (sn.comets++ === 0) addLog('☄ Los cometas se vaporizan al instante cuando los alcanza la onda');
      return;
    }
    const { Edep, q, dv } = snFate(b, sn.E, sn.fej, r);
    const moon = b.type === 'moon';
    // Una luna que se desintegra pasa primero a tener estado propio (para seguir sus escombros).
    if (moon && !b.free && q >= 1) freeMoon(b);
    // El empujón solo se aplica a cuerpos con órbita propia; una luna ligada sigue a su planeta.
    if (b.hv && (!moon || b.free)) {
      const k = (dv / 1000) * KMS_AUD;
      b.hv.x += rad.x * k; b.hv.y += rad.y * k; b.hv.z += rad.z * k;
    }
    const sf = sev(q);
    let label;
    if (q >= 1) {
      destroyPlanet(b, { q, dirOut: n });
      label = '<b>se desintegra</b>';
    } else if (b.kind === 'gas') {
      const fx = fxOf(b), t = sim.days;
      flash(b, n, 0.01, 0.5 + 1.5 * sf, 0.01 + 0.02 * sf);
      fx.shocks.push({ n, t0: t, maxAng: 3, dur: 0.02 + 0.05 * sf });
      fx.heat = { H0: clamp((sf - 0.3) / 0.4, 0.15, 1), t0: t, tau: YEAR * 15 };
      makeLava(fx);
      label = q >= 1e-4 ? 'pierde buena parte de su atmósfera y queda incandescente' : 'su atmósfera se calienta y brilla en infrarrojo';
    } else {
      const cat = categorize(q, b, false);
      applyImpact(b, {
        n, tdir: perpBasis(n)[0], angle: Math.PI / 2, sf, cat, q, frags: 1, craterAng: 1.3,
        A: { q, crater: b.radius, scarKm: b.radius, blastR: 0 },
      });
      label = CATS[cat][0].toLowerCase();
    }
    addLog(`💥 La onda alcanza ${nm(b)}: ${label} (recibe ${sci(Edep)} J y un empujón de ${dv < 1000 ? `${fmtNum(dv, 0)} m/s` : `${fmtNum(dv / 1000, 1)} km/s`})`);
  }

  function snUpdate() {
    const sn = state.sn;
    if (!sn) return;
    if (sn.phase === 'collapse') {
      const k = (sim.days - sn.tC) / 0.004;
      SUN.r = SUN.r0 * (1 - 0.3 * Math.min(1, k) + 0.04 * Math.sin(k * 45));
      if (k >= 1) snBoom();
      return;
    }
    const tau = sim.days - sn.t0;
    const rs = sn.vmeanAU * tau;
    for (const b of [...TARGETS, ...COMETS, ...MOONS]) {
      if (b.type === 'sun' || b.destroyed || sn.passed.has(b)) continue;
      // Una luna ligada está, a escala del sistema solar, en el mismo lugar que su planeta.
      const r = dist3(b.type === 'moon' && !b.free ? b.parentBody.hp : b.hp, sn.c0);
      if (r > rs) continue;
      sn.passed.add(b);
      snHit(b, r);
    }
    // Cuando toda la eyecta superó las 5.000 UA, solo queda el remanente.
    if (!sn.gravDone && sn.vminAU * tau > 5000) { sn.gravDone = true; sunMu = K2 * sn.rem; }
  }

  function fillSN(d) {
    const sn = state.sn;
    if (!sn || sn.phase !== 'boom') return;
    const tau = sim.days - sn.t0, c = sn.c0, o = {};
    for (let i = 0; i < sn.N; i++) {
      if (d.n >= DYN_MAX) return;
      const s = sn.sp[i] * tau;
      mapVec(c.x + sn.dirs[i * 3] * s, c.y + sn.dirs[i * 3 + 1] * s, c.z + sn.dirs[i * 3 + 2] * s, o);
      const j = d.n++;
      d.x[j] = o.x; d.y[j] = o.y; d.z[j] = o.z;
      d.size[j] = 2 + (i % 3) * 0.7;
      d.shade[j] = tau < 0.3 ? 0 : tau < 3 ? (i % 2 ? 1 : 7) : tau < 20 ? (i % 3 ? 2 : 1) : tau < 90 ? (i % 2 ? 3 : sn.comp[i]) : sn.comp[i];
    }
  }

  // Brillo de la supernova, remanente y destello inicial.
  function drawSN() {
    const sn = state.sn;
    if (!sn || sn.phase !== 'boom') return;
    const tau = sim.days - sn.t0;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    toView(SUN.x, SUN.y, SUN.z);
    if (V.z > NEAR) {
      const s = focal / V.z, px = cx + V.x * s, py = cy - V.y * s;
      // Curva de luz: subida en ~1 semana y caída por la desintegración del níquel-56 → cobalto (~111 días).
      const Lrel = sn.Lpeak * (1 - Math.exp(-tau / 6)) * Math.exp(-tau / 111) + 1e7 * Math.exp(-tau / 0.03);
      const R = Math.max(6, SUN.r0 * s * (0.6 + 0.45 * Math.log10(1 + Lrel)));
      const a = clamp(0.25 + Math.log10(1 + Lrel) / 10, 0, 1);
      const g = ctx.createRadialGradient(px, py, 0, px, py, R);
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(0.2, `rgba(210,225,255,${0.7 * a})`);
      g.addColorStop(0.55, `rgba(255,140,210,${0.25 * a})`);
      g.addColorStop(1, 'rgba(120,60,200,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(px, py, R, 0, TAU); ctx.fill();
      if (sn.rem > 0) {
        ctx.fillStyle = 'rgba(220,235,255,0.95)';
        ctx.beginPath(); ctx.arc(px, py, Math.max(1.8, 2.5 * s), 0, TAU); ctx.fill();
      }
    }
    const fl = Math.exp(-(performance.now() - sn.real0) / 900);
    if (fl > 0.01) {
      ctx.fillStyle = `rgba(255,250,240,${0.9 * fl})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  /* ------------------------ Evolución real del Sol ---------------------- */
  // Trayectoria evolutiva aproximada (Sackmann et al. 1993; Schröder y Smith 2008).
  // [t (miles de millones de años desde hoy), radio (R☉), luminosidad (L☉), masa (M☉)].
  // La temperatura superficial sale de L = R²·(T/5772 K)⁴.
  const TRACK = [
    [0, 1, 1, 1], [1.0, 1.04, 1.1, 1], [3.5, 1.2, 1.4, 1], [5.4, 1.6, 2.0, 1], [6.5, 2.3, 2.6, 1],
    [7.0, 6, 15, 0.99], [7.4, 30, 230, 0.95], [7.55, 100, 1100, 0.85], [7.59, 256, 2730, 0.67],
    [7.592, 10, 44, 0.67], [7.70, 15, 60, 0.67], [7.72, 120, 2000, 0.62], [7.735, 180, 5000, 0.55],
    [7.7352, 0.1, 3500, 0.54], [7.75, 0.015, 10, 0.54], [8.0, 0.0126, 0.1, 0.54], [20, 0.0126, 1e-4, 0.54],
  ];
  // Ritmo de la animación: [t0, t1, segundos reales] (las fases breves se ven más lento).
  const EVO_SEGS = [
    [0, 5.4, 14], [5.4, 7.0, 6], [7.0, 7.59, 14], [7.59, 7.592, 2], [7.592, 7.70, 5],
    [7.70, 7.735, 8], [7.735, 7.7352, 10], [7.7352, 8.0, 6], [8.0, 20, 8],
  ];
  const SUN_AGE = 4.57; // edad actual del Sol (miles de millones de años)
  const R_SUN_AU_EVO = 0.00465;

  function trackAt(t) {
    let k = 1;
    while (k < TRACK.length - 1 && TRACK[k][0] < t) k++;
    const a = TRACK[k - 1], b = TRACK[k];
    const f = clamp((t - a[0]) / (b[0] - a[0]), 0, 1);
    const lg = (x, y) => Math.exp(Math.log(x) + (Math.log(y) - Math.log(x)) * f);
    const R = lg(a[1], b[1]), L = lg(a[2], b[2]), M = a[3] + (b[3] - a[3]) * f;
    return { R, L, M, T: 5772 * Math.pow(L / (R * R), 0.25) };
  }

  function evoTime(real) {
    let acc = 0;
    for (const [t0, t1, d] of EVO_SEGS) {
      if (real < acc + d) return t0 + ((t1 - t0) * (real - acc)) / d;
      acc += d;
    }
    return null; // terminó
  }

  function phaseName(t) {
    return t < 5.4 ? 'secuencia principal' : t < 7.0 ? 'subgigante' : t < 7.59 ? 'gigante roja'
      : t < 7.592 ? 'destello de helio' : t < 7.70 ? 'rama horizontal' : t < 7.735 ? 'rama asintótica'
      : t < 7.7352 ? 'nebulosa planetaria' : 'enana blanca';
  }

  // Radio dibujado: se empalma con la escala de distancias para que el engullimiento se vea coherente.
  const sunSceneR = (R) => (R >= 1 ? mapAU(R * R_SUN_AU_EVO) + 26 - mapAU(R_SUN_AU_EVO) : 26 * Math.sqrt(R));

  function sunPalette(T, R) {
    const glowMul = R > 5 ? 2.2 : R < 0.5 ? 9 : 7;
    if (T > 20000) return { c: ['#f6f9ff', '#dbe7ff', '#b3cbff', '#8daeff'], glow: '170,200,255', glowMul };
    if (T > 7500) return { c: ['#ffffff', '#eef3ff', '#cfdcff', '#aec3ff'], glow: '210,225,255', glowMul };
    if (T > 5000) return { ...SUN_PALETTE, glowMul };
    if (T > 4000) return { c: ['#fff1d0', '#ffc169', '#ff8e30', '#e5631b'], glow: '255,150,70', glowMul };
    if (T > 3200) return { c: ['#ffe2c0', '#ff9e5c', '#ef6a2c', '#c24418'], glow: '255,120,60', glowMul };
    return { c: ['#ffd2ad', '#ff8048', '#d9471c', '#9c2410'], glow: '255,95,50', glowMul };
  }

  const fmtGa = (t) => `+${fmtNum(t, t < 7.5 ? 1 : t < 7.7 ? 2 : 4)} Ga`;
  const evoLog = (text) => addLog(text, sim.days, fmtGa(state.evo.t));

  const EVO_EVENTS = [
    [1.0, '🌡 El Sol brilla un 10 % más: la Tierra entra en un efecto invernadero desbocado y sus océanos se evaporan'],
    [3.5, '🏜 Con un 40 % más de brillo, la Tierra es un desierto abrasador parecido a Venus'],
    [5.4, '☀ Se agota el hidrógeno del núcleo: el Sol deja la secuencia principal y se convierte en subgigante'],
    [7.0, '🔴 Rama de las gigantes rojas: el Sol se hincha y enrojece; un viento intenso le hace perder masa y las órbitas se alejan'],
    [7.59, '🔴 Punta de la rama gigante: ~256 veces su radio actual (1,2 UA) y ~2.700 veces más brillante; ha perdido un tercio de su masa'],
    [7.5905, '⚡ Destello de helio: el helio del núcleo se enciende en minutos; el Sol se encoge a unos 10 radios (rama horizontal)'],
    [7.70, '🔴 Rama asintótica: el Sol vuelve a hincharse, ahora con pulsos térmicos'],
    [7.735, '🌫 Expulsa sus capas externas: nace una nebulosa planetaria (su expansión se acelera para poder verla)'],
    [7.7352, '⚪ Queda el núcleo desnudo: una enana blanca de 0,54 M☉ del tamaño de la Tierra, a más de 100.000 °C'],
    [8.0, '❄ La enana blanca ya no produce energía: solo se enfría, durante billones de años'],
  ];

  function launchEvo() {
    if (state.evo && !state.evo.finished) return;
    // La evolución parte del sistema intacto (órbitas analíticas).
    if (state.evo || sim.nbody || state.sn || state.bhs.length || TARGETS.some((b) => b.destroyed)) resetSystem();
    const pn = new Float32Array(5000 * 3), comp = new Uint8Array(5000);
    for (let i = 0; i < 5000; i++) {
      // Forma bipolar (de reloj de arena) con un anillo ecuatorial, como muchas nebulosas planetarias.
      const ring = rnd() < 0.3;
      const d = ring ? norm(v3(gaussR(), gaussR() * 0.12, gaussR())) : norm(v3(gaussR() * 0.8, gaussR() * 2.2, gaussR() * 0.8));
      const s = 0.85 + 0.3 * rnd();
      pn[i * 3] = d.x * s; pn[i * 3 + 1] = d.y * s; pn[i * 3 + 2] = d.z * s;
      comp[i] = ring ? 11 : rnd() < 0.7 ? 10 : 7;
    }
    state.evo = { real: 0, t: 0, fired: new Set(), scale: 1, pn, comp, swallowed: [] };
    resetView();
    cam.tdist = 1150;
    cam.pitch = 0.55;
    evoLog('🌅 Evolución del Sol desde hoy (edad: 4.570 millones de años). Ga = miles de millones de años');
    refreshLabUI();
  }

  function evoUpdate(dt) {
    const evo = state.evo;
    if (!evo) return;
    if (!sim.paused && !evo.finished) evo.real += dt;
    const t = evoTime(evo.real);
    if (t == null) {
      if (!evo.finished) {
        evo.finished = true;
        evo.t = 20;
        const alive = PLANETS.filter((p) => !p.destroyed).map((p) => p.name);
        evoLog(`🌑 Tras 20.000 millones de años la enana blanca es tenue y fría. Siguen orbitando en la oscuridad: ${alive.join(', ')}`);
      }
    } else evo.t = t;
    const s = trackAt(evo.t);
    evo.s = s;
    SUN.r = sunSceneR(s.R);
    SUN.palette = sunPalette(s.T, s.R);
    // Pérdida de masa lenta: las órbitas se expanden como 1/M.
    const scale = 1 / s.M;
    if (Math.abs(scale - orbitScale) / orbitScale > 0.003) { orbitScale = scale; rebuildOrbits(); }

    for (const [te, text] of EVO_EVENTS) {
      if (evo.t >= te && !evo.fired.has(te)) { evo.fired.add(te); evoLog(text); }
    }
    const RAU = s.R * R_SUN_AU_EVO;
    const Teq = (a) => 278 * Math.pow(s.L, 0.25) / Math.sqrt(a * orbitScale);
    for (const p of PLANETS) {
      if (p.destroyed) continue;
      // Engullido si su órbita cae dentro de ~1,3 radios solares (la fricción de marea lo arrastra).
      if (RAU * 1.3 >= p.a * orbitScale) {
        p.destroyed = true;
        for (const m of MOONS) if (m.parentBody === p) m.destroyed = true;
        flash(p, v3(), 0, 3, 0.02);
        evoLog(p.name === 'Tierra'
          ? '🔥 La Tierra (con la Luna) es engullida por la envoltura del Sol y se vaporiza'
          : `🔥 ${p.name} es engullido por la envoltura del Sol y se vaporiza`);
        continue;
      }
      // Superficie fundida si la temperatura de equilibrio supera ~1.300 K.
      if (p.kind === 'rocky') {
        const H = clamp((Teq(p.a) - 1300) / 900, 0, 1);
        const fx = fxOf(p);
        fx.heatFixed = H;
        if (H > 0) {
          makeLava(fx);
          if (!evo.fired.has('melt' + p.name)) { evo.fired.add('melt' + p.name); evoLog(`🌋 La superficie de ${p.name === 'Tierra' ? 'la Tierra' : p.name} se funde (~${fmtNum(Teq(p.a), 0)} K)`); }
        }
      }
    }
    const jup = PLANETS[4], sat = PLANETS[5];
    if (!evo.fired.has('europa') && Teq(jup.a) > 273) {
      evo.fired.add('europa');
      evoLog('💧 El hielo de Europa y Ganímedes se derrite: océanos en la superficie de las lunas de Júpiter');
    }
    if (!evo.fired.has('titan') && Teq(sat.a) > 260) {
      evo.fired.add('titan');
      evoLog('🌍 Titán alcanza temperaturas templadas: podría ser habitable durante algunos cientos de millones de años');
    }
  }

  // Nebulosa planetaria (expansión acelerada para la vista) que se desvanece poco a poco.
  function fillPN(d) {
    const evo = state.evo;
    if (!evo || evo.t < 7.735) return;
    const p = clamp((evo.t - 7.735) / 0.0002, 0, 1);
    const after = Math.max(0, evo.t - 7.7352);
    const keep = 1 - clamp(after / 0.08, 0, 1);
    const n = Math.floor(5000 * keep);
    const R = 3 + 700 * Math.pow(p, 0.7) * (1 + after / 0.04);
    const o = {}, c = SUN.hp;
    for (let i = 0; i < n; i++) {
      if (d.n >= DYN_MAX) return;
      mapVec(c.x + evo.pn[i * 3] * R, c.y + evo.pn[i * 3 + 1] * R, c.z + evo.pn[i * 3 + 2] * R, o);
      const j = d.n++;
      d.x[j] = o.x; d.y[j] = o.y; d.z[j] = o.z;
      d.size[j] = 2.5;
      d.shade[j] = evo.comp[i];
    }
  }

  function hudOverride() {
    const evo = state.evo;
    if (!evo) return null;
    const age = (SUN_AGE + evo.t) * 1000;
    return {
      date: `Edad del Sol: ${fmtNum(age, 0)} millones de años`,
      speed: `Evolución estelar · ${phaseName(evo.t)}${sim.paused ? ' (en pausa)' : ''}`,
    };
  }

  /* ----------------------------- Bucle ---------------------------------- */
  function update(dt) {
    const t = sim.days;
    for (const pr of [...state.projectiles]) {
      if (t >= pr.tImpact) doImpact(pr);
      else placeProjectile(pr);
    }
    for (const bh of state.bhs) updateBH(bh);

    snUpdate();
    evoUpdate(dt);
    while (state.pending.length && state.pending[0].t <= sim.days) {
      const ev = state.pending.shift();
      if (ev.text) addLog(ev.text, ev.t);
      if (ev.fn) ev.fn();
    }

    const slow = isSlow();
    // Durante la supernova el tiempo se acelera mucho: la eyecta local pasa antes a órbitas analíticas.
    const maxNumeric = state.sn ? 0.008 : 0.2;
    for (const sys of state.systems) {
      // Al terminar la cámara lenta (o como máximo tras 0,2 días) se pasa a órbitas analíticas.
      if (sys.numeric && (!slow || sim.days - sys.t0 > maxNumeric)) sys.settle();
      if (sys.numeric) sys.step(lastDays);
      else sys.updateAnalytic();
    }
    state.systems = state.systems.filter((s) => s.alive > 0 || s.numeric);
    state.flashes = state.flashes.filter((f) => sim.days - f.t0 <= f.dur);
    for (const b of TARGETS) {
      const fx = b.fx;
      if (!fx) continue;
      fx.shocks = fx.shocks.filter((s) => sim.days - s.t0 <= s.dur);
      fx.craters = fx.craters.filter((c) => c.kind === 'crater' || sim.days - c.t0 < (c.kind === 'scar' ? 400 : 1500));
    }

    dyn.n = 0;
    for (const sys of state.systems) sys.fill(dyn);
    fillDebris(dyn);
    fillSN(dyn);
    fillPN(dyn);

    const T = state.timers;
    T.monitor += dt; T.osc += dt; T.ui += dt;
    if (T.monitor > 0.5) { T.monitor = 0; monitor(); }
    if (T.osc > 0.3 && sim.nbody) { T.osc = 0; updateOsc(); }
    if (T.ui > 0.25) { T.ui = 0; refreshLabUI(); }
  }
  let lastDays = 0;

  /* ------------------------------ Registro ------------------------------ */
  const logEl = $('log'), logList = $('log-list');
  function addLog(text, t = sim.days, label) {
    const li = document.createElement('li');
    li.className = 'new';
    li.innerHTML = `<span class="t">${label ?? fmtRel(Math.max(0, t - state.anchor))}</span>${text}`;
    logList.prepend(li);
    while (logList.children.length > 60) logList.lastChild.remove();
    logEl.hidden = false;
  }
  $('log-close').addEventListener('click', () => { logEl.hidden = true; });

  /* ------------------------------ Reinicio ------------------------------ */
  function resetSystem() {
    for (const b of [...state.bhs, ...state.projectiles, ...state.generated]) {
      const i = BODIES.indexOf(b);
      if (i >= 0) BODIES.splice(i, 1);
      const j = HELIO.indexOf(b);
      if (j >= 0) HELIO.splice(j, 1);
      const k = MOONS.indexOf(b);
      if (k >= 0) MOONS.splice(k, 1);
    }
    for (const m of MOONS) {
      m.destroyed = false; m.fx = null; m.r = m.r0; m.mass = m.mass0; m.radius = m.radius0;
      if (!m.free) continue;
      m.free = false; m.visOff = null; m.osc = null; m.live = false;
      HELIO.splice(HELIO.indexOf(m), 1);
    }
    for (const b of HELIO) { b.osc = null; b.visOff = null; }
    for (const b of TARGETS) {
      b.destroyed = false; b.fx = null; b.r = b.r0; b.mass = b.mass0; b.radius = b.radius0;
      b.escLogged = b.capLogged = false;
    }
    SUN.hp = v3(); SUN.hv = v3();
    sunMu = K2;
    state.sn = null;
    state.evo = null;
    SUN.palette = null;
    if (orbitScale !== 1) { orbitScale = 1; rebuildOrbits(); }
    beltState.kicked = null;
    Object.assign(state, { projectiles: [], bhs: [], systems: [], flashes: [], pending: [], generated: [], slowUntil: -Infinity });
    db.n = 0; dyn.n = 0;
    beltState.on = false;
    sim.nbody = false;
    $('today').disabled = false;
    $('today').title = '';
    logList.innerHTML = '';
    logEl.hidden = true;
    if (cam.follow && !BODIES.includes(cam.follow)) resetView();
    refreshTargets();
    refreshLabUI();
  }

  /* ----------------------------- Interfaz ------------------------------- */
  const ui = { type: 'asteroid' };
  const el = {
    seg: $('lab-type'), preset: $('lab-preset'), target: $('lab-target'),
    size: $('lab-size'), sizeOut: $('lab-size-out'), sizeLabel: $('lab-size-label'),
    speed: $('lab-speed'), speedOut: $('lab-speed-out'), speedLabel: $('lab-speed-label'),
    angle: $('lab-angle'), angleOut: $('lab-angle-out'), angleRow: $('lab-angle-row'),
    frags: $('lab-frags'), fragsOut: $('lab-frags-out'), fragsRow: $('lab-frags-row'),
    estimate: $('lab-estimate'), launch: $('lab-launch'), reset: $('lab-reset'),
  };

  // Pestañas
  for (const btn of document.querySelectorAll('.tabs button')) {
    btn.addEventListener('click', () => {
      for (const b of document.querySelectorAll('.tabs button')) b.classList.toggle('active', b === btn);
      $('tab-view').hidden = btn.dataset.tab !== 'view';
      $('tab-lab').hidden = btn.dataset.tab !== 'lab';
      if (btn.dataset.tab === 'lab') renderEstimate();
    });
  }

  function speedRange(type, target) {
    if (type === 'bh') return [1, 500];
    const vmin = Math.max(0.5, Math.ceil(vEsc(target) * 10) / 10);
    // Nada cae más lento que la velocidad de escape del objetivo (618 km/s en el Sol).
    return [vmin, Math.max(vmin * 1.15, 80)];
  }

  function readParams() {
    const type = ui.type, ty = TYPES[type];
    const target = TARGETS.find((b) => b.name === el.target.value);
    const sv = +el.size.value / 1000, vv = +el.speed.value / 1000;
    const P = { type, target, angle: +el.angle.value, frags: type === 'bh' || type === 'sn' ? 1 : +el.frags.value };
    if (type === 'evo') { P.target = SUN; return P; }
    if (type === 'sn') {
      // Supernova: el control de tamaño fija la energía y el de velocidad la fracción de masa expulsada.
      P.target = SUN;
      P.E = logLerp(ty.energy[0], ty.energy[1], sv);
      P.fej = 0.05 + 0.95 * vv;
      return P;
    }
    if (!target) return P;
    const [v0, v1] = speedRange(type, target);
    if (type === 'bh') {
      P.mass = logLerp(ty.mass[0], ty.mass[1], sv);
      P.v = logLerp(v0, v1, vv);
    } else {
      P.L = logLerp(ty.size[0], ty.size[1], sv);
      P.v = v0 + (v1 - v0) * vv;
    }
    return P;
  }

  function setType(type) {
    ui.type = type;
    for (const b of el.seg.querySelectorAll('button')) b.classList.toggle('active', b.dataset.type === type);
    const bh = type === 'bh', sn = type === 'sn', evo = type === 'evo';
    el.sizeLabel.textContent = sn ? 'Energía de la explosión' : bh ? 'Masa' : 'Diámetro';
    el.speedLabel.textContent = sn ? 'Masa expulsada' : bh ? 'Velocidad relativa' : 'Velocidad de impacto';
    el.size.closest('.slider').hidden = evo;
    el.speed.closest('.slider').hidden = evo;
    el.angleRow.hidden = bh || sn || evo;
    el.fragsRow.hidden = bh || sn || evo;
    el.target.disabled = sn || evo;
    if (sn || evo) el.target.value = 'Sol';
  }

  function applyPreset(p) {
    setType(p.type);
    el.target.value = p.target;
    const ty = TYPES[p.type], target = TARGETS.find((b) => b.name === p.target);
    if (p.type === 'evo') { renderEstimate(); return; }
    if (p.type === 'sn') {
      el.size.value = Math.round(1000 * invLogLerp(ty.energy[0], ty.energy[1], p.E));
      el.speed.value = Math.round((1000 * (p.fej - 0.05)) / 0.95);
      renderEstimate();
      return;
    }
    const [v0, v1] = speedRange(p.type, target);
    if (p.type === 'bh') {
      el.size.value = Math.round(1000 * invLogLerp(ty.mass[0], ty.mass[1], p.M));
      el.speed.value = Math.round(1000 * invLogLerp(v0, v1, p.v));
    } else {
      el.size.value = Math.round(1000 * invLogLerp(ty.size[0], ty.size[1], p.L));
      el.speed.value = Math.round((1000 * (clamp(p.v, v0, v1) - v0)) / (v1 - v0));
      el.angle.value = p.angle;
      el.frags.value = p.frags || 1;
    }
    renderEstimate();
  }

  function renderEvoEstimate() {
    const rows = [
      ['+1.000 M años', 'Océanos de la Tierra evaporados'],
      ['+5.400 M años', 'Fin del hidrógeno: subgigante'],
      ['+7.590 M años', 'Gigante roja: 256 R☉, 2.700 L☉'],
      ['Después', 'Destello de helio y rama asintótica'],
      ['+7.735 M años', 'Nebulosa planetaria'],
      ['Final', 'Enana blanca de 0,54 M☉'],
    ];
    el.estimate.innerHTML = rows.map(([k, v]) => `<div class="row-kv"><span>${k}</span><span>${v}</span></div>`).join('')
      + '<div class="verdict" style="background:#ffb54733;border:1px solid #ffb54799">El destino real del Sol'
      + '<small>Animación de ~75 s con modelos de evolución estelar. Al perder masa, las órbitas se alejan; '
      + 'aun así Mercurio, Venus y probablemente la Tierra son engullidos. Mientras corre, la fecha muestra la edad del Sol.</small></div>';
  }

  function renderSNEstimate(P) {
    const A = analyzeSN(P);
    el.sizeOut.textContent = `${sci(P.E)} J`;
    el.speedOut.textContent = `${fmtNum(P.fej * 100, 0)} % (${fmtNum(P.fej, 2)} M☉)`;
    const tTo = (au) => fmtDur((au * AU_KM) / A.vmean);
    const rows = [
      ['Velocidad de la eyecta', `~${fmtNum(A.vrms, 0)} km/s`],
      ['Llega a la Tierra en', tTo(1)],
      ['Llega a Neptuno en', tTo(30.07)],
      ['Brillo máximo', `~${sci(A.Lpeak)} × el Sol`],
      ['Órbitas', P.fej > 0.5 ? 'Dejan de estar ligadas' : 'Siguen ligadas (más alargadas)'],
    ];
    const destroyed = A.fates.filter((f) => f.q >= 1).map((f) => f.b.name);
    const melted = A.fates.filter((f) => f.q < 1 && f.q >= 1e-3).map((f) => f.b.name);
    const mild = A.fates.filter((f) => f.q < 1e-3).map((f) => f.b.name);
    const list = (t, arr) => (arr.length ? `<div><b>${t}:</b> ${arr.join(', ')}</div>` : '');
    const [label, color, desc] = CATS.supernova;
    el.estimate.innerHTML = rows.map(([k, v]) => `<div class="row-kv"><span>${k}</span><span>${v}</span></div>`).join('')
      + `<div class="fates">${list('Se desintegran', destroyed)}${list('Fundidos o sin atmósfera', melted)}${list('Daño menor', mild)}</div>`
      + `<div class="verdict" style="background:${color}33;border:1px solid ${color}99">${label}<small>${desc(A)}</small></div>`;
  }

  function refreshTargets() {
    const cur = el.target.value;
    el.target.innerHTML = '';
    for (const [label, list] of [['Estrella', [SUN]], ['Planetas', PLANETS], ['Planetas enanos', DWARFS]]) {
      const g = document.createElement('optgroup');
      g.label = label;
      for (const b of list) {
        const o = new Option(b.destroyed ? `${b.name} (destruido)` : b.name, b.name);
        o.disabled = !!b.destroyed;
        g.appendChild(o);
      }
      el.target.appendChild(g);
    }
    el.target.value = cur || 'Tierra';
    renderEstimate();
  }

  function renderEstimate() {
    const P = readParams();
    if (!P.target) return;
    if (P.type === 'sn') return renderSNEstimate(P);
    if (P.type === 'evo') return renderEvoEstimate();
    const A = analyze(P);
    const bh = P.type === 'bh';
    el.sizeOut.textContent = bh ? `${sci(P.mass)} kg` : fmtLen(P.L);
    el.speedOut.textContent = `${fmtNum(P.v, P.v < 10 ? 1 : 0)} km/s`;
    el.angleOut.textContent = `${P.angle}°`;
    el.fragsOut.textContent = String(P.frags);
    const rows = [];
    if (bh) {
      rows.push(['Equivale a', massEquiv(P.mass)], ['Horizonte de sucesos', fmtLen(A.rs)], ['Radio de marea', `${fmtNum(A.rt, 0)} km`]);
      if (!A.tde) rows.push(['Energía depositada', `${sci(A.E)} J`], ['Materia tragada', `~${sci(A.accreted)} kg`], ['Energía / ligadura', sci(A.q)]);
      if (A.cat === 'solarpass') rows.push(['Brillo solar equivalente', fmtDur(A.Ls)], ['¿Queda atrapado?', A.captured ? 'Sí' : 'No']);
    } else {
      rows.push(['Masa', `${sci(A.mass)} kg`], ['Energía', `${sci(A.E)} J`], ['Equivalente', equiv(A.E)]);
      if (['local', 'regional', 'extinction'].includes(A.cat)) rows.push(['Cráter', `~${fmtLen(A.crater * 1e3)}`]);
      if (A.cat === 'solar') rows.push(['Brillo solar equivalente', fmtDur(A.Ls)]);
      rows.push(['Energía / ligadura', sci(A.qf)]);
    }
    const [label, color, desc] = CATS[A.cat];
    let text = desc(A);
    if (A.bhPass && P.target.type !== 'sun') text = `Atraviesa el planeta (menos masivo que él). ${text}`;
    el.estimate.innerHTML = rows.map(([k, v]) => `<div class="row-kv"><span>${k}</span><span>${v}</span></div>`).join('')
      + `<div class="verdict" style="background:${color}33;border:1px solid ${color}99">${label}<small>${text}</small></div>`;
  }

  function refreshLabUI() {
    const P = readParams();
    const busy = isBusy();
    const evo = P.type === 'evo';
    el.launch.disabled = busy || !P.target || (!evo && !!P.target.destroyed);
    el.launch.textContent = state.evo && !state.evo.finished ? '⏳ Evolución en curso…'
      : busy ? '⏳ Impacto en curso…' : evo ? '▶ Ver evolución' : '🚀 Lanzar';
  }

  for (const p of PRESETS) el.preset.appendChild(new Option(p.name, p.name));
  el.preset.addEventListener('change', () => {
    const p = PRESETS.find((x) => x.name === el.preset.value);
    if (p) applyPreset(p);
  });
  el.seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    setType(b.dataset.type);
    el.preset.value = '';
    renderEstimate();
  });
  for (const input of [el.size, el.speed, el.angle, el.frags]) {
    input.addEventListener('input', () => { el.preset.value = ''; renderEstimate(); });
  }
  el.target.addEventListener('change', () => { el.preset.value = ''; renderEstimate(); });
  el.launch.addEventListener('click', launch);
  el.reset.addEventListener('click', resetSystem);

  refreshTargets();
  applyPreset(PRESETS[2]);
  el.preset.value = PRESETS[2].name;
  refreshLabUI();

  // Enlace compartible a un escenario: index.html#escenario=N lo abre y lo lanza.
  const shared = /^#escenario=(\d+)/.exec(location.hash);
  if (shared && PRESETS[+shared[1]]) {
    const p = PRESETS[+shared[1]];
    document.querySelector('.tabs button[data-tab="lab"]').click();
    applyPreset(p);
    el.preset.value = p.name;
    setTimeout(launch, 600);
  }

  return {
    dyn,
    // Fuente de luz si el Sol fue destruido: el disco de acreción del agujero negro.
    lightSource: () => state.bhs[0] || null,
    hudOverride,
    timeScale,
    advance,
    update(dt, dDays) { lastDays = dDays; update(dt); },
    drawSurface,
    drawAfter,
    drawBody,
    drawOverlay,
    drawTrails,
  };
})();
