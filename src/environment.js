// environment.js
import * as THREE from "three";
import { getTrackBounds } from "./track_bounds.js";

// +1 = RIGHT side of the track (relative to tangent direction)
// -1 = LEFT side
const CITY_SIDE = +1;

// Safety buffer so NOTHING can appear where the bike rides
// (in world units, added on top of track.halfWidth)
const TRACK_CLEARANCE = 26;

export function createEnvironment(scene, renderer) {
  const group = new THREE.Group();
  scene.add(group);

  // ---------- Stars ----------
  const stars = makeStarField(600, 2200);
  group.add(stars);

  // ---------- Sky streaks + meteors ----------
  const skyStreaks = createSkyStreaks(80);
  group.add(skyStreaks.lines);

  const meteorSystem = createMeteors();
  group.add(meteorSystem.group);

  // ---------- City ----------
  let track = null;
  let arena = { halfX: 80, halfZ: 80, cx: 0, cz: 0 };

  // TRON materials
  const tronMat = createTronBuildingMaterial();
  const outlineMat = new THREE.MeshBasicMaterial({
    color: 0x00f5ff,
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.BackSide,
  });

  // Multiple shape batches (instanced)
  const cityBatches = []; // [{ mesh, outline, count }]
  let buildingMode = "TRON";

  function setBounds(halfX, halfZ, cx = 0, cz = 0) {
    arena.halfX = halfX;
    arena.halfZ = halfZ;
    arena.cx = cx;
    arena.cz = cz;

    if (track) rebuildCityAlongTrack();
    else rebuildCityCircleFallback();
  }

  function setTrack(pointsXZ, halfWidth) {
    if (!pointsXZ || pointsXZ.length < 2) {
      track = null;
      rebuildCityCircleFallback();
      return;
    }

    const B = getTrackBounds(pointsXZ, halfWidth, 0);
    const center = new THREE.Vector2(B.cx, B.cz);

    const pts2 = pointsXZ.map(([x, z]) => new THREE.Vector2(x, z));
    const { segLens, totalLen } = computePolylineLengths(pts2);

    track = { points: pointsXZ, halfWidth, pts2, center, segLens, totalLen };
    rebuildCityAlongTrack();
  }

  // exists so main.js calls don't crash
  function setBuildingMode(mode) {
    buildingMode = mode || "TRON";
  }

  function clearCity() {
    for (const b of cityBatches) {
      group.remove(b.mesh);
      group.remove(b.outline);
    }
    cityBatches.length = 0;
  }

  function addBatch(geo, count) {
    const mesh = new THREE.InstancedMesh(geo, tronMat, count);
    mesh.frustumCulled = false;

    const outline = new THREE.InstancedMesh(geo, outlineMat, count);
    outline.frustumCulled = false;

    group.add(mesh);
    group.add(outline);

    cityBatches.push({ mesh, outline, count });
    return cityBatches[cityBatches.length - 1];
  }

  function rebuildCityAlongTrack() {
    if (!track) return rebuildCityCircleFallback();

    clearCity();

    // total density scales with track length
    const total = Math.floor(THREE.MathUtils.clamp(track.totalLen * 0.85, 520, 1700));

    // Split across shapes
    const boxCount = Math.floor(total * 0.55);
    const cylCount = Math.floor(total * 0.25);
    const spireCount = total - boxCount - cylCount;

    // Geometries
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const cylGeo = new THREE.CylinderGeometry(0.65, 0.85, 1, 8, 1, false);
    const spireGeo = new THREE.ConeGeometry(0.75, 1, 7, 1, false);

    const batchBox = addBatch(boxGeo, boxCount);
    const batchCyl = addBatch(cylGeo, cylCount);
    const batchSpire = addBatch(spireGeo, spireCount);

    const dummy = new THREE.Object3D();
    const dummyO = new THREE.Object3D();

    const clampToArena = (v2) => {
      const margin = 12;
      v2.x = THREE.MathUtils.clamp(v2.x, arena.cx - arena.halfX + margin, arena.cx + arena.halfX - margin);
      v2.y = THREE.MathUtils.clamp(v2.y, arena.cz - arena.halfZ + margin, arena.cz + arena.halfZ - margin);
      return v2;
    };

    const exclusion = track.halfWidth + TRACK_CLEARANCE;

    placeAlongTrack(batchBox, boxCount, "box");
    placeAlongTrack(batchCyl, cylCount, "cyl");
    placeAlongTrack(batchSpire, spireCount, "spire");

    function placeAlongTrack(batch, count, shape) {
      const { mesh, outline } = batch;

      for (let i = 0; i < count; i++) {
        // Try several times to guarantee we land OUTSIDE the track exclusion zone
        let placed = null;
        let dir = null;

        for (let tries = 0; tries < 14; tries++) {
          const sample = samplePointAlongPolyline(track.pts2, track.segLens, track.totalLen);
          const p = sample.p;
          dir = sample.dir;

          // Right normal (relative to tangent direction)
          const rightNormal = new THREE.Vector2(dir.y, -dir.x).normalize().multiplyScalar(CITY_SIDE);

          // Base distance outside the lane + depth variation
          const baseOffset = track.halfWidth + TRACK_CLEARANCE + 10;

          const layer = Math.random();
          const randomExtra =
            layer < 0.70 ? (8 + Math.random() * 26) :
            layer < 0.93 ? (34 + Math.random() * 44) :
                           (80 + Math.random() * 120);

          const candidate = p.clone().add(rightNormal.multiplyScalar(baseOffset + randomExtra));

          clampToArena(candidate);

          // HARD rule: keep away from drivable corridor
          const d = closestDistanceToPolyline2(candidate, track.pts2);
          if (d >= exclusion) {
            placed = candidate;
            break;
          }
        }

        // If somehow still not found, push far out on the right side
        if (!placed) {
          const sample = samplePointAlongPolyline(track.pts2, track.segLens, track.totalLen);
          dir = sample.dir;
          const p = sample.p;

          const rightNormal = new THREE.Vector2(dir.y, -dir.x).normalize().multiplyScalar(CITY_SIDE);
          placed = p.clone().add(rightNormal.multiplyScalar(track.halfWidth + TRACK_CLEARANCE + 160));
          clampToArena(placed);
        }

        // Taller + more varied proportions
        const mega = Math.random() < 0.10;
        const giga = Math.random() < 0.03;

        let w, d, h;
        if (giga) {
          w = 8 + Math.random() * 20;
          d = 8 + Math.random() * 20;
          h = 180 + Math.random() * 340;
        } else if (mega) {
          w = 4 + Math.random() * 14;
          d = 4 + Math.random() * 14;
          h = 90 + Math.random() * 220;
        } else {
          w = 1.6 + Math.pow(Math.random(), 0.7) * 10;
          d = 1.6 + Math.pow(Math.random(), 0.7) * 10;
          h = 35 + Math.pow(Math.random(), 0.55) * 180;
        }

        // Shape-specific tweaks
        if (shape === "cyl") {
          w *= 0.75;
          d *= 0.75;
          h *= 1.15;
        } else if (shape === "spire") {
          w *= 0.65;
          d *= 0.65;
          h *= 1.35;
        }

        dummy.position.set(placed.x, h * 0.5, placed.y);

        // Align with track, add slight tilt
        const yaw = Math.atan2(dir.x, dir.y);
        const yawJitter = (Math.random() * 0.70 - 0.35);
        const tiltX = (Math.random() * 0.06 - 0.03);
        const tiltZ = (Math.random() * 0.06 - 0.03);

        dummy.rotation.set(tiltX, yaw + yawJitter, tiltZ);
        dummy.scale.set(w, h, d);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);

        dummyO.position.copy(dummy.position);
        dummyO.rotation.copy(dummy.rotation);
        dummyO.scale.set(w * 1.07, h * 1.03, d * 1.07);
        dummyO.updateMatrix();
        outline.setMatrixAt(i, dummyO.matrix);
      }

      mesh.instanceMatrix.needsUpdate = true;
      outline.instanceMatrix.needsUpdate = true;
    }
  }

  function rebuildCityCircleFallback() {
    clearCity();

    const count = 520;

    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const cylGeo = new THREE.CylinderGeometry(0.65, 0.85, 1, 8, 1, false);
    const spireGeo = new THREE.ConeGeometry(0.75, 1, 7, 1, false);

    const a = addBatch(boxGeo, Math.floor(count * 0.55));
    const b = addBatch(cylGeo, Math.floor(count * 0.25));
    const c = addBatch(spireGeo, count - Math.floor(count * 0.55) - Math.floor(count * 0.25));

    const batches = [a, b, c];
    const radius = Math.min(arena.halfX, arena.halfZ) * 0.92;

    const dummy = new THREE.Object3D();
    const dummyO = new THREE.Object3D();

    for (let bi = 0; bi < batches.length; bi++) {
      const { mesh, outline, count: n } = batches[bi];

      for (let i = 0; i < n; i++) {
        const ang = Math.random() * Math.PI * 2;
        const r = radius + (Math.random() * 18 - 9);

        const x = arena.cx + Math.cos(ang) * r;
        const z = arena.cz + Math.sin(ang) * r;

        const mega = Math.random() < 0.12;
        const w = mega ? (4 + Math.random() * 14) : (1.8 + Math.random() * 8);
        const d = mega ? (4 + Math.random() * 14) : (1.8 + Math.random() * 8);
        const h = mega ? (90 + Math.random() * 220) : (35 + Math.random() * 160);

        dummy.position.set(x, h * 0.5, z);
        dummy.rotation.set((Math.random()*0.06-0.03), ang + (Math.random()*0.6-0.3), (Math.random()*0.06-0.03));
        dummy.scale.set(w, h, d);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);

        dummyO.position.copy(dummy.position);
        dummyO.rotation.copy(dummy.rotation);
        dummyO.scale.set(w * 1.07, h * 1.03, d * 1.07);
        dummyO.updateMatrix();
        outline.setMatrixAt(i, dummyO.matrix);
      }

      mesh.instanceMatrix.needsUpdate = true;
      outline.instanceMatrix.needsUpdate = true;
    }
  }

  function update(time, dt, boostPulse = 0.0) {
    if (stars) stars.rotation.y += dt * 0.04;

    // shader uniforms
    if (tronMat?.uniforms) {
      tronMat.uniforms.uTime.value = time;
      tronMat.uniforms.uBoost.value = boostPulse || 0;
    }

    // outline pulse + cyan/magenta + a touch of red
    const pulse = 0.18 + (boostPulse || 0) * 0.35 + 0.06 * Math.sin(time * 2.3);
    outlineMat.opacity = THREE.MathUtils.lerp(outlineMat.opacity, pulse, 0.12);

    const t = 0.5 + 0.5 * Math.sin(time * 0.7);
    const u = 0.5 + 0.5 * Math.sin(time * 1.1 + 1.4);

    const cCyan = new THREE.Color(0x00f5ff);
    const cMag  = new THREE.Color(0xec10ae);
    const cRed  = new THREE.Color(0xff2a2a);

    // mostly cyan/magenta, occasional red bias
    outlineMat.color.copy(cCyan).lerp(cMag, t * 0.55).lerp(cRed, u * 0.18);

    // sky streaks + meteors
    skyStreaks.update(time, dt, boostPulse);
    meteorSystem.update(time, dt, boostPulse);
    stars.position.x = Math.sin(time*0.02)*5;
  }

  return {
    group,
    setBounds,
    setTrack,
    setBuildingMode,
    update,
  };
}

// ---------------- TRON MATERIAL (Instanced-safe) ----------------

function createTronBuildingMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uBoost: { value: 0 },

      // TRON palette (+red)
      uBase:   { value: new THREE.Color(0x02040a) },
      uCyan:   { value: new THREE.Color(0x00f5ff) },
      uBlue:   { value: new THREE.Color(0x2b6bff) },
      uMag:    { value: new THREE.Color(0xec10ae) },
      uViolet: { value: new THREE.Color(0x6a00ff) },
      uRed:    { value: new THREE.Color(0xff2a2a) },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      varying vec3 vNormalW;

      void main() {
        vec3 pos = position;
        vec3 nrm = normal;

        #ifdef USE_INSTANCING
          pos = (instanceMatrix * vec4(pos, 1.0)).xyz;
          nrm = mat3(instanceMatrix) * nrm;
        #endif

        vec4 wp = modelMatrix * vec4(pos, 1.0);
        vWorldPos = wp.xyz;
        vNormalW = normalize(mat3(modelMatrix) * nrm);

        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uBoost;

      uniform vec3 uBase;
      uniform vec3 uCyan;
      uniform vec3 uBlue;
      uniform vec3 uMag;
      uniform vec3 uViolet;
      uniform vec3 uRed;

      varying vec3 vWorldPos;
      varying vec3 vNormalW;

      float hash(vec2 p){
        p = fract(p * vec2(123.34, 345.45));
        p += dot(p, p + 34.345);
        return fract(p.x * p.y);
      }

      void main() {
        vec3 N = normalize(vNormalW);
        vec3 V = normalize(cameraPosition - vWorldPos);

        // strong rim glow
        float fresnel = pow(1.0 - max(dot(V, N), 0.0), 2.5);

        // height neon gradient
        float h = clamp(vWorldPos.y / 240.0, 0.0, 1.0);
        vec3 neon1 = mix(uCyan, uBlue, smoothstep(0.0, 0.35, h));
        vec3 neon2 = mix(uViolet, uMag, smoothstep(0.35, 1.0, h));
        vec3 neon = mix(neon1, neon2, smoothstep(0.25, 1.0, h));

        // occasional red accent by height + time
        float redMask = smoothstep(0.55, 1.0, h) * (0.5 + 0.5 * sin(uTime * 0.9 + vWorldPos.x * 0.01));
        neon = mix(neon, mix(neon, uRed, 0.55), redMask * 0.22);

        // windows
        vec2 g = vWorldPos.xz * 0.42;
        float cell = hash(floor(g));
        float windows = step(0.74, cell);
        windows *= 0.75 + 0.25 * sin(uTime * 9.0 + vWorldPos.x * 0.15 + vWorldPos.z * 0.15);

        // scanlines
        float scan = 0.5 + 0.5 * sin(vWorldPos.y * 0.65 - uTime * (7.5 + uBoost * 12.0));
        scan = smoothstep(0.40, 0.92, scan);

        // circuit strips
        float fx = abs(fract(vWorldPos.x * 0.10) - 0.5);
        float fz = abs(fract(vWorldPos.z * 0.10) - 0.5);
        float linesX = smoothstep(0.47, 0.50, fx);
        float linesZ = smoothstep(0.47, 0.50, fz);
        float circuits = (1.0 - linesX) * 0.35 + (1.0 - linesZ) * 0.35;

        // trippy hue wobble
        float wobble = 0.5 + 0.5 * sin(uTime * 1.2 + vWorldPos.x * 0.02 + vWorldPos.z * 0.02);
        vec3 wobNeon = mix(neon, mix(uCyan, uMag, wobble), 0.28);

        float flicker = 0.86 + 0.34 * sin(uTime * 13.0 + vWorldPos.x * 0.08 + vWorldPos.z * 0.08);

        vec3 col = uBase;

        col += wobNeon * (
          fresnel * 1.45 +
          scan * 0.22 +
          circuits * 0.08 +
          windows * 0.42
        ) * flicker;

        col *= (1.0 + uBoost * 0.55);

        gl_FragColor = vec4(col, 1.0);
      }
    `,
    transparent: false,
    depthWrite: true,
  });
}

// ---------------- Stars ----------------

function makeStarField(count = 2000, spread = 1200) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const idx = i * 3;
    pos[idx + 0] = (Math.random() * 2 - 1) * spread;
    pos[idx + 1] = Math.random() * spread * 1.1 + 80;
    pos[idx + 2] = (Math.random() * 2 - 1) * spread;
  }

  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));

  const mat = new THREE.PointsMaterial({
    color: 0x88ccff,
    size: 5.15,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });

  return new THREE.Points(geo, mat);
}

// ---------------- Sky streaks ----------------

function createSkyStreaks(count = 180) {
  const positions = new Float32Array(count * 2 * 3);
  const dirs = [];
  const speeds = [];
  const lengths = [];

  const baseYMin = 120;
  const baseYMax = 520;

  for (let i = 0; i < count; i++) {
    const x = (Math.random() * 2 - 1) * 2200;
    const y = baseYMin + Math.random() * (baseYMax - baseYMin);
    const z = (Math.random() * 2 - 1) * 2200;

    const dir = new THREE.Vector3(
      (Math.random() * 2 - 1) * 0.8,
      -(0.4 + Math.random() * 0.7),
      (Math.random() * 2 - 1) * 0.8
    ).normalize();

    const len = 30 + Math.random() * 140;
    const spd = 60 + Math.random() * 95;

    dirs.push(dir);
    speeds.push(spd);
    lengths.push(len);

    const x2 = x - dir.x * len;
    const y2 = y - dir.y * len;
    const z2 = z - dir.z * len;

    const o = i * 6;
    positions[o + 0] = x;  positions[o + 1] = y;  positions[o + 2] = z;
    positions[o + 3] = x2; positions[o + 4] = y2; positions[o + 5] = z2;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.LineBasicMaterial({
    color: 0x00f5ff,
    transparent: true,
    opacity: 0.42,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;

  function update(time, dt, boostPulse) {
    const base = 0.10 + 0.05 * Math.sin(time * 0.7);
    mat.opacity = THREE.MathUtils.lerp(mat.opacity, base + (boostPulse || 0) * 0.60, 0.08);

    // cyan/magenta with tiny red hint
    const mix1 = 0.5 + 0.5 * Math.sin(time * 0.6);
    const mix2 = 0.5 + 0.5 * Math.sin(time * 0.9 + 1.2);
    const cA = new THREE.Color(0x00f5ff);
    const cB = new THREE.Color(0xec10ae);
    const cR = new THREE.Color(0xff2a2a);
    mat.color.copy(cA).lerp(cB, mix1 * 0.35).lerp(cR, mix2 * 0.10);
  
    const arr = geo.attributes.position.array;

    for (let i = 0; i < count; i++) {
      const dir = dirs[i];
      const spd = speeds[i];
      const len = lengths[i];

      const o = i * 6;

      arr[o + 0] += dir.x * spd * dt;
      arr[o + 1] += dir.y * spd * dt;
      arr[o + 2] += dir.z * spd * dt;

      arr[o + 3] = arr[o + 0] - dir.x * len;
      arr[o + 4] = arr[o + 1] - dir.y * len;
      arr[o + 5] = arr[o + 2] - dir.z * len;

      if (arr[o + 1] < 80 || Math.abs(arr[o + 0]) > 2600 || Math.abs(arr[o + 2]) > 2600) {
        arr[o + 0] = (Math.random() * 2 - 1) * 2200;
        arr[o + 1] = 140 + Math.random() * 520;
        arr[o + 2] = (Math.random() * 2 - 1) * 2200;
      }
    }

    geo.attributes.position.needsUpdate = true;
  }

  return { lines, update };
}

// ---------------- Meteors ----------------
function createMeteors() {
  const group = new THREE.Group();

  const meteors = [];
  const meteorGeo = new THREE.SphereGeometry(1.3, 12, 12);

  // --- Red "doomsday" scheduling (guarantees frequent grand reds) ---
  let redTimer = 0;
  let nextRed = 2.8; // seconds
  function scheduleNextRed() {
    // how often the BIG RED meteor appears (lower = more frequent)
    nextRed = 2.0 + Math.random() * 2.8; // 2.0–4.8s
  }
  scheduleNextRed();

  function spawnMeteor(forcedType = null) {
    const headMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const head = new THREE.Mesh(meteorGeo, headMat);
    head.frustumCulled = false;

    // --- Trail: tapered cylinder (fatter near the meteor, thinner at the tail) ---
    // This taper makes it feel like fire / plasma.
    const trailGeo = new THREE.CylinderGeometry(1.0, 0.25, 1, 12, 1, true);
    trailGeo.translate(0, -0.5, 0);
    const trailMat = new THREE.MeshBasicMaterial({
      color: 0x00f5ff,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const trail = new THREE.Mesh(trailGeo, trailMat);
    trail.frustumCulled = false;

    // --- Glow halo (cheap fireball effect) ---
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(1.0, 12, 12),
      new THREE.MeshBasicMaterial({
        color: 0xff6a2a,
        transparent: true,
        opacity: 0.25,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    glow.frustumCulled = false;

    // spawn volume
    const start = new THREE.Vector3(
      (Math.random() * 2 - 1) * 1800,
      540 + Math.random() * 420,
      (Math.random() * 2 - 1) * 1800
    );

    const dir = new THREE.Vector3(
      (Math.random() < 0.5 ? -1 : 1) * (0.7 + Math.random() * 1.2),
      -(1.0 + Math.random() * 1.2),
      (Math.random() < 0.5 ? -1 : 1) * (0.7 + Math.random() * 1.2)
    ).normalize();

    // Keep speeds reasonable (prevents "too fast to notice")
    let speed = 210 + Math.random() * 280; // 210–490 (noticeable)
    let life = 1.8 + Math.random() * 2.2;  // 1.8–4.0
    let trailLen = 120 + Math.random() * 220;

    // Decide type (or force red)
    const roll = Math.random();
    const isRed = forcedType === "red" ? true : (roll < 0.10);  // 10% random reds + scheduled reds
    const isMag = !isRed && (roll < 0.30);                      // 20% magenta

    if (isRed) {
      // ---- DOOMSDAY ASTEROID SETTINGS ----
      trailMat.color.setHex(0xff2a2a);
      trailMat.opacity = 0.55;

      // slower + longer living = "grand", not a blink
      speed = 170 + Math.random() * 170;     // 170–340
      life  = 2.8 + Math.random() * 2.8;     // 2.8–5.6
      trailLen = 500 + Math.random() * 360;  // 260–620

      // Huge head
      const s = 16.0 + Math.random() * 5.5;   // BIG
      head.scale.setScalar(s);

      // Big halo
      glow.scale.setScalar(s * 2.2);

    } else if (isMag) {
      trailMat.color.setHex(0xec10ae);
      head.scale.setScalar(1.7 + Math.random() * 1.4);
      glow.scale.setScalar(4.0 + Math.random() * 2.0);
    } else {
      trailMat.color.setHex(0x00f5ff);
      head.scale.setScalar(1.2 + Math.random() * 0.9);
      glow.scale.setScalar(3.0 + Math.random() * 1.5);
    }

    head.position.copy(start);
    glow.position.copy(start);

    group.add(head);
    group.add(trail);
    group.add(glow);

    // Thickness control (red = MUCH thicker)
    const baseRadius = isRed
      ? (16.0 + Math.random() * 5.0)   // 🔥 THICK
      : (0.7 + Math.random() * 1.1);

    meteors.push({ head, trail, glow, dir, speed, life, trailLen, isRed, baseRadius });
  }

  function update(time, dt, boostPulse) {
    // Normal meteors (keep these modest so it doesn't get noisy)
    const rate = 0.10 + (boostPulse || 0) * 0.06;
    if (Math.random() < dt * rate) spawnMeteor();

    // Scheduled GRAND red meteors (more frequent + guaranteed)
    redTimer += dt;
    if (redTimer >= nextRed) {
      spawnMeteor("red");
      redTimer = 0;
      scheduleNextRed();
    }

    const up = new THREE.Vector3(0, 1, 0);

    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i];
      m.life -= dt;

      m.head.position.addScaledVector(m.dir, m.speed * dt);
      m.glow.position.copy(m.head.position);

      // Trail behind head
      const headPos = m.head.position;

      // orient cylinder Y-axis to direction
      const up = new THREE.Vector3(0, 1, 0);
      m.trail.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(up, m.dir));

      // compute head radius (meteorGeo radius 1.3 * scale)
      const headRadius = 1.3 * m.head.scale.x;

      // place the trail so it *starts* right at the ball (slightly behind to avoid clipping)
      m.trail.position.copy(headPos).addScaledVector(m.dir, -headRadius * 0.15);

      // scale: y = length because geometry height = 1 and we translated it
      const radius = m.baseRadius * (m.isRed ? 1.0 : 0.55);
      m.trail.scale.set(radius, m.trailLen, radius);


      // Fade out
      const fade = THREE.MathUtils.clamp(m.life / 1.1, 0, 1);
      m.head.material.opacity = (m.isRed ? 0.95 : 0.82) * fade;
      m.trail.material.opacity = (m.isRed ? 0.60 : 0.22) * fade;
      m.glow.material.opacity  = (m.isRed ? 0.32 : 0.14) * fade;

      // Extra fiery behavior for red meteors
      if (m.isRed) {
        // flicker + hotter orange pulses
        const flick = 0.72 + 0.28 * Math.sin(time * 18.0 + headPos.x * 0.01 + headPos.z * 0.01);
        m.trail.material.opacity *= flick;

        const hot = 0.5 + 0.5 * Math.sin(time * 6.5);
        m.trail.material.color
          .setHex(0xff2a2a)
          .lerp(new THREE.Color(0xffa23a), hot * 0.65);

        m.glow.material.color
          .setHex(0xff4a2a)
          .lerp(new THREE.Color(0xffd36a), hot * 0.35);

        // slight halo breathing
        const base = m.head.scale.x * 2.2;
        m.glow.scale.setScalar(base * (1.0 + 0.06 * Math.sin(time * 10.0)));
      }

      // Kill
      if (m.life <= 0 || m.head.position.y < 60) {
        group.remove(m.head);
        group.remove(m.trail);
        group.remove(m.glow);
        m.head.geometry.dispose();
        m.head.material.dispose();
        m.trail.geometry.dispose();
        m.trail.material.dispose();
        m.glow.geometry.dispose();
        m.glow.material.dispose();
        meteors.splice(i, 1);
      }
    }
  }

  return { group, update };
}

// ---------------- Polyline helpers ----------------

function computePolylineLengths(points2) {
  const segLens = [];
  let totalLen = 0;

  for (let i = 0; i < points2.length - 1; i++) {
    const a = points2[i];
    const b = points2[i + 1];
    const d = b.clone().sub(a).length();
    segLens.push(d);
    totalLen += d;
  }
  return { segLens, totalLen: Math.max(totalLen, 1e-6) };
}

function samplePointAlongPolyline(points2, segLens, totalLen) {
  let r = Math.random() * totalLen;

  let i = 0;
  while (i < segLens.length && r > segLens[i]) {
    r -= segLens[i];
    i++;
  }
  i = Math.min(i, segLens.length - 1);

  const a = points2[i];
  const b = points2[i + 1];

  const t = segLens[i] > 0 ? r / segLens[i] : 0.0;

  const p = a.clone().lerp(b, t);
  const dir = b.clone().sub(a).normalize();

  return { p, dir };
}

// Closest distance from point (Vector2) to the polyline (Vector2[])
// returns distance in world units
function closestDistanceToPolyline2(p, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const d = pointSegmentDistance2(p, a, b);
    if (d < best) best = d;
  }
  return best;
}

function pointSegmentDistance2(p, a, b) {
  const ab = b.clone().sub(a);
  const ap = p.clone().sub(a);
  const abLen2 = ab.lengthSq();
  let t = abLen2 > 0 ? ap.dot(ab) / abLen2 : 0;
  t = THREE.MathUtils.clamp(t, 0, 1);
  const proj = a.clone().add(ab.multiplyScalar(t));
  return proj.distanceTo(p);
}
