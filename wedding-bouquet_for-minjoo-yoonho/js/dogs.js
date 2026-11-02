import * as THREE from '../vendor/three/three.module.min.js?v=r170';
import { mergeGeometries } from '../vendor/three/addons/utils/BufferGeometryUtils.js?v=r170';
import { blobShadow } from './room.js?v=20261102f';

/* ────────────────────────────────────────────────────────────
   앉아 있는 강아지 (폼피츠 / 비숑)
   - 몸은 매끈한 타원체들을 합쳐 만들고,
   - 그 위에 "쉘 퍼(shell fur)" 를 여러 겹 쌓아 보송보송한 털을 표현합니다.
   로컬 좌표: +y = 위, +z = 정면
   ──────────────────────────────────────────────────────────── */

const SPHERE = new THREE.SphereGeometry(1, 22, 16);
SPHERE.deleteAttribute('uv');
const smoothstep = THREE.MathUtils.smoothstep;

/** 타원체 파츠 하나 (위치/반지름/회전/털 길이 배수/얼굴 쪽 털 줄이기) */
function part(center, radii, { rot = [0, 0, 0], tint = [1.06, 1.045, 1.015], fur = 1, faceShort = 0 } = {}) {
  const g = SPHERE.clone();
  const n = g.attributes.normal;
  const col = new Float32Array(n.count * 3);
  const furA = new Float32Array(n.count);
  for (let i = 0; i < n.count; i++) {
    const ao = 0.9 + 0.1 * (n.getY(i) * 0.5 + 0.5); // 아래쪽 살짝 어둡게
    col[i * 3] = tint[0] * ao; col[i * 3 + 1] = tint[1] * ao; col[i * 3 + 2] = tint[2] * ao;
    furA[i] = fur * (1 - faceShort * smoothstep(n.getZ(i), 0.22, 0.7));
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aFur', new THREE.BufferAttribute(furA, 1));
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...center),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
    new THREE.Vector3(...radii),
  );
  g.applyMatrix4(m);
  return g;
}

/* ───────── 쉘 퍼 머티리얼 ───────── */
function furMaterial(shell, len, density) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  const uniforms = { uShell: { value: shell }, uLen: { value: len }, uDensity: { value: density } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aFur; uniform float uShell; uniform float uLen; varying vec3 vFurPos;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vFurPos = position;
        transformed += normalize(objectNormal) * uLen * uShell * aFur;
        transformed.y -= uShell * uShell * uLen * 0.3 * aFur;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uShell; uniform float uDensity; varying vec3 vFurPos;
        float h31(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (uShell > 0.001) {
          vec3 p = vFurPos * uDensity;
          vec3 c = floor(p);
          vec3 f = fract(p) - 0.5;
          float h = 0.55 + 0.45 * h31(c);
          f -= (vec3(h31(c + 11.3), h31(c + 27.1), h31(c + 5.7)) - 0.5) * 0.45;
          float r = 0.74 * (1.0 - pow(uShell / h, 1.6));
          if (uShell > h || length(f) > r) discard;
        }
        diffuseColor.rgb *= mix(0.78, 1.04, uShell);`);
  };
  m.customProgramCacheKey = () => 'shellfur';
  return m;
}

/** 베이스 지오메트리 위에 털 층을 쌓은 그룹 */
function furGroup(geo, { len = 0.04, density = 150, layers = 12 } = {}) {
  const grp = new THREE.Group();
  for (let i = 0; i < layers; i++) {
    const s = i / (layers - 1);
    const mesh = new THREE.Mesh(geo, furMaterial(s, len, density));
    mesh.castShadow = i === 0;
    mesh.frustumCulled = false;
    grp.add(mesh);
  }
  return grp;
}

/* ───────── 얼굴 파츠 ───────── */
const eyeMat = new THREE.MeshStandardMaterial({ color: '#17110f', roughness: 0.1, metalness: 0.1 });
const noseMat = new THREE.MeshStandardMaterial({ color: '#241c1a', roughness: 0.28 });
const tongueMat = new THREE.MeshStandardMaterial({ color: '#f0a3ac', roughness: 0.5 });
const earInMat = new THREE.MeshStandardMaterial({ color: '#f2c9bf', roughness: 0.9 });
const shineMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });

function ball(r, mat, x, y, z, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz);
  return m;
}
function smile(x, y, z, r = 0.013) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.0022, 6, 16, Math.PI), noseMat);
  m.rotation.z = Math.PI; m.position.set(x, y, z); m.scale.y = 0.75;
  return m;
}

/* ───────── 한 마리 만들기 ───────── */
function makeDog(kind) {
  const isPom = kind === 'pom';
  const root = new THREE.Group();
  const bodyG = new THREE.Group(); root.add(bodyG);
  const warm = [1.05, 1.0, 0.94];

  /* 몸 */
  const B = [];
  if (isPom) {
    B.push(part([0, 0.17, -0.02], [0.105, 0.135, 0.105]));
    B.push(part([0, 0.21, 0.055], [0.095, 0.1, 0.07], { fur: 1.45 }));
    B.push(part([-0.088, 0.07, -0.025], [0.06, 0.065, 0.09]), part([0.088, 0.07, -0.025], [0.06, 0.065, 0.09]));
    B.push(part([0, 0.055, -0.075], [0.1, 0.05, 0.07], { fur: 1.3 }));
    [-1, 1].forEach((s) => {
      B.push(part([s * 0.042, 0.095, 0.095], [0.026, 0.09, 0.03], { fur: 0.8 }));
      B.push(part([s * 0.042, 0.022, 0.125], [0.034, 0.024, 0.048], { fur: 0.7 }));
    });
  } else {
    B.push(part([0, 0.14, -0.01], [0.095, 0.12, 0.095]));
    B.push(part([0, 0.175, 0.06], [0.085, 0.085, 0.06], { fur: 1.2 }));
    B.push(part([-0.075, 0.065, -0.01], [0.052, 0.058, 0.085]), part([0.075, 0.065, -0.01], [0.052, 0.058, 0.085]));
    [-1, 1].forEach((s) => {
      B.push(part([s * 0.038, 0.09, 0.09], [0.024, 0.085, 0.028], { fur: 0.8 }));
      B.push(part([s * 0.038, 0.021, 0.118], [0.032, 0.022, 0.045], { fur: 0.7 }));
    });
  }
  const bodyFur = furGroup(mergeGeometries(B), isPom ? { len: 0.036, density: 240 } : { len: 0.04, density: 270 });
  bodyG.add(bodyFur);

  /* 꼬리 */
  const tailG = new THREE.Group();
  const T = isPom
    ? [part([0, 0.05, -0.025], [0.045, 0.06, 0.045], { fur: 1.3 }), part([0, 0.12, -0.02], [0.055, 0.06, 0.055], { fur: 1.3 }), part([0, 0.17, 0.02], [0.055, 0.045, 0.06], { fur: 1.3 })]
    : [part([0, 0.035, -0.015], [0.03, 0.045, 0.03], { fur: 1.2 }), part([0, 0.085, -0.02], [0.04, 0.045, 0.04], { fur: 1.2 })];
  tailG.add(furGroup(mergeGeometries(T), isPom ? { len: 0.036, density: 240 } : { len: 0.036, density: 270 }));
  tailG.position.set(0, isPom ? 0.17 : 0.15, isPom ? -0.11 : -0.1);
  bodyG.add(tailG);

  /* 머리 */
  const head = new THREE.Group();
  head.position.set(0, isPom ? 0.265 : 0.235, 0.045);
  const H = [];
  const eyes = [];
  const bits = [];
  if (isPom) {
    H.push(part([0, 0.075, 0.01], [0.082, 0.072, 0.072], { faceShort: 0.75 }));
    H.push(part([-0.06, 0.04, 0.025], [0.04, 0.035, 0.04], { fur: 1.25 }), part([0.06, 0.04, 0.025], [0.04, 0.035, 0.04], { fur: 1.25 }));
    H.push(part([0, 0.042, 0.072], [0.034, 0.028, 0.042], { fur: 0.3 }));
    [-1, 1].forEach((s) => {
      H.push(part([s * 0.052, 0.145, -0.002], [0.022, 0.042, 0.015], { rot: [0, 0, -s * 0.28], fur: 0.5, tint: warm }));
      const inner = ball(0.018, earInMat, s * 0.054, 0.142, 0.01, 0.8, 1.5, 0.3);
      inner.rotation.z = -s * 0.28; bits.push(inner);
      eyes.push(ball(0.0118, eyeMat, s * 0.034, 0.083, 0.081));
    });
    bits.push(ball(0.0145, noseMat, 0, 0.05, 0.113, 1.2, 0.9, 1));
    bits.push(ball(0.012, tongueMat, 0, 0.012, 0.102, 0.9, 0.5, 1.5));
    bits.push(smile(-0.012, 0.03, 0.108), smile(0.012, 0.03, 0.108));
  } else {
    H.push(part([0, 0.08, 0.01], [0.092, 0.085, 0.085], { faceShort: 0.6 }));
    H.push(part([0, 0.04, 0.078], [0.03, 0.025, 0.035], { fur: 0.3 }));
    [-1, 1].forEach((s) => {
      H.push(part([s * 0.088, 0.05, 0.0], [0.03, 0.055, 0.04], { rot: [0, 0, s * 0.12], fur: 1.1 }));
      eyes.push(ball(0.0125, eyeMat, s * 0.033, 0.078, 0.091));
    });
    bits.push(ball(0.0165, noseMat, 0, 0.046, 0.112, 1.25, 0.95, 1));
    bits.push(smile(-0.011, 0.03, 0.108), smile(0.011, 0.03, 0.108));
    bits.push(ball(0.0105, tongueMat, 0, 0.012, 0.099, 0.9, 0.5, 1.4));
  }
  head.add(furGroup(mergeGeometries(H), isPom ? { len: 0.03, density: 250 } : { len: 0.038, density: 290 }));
  eyes.forEach((e) => {
    const s = ball(0.0038, shineMat, 0.004, 0.005, 0.0098);
    e.add(s);
    head.add(e);
  });
  bits.forEach((b) => head.add(b));
  bodyG.add(head);

  /* 그림자 */
  const sh = blobShadow(isPom ? 0.52 : 0.44, isPom ? 0.48 : 0.42, 0.4);
  sh.position.set(0, 0.006, 0);
  root.add(sh);

  const scale = isPom ? 1.15 : 0.95;
  root.scale.setScalar(scale);
  return { root, bodyG, head, tailG, eyes, kind, scale };
}

/* ───────── 동작(애니메이션) ───────── */
const BEG_DUR = 2.8;
const SPIN_DUR = 1.1;

export function createDogs() {
  const dogs = [makeDog('pom'), makeDog('bichon')].map((d, i) => {
    d.name = d.kind === 'pom' ? '폼피츠' : '비숑';
    d.say = d.kind === 'pom' ? '왈!' : '멍!';
    d.seed = i * 3.1;
    d.hop = 0;
    d.blinkT = 2 + Math.random() * 3;
    d.blink = 0;
    d.lookYaw = 0; d.lookPitch = 0;
    d.tilt = 0; d.tiltT = 3 + Math.random() * 4; d.tiltTarget = 0;
    d.excited = 0;
    d.beg = 0; d.spinT = 0;
    return d;
  });

  function update(t, dt, look) {
    dogs.forEach((d) => {
      const br = Math.sin(t * 2.1 + d.seed) * 0.012;
      d.bodyG.scale.set(1 + br * 0.6, 1 + br, 1 + br * 0.6);

      if (d.hop > 0) d.hop = Math.max(0, d.hop - dt * 1.6);
      d.root.position.y = Math.sin((1 - d.hop) * Math.PI) * (d.hop > 0 ? 0.11 : 0) * d.scale;

      d.tiltT -= dt;
      if (d.tiltT < 0) { d.tiltTarget = (Math.random() - 0.5) * 0.5; d.tiltT = 2.5 + Math.random() * 4; if (Math.random() < 0.35) d.tiltTarget = 0; }
      d.tilt += (d.tiltTarget - d.tilt) * Math.min(1, dt * 3);

      d.lookYaw += (look.yaw - d.lookYaw) * Math.min(1, dt * 4);
      d.lookPitch += (look.pitch - d.lookPitch) * Math.min(1, dt * 4);
      d.head.rotation.set(-d.lookPitch * 0.3 + Math.sin(t * 1.3 + d.seed) * 0.02, d.lookYaw * 0.55, d.tilt + d.hop * 0.15);

      // 앞발 들고 애교 (뒷다리 쪽을 축으로 몸을 세우고 앞발을 까딱까딱)
      if (d.beg > 0) d.beg = Math.max(0, d.beg - dt);
      const begAmt = d.beg > 0 ? Math.min(1, (BEG_DUR - d.beg) * 4, d.beg * 4) : 0;
      const paw = Math.sin(t * 11 + d.seed) * 0.07 * begAmt;
      d.bodyG.rotation.x = -0.62 * begAmt + paw;
      d.bodyG.position.y = 0.06 * begAmt;
      d.head.rotation.x += 0.52 * begAmt - paw * 0.8;
      d.head.rotation.z += Math.sin(t * 3 + d.seed) * 0.18 * begAmt;

      // 빙글 한 바퀴
      if (d.baseYaw === undefined) d.baseYaw = d.root.rotation.y;
      if (d.spinT > 0) d.spinT = Math.max(0, d.spinT - dt / SPIN_DUR);
      const sp = 1 - d.spinT;
      const ease = d.spinT > 0 ? sp * sp * (3 - 2 * sp) : 0;
      d.root.rotation.y = d.baseYaw + ease * Math.PI * 2;
      if (d.spinT > 0) d.root.position.y += Math.sin(sp * Math.PI) * 0.05 * d.scale;

      d.excited = Math.max(0, d.excited - dt * 0.5);
      const wag = Math.sin(t * (4 + d.excited * 16) + d.seed) * (0.12 + d.excited * 0.55);
      d.tailG.rotation.z = wag;
      d.tailG.rotation.y = wag * 0.4;

      d.blinkT -= dt;
      if (d.blinkT < 0) { d.blink = 0.14; d.blinkT = 2.2 + Math.random() * 4; }
      d.blink = Math.max(0, d.blink - dt);
      const ey = d.blink > 0 ? 0.12 : 1;
      d.eyes.forEach((e) => { e.scale.y = ey; });
    });
  }

  function poke(d) { d.hop = 1; d.excited = 1; d.blink = 0.4; }
  function beg() { dogs.forEach((d, i) => { d.beg = BEG_DUR + i * 0.2; d.excited = 1; }); }
  function spin() { dogs.forEach((d, i) => setTimeout(() => { d.spinT = 1; d.excited = 1; }, i * 220)); }

  return { dogs, update, poke, beg, spin };
}
