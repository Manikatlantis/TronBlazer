// audio.js
import * as THREE from "three";

export function createAudioManager(camera) {
  const listener = new THREE.AudioListener();
  camera.add(listener);

  const loader = new THREE.AudioLoader();

  const bgm = new THREE.Audio(listener);
  bgm.setLoop(true);
  bgm.setVolume(0.55);

  const whoosh = new THREE.Audio(listener);
  whoosh.setLoop(true);
  whoosh.setVolume(0.85);

  // --- pickup pool ---
  const PICKUP_POOL_SIZE = 4;
  const pickupPool = Array.from({ length: PICKUP_POOL_SIZE }, () => {
    const a = new THREE.Audio(listener);
    a.setLoop(false);
    a.setVolume(0.9);
    return a;
  });
  let pickupIdx = 0;
  let pickupLoaded = false;

  // --- NEW: damage pool ---
  const DAMAGE_POOL_SIZE = 3;
  const damagePool = Array.from({ length: DAMAGE_POOL_SIZE }, () => {
    const a = new THREE.Audio(listener);
    a.setLoop(false);
    a.setVolume(0.95);
    return a;
  });
  let damageIdx = 0;
  let damageLoaded = false;
  // -----------------------

  let bgmLoaded = false;
  let whooshLoaded = false;

  let wantBgm = false;
  let wantWhoosh = false;

  function resumeContextIfNeeded() {
    const ctx = listener.context;
    if (ctx && ctx.state !== "running") ctx.resume();
  }

  function load() {
    loader.load("./public/audio/tron_bgm.mp3", (buffer) => {
      bgm.setBuffer(buffer);
      bgmLoaded = true;
      if (wantBgm && !bgm.isPlaying) bgm.play();
    });

    loader.load("./public/audio/nitros_whoosh.mp3", (buffer) => {
      whoosh.setBuffer(buffer);
      whooshLoaded = true;
      if (wantWhoosh && !whoosh.isPlaying) whoosh.play();
    });

    loader.load("./public/audio/orb_pickup.mp3", (buffer) => {
      pickupPool.forEach((a) => a.setBuffer(buffer));
      pickupLoaded = true;
    });

    // NEW
    loader.load("./public/audio/damage.mp3", (buffer) => {
      damagePool.forEach((a) => a.setBuffer(buffer));
      damageLoaded = true;
    });
  }

  function startBgm() {
    resumeContextIfNeeded();
    wantBgm = true;
    if (bgmLoaded && !bgm.isPlaying) bgm.play();
  }

  function stopBgm() {
    wantBgm = false;
    if (bgm.isPlaying) bgm.stop();
  }

  function setWhoosh(on) {
    resumeContextIfNeeded();
    wantWhoosh = on;

    if (!whooshLoaded) return;

    if (on) {
      if (!whoosh.isPlaying) whoosh.play();
    } else {
      if (whoosh.isPlaying) whoosh.stop();
    }
  }

  function playPickup() {
    resumeContextIfNeeded();
    if (!pickupLoaded) return;

    const a = pickupPool[pickupIdx];
    pickupIdx = (pickupIdx + 1) % pickupPool.length;

    if (a.isPlaying) a.stop();
    a.play();
  }

  // NEW
  function playDamage() {
    resumeContextIfNeeded();
    if (!damageLoaded) return;

    const a = damagePool[damageIdx];
    damageIdx = (damageIdx + 1) % damagePool.length;

    if (a.isPlaying) a.stop();
    a.play();
  }

  function update({ holdingNitro, nitroAmount, gameState }) {
    const shouldWhoosh =
      gameState === "PLAYING" && holdingNitro && nitroAmount > 0;

    setWhoosh(shouldWhoosh);
  }

  function stopAll() {
    setWhoosh(false);
    stopBgm();
  }

  return {
    load,
    startBgm,
    stopBgm,
    setWhoosh,
    playPickup,
    playDamage, // ✅ expose it
    update,
    stopAll,
    resumeContextIfNeeded,
  };
}
