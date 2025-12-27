// src/environment.js
import * as THREE from "three";

export function createEnvironment(scene, renderer) {
  const group = new THREE.Group();
  scene.add(group);

  // --------- dynamic bounds (updated from main.js) ----------
  let halfX = 300;
  let halfZ = 300;
  const maxHalf = () => Math.max(halfX, halfZ);

  // ---------- SKY DOME ----------
  const skyGeo = new THREE.SphereGeometry(2500, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color(0x050a14) },
      uMid: { value: new THREE.Color(0x020308) },
      uBot: { value: new THREE.Color(0x000000) },
    },
    vertexShader: `
      varying vec3 vPos;
      void main(){
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vPos;
      uniform vec3 uTop, uMid, uBot;
      void main(){
        float h = normalize(vPos).y * 0.5 + 0.5;
        vec3 col = mix(uBot, uMid, smoothstep(0.0, 0.6, h));
        col = mix(col, uTop, smoothstep(0.55, 1.0, h));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  group.add(sky);

  // ---------- CITY RING (INSTANCED) ----------
  const CITY_COUNT  = 1800;
  const CITY_HEIGHT_MIN = 25;
  const CITY_HEIGHT_MAX = 180;

  const bGeo = new THREE.BoxGeometry(1, 1, 1);

  const bMat = new THREE.ShaderMaterial({
    transparent: false,
    uniforms: {
      uTime: { value: 0 },
      uBase: { value: new THREE.Color(0x020308) },
      uNeon: { value: new THREE.Color(0x00f5ff) },
      uNeon2:{ value: new THREE.Color(0xec10ae) },
      uPulse:{ value: 0.0 },
    },
    vertexShader: `
      varying vec3 vWorld;
      varying vec3 vLocal;
      void main(){
        vLocal = position;
        vec4 w = modelMatrix * instanceMatrix * vec4(position,1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: `
      varying vec3 vWorld;
      varying vec3 vLocal;
      uniform float uTime;
      uniform float uPulse;
      uniform vec3 uBase, uNeon, uNeon2;

      float hash(vec2 p){
        p = fract(p * vec2(123.34, 345.45));
        p += dot(p, p + 34.345);
        return fract(p.x * p.y);
      }

      void main(){
        vec3 col = uBase;

        vec2 g = vec2(vWorld.x, vWorld.z) * 0.18 + vec2(vWorld.y * 0.08);
        vec2 cell = floor(g);
        float h = hash(cell);

        float win = step(0.62, h);

        float scan = 0.5 + 0.5 * sin(uTime * 1.8 + vWorld.y * 0.08 + h * 6.2831);
        scan = smoothstep(0.35, 0.95, scan);

        vec3 neon = mix(uNeon, uNeon2, step(0.5, hash(cell + 19.2)));

        float b = win * (0.25 + 0.75 * scan);
        b += uPulse * win * 0.8;

        col += neon * b;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const buildings = new THREE.InstancedMesh(bGeo, bMat, CITY_COUNT);
  buildings.frustumCulled = false;
  group.add(buildings);

  // Cache per-building randoms so resizing doesn't "shuffle" the city
  const citySeed = Array.from({ length: CITY_COUNT }, (_, i) => {
    const angle = (i / CITY_COUNT) * Math.PI * 2;
    return {
      angle,
      radialJitter: Math.random() * 90,
      h: THREE.MathUtils.lerp(CITY_HEIGHT_MIN, CITY_HEIGHT_MAX, Math.random() ** 2),
      w: THREE.MathUtils.lerp(6, 22, Math.random()),
      d: THREE.MathUtils.lerp(6, 22, Math.random()),
    };
  });

  const dummy = new THREE.Object3D();

  function rebuildCityRing() {
    // Put city OUTSIDE the arena so it frames it, not sits inside it
    const CITY_RADIUS = maxHalf() * 1.35 + 60;

    for (let i = 0; i < CITY_COUNT; i++) {
      const s = citySeed[i];
      const radius = CITY_RADIUS + s.radialJitter;

      const x = Math.cos(s.angle) * radius;
      const z = Math.sin(s.angle) * radius;

      dummy.position.set(x, s.h * 0.5 - 2, z);
      dummy.rotation.y = s.angle + Math.PI * 0.5;
      dummy.scale.set(s.w, s.h, s.d);
      dummy.updateMatrix();

      buildings.setMatrixAt(i, dummy.matrix);
    }
    buildings.instanceMatrix.needsUpdate = true;
  }

  // ---------- HOLOGRAM BILLBOARDS ----------
  const holoGroup = new THREE.Group();
  group.add(holoGroup);

  function makeHoloSign(text, color = "#00f5ff") {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 512;
    const ctx = c.getContext("2d");

    function draw(t = 0) {
      ctx.clearRect(0, 0, c.width, c.height);

      ctx.fillStyle = "rgba(0,0,0,0)";
      ctx.fillRect(0, 0, c.width, c.height);

      ctx.fillStyle = "rgba(255,255,255,0.04)";
      for (let y = 0; y < c.height; y += 6) ctx.fillRect(0, y, c.width, 2);

      const jx = Math.sin(t * 8.0) * 3.0;

      ctx.font = '900 150px system-ui, sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      ctx.shadowColor = color;
      ctx.shadowBlur = 60;

      ctx.fillStyle = color;
      ctx.fillText(text, c.width / 2 + jx, c.height / 2);

      ctx.font = '700 44px system-ui, sans-serif';
      ctx.shadowBlur = 25;
      ctx.fillStyle = "rgba(236,16,174,0.85)";
      ctx.fillText("NEON GRID CIRCUIT", c.width / 2, c.height * 0.82);
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;

    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const geo = new THREE.PlaneGeometry(70, 35);
    const mesh = new THREE.Mesh(geo, mat);

    return { mesh, update: (t) => { draw(t); tex.needsUpdate = true; } };
  }

  const signs = [];
  const s1 = makeHoloSign("TRON CIRCUIT", "#00f5ff");
  holoGroup.add(s1.mesh);
  signs.push(s1);

  const s2 = makeHoloSign("LIGHTCYCLE", "#ec10ae");
  holoGroup.add(s2.mesh);
  signs.push(s2);

  function repositionSigns() {
    // Place near outer edges of the arena, so they "frame" the action
    const pad = 110;
    s1.mesh.position.set(0, 40, -(halfZ + pad));
    s1.mesh.rotation.y = 0;

    s2.mesh.position.set(halfX + pad, 32, 0);
    s2.mesh.rotation.y = -Math.PI * 0.5;
  }

  // ---------- SCANLINE SWEEP RING ----------
  const sweepGeo = new THREE.RingGeometry(1, 1.22, 128);
  const sweepMat = new THREE.MeshBasicMaterial({
    color: 0x00f5ff,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const sweep = new THREE.Mesh(sweepGeo, sweepMat);
  sweep.rotation.x = -Math.PI * 0.5;
  sweep.position.y = 0.15;
  group.add(sweep);

  let sweepT = 0;
  let sweepActive = false;

  function triggerSweep() {
    sweepT = 0;
    sweepActive = true;
    sweepMat.opacity = 1.0;
  }

  // ---------- LIGHT SHAFTS (FAKE VOLUMETRIC) ----------
  const shaftGroup = new THREE.Group();
  group.add(shaftGroup);

  function makeShaft() {
    const geo = new THREE.CylinderGeometry(0.6, 6.0, 90, 18, 1, true);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        varying vec2 vUv;
        void main(){
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform float uTime;
        float n(float x){ return fract(sin(x)*43758.5453123); }
        void main(){
          float v = smoothstep(0.0, 0.15, vUv.y) * (1.0 - smoothstep(0.75, 1.0, vUv.y));
          float bands = 0.5 + 0.5*sin((vUv.y*18.0) - uTime*2.2 + n(vUv.x*10.0)*6.28);
          bands = smoothstep(0.35, 0.9, bands);
          float a = v * bands * 0.45;
          gl_FragColor = vec4(0.0, 0.96, 1.0, a);
        }
      `,
    });
    const m = new THREE.Mesh(geo, mat);
    return { mesh: m, mat };
  }

  const shafts = [];
  const SHAFT_COUNT = 28;

  for (let i = 0; i < SHAFT_COUNT; i++) {
    const s = makeShaft();
    shafts.push(s);
    shaftGroup.add(s.mesh);
  }

  function scatterShaftsAcrossArena() {
    // Scatter THROUGH the arena instead of a circle in the middle
    // (keep a margin so they don't sit inside walls)
    const margin = 25;
    for (let i = 0; i < shafts.length; i++) {
      const s = shafts[i];

      const x = THREE.MathUtils.randFloat(-halfX + margin, halfX - margin);
      const z = THREE.MathUtils.randFloat(-halfZ + margin, halfZ - margin);

      s.mesh.position.set(x, 45, z);

      // random slight scale so it feels organic
      const sc = THREE.MathUtils.randFloat(0.9, 1.35);
      s.mesh.scale.set(sc, 1.0, sc);

      s.mesh.rotation.y = Math.random() * Math.PI * 2;
    }
  }

  // ---------- BOUNDS API (called from main.js) ----------
  function setBounds(newHalfX, newHalfZ) {
    halfX = Math.max(50, newHalfX || halfX);
    halfZ = Math.max(50, newHalfZ || halfZ);

    rebuildCityRing();
    repositionSigns();
    scatterShaftsAcrossArena();
  }

  // build once with defaults (until arena loads and calls setBounds)
  rebuildCityRing();
  repositionSigns();
  scatterShaftsAcrossArena();

  // ---------- UPDATE HOOK ----------
  function update(t, dt, intensity = 0) {
    bMat.uniforms.uTime.value = t;
    bMat.uniforms.uPulse.value = intensity;

    for (const s of signs) s.update(t);

    // sweep event auto triggers
    if (!sweepActive && (Math.floor(t) % 18 === 0) && (Math.random() < 0.02)) {
      triggerSweep();
    }

    if (sweepActive) {
      sweepT += dt;

      // scale sweep to cover the FULL arena footprint
      const Rmax = maxHalf() * 1.55 + 80;
      const Rmin = maxHalf() * 0.12;

      const k = THREE.MathUtils.smoothstep(sweepT, 0, 2.2);
      const R = THREE.MathUtils.lerp(Rmin, Rmax, k);

      sweep.scale.setScalar(R);
      sweepMat.opacity = Math.max(0, 1.0 - sweepT / 2.2);

      bMat.uniforms.uPulse.value = Math.max(
        bMat.uniforms.uPulse.value,
        sweepMat.opacity * 0.75
      );

      if (sweepT >= 2.2) {
        sweepActive = false;
        sweepMat.opacity = 0.0;
      }
    }

    for (const s of shafts) s.mat.uniforms.uTime.value = t;
  }

  return {
    group,
    update,
    triggerSweep,
    setBounds, // ✅ IMPORTANT: call this after arena loads
  };
}
