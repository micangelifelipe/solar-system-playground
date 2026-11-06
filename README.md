# 3D Solar System — Impact Lab

An interactive 3D simulation of the Solar System written in **plain JavaScript and Canvas 2D**: no frameworks, no libraries, no build step. It includes the planets and their main moons, dwarf planets, comets, the asteroid belt, Jupiter's Trojans and the Kuiper belt. It also includes an **impact laboratory** where you can hit planets (or the Sun) with meteors, asteroids, comets and black holes and watch how the system evolves over time. It can also turn the Sun into a hypothetical supernova or play back its real stellar evolution.

> Available in **English** (default) and **Spanish**. Switch with the **EN | ES** selector in the header, or open the Spanish version directly with `?lang=es`.

**▶ Live demo: [solar-simulation.pages.dev](https://solar-simulation.pages.dev/)**

## Running it

Use the live demo above, or open `index.html` in a modern browser (Chrome, Edge, Firefox or Safari). That's it: no server, no dependencies, no internet connection required.

The site is deployed on Cloudflare Pages from this GitHub repository. `robots.txt`, `sitemap.xml`, the canonical URL and the structured data all point to `https://solar-simulation.pages.dev/`.

## Features

### The Solar System

- **Sun, 8 planets and 11 moons** (Moon, Phobos, Deimos, Io, Europa, Ganymede, Callisto, Titan, Titania, Triton, Charon).
- **Real orbital data:** periods, inclinations and starting positions. The simulation starts at today's date.
- **Compressed distances and sizes** so that everything fits on screen. Distances use a piecewise-logarithmic scale.
- **Day/night lighting** from the Sun, so planets and moons show phases. Gas giants have cloud bands, Earth and Mars have polar caps, and Saturn and Uranus have rings that correctly pass behind and in front of the planet.
- **5 dwarf planets:** Ceres, Pluto, Haumea, Makemake and Eris.
- **7 comets:** Halley, Encke, 67P, Tempel-Tuttle, Swift-Tuttle, Hale-Bopp and NEOWISE. They follow elliptical Kepler orbits, and their ion and dust tails grow as they approach the Sun.
- **About 12,000 particles:**
  - an asteroid belt that shows the Kirkwood gaps;
  - Jupiter's L4/L5 Trojans;
  - the Kuiper belt.
- **Correct depth sorting** between bodies and particles, a starfield with a Milky Way band, labels, and info cards with live data.

### The Milky Way

Zoom far out (or press **G** / the "🌌 Ver la Vía Láctea" button) and the Solar System shrinks to a point inside the Milky Way, drawn to true scale in light-years:
- **Real orientation:** the galactic plane is tilted ~60° to the ecliptic, and the galactic center (Sagittarius A*) lies ~26,000 light-years away toward Sagittarius. The Milky Way band in the starfield uses the same plane, so as you zoom out it turns into the galaxy's disk.
- **Structure:** a barred spiral with four logarithmic arms (~12° pitch). The Sun sits in the local Orion arm, between the Perseus and Sagittarius–Carina arms. There is also a central bar and bulge, a diffuse disk, pink emission nebulae, and globular clusters in the halo.
- **Camera:** as you zoom out, the rotation pivot slides toward the galactic center.

### Impact laboratory (☄ Impactos tab)

| Projectile | What it does |
|---|---|
| **Meteor** (0.5–200 m) | Air bursts in planets with atmospheres (e.g. Tunguska, Chelyabinsk) |
| **Asteroid** (50 m–7,000 km) | From local craters up to complete planet destruction |
| **Comet** (0.3–200 km) | Low density, high speed; can split into several fragments, like Shoemaker-Levy 9 |
| **Black hole** (10¹⁵ kg–10 M☉) | Passes through the target, or tears it apart by tidal forces |
| **Supernova** | Hypothetical explosion of the Sun |
| **Sun's evolution** | Red giant → planetary nebula → white dwarf |

**How it works:**
- Before launching, you get an **estimate**: energy, TNT and Hiroshima/Chicxulub equivalents, crater size, and the expected outcome.
- The impact plays in **slow motion**. After that, time runs normally and an **"Evolución" log** narrates what happens next: crater cooling, impact winter, magma oceans, ring and moon formation, debris spreading along the orbit, accretion disks, ejected planets, and more.
- **"Restablecer sistema"** restores the original Solar System.

### Scenarios

Each scenario can be opened directly with `index.html#escenario=N`:

| N | Scenario |
|---|---|
| 0 | Chelyabinsk (2013) |
| 1 | Tunguska (1908) |
| 2 | Chicxulub — the end of the dinosaurs |
| 3 | An asteroid that boils the oceans |
| 4 | Theia — origin of the Moon |
| 5 | Destroy the Earth |
| 6 | Shoemaker-Levy 9 vs. Jupiter (1994) |
| 7 | A comet hits Mars |
| 8 | Destroy Ceres |
| 9 | A primordial black hole passes through the Earth |
| 10 | A Moon-mass black hole |
| 11 | A Jupiter-mass black hole: accretion disk |
| 12 | A stellar black hole (10 M☉) vs. Jupiter |
| 13 | A sungrazing comet falls into the Sun (Kreutz family) |
| 14 | A giant asteroid hits the Sun |
| 15 | A black hole trapped inside the Sun |
| 16 | A stellar black hole (10 M☉) tears the Sun apart |
| 17 | The Sun explodes as a supernova (hypothetical) |
| 18 | A weak supernova that ejects only 30% of the mass |
| 19 | The real evolution of the Sun: red giant → white dwarf |

You can also link straight to a body using its name in either language, e.g. `index.html#Saturn`, `index.html#Saturno` or `index.html#Halley`, or to the galaxy view with `index.html#galaxia`.

## Physics

The visuals are exaggerated, but the numbers behind them come from real physics:

- **Impact outcome.** The projectile's kinetic energy is compared with the planet's gravitational binding energy, *U = 3GM²/5R*. That ratio decides the result:

  | Ratio | Outcome |
  |---|---|
  | Lowest | Local crater |
  | ↓ | Regional devastation |
  | ↓ | Mass extinction |
  | ↓ | Global sterilization |
  | ↓ | Magma ocean |
  | ↓ | Partial disruption |
  | Highest | Total destruction |

  Gas giants get atmospheric scars instead of craters.
- **Crater size** follows the scaling laws of Collins, Melosh & Marcus (2005). **Air bursts** happen for small bodies in thick atmospheres.
- **Black holes:**
  - The tidal radius is *r_t = R·(M_bh/M_p)^(1/3)*. If the black hole is less massive than the planet, it passes through. It deposits energy by dynamical friction (Chandrasekhar) and swallows mass by Bondi–Hoyle accretion.
  - Otherwise the planet is tidally disrupted, and the debris splits into bound and unbound parts according to its orbital energy.
  - A black hole can get trapped inside the Sun. The time it would take to eat the Sun uses Eddington-limited growth.
- **N-body dynamics.** Once there is free debris or a black hole, everything is integrated numerically with a leapfrog scheme: planets, moons, comets and the belts. Osculating orbits are drawn as they change, and the log reports planets that are ejected or captured.
- **Ejecta near a planet** are simulated in a dimensionless local frame (length = planet radius, time = √(R³/GM)). After the slow-motion phase they become analytic Kepler orbits that slowly circularize, forming rings inside the Roche limit (~2.9 R) and new moons outside it. Escaping fragments are handed over to the heliocentric simulation.
- **Supernova (hypothetical).** The ejecta expand as a shell at ~√(2E/M).
  - Shell theorem: as the shell passes each body, the Sun's mass stops pulling on it.
  - Bodies also get pushed by the momentum they intercept and heated by the energy they intercept. This assumes ~10% coupling, which is an approximation.
  - The light curve rises over about a week, then decays like nickel-56 → cobalt (~111 days).
- **Stellar evolution.** Radius, luminosity and mass follow published models (Sackmann et al. 1993; Schröder & Smith 2008).
  - Planetary orbits expand as 1/M while the Sun loses mass.
  - A planet is engulfed when its orbit falls within ~1.3 solar radii; the extra margin stands in for tidal drag.
  - Equilibrium temperatures decide when surfaces melt and when the icy moons thaw.

### Known simplifications

- Planets and moons are drawn far larger than their true scale. Near-planet ejecta use that exaggerated scale and blend smoothly into the true heliocentric scale as they move away.
- Moon and ring formation use simple timescales instead of a full collision simulation.
- Planets don't attract each other; only the Sun and any black holes act as attracting masses.
- The supernova's energy coupling and the planetary nebula's on-screen expansion are artistic approximations.
- The Sun is far too small to ever go supernova. That scenario is labeled as hypothetical in the app.

## Controls

| Action | Input |
|---|---|
| Rotate | Drag |
| Zoom | Mouse wheel / pinch |
| Pan | Right-click drag or Shift+drag |
| Follow a body | Click on it |
| Pause | Space |
| Overview | Esc |
| Focus Sun / planets | Keys 0–8 |
| Milky Way view (toggle) | G |

## Project structure

| File | Contents |
|---|---|
| `index.html` | Page layout, side panel (View / Impacts tabs), info card and event log |
| `i18n.js` | Language selection (English by default, Spanish), static UI dictionary and the `L('English', 'Español')` helper used in the code |
| `style.css` | Dark, glass-style UI |
| `main.js` | Bodies and orbits, distance scale, 3D projection, rendering (spheres, rings, comets, particles), camera, input, main loop |
| `galaxy.js` | Milky Way layer: true-scale galaxy model, camera pivot and flight, galactic labels |
| `impacts.js` | Impact laboratory: physics, local and heliocentric debris, N-body integrator, black holes, supernova, stellar evolution, effects and lab UI |

`i18n.js` loads first and translates the static HTML. Then `main.js`, `galaxy.js` and `impacts.js` load in that order. Each later file exposes a single object (`Galaxy`, `Impacts`), and `main.js` calls them at fixed points.
- `Galaxy`: camera and drawing layers.
- `Impacts`: time scale, integration, per-frame update, surface effects, special bodies and the overlay.
