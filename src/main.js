import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { metalness } from "three/tsl";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import './style.css'

const MAX_LEAN = 0.5;      // radians (~30°)
const LEAN_SMOOTH = 0.04;  // 0–1, higher = snappier
const TURN_SPEED  = Math.PI * 0.5;  // radians per second for left/right turning

let renderer, scene, camera, composer, clock;
let bike;
let bikeReady = false;
let controls;
let DEBUG_FREE_CAMERA = true; // to toggle for debugging
let keys = { left: false, right: false };

let forwardSpeed = 20;
let lateralSpeed = 10;
let travel = 0;

let trailCoreMesh, trailHaloMesh;
let trailMaterialCore, trailMaterialHalo;

let trailMaterial, trailMesh;  // For the tron trail
const MAX_TRAIL_POINTS = 1000;
const trailPositions = [];


window.addEventListener("keydown", (e) => {
  if (e.code === "ArrowLeft" || e.code === "KeyA") keys.left = true;
  if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = true;

  // Toggle cameras with C
  if (e.code === "KeyC") {
    DEBUG_FREE_CAMERA = !DEBUG_FREE_CAMERA;
    console.log("DEBUG_FREE_CAMERA:", DEBUG_FREE_CAMERA);
  }
});

window.addEventListener("keyup", (e) => {
  if (e.code === "ArrowLeft" || e.code === "KeyA") keys.left = false;
  if (e.code === "ArrowRight" || e.code === "KeyD") keys.right = false;
});

init();
animate();

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

  // Lights
  const ambient = new THREE.AmbientLight(0x050608, 0.4);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0x66aaff, 1.5);
  keyLight.position.set(10, 20, 10);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0xff6600, 2.0);
  rimLight.position.set(-5, 4, -5);
  scene.add(rimLight);

  // World
  loadArena();
  loadBike();

  // Postprocessing – bloom
  const renderScene = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    0.7,
    0.4,
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
    "/models/lightcycle.glb",
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
      bike.position.set(0, 0.9, 0);
      scene.add(bike);

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

function loadArena() {
  const loader = new GLTFLoader();

  loader.load(
    "/models/arena/scene.gltf",   // adjust if your folder/file name differs
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
      uColorCore: { value: new THREE.Color(0xfff9a0) }, // bright inner glow
      uColorEdge: { value: new THREE.Color(0xff6600) }, // red/orange edges
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
        coreBand * coreAlphaMask * 0.35 +  // watery center
        edgeBand * 0.55 +                  // strong edges
        fresnel  * 0.35                    // extra halo at grazing angles
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

  // Local up (+Y) -> world (so lean doesn’t mess us up)
  const up = new THREE.Vector3(0, 1, 0)
    .applyQuaternion(bike.quaternion)
    .normalize();

  const sample = bikePos.clone()
    .addScaledVector(forward, -2.5)   // behind the bike

  // Fix height so lean doesn't move the trail up/down
  sample.y = bikePos.y + 0.4;  // small offset below bike center; tweak as needed
  
  return sample;
}


function onWindowResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setSize(width, height);
  composer.setSize(width, height);
}

function animate() {
  requestAnimationFrame(animate);

  const dt = clock.getDelta();
  const t = clock.getElapsedTime();

    // drive the water-like ripple on the trail
  if (trailMaterial && trailMaterial.uniforms && trailMaterial.uniforms.uTime) {
    trailMaterial.uniforms.uTime.value = t;
  }

  if (bikeReady && bike) {
    // travel += forwardSpeed * dt;
    // bike.position.z = -travel;
    // --- MOVE & TURN ---

// 1. Turn based on left/right keys (no up/down movement yet)
let turnAmount = 0;
if (!DEBUG_FREE_CAMERA) {
  if (keys.left)  turnAmount += TURN_SPEED * dt;
  if (keys.right) turnAmount -= TURN_SPEED * dt;
}

// apply yaw rotation
bike.rotation.y += turnAmount;

// 2. Constant forward movement in whatever direction the bike faces
//    (local -Z of the model is "forward" in three.js by convention)
const forwardDir = new THREE.Vector3(0, 0, -1);
forwardDir.applyQuaternion(bike.quaternion);
bike.position.addScaledVector(forwardDir, forwardSpeed * dt);

// 3. Hover effect at a fixed height (no manual up/down yet)
const baseY = 0.7;
bike.position.y = baseY + Math.sin(t * 2.0) * 0.05;

// 4. Lean based on steering input
let targetLean = 0;
if (!DEBUG_FREE_CAMERA) {
  if (keys.left)  targetLean =  MAX_LEAN;   // lean left
  if (keys.right) targetLean = -MAX_LEAN;   // lean right
} else {
  // in debug, auto-upright
  targetLean = 0;
}

bike.rotation.z = THREE.MathUtils.lerp(
  bike.rotation.z,
  targetLean,
  LEAN_SMOOTH
);

  updateTrail();

  // CAMERA
    if (DEBUG_FREE_CAMERA) {
      // Orbit mode around bike
      controls.target.copy(bike.position);
      controls.update();
    } else {
      // Follow camera behind + above the bike
      const camOffsetLocal = new THREE.Vector3(0, 7.5, 12);   // x,y,z offset from bike
      const camOffsetWorld = camOffsetLocal.clone().applyQuaternion(bike.quaternion);
      const desiredPos = bike.position.clone().add(camOffsetWorld);

      // Smooth follow
      camera.position.lerp(desiredPos, 0.12);

      // Look slightly ahead of the bike into the forward direction
      const lookOffsetLocal = new THREE.Vector3(0, 1.5, -10);
      const lookOffsetWorld = lookOffsetLocal.clone().applyQuaternion(bike.quaternion);
      const lookTarget = bike.position.clone().add(lookOffsetWorld);
      camera.lookAt(lookTarget);
    }
  } else {
    // Before bike loads, still keep tunnel alive
    if (DEBUG_FREE_CAMERA && controls) controls.update();
  }

  composer.render(scene, camera);
}
