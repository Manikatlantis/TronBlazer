# **TronBlazer**
## ***World's Best Three.js Tron Game***

***TronBlazer*** is a neon time-trial racer inspired by the **TRON lightcycle** scenes - built with **Three.js**, custom **GLSL shaders**, post-processing **bloom**, a lap + gate system, **ghost replay**, **Nitro Orbs**, **AI riders**, trail collisions, and crash feedback with **explosions**.

## **Play Here -** https://manikatlantis.github.io/TronBlazer/
> I used AI tooling during development, but the project architecture, gameplay systems, and implementation decisions are my own.
---

## 🎥 Demo
I also cut a short intro video using the phonk track **"Estou Livre"** that I use when presenting the project for my CS460 Class at UMass Boston. This is one of the older versions at the time - https://vimeo.com/1144625468

---

## 🚀 Core Gameplay
- **Neon lightcycle** with hover + lean for an arcade feel  
- **Constant forward motion** with smooth turning (tight but controllable)  
- **TRON trail system** that grows behind the bike and becomes a hazard  
- **HP (Health Points)** — collisions reduce HP, and reaching zero triggers a crash flow  
- **Nitro Orbs** to refill boost meter + **Shift** boost for speed bursts  
- **AI riders** (bots) that move in the arena and add pressure + trail threats  
- **Lap system** with a measured gate, direction validation, and minimum lap time protection  
- **Ghost replay** that records your best lap and replays it as a neon ghost bike  
- **Explosion** and crash overlay feedback (restart/reset loop)

---

## 🕹 Controls

| Key | Action |
|---|---|
| **A** or **←** | Turn left |
| **D** or **→** | Turn right |
| **Shift (hold)** | Boost (consumes Nitro while Nitro > 0) |
| **SPACE** | Start countdown / restart after crash |
| **R** | Reset to spawn and go back to Ready |
| **V** | Toggle Chase vs Cinematic camera |
| **C** | Toggle free OrbitControls debug camera |
| **P** | Log bike position to console (debug) |

---

## 🎮 Game States
- **Ready**: bike at spawn, overlay shows start instructions  
- **Countdown**: 3 / 2 / 1 / GO appears near the gate  
- **Playing**: movement, laps, trails, orbs, bots, HP all active  
- **Crashed**: overlay prompts restart/reset (and crash VFX triggers)

---


## 🧩 How It Works (Systems + Implementation)

### 1) Arena + World Bounds (GLTF)
The arena is loaded using `GLTFLoader` from a downloaded model (credited in `credits.txt`).  
After load:
- the arena is scaled/positioned so the floor sits near `y = 0`
- a `THREE.Box3` is computed around the arena
- the XZ half-sizes are used to keep the bike inside the playable area via a simple wall collision check

> This makes the arena constraints resilient even if the model scale changes.

---

### 2) Track + Lane Constraints
The track centerline is defined in `tracks.js` as an array of `[x, z]` points.  
Those points are converted into `THREE.Vector2` and cached in `trackPoints`.  
From there, segment lengths + helpers are precomputed so the game can:
- sample points along the track (for orb spawns and tuning)
- compute “closest point on track” corrections
- constrain movement inside a `TRACK_HALF_WIDTH` corridor with a soft “push back / bounce” feel

---

### 3) Bike Movement (Hover + Lean + Smooth Steering)
Every frame (while `PLAYING`):
- forward direction is derived from the bike’s quaternion
- forward movement is applied: `pos += forwardDir * forwardSpeed * dt`
- turning applies yaw changes: `rotation.y += turnDir * TURN_SPEED * dt`
- roll/lean is applied on the Z axis based on input using smoothing (arcade lean)
- hover uses a small sine offset in Y for floating

Useful knobs:
- `forwardSpeed` - overall pace  
- `TURN_SPEED` - steering strength  
- `MAX_LEAN` + `LEAN_SMOOTH` — corner feel  

---

### 4) TRON Trail (TubeGeometry + GLSL Shader)
This is the signature system.

**Geometry**
- The trail samples bike positions over time.
- A smooth curve is built (commonly via `CatmullRomCurve3`).
- The visible trail is generated using **`THREE.TubeGeometry`** along that curve.

**Shader (GLSL)**
The trail uses a `ShaderMaterial` with animated energy flow:
- **Fresnel glow** so edges are hotter at grazing angles  
- **UV warping** so energy “moves” through the tube  
- **Core/edge band masks** for a layered neon look  
- **Age-based fade** so older trail segments become transparent  

Common uniforms include:
- `uTime` (animation)
- `uColorCore` / `uColorEdge` (palette)
- `uOpacity`
- `uFadePower` (tail fade behavior)

---

### 5) Trail Collisions
The trail is not just visual, it becomes gameplay:
- colliding with your own trail counts as a crash / damage event
- bots’ trails can also be hazards depending on mode
- trail collision checks are done by comparing the bike position against the trail representation (sampled segments / radius checks)

---

### 6) HP (Health) + Damage
The game tracks HP continuously:
- collisions (trail / walls / riders) reduce HP
- HUD reflects current HP status
- when HP hits `0`, the game transitions into the crash flow (overlay + explosion + restart options)

---

### 7) Nitro Orbs (Collectibles + Boost)
Nitro Orbs:
- are spawned along the track by sampling random positions along track length
- use emissive neon + animation (spin + pulse)
- refill the Nitro bar when collected

Boost:
- hold **Shift** to boost speed while `Nitro > 0`
- Nitro drains during boost and stops when empty or on release

> The orb model is downloaded and credited in `credits.txt`.

---

### 8) AI Riders (Bots)
AI bikes (“bots”) roam the arena to add pressure:
- they follow a track-based strategy (centerline following + steering corrections)
- their movement is tuned to feel like riders in the same world (not random cubes)
- they create additional collision risk and increase difficulty through positioning and timing

---

### 9) Crash Feedback (Explosion + UI)
When a crash occurs (trail hit / HP reaches zero / major collision):
- gameplay transitions to `CRASHED`
- a crash overlay appears with restart instructions
- an **explosion effect** triggers near the bike (flash/particles/bloom pop depending on implementation)
- user can restart/reset using the controls displayed in the overlay

---

### 10) Start Gate + Lap Timing
The start gate is defined using measured world-space points:
- `GATE_POINTS` define a rectangle range
- a plane is defined using `(gatePlanePoint, gatePlaneNormal)`
- crossing is detected when the sign of `(bikePos - gatePlanePoint) · gatePlaneNormal` flips
- direction validation uses a dot check between bike forward direction and `START_FORWARD_DIR`

Lap timing:
- valid crossings finalize lap time
- laps shorter than `MIN_VALID_LAP_TIME` are ignored to prevent tiny-loop exploits
- best lap is stored and displayed on HUD

---

### 11) Ghost Replay (Record + Playback + Ghost Trail)
Ghost replay records your **best lap** and replays it on future laps.

**Recording**
During a lap, the game samples frames every `GHOST_SAMPLE_INTERVAL`:
- time `t`
- position `pos`
- yaw rotation `rotY`

**Saving**
When a lap becomes a new record:
- the sampled frames are deep-copied into the “best ghost”
- HUD shows a **New Record** flash

**Playback**
During future laps:
- ghost time `ghostT` comes from current lap timer
- the game finds the two ghost frames surrounding `ghostT`
- position + rotation are interpolated for smooth replay

**Ghost trail**
- best ghost positions are converted into a curve
- a separate **TubeGeometry** trail is generated
- a theme map controls ghost colors

Example theme map:
```js
const GHOST_THEMES = {
  cyan:   { body: 0x00ffff, edge: 0x00ffff },
  magenta:{ body: 0xff00ff, edge: 0xff66ff },
  gold:   { body: 0xffd54f, edge: 0xfff3c0 },
  lime:   { body: 0xa6ff00, edge: 0xe1ff66 },
  orange: { body: 0xff6b00, edge: 0xffb066 },
  iceBlue:{ body: 0x66ccff, edge: 0xccf3ff },
};
```
---

## 12) Cameras (Chase + Cinematic + Debug)

### **Chase camera**
- Classic behind-and-above view
- Uses a bike-local offset transformed into world space
- Smoothed every frame using **lerp** so motion feels stable and “game-like”

### **Cinematic camera**
- Orbits around the **front side** of the bike for dramatic shots
- Slowly varies **radius**, **height**, and **FOV** over time (soft dolly/crane feel)
- Still aims slightly ahead of the bike to keep framing consistent

### **Debug camera**
- Free camera for tuning/testing
- Uses **OrbitControls** so you can rotate/zoom around the bike

**Toggle keys**
- Press `V` to switch **Chase ↔ Cinematic**
- Press `C` to enable/disable **free OrbitControls debug camera**

---

## 13) Post Processing (Neon Look)

The neon look is created using a post-processing pipeline:
- **EffectComposer**
- **RenderPass**
- **UnrealBloomPass**
- Filmic tone mapping + correct output encoding (**sRGB**)

---

## 🏗 Requirements
- **Node.js 18+**
- **npm** or **yarn**
- Modern browser with **WebGL** support

---

## 🧪 Getting Started (Local)

Clone + install:
```bash
git clone https://github.com/Manikatlantis/TronBlazer.git
cd TronBlazer
npm install
npm run dev
```
Open the local URL printed by Vite (usually http://localhost:5173), then press Q to start.

Build:
```bash
npm run build
npm run preview
```

## Project Structure
```bash
.
├── node_modules
├── public
│   └── models
│       ├── arena2
│       ├── lightcycle.glb
│       ├── energy_flash.glb
│       └── ... (other unused .glb files)
│   └── audio
│       ├── tron_bgm.mp3
│       ├── ... (Other audio files)
├── src
│   └── audio.js
│   └── counter.js
│   └── environment.js
│   └── main.js
│   └── style.css
│   └── track_bounds.js
│   └── tracks.js
├── .gitignore
├── package.json
├── index.html
├── package.json
├── package-lock.json
├── README.md
├── credits.txt
```
Expected model paths (update if you move assets)
``` js
loader.load("/models/lightcycle.glb", ...)
loader.load("/models/arena2/scene.gltf", ...)

```







## Core gameplay

- Neon lightcycle with hover and lean
- Constant forward speed with smooth turning
- Bike leans into corners for a more arcade feel

## Tron style trail

- Custom GLSL shader with flowing energy effect
- Trail fades out based on age
- Colliding with your own trail counts as a crash

## Sci fi arena

- GLTF arena model loaded with GLTFLoader
- Arena bounds computed from the model so the bike cannot escape
- Rim lights at corners to give a clean silhouette

## Lap system

- Invisible start gate built from measured track points
- Crossing the gate in the correct direction increments the lap
- Lap timer and best lap tracking
- Laps shorter than a minimum time are ignored so tiny loops do not count

## Ghost replay

- While you race, position and rotation are sampled every few frames
- A best lap ghost is saved when you set a new record
- Ghost bike replays your best path on future laps
- Separate neon ghost trail shows the full line of the record lap
- Ghost colors can be changed with a small theme map

## Cameras (toggled by 'v')

- Chase camera - classic behind and above view
- Cinematic camera - orbits the bike on the front side with slow radius, height and FOV changes

## HUD and UI

- Lap count
- Speed display
- Current lap time
- Best lap time
- "New Record" flash when you beat your best time
- Overlay messages for ready, countdown and crash states

## Post processing

- UnrealBloomPass for neon glow
- ACES filmic tone mapping
- sRGB output encoding

## Controls
### Key	Action
A or ←	Turn left
D or →	Turn right
Q	Start countdown or restart after crash
R	Reset to spawn and go back to ready
C	Toggle free OrbitControls debug camera
V	Toggle Chase vs Cinematic camera mode
P	Log bike position to the console (debug)

## Game states:

Ready: bike at spawn, overlay shows "Press Q to start"

Countdown: 3 / 2 / 1 / GO sprite appears near the gate

Playing: bike moves, laps and trails are active

Crashed: overlay tells you to press R or Q

## Requirements

Node.js 18 or newer

npm or yarn

Modern browser with WebGL support

## Getting started

Install dependencies:
```bash
git clone https://github.com/Manikatlantis/TronBlazer.git
cd TronBlazer
cd src
```
```bash
npm install
```

## Start the dev server:
```bash
npm run dev
```

Open the local URL that the dev server prints (usually something like http://localhost:5173).
You should see the arena and the bike. Press Q to start the countdown and ride.

## Build for production:
```bash
npm run build
npm run preview
```
## Project structure

Rough layout of the repo:
```bash
.
├── index.html
├── package.json
├── package-lock.json
├── README.md
├── public
│   └── models
│       ├── lightcycle.glb
│       └── arena2
│           └── scene.gltf
└── src
    ├── main.js
    ├── tracks.js
    ├── style.css
    └── ...
```

### The code currently expects the models at:

_loader.load("/models/lightcycle.glb", ...)
loader.load("/models/arena2/scene.gltf", ...)_


If you move the models or rename folders, update those paths in loadBike() and loadArena().

## How it works
### Core stack

**three** for rendering
**GLTFLoader** for loading the bike and arena
**EffectComposer**, **RenderPass**, **UnrealBloomPass** for bloom and post processing
**OrbitControls** for the debug camera
Everything is wired up in **src/main.js** using ES modules.

## Track and arena

- Track centerline is defined in **tracks.js** as an array of **[x, z]** points.
- These are turned into **Vector2** objects and cached in **trackPoints**.
- From those, **trackSegments2D** are precomputed so the game can:
- Keep the bike inside a half width
- Push the bike back in with a "bounce" effect when it goes too far out

## Arena:

- The GLTF arena is loaded and scaled so the floor is around **y = 0**.
- A **Box3** around the arena gives the world size in XZ.
- Those sizes are used as **ARENA_HALF_SIZE_X** and **ARENA_HALF_SIZE_Z**.
- A simple wall collision chek prevents the bike from leaving the arena.

## Bike movement and leaning
### Every frame:

- Forward direction is computed from the bike quaternion.
- When **gameState** is PLAYING, the bike moves by **forwardDir * forwardSpeed * dt**.
- **A** and **D** change **bike.rotation.y** for turning.
- Roll is applied on the Z axis based on input using **MAX_LEAN** and **LEAN_SMOOTH**.
- A small sine is added to bike.position.y for hovering.

Useful constants to tweak:
```bash
const forwardSpeed = 800;          // units per second
const MAX_LEAN = 0.5;              // radians
const LEAN_SMOOTH = 0.04;          // interpolation factor
const TURN_SPEED = Math.PI * 0.5;  // radians per second
```

## Start gate and lap timing

- **GATE_POINTS** is a set of measured world space points across the start line.
- From those, a bounding rectangle is built and stored as gateMinX, gateMaxX, **gateMinZ**, gateMaxZ.
- A plane is defined using a center point (**gatePlanePoint**) and a normal (**gatePlaneNormal**).

### When the bike is near the gate:

- The sign of (bikePos - gatePlanePoint) dot gatePlaneNormal tells which side of the gate you are on.
- If that sign flips between frames and the cooldown has passed, you crossed the gate.
- The bike forward direction is dotted with START_FORWARD_DIR to check if you are going the proper way.

### Lap timing:

- On a valid crossing, the current lap time is finished and compared with **bestLapTime**.
- Laps shorter than **MIN_VALID_LAP_TIME** are ignored.
- If it is a new record, HUD flashes "New Record" and ghost data is updated.
- Lap count increments and a new lap timer starts.

## Ghost lap and ghost trail

### While you are playing a lap:

- currentLapFrames collects snapshots of:
- `t` (time since lap start)
- `pos` (world position)
- `rotY` (rotation around Y)
- Sampling happens every `GHOST_SAMPLE_INTERVAL` seconds.

### When a lap becomes the new best:

- `bestLapGhostFrames` is set to a deep copy of those frames.
- `ghostActive` becomes true.
- `ghostBike` is a clone of the main bike with a transparent neon material.

### During future laps:

- Current lap time gives `ghostT`.
- The code finds the two frames that bracket this time and interpolates position and rotation. 
- The ghost bike replays along your best path.

### Ghost trail:

- Once `bestLapGhostFrames` is ready, their positions are fed into a `CatmullRomCurve3`.
- A `TubeGeometry` is created on that curve.
- A clone of the player trail shader is used, with ghost colors and slightly different opacity.
- The trail is scaled to match the player trail style.

### Ghost colors are set at the top:
``` bash
const GHOST_THEMES = {
  cyan:   { body: 0x00ffff, edge: 0x00ffff },
  magenta:{ body: 0xff00ff, edge: 0xff66ff },
  gold:   { body: 0xffd54f, edge: 0xfff3c0 },
  lime:   { body: 0xa6ff00, edge: 0xe1ff66 },
  orange: { body: 0xff6b00, edge: 0xffb066 },
  iceBlue:{ body: 0x66ccff, edge: 0xccf3ff },
};

const ACTIVE_GHOST_THEME = GHOST_THEMES.lime;
```

Switch `ACTIVE_GHOST_THEME` to try different looks.

## Player trail shader

- The player trail is a `ShaderMaterial` with:
- Vertex shader that passes uv, world position and normal. 
- Fragment shader that:
- Computes a Fresnel term so edges glow more when viewed at a grazing angle. 
- Warps the V coordinate over time with sines so the trail looks like moving energy.
- Builds band masks so the center is softer and edges are hot. 
- Fades color and alpha with uFadePower based on age along the trail.
- Adds extra brightness near the "head" of the trail close to the bike.

### Uniforms:
``` bash
uniform float uTime;
uniform vec3  uColorCore;
uniform vec3  uColorEdge;
uniform float uOpacity;
uniform float uFadePower;
```

You can tune these in `createTrail()` if you want different colors or a longer or shorter tail.

## Cameras

### Chase mode

- Camera offset is defined in bike local space.
- It is transformed into world space and lerped toward each frame.
- Camera looks at a point slightly in front of the bike.

### Cinematic mode

- Uses `cinematicTime` to slowly rotate the camera around the front side of the bike.
- Radius, height and FOV change over time for a soft "dolly and crane" feel.
- Camera still looks slightly ahead of the bike so framing stays interesting.

`C` toggles a free debug camera that still uses OrbitControls around the bike.

## Customization

Some easy knobs to play with:

- `forwardSpeed` for overall pace
- `MAX_LEAN`, `TURN_SPEED` for handling
- `TRACK_HALF_WIDTH` in `tracks.js` to change lane width
- `ARENA_HALF_SIZE_X` and `ARENA_HALF_SIZE_Z` scaling in `loadArena()`
- Trail colors and fade behavior through `uColorCore`, `uColorEdge`, `uOpacity`, `uFadePower`
- Camera ofsets and FOV ranges

## Known limitations

- No in game menu yet, everything is controlled from the keyboard.
- Only one arena and one track are wired up right now.
- Track data lives in code, there is no track editor or selection screen.
