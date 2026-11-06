'use strict';

/* =========================================================================
 * Vía Láctea: capa que aparece al alejar mucho la cámara.
 *
 * Usa su propia escala, lineal y real: 10 unidades de escena por año luz.
 * A esa escala el sistema solar (dibujado con distancias comprimidas) queda
 * reducido a un punto. La orientación es la real: el plano galáctico está
 * inclinado ~60° respecto de la eclíptica y el centro galáctico queda hacia
 * Sagitario, a ~26.000 años luz.
 *
 * Estructura: espiral barrada con 4 brazos logarítmicos (inclinación ~12°),
 * el brazo local de Orión, bulbo, barra, disco difuso y cúmulos globulares.
 * ========================================================================= */

const Galaxy = (() => {
  const LY = 10;                 // unidades de escena por año luz (solo en esta capa)
  const R0 = 26000 * LY;         // distancia del Sol al centro galáctico
  const TANP = Math.tan(12 * DEG); // inclinación de los brazos espirales
  const MAX_DIST = 2.6e6;

  const N = GAL_N;                                        // normal del plano galáctico
  const GX = { x: -GAL_GC.x, y: -GAL_GC.y, z: -GAL_GC.z }; // del centro galáctico hacia el Sol
  const GY = { x: N.y * GX.z - N.z * GX.y, y: N.z * GX.x - N.x * GX.z, z: N.x * GX.y - N.y * GX.x };
  const C = { x: GAL_GC.x * R0, y: GAL_GC.y * R0, z: GAL_GC.z * R0 };

  const rnd = mulberry32(7731);
  const g = () => { let u = 0; while (!u) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rnd()); };

  // [color RGB, opacidad, tamaño en píxeles]
  const COLORS = [
    ['255,214,160', 0.5, 1.6],  // 0 bulbo y barra: estrellas viejas, amarillentas
    ['170,200,255', 0.45, 1.4], // 1 brazos: estrellas jóvenes, azuladas
    ['235,238,255', 0.4, 1.3],  // 2 estrellas blancas
    ['255,120,175', 0.75, 1.8], // 3 nebulosas de emisión (regiones H II)
    ['220,205,190', 0.22, 1.2], // 4 disco difuso
    ['255,236,200', 0.85, 2.4], // 5 cúmulos globulares del halo
  ];
  const lists = COLORS.map(() => []);

  // Punto en coordenadas galactocéntricas (u hacia el Sol, v en el plano, h sobre el plano), en años luz.
  function add(k, u, v, h) {
    lists[k].push(
      C.x + (u * GX.x + v * GY.x + h * N.x) * LY,
      C.y + (u * GX.y + v * GY.y + h * N.y) * LY,
      C.z + (u * GX.z + v * GY.z + h * N.z) * LY,
    );
  }
  const addPolar = (k, r, th, h) => add(k, r * Math.cos(th), r * Math.sin(th), h);

  // Brazos: θ(r) = φ + ln(r/R0)/tan(pitch). Las fases dejan al Sol entre Perseo (afuera)
  // y Sagitario-Carina (adentro), como en la Vía Láctea real.
  const PHI0 = -Math.log(1.18) / TANP;
  const ARMS = [
    { name: L('Perseus Arm', 'Brazo de Perseo'), phi: PHI0 },
    { name: L('Sagittarius–Carina Arm', 'Brazo de Sagitario-Carina'), phi: PHI0 + Math.PI / 2 },
    { name: L('Scutum–Centaurus Arm', 'Brazo de Escudo-Centauro'), phi: PHI0 + Math.PI },
    { name: L('Norma Arm', 'Brazo de Norma'), phi: PHI0 + 1.5 * Math.PI },
  ];
  const R0LY = R0 / LY;
  const armTheta = (arm, r) => arm.phi + Math.log(r / R0LY) / TANP;

  (function build() {
    for (const arm of ARMS) {
      for (let i = 0; i < 4200; i++) {
        const r = Math.exp(Math.log(9000) + (Math.log(55000) - Math.log(9000)) * Math.pow(rnd(), 0.8));
        const th = armTheta(arm, r) + g() * 0.05;
        const rr = r + g() * (900 + 0.03 * r);
        const h = g() * (200 + 0.006 * r);
        const p = rnd();
        addPolar(p < 0.55 ? 1 : p < 0.85 ? 2 : p < 0.93 ? 3 : 2, rr, th, h);
      }
    }
    // Brazo (espolón) de Orión: el tramo local donde está el Sol.
    for (let i = 0; i < 1800; i++) {
      const th = -0.4 + 0.9 * rnd();
      const r = R0LY * (1.01 + 0.12 * th) + g() * 650;
      const p = rnd();
      addPolar(p < 0.55 ? 1 : p < 0.9 ? 2 : 3, r, th, g() * 220);
    }
    // Barra central, inclinada ~27° respecto de la línea Sol-centro.
    const tb = 27 * DEG;
    for (let i = 0; i < 4000; i++) {
      const along = Math.max(-16000, Math.min(16000, g() * 7000));
      const across = g() * 1800;
      add(0, along * Math.cos(tb) - across * Math.sin(tb), along * Math.sin(tb) + across * Math.cos(tb), g() * 1200);
    }
    // Bulbo achatado.
    for (let i = 0; i < 2500; i++) add(0, g() * 3000, g() * 3000, g() * 1800);
    // Disco difuso exponencial (escala ~11.000 años luz).
    for (let i = 0; i < 9000; i++) {
      const r = Math.min(60000, -Math.log(1 - rnd() * 0.999) * 11000);
      addPolar(4, r, rnd() * TAU, g() * 350);
    }
    // Cúmulos globulares en el halo esférico.
    for (let i = 0; i < 60; i++) {
      const r = 3000 + Math.pow(rnd(), 1.5) * 60000;
      const d = { x: g(), y: g(), z: g() };
      const l = Math.hypot(d.x, d.y, d.z) || 1;
      add(5, (d.x / l) * r, (d.y / l) * r, (d.z / l) * r);
    }
  })();
  const POS = lists.map((l) => new Float32Array(l));

  // Etiquetas: posición en años luz (galactocéntrica) y texto.
  const polarPos = (r, th) => ({ u: r * Math.cos(th), v: r * Math.sin(th) });
  const LABELS = [
    { ...polarPos(0, 0), text: L('Galactic center · Sagittarius A*', 'Centro galáctico · Sagitario A*') },
    { ...polarPos(R0LY * 1.03, 0.32), text: L('Orion Arm (local)', 'Brazo de Orión (local)') },
    ...ARMS.map((arm) => {
      // Un punto del brazo a ~-1,1 rad, a un radio visible.
      let th = -1.1, r = R0LY * Math.exp((th - arm.phi) * TANP);
      while (r < 14000) { th += TAU; r = R0LY * Math.exp((th - arm.phi) * TANP); }
      while (r > 50000) { th -= TAU; r = R0LY * Math.exp((th - arm.phi) * TANP); }
      return { ...polarPos(r, th), text: arm.name };
    }),
  ].map((l) => ({
    text: l.text,
    x: C.x + (l.u * GX.x + l.v * GY.x) * LY,
    y: C.y + (l.u * GX.y + l.v * GY.y) * LY,
    z: C.z + (l.u * GX.z + l.v * GY.z) * LY,
  }));

  const MILKY_WAY = {
    name: L('Milky Way', 'Vía Láctea'),
    desc: L('Our galaxy: a barred spiral shown here to true scale in light-years. At this scale the whole Solar System is a single point.',
      'Nuestra galaxia: una espiral barrada vista aquí a escala real en años luz. A esta escala todo el sistema solar es un punto.'),
    facts: L([
      ['Diameter', '~100,000 light-years'], ['Stars', '100 – 400 billion'],
      ['Sun – center distance', '~26,000 light-years'], ['Sun’s orbit (galactic year)', '~230 million years'],
      ['Sun’s speed', '~230 km/s'], ['Central black hole', 'Sagittarius A* (~4 million M☉)'],
    ], [
      ['Diámetro', '~100.000 años luz'], ['Estrellas', '100.000 – 400.000 millones'],
      ['Distancia Sol – centro', '~26.000 años luz'], ['Vuelta del Sol (año galáctico)', '~230 millones de años'],
      ['Velocidad del Sol', '~230 km/s'], ['Agujero negro central', 'Sagitario A* (~4 millones de M☉)'],
    ]),
  };

  /* ----------------------------- Cámara -------------------------------- */
  const smooth01 = (x) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
  const logStep = (a, b, d) => smooth01((Math.log(d) - Math.log(a)) / (Math.log(b) - Math.log(a)));
  // Opacidad de la galaxia y desplazamiento del centro de giro según la distancia de la cámara.
  const visibility = () => logStep(6e3, 6e4, cam.dist);
  const pivotWeight = () => logStep(1.5e5, 1.0e6, cam.dist);

  let flight = null;
  let saved = null;
  const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  function fly(d1, yaw1, pitch1, dur, onEnd) {
    flight = {
      t: 0, dur, onEnd, d0: cam.dist, d1,
      y0: cam.yaw, y1: cam.yaw + wrapAngle(yaw1 - cam.yaw), p0: cam.pitch, p1: pitch1, lastSet: cam.tdist,
    };
  }

  function updateCamera(dt) {
    if (flight) {
      // Cualquier zoom o arrastre del usuario cancela el vuelo.
      if (drag.active || Math.abs(cam.tdist - flight.lastSet) > 1) flight = null;
      else {
        flight.t = Math.min(1, flight.t + dt / flight.dur);
        const e = ease(flight.t);
        cam.yaw = flight.y0 + (flight.y1 - flight.y0) * e;
        cam.pitch = flight.p0 + (flight.p1 - flight.p0) * e;
        cam.tdist = cam.dist = Math.exp(Math.log(flight.d0) + (Math.log(flight.d1) - Math.log(flight.d0)) * e);
        flight.lastSet = cam.tdist;
        if (flight.t >= 1) { const f = flight; flight = null; if (f.onEnd) f.onEnd(); }
      }
    }
    const w = pivotWeight();
    cam.ox = (C.x - cam.tx) * w;
    cam.oy = (C.y - cam.ty) * w;
    cam.oz = (C.z - cam.tz) * w;
    const far = cam.dist > 2e5;
    if (btn && btn.dataset.far !== String(far)) {
      btn.dataset.far = String(far);
      btn.textContent = far ? L('☀ Back to the Solar System', '☀ Volver al Sistema Solar') : T('galaxy.go');
    }
  }

  // Vuelo de ida (vista desde arriba del disco, con el Sol en primer plano) o de vuelta.
  function toggle() {
    if (cam.dist > 2e5) {
      const back = saved || { yaw: -0.6, pitch: 0.48 };
      fly(950, back.yaw, back.pitch, 4, () => resetView());
      return;
    }
    saved = { yaw: cam.yaw, pitch: cam.pitch };
    resetView();
    // Dirección de vista: hacia abajo del plano galáctico y hacia el centro.
    let fx = -N.x - 0.5 * GX.x, fy = -N.y - 0.5 * GX.y, fz = -N.z - 0.5 * GX.z;
    const l = Math.hypot(fx, fy, fz);
    fx /= l; fy /= l; fz /= l;
    const pitch = Math.max(-1.45, Math.min(1.45, Math.asin(-fy)));
    fly(1.5e6, Math.atan2(fx, fz), pitch, 5, () => showInfo(MILKY_WAY));
  }

  /* ------------------------------ Dibujo -------------------------------- */
  function draw() {
    const vis = visibility();
    if (vis < 0.01) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // Resplandor del bulbo central.
    toView(C.x, C.y, C.z);
    if (V.z > NEAR) {
      const s = focal / V.z, px = cx + V.x * s, py = cy - V.y * s, R = 9000 * LY * s;
      if (R > 2) {
        const gr = ctx.createRadialGradient(px, py, 0, px, py, R);
        gr.addColorStop(0, `rgba(255,225,180,${0.45 * vis})`);
        gr.addColorStop(0.35, `rgba(255,200,150,${0.15 * vis})`);
        gr.addColorStop(1, 'rgba(255,180,120,0)');
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(px, py, R, 0, TAU); ctx.fill();
      }
    }
    for (let k = 0; k < COLORS.length; k++) {
      const [rgb, a, size] = COLORS[k], P = POS[k], h = size / 2;
      ctx.fillStyle = `rgba(${rgb},${a * vis})`;
      ctx.beginPath();
      for (let i = 0; i < P.length; i += 3) {
        toView(P[i], P[i + 1], P[i + 2]);
        if (V.z < NEAR) continue;
        const s = focal / V.z, sx = cx + V.x * s, sy = cy - V.y * s;
        if (sx < -2 || sy < -2 || sx > W + 2 || sy > H + 2) continue;
        ctx.rect(sx - h, sy - h, size, size);
      }
      ctx.fill();
    }
    ctx.restore();
  }

  function drawLabels() {
    const vis = visibility();
    if (vis < 0.3) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, (vis - 0.3) / 0.4);
    ctx.font = '12px Consolas, "Cascadia Mono", Menlo, "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    // Mismo verde fluorescente que los nombres del sistema solar.
    ctx.shadowColor = `rgba(${LABEL_GREEN},0.7)`;
    ctx.shadowBlur = 6;
    ctx.fillStyle = `rgba(${LABEL_GREEN},0.9)`;
    for (const l of LABELS) {
      toView(l.x, l.y, l.z);
      if (V.z < NEAR) continue;
      const s = focal / V.z;
      ctx.fillText(l.text, cx + V.x * s, cy - V.y * s - 6);
    }
    // El Sistema Solar: marca destacada.
    toView(SUN.x, SUN.y, SUN.z);
    if (V.z > NEAR) {
      const s = focal / V.z, px = cx + V.x * s, py = cy - V.y * s;
      ctx.strokeStyle = `rgb(${LABEL_GREEN})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(px, py, 7, 0, TAU); ctx.stroke();
      ctx.fillStyle = `rgb(${LABEL_GREEN})`;
      ctx.beginPath(); ctx.arc(px, py, 2, 0, TAU); ctx.fill();
      ctx.font = 'bold 12px Consolas, "Cascadia Mono", Menlo, "Courier New", monospace';
      ctx.fillText(L('☀ Solar System — you are here', '☀ Sistema Solar — estás aquí'), px, py - 10);
    }
    ctx.restore();
  }

  const btn = document.getElementById('galaxy-btn');
  if (btn) btn.addEventListener('click', toggle);

  // Enlace directo: index.html#galaxia abre la vista de la Vía Láctea sin animación.
  if (location.hash === '#galaxia') {
    toggle();
    const f = flight;
    flight = null;
    cam.yaw = f.y1; cam.pitch = f.p1;
    cam.tdist = cam.dist = f.d1;
    cam.blend = 1;
    showInfo(MILKY_WAY);
  }

  return { MAX_DIST, visibility, updateCamera, draw, drawLabels, toggle };
})();
