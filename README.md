# **TronBlazer**

Neon time trial racer in the style of the Tron lightcycle scenes, built with Three.js.
Ride a lightcycle inside a sci fi arena, leave a glowing trail behind you, and race your own ghost to beat your best lap.

_I also cut a short intro video with the phonk track "Estou Livre" that I use when presenting the project._

Repo
```bash
git clone https://github.com/Manikatlantis/TronBlazer.git
cd TronBlazer
```
## Core gameplay

- Neon lightcycle with hover and lean
- Constant forward speed with smooth turning
- Bike leans into corners for a more arcade feel


Glowing Tron style trail

Custom GLSL shader with flowing "energy" effect

Trail fades out smoothly based on age

Colliding with your own trail counts as a crash

Sci fi arena

Imported GLTF arena model

Arena bounds computed from the model

Rim lights at the corners to give a clean silhouette

Lap system

Invisible start gate built from measured track points

Crossing the gate in the correct direction increments the lap

Lap timer and best lap tracking

Laps shorter than a minimum time are ignored so tiny loops do not count

Ghost replay

While you race, your position and rotation are sampled every few frames

A "best lap" ghost is saved when you set a new record

Ghost bike replays your best path on future laps

Separate neon ghost trail shows the full line of the record lap

Ghost colors are configurable through a small theme map

Two camera modes

Chase camera sits behind and above the bike

Cinematic camera orbits the bike on the front side with slow radius, height and FOV changes

HUD and UI

Lap count

Speed display

Current lap time

Best lap time

"New Record" flash when you beat your best time

Overlay messages for ready, countdown and crash states

Post processing

UnrealBloomPass for neon glow

ACES filmic tone mapping

sRGB output encoding

Controls
Key	Action
A or ←	Turn left
D or →	Turn right
Q	Start countdown or restart after crash
R	Reset to spawn and go back to ready
C	Toggle free OrbitControls debug camera
V	Toggle Chase vs Cinematic camera mode
P	Log bike position to the console (debug)

Game states:

Ready: bike at spawn, overlay shows "Press Q to start"

Countdown: 3 / 2 / 1 / GO sprite appears near the gate

Playing: bike moves, laps and trails are active

Crashed: overlay tells you to press R or Q

Requirements

Node.js 18 or newer

npm or yarn

Modern browser with WebGL support

Getting started

Install dependencies:

git clone https://github.com/Manikatlantis/TronBlazer.git
cd TronBlazer

npm install
# or
yarn


Start the dev server:

npm run dev
# or
yarn dev


Open the local URL that the dev server prints (usually something like http://localhost:5173).
You should see the arena and the bike. Press Q to start the countdown and ride.

Build for production:

npm run build
npm run preview

Project structure

Rough layout of the repo:

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


The code currently expects the models at:

loader.load("/models/lightcycle.glb", ...)
loader.load("/models/arena2/scene.gltf", ...)


If you move the models or rename folders, update those paths in loadBike() and loadArena().

How it works
Core stack

three for rendering

GLTFLoader for loading the bike and arena

EffectComposer, RenderPass, UnrealBloomPass for bloom and post processing

OrbitControls for the debug camera

Everything is wired up in src/main.js using ES modules.

Track and arena

Track centerline is defined in tracks.js as an array of [x, z] points.

These are turned into Vector2 objects and cached in trackPoints.

From those, trackSegments2D are precomputed so the game can:

Keep the bike inside a half width

Push the bike back in with a "bounce" effect when it goes too far out

Arena:

The GLTF arena is loaded and scaled so the floor is around y = 0.

A Box3 around the arena gives the world size in XZ.

Those sizes are used as ARENA_HALF_SIZE_X and ARENA_HALF_SIZE_Z.

A simple wall collision check prevents the bike from leaving the arena.

Bike movement and leaning

Every frame:

Forward direction is computed from the bike quaternion.

When gameState is PLAYING, the bike moves by forwardDir * forwardSpeed * dt.

A and D change bike.rotation.y for turning.

Roll is applied on the Z axis based on input using MAX_LEAN and LEAN_SMOOTH.

A small sine is added to bike.position.y for hovering.

Useful constants to tweak:

const forwardSpeed = 800;          // units per second
const MAX_LEAN = 0.5;              // radians
const LEAN_SMOOTH = 0.04;          // interpolation factor
const TURN_SPEED = Math.PI * 0.5;  // radians per second

Start gate and lap timing

GATE_POINTS is a set of measured world space points across the start line.

From those, a bounding rectangle is built and stored as gateMinX, gateMaxX, gateMinZ, gateMaxZ.

A plane is defined using a center point (gatePlanePoint) and a normal (gatePlaneNormal).

When the bike is near the gate:

The sign of (bikePos - gatePlanePoint) dot gatePlaneNormal tells which side of the gate you are on.

If that sign flips between frames and the cooldown has passed, you crossed the gate.

The bike forward direction is dotted with START_FORWARD_DIR to check if you are going the proper way.

Lap timing:

On a valid crossing, the current lap time is finished and compared with bestLapTime.

Laps shorter than MIN_VALID_LAP_TIME are ignored.

If it is a new record, HUD flashes "New Record" and ghost data is updated.

Lap count increments and a new lap timer starts.

Ghost lap and ghost trail

While you are playing a lap:

currentLapFrames collects snapshots of:

t (time since lap start)

pos (world position)

rotY (rotation around Y)

Sampling happens every GHOST_SAMPLE_INTERVAL seconds.

When a lap becomes the new best:

bestLapGhostFrames is set to a deep copy of those frames.

ghostActive becomes true.

ghostBike is a clone of the main bike with a transparent neon material.

During future laps:

Current lap time gives ghostT.

The code finds the two frames that bracket this time and interpolates position and rotation.

The ghost bike replays along your best path.

Ghost trail:

Once bestLapGhostFrames is ready, their positions are fed into a CatmullRomCurve3.

A TubeGeometry is created on that curve.

A clone of the player trail shader is used, with ghost colors and slightly different opacity.

The trail is scaled to match the player trail style.

Ghost colors are set at the top:

const GHOST_THEMES = {
  cyan:   { body: 0x00ffff, edge: 0x00ffff },
  magenta:{ body: 0xff00ff, edge: 0xff66ff },
  gold:   { body: 0xffd54f, edge: 0xfff3c0 },
  lime:   { body: 0xa6ff00, edge: 0xe1ff66 },
  orange: { body: 0xff6b00, edge: 0xffb066 },
  iceBlue:{ body: 0x66ccff, edge: 0xccf3ff },
};

const ACTIVE_GHOST_THEME = GHOST_THEMES.lime;


Switch ACTIVE_GHOST_THEME to try different looks.

Player trail shader

The player trail is a ShaderMaterial with:

Vertex shader that passes uv, world position and normal.

Fragment shader that:

Computes a Fresnel term so edges glow more when viewed at a grazing angle.

Warps the V coordinate over time with sines so the trail looks like moving energy.

Builds band masks so the center is softer and edges are hot.

Fades color and alpha with uFadePower based on age along the trail.

Adds extra brightness near the "head" of the trail close to the bike.

Uniforms:

uniform float uTime;
uniform vec3  uColorCore;
uniform vec3  uColorEdge;
uniform float uOpacity;
uniform float uFadePower;


You can tune these in createTrail() if you want different colors or a longer or shorter tail.

Cameras

Chase mode

Camera offset is defined in bike local space.

It is transformed into world space and lerped toward each frame.

Camera looks at a point slightly in front of the bike.

Cinematic mode

Uses cinematicTime to slowly rotate the camera around the front side of the bike.

Radius, height and FOV change over time for a soft "dolly and crane" feel.

Camera still looks slightly ahead of the bike so framing stays interesting.

C toggles a free debug camera that still uses OrbitControls around the bike.

Customization

Some easy knobs to play with:

forwardSpeed for overall pace

MAX_LEAN, TURN_SPEED for handling

TRACK_HALF_WIDTH in tracks.js to change lane width

ARENA_HALF_SIZE_X and ARENA_HALF_SIZE_Z scaling in loadArena()

Trail colors and fade behavior through uColorCore, uColorEdge, uOpacity, uFadePower

Camera offsets and FOV ranges

Known limitations

No in game menu yet, everything is controlled from the keyboard.

Only one arena and one track are wired up right now.

Track data lives in code, there is no track editor or selection screen.
