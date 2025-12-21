// import './style.css'
// import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js";
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { tracks } from "./tracks.js";
// import "./style.css";

// SPAWN POINT
const SPAWN_POS = new THREE.Vector3(0, 0.9, 2500);
const SPAWN_ROT_Y = Math.PI * 0.5;   

const MAX_LEAN = 0.5;      // radians (~30°)
const LEAN_SMOOTH = 0.04;  // 0–1, higher = snappier
const TURN_SPEED  = Math.PI * 0.5;  // radians per second for left/right turning

let renderer, scene, camera, composer, clock;
let bike;
let bikeReady = false;
let controls;
let DEBUG_FREE_CAMERA = false; // to toggle for debugging
let keys = { left: false, right: false };
let crashMessageEl = null;
let crashTitleEl = null;
let crashSubtitleEl = null;
let forwardSpeed = 400;
let lastGateSide = null;
let countdownStep = -1;
let countdownTimer = 0;
let countdownSprite = null;
let countdownSpritePhase = 0;
let countdownSpriteBaseScale = 45;

// Track parameters
const currentTrack = tracks.arena1;
const BOUNCE_STRENGTH   = 0.3;// how strongly it pushes/reflects
const TRACK_HALF_WIDTH = currentTrack.halfWidth;

const CAMERA_MODE = {
  CHASE: "CHASE",
  CINEMATIC: "CINEMATIC",
};
let cinematicTime = 0;

let cameraMode = CAMERA_MODE.CHASE;
const trackPoints = currentTrack.points.map(
  ([x, z]) => new THREE.Vector2(x, z)
);

let trailMaterial, trailMesh;  // For the tron trail
const MAX_TRAIL_POINTS = 200;
const trailPositions = [];

const GAME_STATE = {
  WAITING: "WAITING",
  COUNTDOWN: "COUNTDOWN",
  PLAYING: "PLAYING",
  CRASHED: "CRASHED",
};

// Build 2D segments from your centerline points (XZ plane)
const trackSegments2D = [];
for (let i = 0; i < trackPoints.length - 1; i++) {
  const a = trackPoints[i].clone();     // Vector2
  const b = trackPoints[i + 1].clone(); // Vector2
  const ab = b.clone().sub(a);
  const lenSq = ab.lengthSq();

  if (lenSq > 0.0001) {
    trackSegments2D.push({ a, b, ab, lenSq });
  }
}

let gameState = GAME_STATE.WAITING;
let timeScale = 1.0;

// trail collision data (segments)
const trailSegments = []; // { start: Vector3, end: Vector3 }
const TRAIL_RADIUS = 0.9; // match-ish your visible radius

// simple arena bounds for now 
let ARENA_HALF_SIZE_X = 80;
let ARENA_HALF_SIZE_Z = 80;

let startGateMesh;
let lapCount = 0;

let currentLapStartTime = null; // when current lap began (clock time)
let currentLapTime = 0;        // seconds
let bestLapTime = null;        // null until first completed lap
let lastLapCrossTime = 0;
const LAP_COOLDOWN = 0.8; // seconds
const MIN_VALID_LAP_TIME = 10; // seconds – ignore anything faster than this

// HUD elements
let hudLapEl, hudSpeedEl, hudCurLapEl, hudBestLapEl, hudRecordEl;

const p0 = trackPoints[0];          // Vector2
const p1 = trackPoints[1];          // Vector2

// GHOST BIKE
let bestLapGhostFrames = []; // [{ t, pos: THREE.Vector3, rotY: number }]
let currentLapFrames    = [];
let ghostBike = null;
let ghostActive = false;
const GHOST_SAMPLE_INTERVAL = 0.05; // seconds between recorded frames
let lastGhostSampleTime = 0;

// direction along the track near spawn (XZ)
const startDir2D   = p1.clone().sub(p0).normalize();
// Correct forward direction for laps = along the track from p0 → p1
const START_FORWARD_DIR = new THREE.Vector3(
  startDir2D.x,
  0,
  startDir2D.y
).normalize();

// 3D versions
let START_GATE_POS    = new THREE.Vector3(p0.x, 0, p0.y);

// Given as X Z pairs in world space
const GATE_POINTS = [
  new THREE.Vector2(-36.8, 2452.3),
  new THREE.Vector2(-36.7, 2460.3),
  new THREE.Vector2(-36.7, 2470.3),
  new THREE.Vector2(-36.6, 2478.2),
  new THREE.Vector2(-36.5, 2488.6),
  new THREE.Vector2(-36.5, 2499.5),
  new THREE.Vector2(-36.4, 2510.7),
  new THREE.Vector2(-36.3, 2522.4),
  new THREE.Vector2(-36.2, 2534.1),
  new THREE.Vector2(-36.1, 2545.7),
  new THREE.Vector2(-36.1, 2556.2),
];

// Precomputed gate region + plane
let gateMinX, gateMaxX, gateMinZ, gateMaxZ;
let gatePlanePoint;   // a point on the gate plane
let gatePlaneNormal;  // normal of the plane (which side we're on)

// how much bigger than the raw points to treat as "in the gate zone"
const GATE_X_MARGIN = 10;   // side-to-side tolerance
const GATE_Z_MARGIN = 10;   // along-the-gate tolerance

window.addEventListener("keydown", (e) => {
  if (e.code === "ArrowLeft" || e.code === "KeyA") keys.left = true;
  if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = true;

  // Toggle cameras with C
  if (e.code === "KeyC") {
    DEBUG_FREE_CAMERA = !DEBUG_FREE_CAMERA;
    console.log("DEBUG_FREE_CAMERA:", DEBUG_FREE_CAMERA);
  }

   // Toggle cinematic vs chase with V
  if (e.code === "KeyV") {
    cameraMode =
      cameraMode === CAMERA_MODE.CHASE
        ? CAMERA_MODE.CINEMATIC
        : CAMERA_MODE.CHASE;
    console.log("Camera mode:", cameraMode);
  }

  // To get the position of the bike temporarily
  if (e.code === "KeyP") {
    console.log(bike.position.x.toFixed(1), bike.position.z.toFixed(1));
  }

  // Start / restart with Q
  if (e.code === "KeyQ") {
    if (gameState === GAME_STATE.WAITING) {
      startCountdown();   
    } else if (gameState === GAME_STATE.CRASHED) {
      resetGame();
      startCountdown();
    }
  }
   // Restart after crash
  if (e.code === "KeyR") {
    console.log("R pressed, resetting. state was:", gameState);
    resetGame();
  }
});

window.addEventListener("keyup", (e) => {
  if (e.code === "ArrowLeft" || e.code === "KeyA") keys.left = false;
  if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = false;
});

init();
animate();

function initGateFromPoints() {
  gateMinX = Infinity;
  gateMaxX = -Infinity;
  gateMinZ = Infinity;
  gateMaxZ = -Infinity;

  for (const p of GATE_POINTS) {
    gateMinX = Math.min(gateMinX, p.x);
    gateMaxX = Math.max(gateMaxX, p.x);
    gateMinZ = Math.min(gateMinZ, p.y);
    gateMaxZ = Math.max(gateMaxZ, p.y);
  }

  // Center of the gate region
  const cx = 0.5 * (gateMinX + gateMaxX);
  const cz = 0.5 * (gateMinZ + gateMaxZ);
  gatePlanePoint = new THREE.Vector3(cx, 0, cz);

  // Direction of the measured line (from first point to last)
  const first = GATE_POINTS[0];
  const last  = GATE_POINTS[GATE_POINTS.length - 1];

  const dir = new THREE.Vector3(
    last.x - first.x,
    0,
    last.y - first.y    // NOTE: Vector2.y is our Z
  ).normalize();

  // A horizontal normal perpendicular to that line (in XZ plane)
  // This defines our "gate plane"
  gatePlaneNormal = new THREE.Vector3(
    -dir.z,   // -dz
    0,
    dir.x    //  dx
  ).normalize();

  console.log("Gate region:",
    "X:", gateMinX, gateMaxX,
    "Z:", gateMinZ, gateMaxZ,
    "planePoint:", gatePlanePoint,
    "planeNormal:", gatePlaneNormal
  );
}


function init() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  // Renderer – filmic look
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  document.getElementById("app").appendChild(renderer.domElement);

  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020308);
  scene.fog = null;

  // Camera
  camera = new THREE.PerspectiveCamera(70, width / height, 0.1, 5000);
  camera.position.set(0, 3, 15);
  camera.lookAt(0, 0.7, 0);

  clock = new THREE.Clock();

  // Orbit controls (for debugging)
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0.7, 0);  // look at bike position

  const hemiLight = new THREE.HemisphereLight(
    0x0a2a33,   // sky color (deep teal)
    0x020308,   // ground color (almost black)
    0.35        // intensity (keep low)
  );
  scene.add(hemiLight);

  // Teal key light from above/front to highlight track curves
  const keyLight = new THREE.DirectionalLight(0x55ffee, 0.5);
  keyLight.position.set(30, 50, 40);
  keyLight.target.position.set(0, 0, 0);
  scene.add(keyLight);
  scene.add(keyLight.target);

  // teal rim light from behind - outlines on the bike & edges
  const rimLight = new THREE.DirectionalLight(0x33ddff, 0.5);
  rimLight.position.set(-25, 20, -35);
  rimLight.target.position.set(0, 0, 0);
  scene.add(rimLight);
  scene.add(rimLight.target);

  crashMessageEl = document.getElementById("crashMessage");
  crashTitleEl     = document.getElementById("crashTitle");
  crashSubtitleEl  = document.getElementById("crashSubtitle");
  // HUD elements
  hudLapEl      = document.getElementById("hudLap");
  hudSpeedEl    = document.getElementById("hudSpeed");
  hudCurLapEl   = document.getElementById("hudCurLap");
  hudBestLapEl  = document.getElementById("hudBestLap");
  hudRecordEl   = document.getElementById("hudRecord");

  showReadyToStartMessage();  // show "Press Q" on first load
  initGateFromPoints();
  // World
  loadArena();
  loadBike();

  createStartGate();
  console.log("Start gate at:", START_GATE_POS);

  // Postprocessing – bloom
  const renderScene = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    0.5,
    0.2,
    0.2
  );

  composer = new EffectComposer(renderer);
  composer.addPass(renderScene);
  composer.addPass(bloomPass);
  
  // Resize
  window.addEventListener("resize", onWindowResize);
}

function loadBike() {
  const loader = new GLTFLoader();

  loader.load(
    "./public/models/lightcycle.glb",
    // "/models/attack_helicopter_concept.glb",
    (gltf) => {
      bike = gltf.scene;

      // Make it TRON-glowy and clean
      bike.traverse((child) => {
        if (child.isMesh && child.material) {
          child.castShadow = true;
          child.receiveShadow = true;

          // Simple stylized override – you can tweak later
          if ('metalness' in child.material){
            child.material.metalness = 1.0;
            child.material.roughness = 0.2;
          }
        }
      });

      bike.scale.set(1.0, 1.0, 1.0);      // tweak if too big/small
      bike.position.copy(SPAWN_POS);
      bike.rotation.set(0, SPAWN_ROT_Y, 0);
      scene.add(bike);
      
            // --- GHOST BIKE SETUP ---
      ghostBike = bike.clone(true);
      ghostBike.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = false;
          child.receiveShadow = false;
          child.material = new THREE.MeshStandardMaterial({
            color: 0x00ffff,         // cyan
            emissive: 0x0055ff,
            emissiveIntensity: 1.5,
            transparent: true,
            opacity: 0.25,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          });
        }
      });
      ghostBike.visible = false;
      scene.add(ghostBike);
      // -------------------------

      bikeReady = true;
      createTrail();
    },
    undefined,
    (error) => {
      console.error("Error loading lightcycle:", error);
    }
  );
}

let arena;

function addArenaRimLightsAtCorners() {
  const height = 30; // how high above the arena the lights sit

  const cornerPositions = [
    [  ARENA_HALF_SIZE_X, height,  ARENA_HALF_SIZE_Z],
    [ -ARENA_HALF_SIZE_X, height,  ARENA_HALF_SIZE_Z],
    [  ARENA_HALF_SIZE_X, height, -ARENA_HALF_SIZE_Z],
    [ -ARENA_HALF_SIZE_X, height, -ARENA_HALF_SIZE_Z],
  ];

  cornerPositions.forEach(([x, y, z]) => {
    const light = new THREE.DirectionalLight(0x33ddff, 0.5); // teal, a bit brighter
    light.position.set(x, y, z);
    light.target.position.set(0, 0, 0);       // aim at center of arena
    scene.add(light);
    scene.add(light.target);
  });
}

function loadArena() {
  const loader = new GLTFLoader();

  loader.load(
    "./public/models/arena2/scene.gltf",   // adjust if your folder/file name differs
    (gltf) => {
      arena = gltf.scene;

      // Optional: clean up materials a bit
      arena.traverse((child) => {
        if (child.isMesh && child.material) {
          child.castShadow = true;
          child.receiveShadow = true;

          // keep drawing even if bounding box is weird
          child.frustumCulled = false;

          // Make sure it's not too shiny/too dark
          if ('metalness' in child.material) {
            child.material.metalness = 0.5;
            child.material.roughness = 0.4;
          }
        }
      });

      // Position / scale the arena so the floor is around y = 0
      arena.scale.set(25, 25, 25);    // tweak this
      arena.position.set(0, -1, 0); // tweak if needed
      scene.add(arena);
      const box = new THREE.Box3().setFromObject(arena);
      const size = new THREE.Vector3();
      box.getSize(size);

      // Half-size in X/Z, shrink a bit so you don't hit the exact visual edge
      ARENA_HALF_SIZE_X = (size.x * 0.7) * 0.9;
      ARENA_HALF_SIZE_Z = (size.z * 0.7) * 0.9;

      console.log("Arena bounds:", ARENA_HALF_SIZE_X, ARENA_HALF_SIZE_Z);
      // teal rim lights at the four corners
      addArenaRimLightsAtCorners();
    },
    undefined,
    (err) => {
      console.error("Error loading arena:", err);
    }
  );
}


function createTrail() {
  trailMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime:      { value: 0.0 },
      uColorCore: { value: new THREE.Color(0xff5503) }, // bright inner glow
      uColorEdge: { value: new THREE.Color(0xff5503) }, // red/orange edges
      uOpacity:   { value: 0.5 },
      uFadePower:   { value: 1.5 },   // controls how quickly the tail disappears
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vNormal;

      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);

        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;

        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
  uniform float uTime;
  uniform vec3  uColorCore;
  uniform vec3  uColorEdge;
  uniform float uOpacity;
  uniform float uFadePower;

  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vNormal;

  void main() {
  // View-dependent Fresnel for edge glow
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float fresnel = pow(1.0 - max(dot(viewDir, normalize(vNormal)), 0.0), 2.0);

  // --- "Liquid" UV warp so it feels like flowing energy/water ---
  float vCoord = vUv.y
    + sin(vUv.x * 40.0 - uTime * 4.0) * 0.015
    + sin(vUv.x * 18.0 + uTime * 2.0) * 0.01;
  vCoord = clamp(vCoord, 0.0, 1.0);

  // Distance from center line after warp
  float v = abs(vCoord - 0.5);        // 0 at center, 0.5 at edge

  // Band masks
  float coreBand = 1.0 - smoothstep(0.0, 0.22, v);  // bright near center
  float edgeBand = smoothstep(0.25, 0.48, v);       // bright near edges

  // Extra fade so very center is *more* transparent (watery)
  float centerFade = smoothstep(0.0, 0.12, v);      // 0 at center, 1 a bit out
  float coreAlphaMask = (1.0 - centerFade);         // alpha is low in dead center

  // Flow along the length
  float flow = 0.5 + 0.5 * sin(vUv.x * 25.0 - uTime * 5.0);

  // Base colors (same warm palette)
  vec3 coreCol = uColorCore * (0.8 + 0.4 * flow);   // soft pulsing core
  vec3 edgeCol = uColorEdge;                        // strong red/orange rim

  // Color mix: glassy core + hot edges + fresnel rim
  vec3 color = coreCol * coreBand
             + edgeCol * (edgeBand + fresnel * 0.9);

  // Alpha: mostly transparent center, solid edges + halo
  float alpha =
      uOpacity * (
        coreBand * coreAlphaMask * 0.95 +  // watery center
        edgeBand * 0.95 +                  // strong edges
        fresnel  * 0.25                    // extra halo at grazing angles
      );

   // === Fade by "age" along the trail (tail dissolves) ===
    // vUv.x ≈ 0  => oldest part of trail
    // vUv.x ≈ 1  => newest part near the bike
    float age = clamp(vUv.x, 0.0, 1.0);
    float ageFade = pow(age, uFadePower);   // tweak uFadePower in JS

    color *= ageFade;
    alpha *= ageFade;
    // =============================

  // Kill ultra-thin noise
  if (alpha < 0.02) discard;

  // vUv.x ~ 1 near the bike
  float headGlow = smoothstep(0.7, 0.9, vUv.x);
  color += headGlow * 0.4 * uColorCore;

  gl_FragColor = vec4(color, alpha);
}

`,

    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  // Tiny initial tube so the mesh exists
  const p0 = bike.position.clone();
  const p1 = bike.position.clone().add(new THREE.Vector3(0, 0, -1));
  const curve = new THREE.CatmullRomCurve3([p0, p1]);

  const tubeGeo = new THREE.TubeGeometry(curve, 32, 0.8, 24, false);
  trailMaterial.uniforms.uFadePower.value = 0.6; // softer tail
  trailMesh = new THREE.Mesh(tubeGeo, trailMaterial);

  // Flatten into tall rectangular "wall"
  trailMesh.scale.set(1.0, 1.8, 1.0);

  scene.add(trailMesh);
}

function updateTrail() {
  if (!bike || !trailMesh) return;

  // Sample slightly under the bike so the tube is anchored near the lane
  const point = getTrailSamplePoint();
  

  trailPositions.push(point.clone());
  if (trailPositions.length > MAX_TRAIL_POINTS) {
    trailPositions.shift();
  }
   // --- NEW: store line segments for collision ---
  if (trailPositions.length >= 2) {
    const len = trailPositions.length;
    const start = trailPositions[len - 2].clone();
    const end   = trailPositions[len - 1].clone();
    trailSegments.push({ start, end });

    // keep trail segments capped similarly
    if (trailSegments.length > MAX_TRAIL_POINTS) {
      trailSegments.shift();
    }
  }

  if (trailPositions.length < 2) return;

  const curve = new THREE.CatmullRomCurve3(trailPositions);
  const tubularSegments = Math.max(2, trailPositions.length * 3);
  const radius = 0.8;
  const radialSegments = 24;

  // Replace geometry with a new tube along the current path
  trailMesh.geometry.dispose();
  trailMesh.geometry = new THREE.TubeGeometry(
    curve,
    tubularSegments,
    radius,
    radialSegments,
    false
  );
}

function getTrailSamplePoint() {
  if (!bike) return new THREE.Vector3();

  // Bike world position
  const bikePos = new THREE.Vector3();
  bike.getWorldPosition(bikePos);

  // Bike's forward direction in world space.
  // Assuming the bike model faces -Z in its default pose.
  const forward = new THREE.Vector3(0, 0, -1)
    .applyQuaternion(bike.quaternion)
    .normalize();

  const sample = bikePos.clone()
    .addScaledVector(forward, -2.5)   // behind the bike

  // Fix height so lean doesn't move the trail up/down
  sample.y = bikePos.y + 0.4;  // small offset below bike center; tweak as needed
  
  return sample;
}

function showOverlay() {
  if (!crashMessageEl) return;
  crashMessageEl.style.visibility = "visible";
  crashMessageEl.classList.add("visible");
}

function hideOverlay() {
  if (!crashMessageEl) return;
  crashMessageEl.classList.remove("visible");
  // small timeout to let opacity transition, then hide
  setTimeout(() => {
    if (!crashMessageEl.classList.contains("visible")) {
      crashMessageEl.style.visibility = "hidden";
    }
  }, 350);
}

function showReadyToStartMessage() {
  if (!crashMessageEl) return;
  crashTitleEl.textContent = "Ready to Ride";
  crashSubtitleEl.innerHTML = `Press <span class="key">Q</span> to start`;
  showOverlay();
}

function showCrashMessage() {
  if (!crashMessageEl) return;
  crashTitleEl.textContent = "You Crashed!!";
  crashSubtitleEl.innerHTML =
    `Press <span class="key">R</span> to reset<br>` +
    `or <span class="key">Q</span> to restart`;
  showOverlay();
}


function onWindowResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setSize(width, height);
  composer.setSize(width, height);
}

function distancePointToSegment(p, a, b) {
  // p, a, b are Vector3
  const ab = b.clone().sub(a);
  const ap = p.clone().sub(a);
  const abLenSq = ab.lengthSq();

  if (abLenSq === 0) return ap.length(); // degenerate segment

  let t = ap.dot(ab) / abLenSq;
  t = THREE.MathUtils.clamp(t, 0, 1);

  const closest = a.clone().addScaledVector(ab, t);
  return closest.distanceTo(p);
}

function checkTrailCollision() {
  if (trailSegments.length < 2) return false;

  const bikePos = new THREE.Vector3();
  bike.getWorldPosition(bikePos);

  // Skip the last few segments so we don't immediately collide with ourselves
  const skipLast = 10;
  const limit = Math.max(0, trailSegments.length - skipLast);

  for (let i = 0; i < limit; i++) {
    const seg = trailSegments[i];
    const d = distancePointToSegment(bikePos, seg.start, seg.end);
    if (d < TRAIL_RADIUS * 0.9) {
      return true;
    }
  }
  return false;
}

function createStartGate() {
  const gateWidth     = TRACK_HALF_WIDTH * 2.30;  // a bit wider than lane
  const gateHeight    = 30;
  const gateThickness = 1;

  const geom = new THREE.BoxGeometry(gateWidth, gateHeight, gateThickness);

  const mat = new THREE.MeshStandardMaterial({
    color: 0x33aa99,
    emissive: 0x33aa99,
    emissiveIntensity: 3.0,
    transparent: true,
    opacity: 0.02,
    roughness: 0.9,
    metalness: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  startGateMesh = new THREE.Mesh(geom, mat);

  // ➜ move the gate some distance forward along the track direction
  const forward2D = startDir2D.clone().normalize();
  const offsetDist = 20; 
  START_GATE_POS.set(
    p0.x + forward2D.x * offsetDist,
    0,
    p0.y + forward2D.y * offsetDist
  );

  startGateMesh.position.set(
    START_GATE_POS.x,
    gateHeight * 0.5,
    START_GATE_POS.z
  );

  const yaw = Math.atan2(startDir2D.x, startDir2D.y);
  startGateMesh.rotation.set(0, yaw, 0);

  scene.add(startGateMesh);
}

function startCountdown() {
  gameState = GAME_STATE.COUNTDOWN;
  timeScale = 1.0;

  countdownStep = 0;
  countdownTimer = 0;

  // first value: "3"
  makeCountdownSprite("3");

  // hide the “Ready to Ride” overlay so only text shows
  hideOverlay();
}

function makeCountdownSprite(text) {
  // clean up old sprite
  if (countdownSprite) {
    scene.remove(countdownSprite);
    if (countdownSprite.material.map) {
      countdownSprite.material.map.dispose();
    }
    countdownSprite.material.dispose();
    countdownSprite = null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // transparent bg
  ctx.fillStyle = "rgba(0,0,0,0)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // high-tech gradient
  const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  grad.addColorStop(0.0, "#00f5ff");  // bright cyan
  grad.addColorStop(0.35, "#00e5ffff"); // electric blue
  grad.addColorStop(0.7, "#ec10aeff");  // neon magenta
  grad.addColorStop(1.0, "#580dc2ff");  // deep purple

  ctx.font = 'bold 320px "Orbitron", system-ui, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.shadowColor = "#0c46c2ff"; // pink-ish glow
  ctx.shadowBlur = 75;
  ctx.fillStyle = grad;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding;
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  });

  countdownSprite = new THREE.Sprite(material);

  // slightly bigger on "GO"
  countdownSpriteBaseScale = (text === "GO") ? 100 : 80;
  countdownSprite.scale.set(
    countdownSpriteBaseScale,
    countdownSpriteBaseScale * 1.5,
    1
  );

  // position: floating in front of the wall, a bit above
  const forwardOffset = START_FORWARD_DIR.clone().multiplyScalar(6); // move in front of gate
  const pos = START_GATE_POS.clone().add(forwardOffset);
  pos.y = 15; // height above ground
  countdownSprite.position.copy(pos);

  scene.add(countdownSprite);
  countdownSpritePhase = 0;
}
function isNearGateRegion(bikePos) {
  return (
    bikePos.x >= gateMinX - GATE_X_MARGIN &&
    bikePos.x <= gateMaxX + GATE_X_MARGIN &&
    bikePos.z >= gateMinZ - GATE_Z_MARGIN &&
    bikePos.z <= gateMaxZ + GATE_Z_MARGIN
  );
}

function updateLaps() {
  if (!bike || gameState !== GAME_STATE.PLAYING) return;

  const bikePos = new THREE.Vector3();
  bike.getWorldPosition(bikePos);

  // Only care if we're actually near the measured wall
  if (!isNearGateRegion(bikePos)) {
    return;
  }

  // Vector from gate center to bike
  const rel = bikePos.clone().sub(gatePlanePoint);

  // Which side of the gate plane are we on? (<0 one side, >0 the other)
  const dot = rel.dot(gatePlaneNormal);
  const side = dot >= 0 ? 1 : -1;

  // First time near the gate → just record side
  if (lastGateSide === null) {
    lastGateSide = side;
    return;
  }

  const now = clock.getElapsedTime();

  // We crossed the plane near the gate if the sign changed
  const crossedPlane =
    side !== lastGateSide &&
    now - lastLapCrossTime > LAP_COOLDOWN;

  if (crossedPlane) {
    // 🔹 Extra check: make sure we are going in the "forward" lap direction
    const bikeForward = new THREE.Vector3(0, 0, -1)
      .applyQuaternion(bike.quaternion)
      .setY(0)
      .normalize();

    const forwardDot = bikeForward.dot(START_FORWARD_DIR);

    // > 0 → roughly forward; tweak 0.1 if needed
    if (forwardDot > 0.1) {
      lapCount++;
      lastLapCrossTime = now;
      console.log("Lap:", lapCount);
      flashStartGate();

      if (currentLapStartTime !== null) {
  const finishedLapTime = now - currentLapStartTime;
  currentLapTime = finishedLapTime;

  if (finishedLapTime >= MIN_VALID_LAP_TIME) {
    // New record?
    if (bestLapTime === null || finishedLapTime < bestLapTime) {
      bestLapTime = finishedLapTime;
      showNewRecordFlash();

      // 🔹 Save ghost path for this best lap
      bestLapGhostFrames = currentLapFrames.map(f => ({
        t: f.t,
        pos: f.pos.clone(),
        rotY: f.rotY,
      }));
      ghostActive = bestLapGhostFrames.length > 1;
      if (ghostBike && ghostActive) ghostBike.visible = true;
    }
  }
}

// start recording the next lap
currentLapStartTime = now;
currentLapFrames = [];
lastGhostSampleTime = 0;

      currentLapStartTime = now; // start timing next lap
    } else {
      // going backwards through the gate → ignore
      console.log("Crossed gate but facing backwards, no lap");
    }
  }

  // Update side only while near gate
  lastGateSide = side;

}

function checkWallCollision() {
  const bikePos = new THREE.Vector3();
  bike.getWorldPosition(bikePos);

  return (
    Math.abs(bikePos.x) > ARENA_HALF_SIZE_X ||
    Math.abs(bikePos.z) > ARENA_HALF_SIZE_Z
  );
}

function applyTrackBounce() {
  if (!bike || trackSegments2D.length === 0) return;

  const p = new THREE.Vector2(bike.position.x, bike.position.z);

  let minDist = Infinity;
  let closestDelta = null;

  for (const seg of trackSegments2D) {
    const { a, ab, lenSq } = seg;
    const ap = p.clone().sub(a);
    let t = ap.dot(ab) / lenSq;
    t = THREE.MathUtils.clamp(t, 0, 1);

    const closest = a.clone().add(ab.clone().multiplyScalar(t));
    const delta = p.clone().sub(closest);
    const dist = delta.length();

    if (dist < minDist) {
      minDist = dist;
      closestDelta = delta;
    }
  }

  if (!closestDelta) return;

  // still inside lane → no bounce
  if (minDist <= TRACK_HALF_WIDTH) return;

  const overshoot = minDist - TRACK_HALF_WIDTH;
  const pushDir = closestDelta.normalize(); // outward
  const correction = pushDir.multiplyScalar(
    overshoot * (1.0 + BOUNCE_STRENGTH)
  );

  // move back inward
  p.sub(correction);

  bike.position.x = p.x;
  bike.position.z = p.y;

}


function handleCollisions() {
  if (gameState !== GAME_STATE.PLAYING) return;

  if (checkTrailCollision() || checkWallCollision()) {
    // trigger crash
    gameState = GAME_STATE.CRASHED;
    showCrashMessage();  
    console.log("CRASH!");
  }
}

function resetGame() {
  gameState = GAME_STATE.WAITING;
  timeScale = 1.0;
  // shakeIntensity = 0.0;

  DEBUG_FREE_CAMERA = false; // force back to game camera on reset

  // clear trail data
  trailPositions.length = 0;
  trailSegments.length = 0;
  lapCount = 0;
  lastLapCrossTime = 0;
  lastGateSide = null;
  bestLapGhostFrames = [];
  currentLapFrames = [];
  ghostActive = false;
  if (ghostBike) {
    ghostBike.visible = false;
  }
  lastGhostSampleTime = 0;


  // reset current lap timing, keep bestLapTime as "record"
  currentLapStartTime = null;
  currentLapTime = 0;

  // clear countdown visual + timers
  if (countdownSprite) {
    scene.remove(countdownSprite);
    if (countdownSprite.material.map) {
      countdownSprite.material.map.dispose();
    }
    countdownSprite.material.dispose();
    countdownSprite = null;
  }
  countdownTimer = 0;
  countdownStep = -1;

  if (trailMesh) {
    trailMesh.geometry.dispose();
    // recreate tiny starter tube
    const p0 = bike.position.clone();
    const p1 = bike.position.clone().add(new THREE.Vector3(0, 0, -1));
    const curve = new THREE.CatmullRomCurve3([p0, p1]);
    trailMesh.geometry = new THREE.TubeGeometry(curve, 32, 0.8, 24, false);
  }
  bike.position.copy(SPAWN_POS);
  bike.rotation.set(0, SPAWN_ROT_Y, 0);

  showReadyToStartMessage();   // back to "Press Q to start"
}

function flashStartGate() {
  if (!startGateMesh) return;
  const mat = startGateMesh.material;
  const originalIntensity = mat.emissiveIntensity;

  mat.emissiveIntensity = 6.0;
  mat.opacity = 0.5;

  setTimeout(() => {
    mat.emissiveIntensity = originalIntensity;
    mat.opacity = 0.02;
  }, 200);
}

function startGame() {
  gameState = GAME_STATE.PLAYING;
  timeScale = 1.0;
  hideOverlay();

  // Start timing the current lap from now
  currentLapStartTime = clock.getElapsedTime();
  currentLapTime = 0;
}


function formatLapTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return "--.--";
  const totalMs = Math.floor(seconds * 1000);
  const mins = Math.floor(totalMs / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const ms   = Math.floor((totalMs % 1000) / 10); // 2-digit ms

  if (mins > 0) {
    return `${mins}:${secs.toString().padStart(2, "0")}.${ms
      .toString()
      .padStart(2, "0")}`;
  } else {
    return `${secs}.${ms.toString().padStart(2, "0")}`;
  }
}

function updateHUD(dt) {
  if (!hudLapEl) return;

  // Lap + speed
  hudLapEl.textContent = lapCount.toString();
  hudSpeedEl.textContent = `${Math.round(forwardSpeed)}`;

  // Lap times
  if (currentLapStartTime !== null && gameState === GAME_STATE.PLAYING) {
    currentLapTime = clock.getElapsedTime() - currentLapStartTime;
  }

  hudCurLapEl.textContent  = formatLapTime(currentLapTime);
  hudBestLapEl.textContent =
    bestLapTime === null ? "--.--" : formatLapTime(bestLapTime);
}

function showNewRecordFlash() {
  if (!hudRecordEl) return;
  hudRecordEl.classList.add("visible");
  // fade out after a short moment
  setTimeout(() => {
    hudRecordEl.classList.remove("visible");
  }, 1200);
}


function animate() {
  requestAnimationFrame(animate);

  const rawDt = clock.getDelta();      // real delta since last frame
  const gameDt = rawDt * timeScale;    // slowed during crash
  const t = clock.getElapsedTime();    // total time
  cinematicTime += rawDt;              // drives cinematic camera motion

  // drive the water-like ripple on the trail
  if (trailMaterial && trailMaterial.uniforms && trailMaterial.uniforms.uTime) {
    trailMaterial.uniforms.uTime.value = t;
  }

  if (bikeReady && bike) {
    // 1. Turn left/right only while playing
    let turnAmount = 0;
    if (!DEBUG_FREE_CAMERA && gameState === GAME_STATE.PLAYING) {
      if (keys.left)  turnAmount += TURN_SPEED * gameDt;
      if (keys.right) turnAmount -= TURN_SPEED * gameDt;
    }
    bike.rotation.y += turnAmount;

      // === COUNTDOWN STATE ===
  if (gameState === GAME_STATE.COUNTDOWN) {
    countdownTimer += rawDt;

    const steps = ["3", "2", "1", "GO"];
    const stepDuration = 0.85; // seconds for each value
    const totalDuration = stepDuration * steps.length;

    // which step should we be on?
    const newStep = Math.min(
      Math.floor(countdownTimer / stepDuration),
      steps.length - 1
    );

    if (newStep !== countdownStep) {
      countdownStep = newStep;
      makeCountdownSprite(steps[countdownStep]);
    }

    // high-tech breathing + flicker animation
    if (countdownSprite) {
      countdownSpritePhase += rawDt * 5.0;
      const pulse = 1.0 + 0.18 * Math.sin(countdownSpritePhase * 3.0);

      countdownSprite.scale.set(
        countdownSpriteBaseScale * pulse,
        countdownSpriteBaseScale * 0.5 * pulse,
        1
      );

      const mat = countdownSprite.material;
      mat.opacity = 0.8 + 0.2 * Math.sin(countdownSpritePhase * 7.0);
    }

    // when countdown ends → start race
    if (countdownTimer >= totalDuration) {
      if (countdownSprite) {
        scene.remove(countdownSprite);
        if (countdownSprite.material.map) {
          countdownSprite.material.map.dispose();
        }
        countdownSprite.material.dispose();
        countdownSprite = null;
      }

      startGame();  // your existing function that sets PLAYING, starts lap timer
    }
  }
  // Record ghost frames during a lap
    if (gameState === GAME_STATE.PLAYING && currentLapStartTime !== null) {
      const lapT = clock.getElapsedTime() - currentLapStartTime;
      if (lapT - lastGhostSampleTime >= GHOST_SAMPLE_INTERVAL) {
        currentLapFrames.push({
          t: lapT,
          pos: bike.position.clone(),
          rotY: bike.rotation.y,
        });
        lastGhostSampleTime = lapT;
      }
    }

    // 2. Constant forward movement
    const forwardDir = new THREE.Vector3(0, 0, -1).applyQuaternion(bike.quaternion);
    if (gameState === GAME_STATE.PLAYING) {
      bike.position.addScaledVector(forwardDir, forwardSpeed * gameDt);
      // Apply track-edge bounce after moving
      applyTrackBounce();
    }

    // 3. Hover effect
    const baseY = 0.7;
    bike.position.y = baseY + Math.sin(t * 2.0) * 0.05;

    // 4. Lean
    let targetLean = 0;
    if (!DEBUG_FREE_CAMERA) {
      if (keys.left)  targetLean =  MAX_LEAN;
      if (keys.right) targetLean = -MAX_LEAN;
    }
    bike.rotation.z = THREE.MathUtils.lerp(
      bike.rotation.z,
      targetLean,
      LEAN_SMOOTH
    );

    // 5. Trail & collisions only while playing
    if (gameState === GAME_STATE.PLAYING) {
      updateTrail();
      updateLaps();
      handleCollisions();
    }
    
        // --- GHOST PLAYBACK ---
    if (
      ghostActive &&
      ghostBike &&
      bestLapGhostFrames.length > 1 &&
      gameState === GAME_STATE.PLAYING &&
      currentLapStartTime !== null
    ) {
      const ghostT = clock.getElapsedTime() - currentLapStartTime;
      const lastFrame = bestLapGhostFrames[bestLapGhostFrames.length - 1];

      if (ghostT > lastFrame.t) {
        // finished ghost lap – hide until next lap
        ghostBike.visible = false;
      } else {
        ghostBike.visible = true;

        // find segment [i, i+1] that spans ghostT
        let i = 0;
        while (
          i < bestLapGhostFrames.length - 2 &&
          bestLapGhostFrames[i + 1].t < ghostT
        ) {
          i++;
        }

        const f0 = bestLapGhostFrames[i];
        const f1 = bestLapGhostFrames[i + 1];
        const span = Math.max(f1.t - f0.t, 0.0001);
        const alpha = (ghostT - f0.t) / span;

        ghostBike.position.copy(f0.pos).lerp(f1.pos, alpha);
        ghostBike.rotation.y = THREE.MathUtils.lerp(f0.rotY, f1.rotY, alpha);
      }
    } else if (ghostBike && !ghostActive) {
      ghostBike.visible = false;
    }

    // 6. Camera
    if (DEBUG_FREE_CAMERA) {
      controls.target.copy(bike.position);
      controls.update();
    } else {
      let desiredPos, lookTarget, lerpFactor, targetFov;

      if (cameraMode === CAMERA_MODE.CHASE) {
        // --- Normal chase camera (kept as-is) ---
        const camOffsetLocal = new THREE.Vector3(0, 7.5, 12);
        const camOffsetWorld = camOffsetLocal
          .clone()
          .applyQuaternion(bike.quaternion);
        desiredPos = bike.position.clone().add(camOffsetWorld);

        const lookOffsetLocal = new THREE.Vector3(0, 1.5, -10);
        const lookOffsetWorld = lookOffsetLocal
          .clone()
          .applyQuaternion(bike.quaternion);
        lookTarget = bike.position.clone().add(lookOffsetWorld);

        lerpFactor = 0.12;
        targetFov = 90;
      } else {
        // --- CINEMATIC MODE: smooth orbit, only front/side views ---

        // phase drives where the camera is on the front semicircle
        const phase = cinematicTime * 0.25;       // slow drift
        const swing = Math.sin(phase);            // [-1, 1]
        const angle = swing * (Math.PI * 0.65);   // ~[-81°, +81°] around FRONT

        // distance & height change slowly for dolly/crane feel
        const baseRadius = 18;
        const radius = baseRadius + 4 * Math.sin(phase * 0.7 + 1.0);
        const height = 10 + 2 * Math.sin(phase * 1.3 + 0.5);

        // NOTE: -Z is "in front" of the bike in its local space
        const offsetLocal = new THREE.Vector3(
          Math.sin(angle) * radius,   // side swing (left/right)
          height,                     // crane up/down
          -Math.cos(angle) * radius   // always in front hemisphere
        );

        const offsetWorld = offsetLocal.clone().applyQuaternion(bike.quaternion);
        desiredPos = bike.position.clone().add(offsetWorld);

        // the camera *focuses* a bit ahead of the bike, so it feels like
        // a stationary point the bike passes through
        const lookOffsetLocal = new THREE.Vector3(0, 2.0, -3);
        const lookOffsetWorld = lookOffsetLocal
          .clone()
          .applyQuaternion(bike.quaternion);
        lookTarget = bike.position.clone().add(lookOffsetWorld);

        lerpFactor = 0.08;                      // smoother, weighty motion
        targetFov = 110 + 10 * Math.sin(phase * 0.8);  // gentle FOV breathing
      }

      camera.position.lerp(desiredPos, lerpFactor);
      camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 0.05);
      camera.updateProjectionMatrix();
      camera.lookAt(lookTarget);
    }
  } else {
    if (DEBUG_FREE_CAMERA && controls) controls.update();
  }
  updateHUD(rawDt);
  composer.render(scene, camera);
}
