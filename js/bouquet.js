import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/* ────────────────────────────────────────────────────────────
   화이트 웨딩 부케 — 꽃잎 한 장 한 장을 절차적으로 생성합니다.
   (참고 사진: 거베라 · 장미 · 튤립 봉오리 · 리시안셔스 · 작은 흰 꽃,
    무늬 잎 · 아스파라거스 펀 · 긴 잎, 흰 새틴 리본 손잡이)

   설계는 실제 크기(m)로 하고 마지막에 SCALE 배로 키웁니다.
   좌표: +y 위, +z 정면(카메라 쪽)
   ──────────────────────────────────────────────────────────── */

export const FLOWER_LABEL = {
  Gerbera: { ko: '거베라', icon: '🌼' },
  Rose: { ko: '장미', icon: '🌹' },
  Tulip: { ko: '튤립', icon: '🌷' },
  Lisianthus: { ko: '리시안셔스', icon: '🤍' },
  Filler: { ko: '작은 흰 꽃', icon: '✿' },
};

const SCALE = 2.05;
const UP = new THREE.Vector3(0, 1, 0);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const deg = THREE.MathUtils.degToRad;
const lerp = THREE.MathUtils.lerp;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// 시드 고정 난수
let _s = 20261101;
const rnd = () => ((_s = (_s * 1664525 + 1013904223) >>> 0) / 4294967296);
const rr = (a, b) => a + (b - a) * rnd();

// sRGB → linear (정점 색은 linear 로 다룸)
const L = (c) => Math.pow(c, 2.2);
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/* ───────── 기본 지오메트리 도우미 ───────── */

/** 정점 색 채우기 + uv 제거 (병합 호환) */
function paint(g, fn) {
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const c = fn(p.getX(i), p.getY(i), p.getZ(i), i);
    col[i * 3] = L(c[0]); col[i * 3 + 1] = L(c[1]); col[i * 3 + 2] = L(c[2]);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (!g.index) g.setIndex([...Array(p.count).keys()]);
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

/**
 * 꽃잎/잎 한 장 — 격자 곡면.
 * 꽃잎 좌표계: 바깥 방향 +X(척추), 꽃 축 +Y, 폭 방향 +Z
 *  L 길이, W 최대 폭, r0 꽃 중심으로부터 시작 반경,
 *  lift 시작 각도(수평=0, 수직=π/2), curl 끝으로 갈수록 휘는 양(+ 바깥/아래로 젖힘 아님, 각도 증가),
 *  cup 폭 방향 오목함, fold 잎맥 접힘(V), wave 가장자리 물결, twist 비틀림,
 *  p/q 폭 프로파일 (p<1 → 뿌리 쪽이 넓음, q<1 → 둥근 끝)
 */
function sheet(o, color) {
  const {
    L: len, W, r0 = 0, lift = 0, curl = 0, cup = 0, fold = 0, wave = 0, waveK = 6, twist = 0,
    p = 1, q = 1, base = 0.15, serr = 0, su = 10, sv = 4, y0 = 0,
  } = o;
  const nu = su, nv = sv * 2;
  const pos = [];
  const uvs = [];
  // 척추 적분
  let sx = r0, sy = y0;
  const spine = [];
  for (let i = 0; i <= nu; i++) {
    const u = i / nu;
    const a = lift + curl * u * u * 1.2 + curl * u * 0.2;
    spine.push([sx, sy, a]);
    sx += Math.cos(a) * (len / nu);
    sy += Math.sin(a) * (len / nu);
  }
  for (let i = 0; i <= nu; i++) {
    const u = i / nu;
    const [cx, cy, a] = spine[i];
    let w = W * Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(u, p))), q) + W * base * (1 - u) * (1 - u);
    if (serr) w *= 1 + serr * Math.sin(u * Math.PI * 22) * sstep(0.1, 0.3, u);
    const nx = -Math.sin(a), ny = Math.cos(a); // 척추 법선 (꽃 안쪽/위)
    const tw = twist * u;
    for (let j = 0; j <= nv; j++) {
      const v = j / nv * 2 - 1;
      let z = v * w * 0.5;
      let off = cup * W * v * v * (0.4 + 0.6 * Math.sin(Math.PI * Math.min(1, u * 1.1))) + fold * Math.abs(v) * w * 0.5;
      off += wave * W * Math.sin(u * waveK + v * 3.1) * v * v;
      // 비틀림
      const zt = z * Math.cos(tw) - off * Math.sin(tw);
      const ot = z * Math.sin(tw) + off * Math.cos(tw);
      pos.push(cx + nx * ot, cy + ny * ot, zt);
      uvs.push(u, v);
    }
  }
  const idx = [];
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = i * (nv + 1) + j, b = a + nv + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const col = new Float32Array((pos.length / 3) * 3);
  for (let k = 0; k < pos.length / 3; k++) {
    const c = color(uvs[k * 2], uvs[k * 2 + 1]);
    col[k * 3] = L(c[0]); col[k * 3 + 1] = L(c[1]); col[k * 3 + 2] = L(c[2]);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** 꽃 축(+Y) 기준 회전 배치 */
function around(g, phi, tiltX = 0) {
  if (tiltX) g.rotateX(tiltX);
  g.rotateY(phi);
  return g;
}

function sphereGeo(r, ws, hs, color, sx = 1, sy = 1, sz = 1) {
  const g = new THREE.SphereGeometry(r, ws, hs);
  g.scale(sx, sy, sz);
  return paint(g, color);
}

function tube(points, radius, color, segs = 24, radial = 5) {
  const curve = new THREE.CatmullRomCurve3(points);
  const g = new THREE.TubeGeometry(curve, segs, radius, radial, false);
  return paint(g, color);
}

/** 국소 좌표(+Y = 꽃 방향)를 부케 좌표로 */
function placeMatrix(pos, dir, spin = 0, scale = 1) {
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize());
  q.multiply(new THREE.Quaternion().setFromAxisAngle(UP, spin));
  return new THREE.Matrix4().compose(pos, q, V(scale, scale, scale));
}

/* ───────── 색 ───────── */
const WHITE = [0.975, 0.97, 0.94];
const IVORY = [0.97, 0.955, 0.9];
const CREAM = [0.95, 0.92, 0.8];
const PETAL_GREEN = [0.74, 0.82, 0.58];
const STEM = [0.42, 0.58, 0.28];
const LEAF_DARK = [0.2, 0.36, 0.16];
const LEAF_MID = [0.32, 0.52, 0.22];
const LEAF_CREAM = [0.9, 0.9, 0.72];
const FERN = [0.38, 0.58, 0.24];

/* ───────── 꽃 ───────── */

function gerbera() {
  const parts = [];
  const petalCol = (u, v) => {
    let c = mix3(PETAL_GREEN, WHITE, sstep(0.0, 0.22, u));
    c = mix3(c, [0.99, 0.985, 0.97], 0.5 * sstep(0.5, 1, u) * (1 - Math.abs(v)));
    return c;
  };
  // 바깥 꽃잎 (길고 얇음)
  const n1 = 30;
  for (let i = 0; i < n1; i++) {
    const g = sheet({ L: rr(0.04, 0.045), W: rr(0.0088, 0.0098), r0: 0.011, lift: rr(0.04, 0.14), curl: rr(-0.3, -0.12), cup: 0.28, p: 0.45, q: 0.32, base: 0.35, su: 10, sv: 3, y0: 0.001 }, petalCol);
    parts.push(around(g, (i / n1) * Math.PI * 2 + rr(-0.04, 0.04)));
  }
  // 안쪽 꽃잎
  const n2 = 24;
  for (let i = 0; i < n2; i++) {
    const g = sheet({ L: rr(0.03, 0.034), W: 0.0078, r0: 0.01, lift: rr(0.2, 0.32), curl: -0.1, cup: 0.25, p: 0.45, q: 0.35, base: 0.35, su: 7, sv: 2, y0: 0.0025 }, petalCol);
    parts.push(around(g, ((i + 0.5) / n2) * Math.PI * 2));
  }
  // 중심 가까운 짧은 크림색 꽃잎 고리
  const n3 = 26;
  for (let i = 0; i < n3; i++) {
    const g = sheet({ L: 0.007, W: 0.0028, r0: 0.0105, lift: 0.95, curl: -0.3, cup: 0.2, p: 0.6, q: 0.5, su: 3, sv: 1, y0: 0.003 },
      () => [0.97, 0.93, 0.78]);
    parts.push(around(g, (i / n3) * Math.PI * 2));
  }
  // 중심 디스크: 연두 눈 → 노란 꽃밥 고리 → 크림
  const disk = new THREE.SphereGeometry(0.0112, 22, 8, 0, Math.PI * 2, 0, 0.75);
  disk.scale(1, 0.45, 1);
  disk.translate(0, 0.0005, 0);
  parts.push(paint(disk, (x, y, z) => {
    const r = Math.hypot(x, z) / 0.0112;
    if (r < 0.35) return mix3([0.62, 0.72, 0.36], [0.75, 0.78, 0.42], r / 0.35);
    return mix3([0.93, 0.83, 0.48], [0.96, 0.9, 0.66], sstep(0.55, 0.95, r));
  }));
  // 꽃밥 알갱이
  for (let i = 0; i < 46; i++) {
    const a = i * 2.39996, r = 0.004 + 0.0062 * Math.sqrt(i / 46);
    const b = sphereGeo(0.0011, 5, 3, () => [0.95, 0.86, 0.5]);
    b.translate(Math.cos(a) * r, 0.0042 - r * 0.12, Math.sin(a) * r);
    parts.push(b);
  }
  // 아래 꽃받침 (초록 포엽)
  const rec = new THREE.CylinderGeometry(0.0105, 0.004, 0.012, 16, 1, true);
  rec.translate(0, -0.006, 0);
  parts.push(paint(rec, () => [0.45, 0.6, 0.3]));
  for (let i = 0; i < 16; i++) {
    const g = sheet({ L: 0.011, W: 0.0028, r0: 0.007, lift: -0.55, curl: -0.4, p: 0.5, q: 1, su: 3, sv: 1, y0: -0.002 }, () => [0.4, 0.56, 0.28]);
    parts.push(around(g, (i / 16) * Math.PI * 2 + 0.1));
  }
  return parts;
}

function rose() {
  const parts = [];
  const col = (deep) => (u, v) => {
    let c = mix3(CREAM, IVORY, sstep(0.0, 0.5, u));
    c = mix3(c, [0.985, 0.975, 0.95], sstep(0.55, 1, u) * 0.7);
    return mix3(c, [0.9, 0.88, 0.76], deep * (1 - u));
  };
  // 중심 봉오리 원뿔
  const core = new THREE.ConeGeometry(0.006, 0.018, 10, 1);
  core.translate(0, 0.012, 0);
  parts.push(paint(core, () => [0.94, 0.9, 0.78]));
  // 나선으로 감긴 안쪽 꽃잎
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const g = sheet({ L: lerp(0.018, 0.026, t), W: lerp(0.022, 0.03, t), r0: lerp(0.002, 0.004, t), lift: lerp(1.5, 1.38, t), curl: lerp(-0.5, -0.25, t), cup: 0.75, p: 1.25, q: 0.55, su: 10, sv: 6, y0: 0.002 }, col(0.6));
    parts.push(around(g, i * 2.4));
  }
  // 중간 꽃잎
  for (let i = 0; i < 6; i++) {
    const g = sheet({ L: rr(0.028, 0.032), W: rr(0.032, 0.036), r0: 0.006, lift: rr(1.18, 1.3), curl: rr(0.1, 0.3), cup: 0.62, wave: 0.008, p: 1.3, q: 0.55, su: 12, sv: 6 }, col(0.35));
    parts.push(around(g, i * (Math.PI * 2 / 6) + 0.4));
  }
  // 바깥 꽃잎 (끝이 바깥으로 말림)
  for (let i = 0; i < 6; i++) {
    const g = sheet({ L: rr(0.032, 0.037), W: rr(0.038, 0.043), r0: 0.008, lift: rr(0.85, 1.0), curl: rr(0.6, 0.85), cup: 0.52, wave: 0.01, p: 1.35, q: 0.55, su: 12, sv: 6, y0: -0.003 }, col(0.15));
    parts.push(around(g, i * (Math.PI * 2 / 6) + 0.05));
  }
  // 꽃받침
  for (let i = 0; i < 5; i++) {
    const g = sheet({ L: 0.018, W: 0.005, r0: 0.004, lift: -0.4, curl: -0.6, p: 0.6, q: 1, su: 4, sv: 1, y0: -0.006 }, () => [0.36, 0.52, 0.26]);
    parts.push(around(g, i * 1.2566));
  }
  const hip = sphereGeo(0.006, 10, 6, () => [0.42, 0.58, 0.3], 1, 0.9, 1);
  hip.translate(0, -0.006, 0);
  parts.push(hip);
  return parts;
}

function tulip() {
  const parts = [];
  const col = (u, v) => {
    let c = mix3([0.66, 0.78, 0.48], WHITE, sstep(0.05, 0.42, u));
    // 바깥면 가운데 연두 줄무늬
    c = mix3(c, [0.82, 0.88, 0.68], (1 - sstep(0, 0.35, Math.abs(v))) * (1 - sstep(0.2, 0.7, u)) * 0.6);
    return c;
  };
  for (let k = 0; k < 2; k++) {
    for (let i = 0; i < 3; i++) {
      const g = sheet({
        L: k ? 0.046 : 0.054, W: k ? 0.031 : 0.039, r0: k ? 0.0022 : 0.0048,
        lift: k ? 1.46 : 1.34, curl: k ? -0.26 : -0.22, cup: 0.6, p: 1.1, q: 0.5, base: 0.35, su: 16, sv: 7,
      }, col);
      parts.push(around(g, i * (Math.PI * 2 / 3) + k * (Math.PI / 3)));
    }
  }
  const b = sphereGeo(0.006, 10, 6, () => [0.5, 0.64, 0.34]);
  parts.push(b);
  return parts;
}

function lisianthusBud(scale = 1) {
  const parts = [];
  for (let i = 0; i < 5; i++) {
    const g = sheet({ L: 0.026 * scale, W: 0.016 * scale, r0: 0.0012, lift: 1.5, curl: -0.18, cup: 0.55, twist: 0.9, p: 1.1, q: 0.7, su: 8, sv: 3 },
      (u) => mix3([0.66, 0.78, 0.46], [0.84, 0.9, 0.7], sstep(0.2, 1, u)));
    parts.push(around(g, i * (Math.PI * 2 / 5)));
  }
  return parts;
}

function lisianthus() {
  const parts = [];
  const col = (u, v) => mix3([0.8, 0.86, 0.66], [0.98, 0.975, 0.95], sstep(0.05, 0.55, u));
  // 반쯤 핀 꽃: 주름진 바깥 꽃잎 + 감긴 안쪽 꽃잎
  for (let i = 0; i < 5; i++) {
    const g = sheet({ L: 0.032, W: 0.033, r0: 0.003, lift: 1.12, curl: 0.25, cup: 0.55, wave: 0.04, waveK: 9, twist: 0.35, p: 1.3, q: 0.6, su: 12, sv: 6 }, col);
    parts.push(around(g, i * (Math.PI * 2 / 5)));
  }
  for (let i = 0; i < 4; i++) {
    const g = sheet({ L: 0.024, W: 0.024, r0: 0.0015, lift: 1.42, curl: -0.3, cup: 0.7, twist: 0.6, wave: 0.03, p: 1.2, q: 0.6, su: 8, sv: 3 }, col);
    parts.push(around(g, i * 1.7 + 0.5));
  }
  // 옆으로 달린 연두 봉오리 두 개
  [[0.026, -0.018, 0.006, -0.55, 0.85], [-0.022, -0.026, -0.012, 0.6, 0.75]].forEach(([x, y, z, tilt, s]) => {
    const dir = V(x * 18, 1, z * 18).normalize();
    const m = placeMatrix(V(x, y, z), dir, rnd() * 6, 1);
    lisianthusBud(s).forEach((g) => parts.push(g.applyMatrix4(m)));
    parts.push(tube([V(x, y, z), V(x * 0.5, y - 0.012, z * 0.5), V(0, -0.03, 0)], 0.0013, () => STEM, 8, 4));
  });
  return parts;
}

function smallBlooms() {
  const parts = [];
  const star = (r) => {
    const out = [];
    for (let i = 0; i < 5; i++) {
      const g = sheet({ L: 0.0085 * r, W: 0.0055 * r, r0: 0.0012, lift: 0.18, curl: -0.25, cup: 0.25, p: 0.85, q: 0.9, base: 0.05, su: 4, sv: 2 },
        (u) => mix3([0.86, 0.9, 0.72], WHITE, sstep(0, 0.35, u)));
      out.push(around(g, i * (Math.PI * 2 / 5)));
    }
    out.push(sphereGeo(0.0016 * r, 6, 4, () => [0.82, 0.84, 0.5]));
    const tubeG = new THREE.CylinderGeometry(0.0012, 0.0009, 0.006, 6, 1, true);
    tubeG.translate(0, -0.003, 0);
    out.push(paint(tubeG, () => [0.84, 0.88, 0.7]));
    return out;
  };
  const heads = [[0, 0.004, 0, 1], [0.017, -0.004, 0.006, 0.9], [-0.014, -0.002, 0.011, 0.95], [0.004, -0.008, -0.016, 0.85], [-0.012, -0.012, -0.008, 0.8]];
  heads.forEach(([x, y, z, s]) => {
    const dir = V(x * 25, 1, z * 25).normalize();
    const m = placeMatrix(V(x, y, z), dir, rnd() * 6);
    star(s).forEach((g) => parts.push(g.applyMatrix4(m)));
    parts.push(tube([V(x, y - 0.003, z), V(x * 0.6, y - 0.014, z * 0.6), V(0, -0.03, 0)], 0.0008, () => STEM, 6, 3));
  });
  return parts;
}

const BUILDERS = { Gerbera: gerbera, Rose: rose, Tulip: tulip, Lisianthus: lisianthus, Filler: smallBlooms };

/* ───────── 잎 / 줄기 / 리본 ───────── */

function variegatedLeaf(len, wid, seed) {
  return sheet({ L: len, W: wid, lift: 0, curl: rr(-0.5, -0.15), fold: 0.25, cup: 0.05, p: 0.95, q: 0.75, base: 0.05, serr: 0.05, su: 10, sv: 4 }, (u, v) => {
    const thr = 0.58 + 0.12 * Math.sin(u * 9 + seed) + 0.06 * Math.sin(u * 23 + seed * 2);
    const edge = sstep(thr - 0.08, thr + 0.08, Math.abs(v)) * sstep(0.04, 0.2, u);
    let c = mix3(LEAF_DARK, LEAF_MID, 0.35 + 0.3 * Math.sin(u * 7 + v * 5 + seed));
    c = mix3(c, [0.5, 0.66, 0.36], (1 - sstep(0, 0.1, Math.abs(v))) * 0.6); // 잎맥
    return mix3(c, LEAF_CREAM, edge);
  });
}

function bladeLeaf(len, wid, curl) {
  return sheet({ L: len, W: wid, lift: 0, curl, fold: 0.35, p: 0.7, q: 0.9, base: 0.1, su: 18, sv: 3 }, (u, v) => {
    const c = mix3([0.3, 0.52, 0.2], [0.46, 0.68, 0.28], u * 0.6 + 0.2 * Math.sin(v * 3));
    return mix3(c, [0.6, 0.76, 0.4], (1 - sstep(0, 0.12, Math.abs(v))) * 0.7);
  });
}

/** 아스파라거스 펀 한 줄기 (깃털 같은 잔잎) */
function fernFrond(base, tip, bend, out) {
  const mid = base.clone().lerp(tip, 0.55).add(bend);
  const curve = new THREE.QuadraticBezierCurve3(base, mid, tip);
  out.push(paint(new THREE.TubeGeometry(curve, 16, 0.0009, 3, false), () => FERN));
  const needleQuad = (p, d, len, wdt, c) => {
    const side = new THREE.Vector3().crossVectors(d, UP);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize().multiplyScalar(wdt / 2);
    const a = p.clone().add(side), b = p.clone().sub(side);
    const e = p.clone().addScaledVector(d, len);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([a.x, a.y, a.z, b.x, b.y, b.z, e.x, e.y, e.z], 3));
    g.setIndex([0, 1, 2]);
    g.computeVertexNormals();
    const cc = [L(c[0]), L(c[1]), L(c[2])];
    g.setAttribute('color', new THREE.Float32BufferAttribute([...cc, ...cc, ...cc], 3));
    return g;
  };
  const len = base.distanceTo(tip);
  const steps = 22;
  for (let i = 3; i <= steps; i++) {
    const t = i / steps;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3().crossVectors(tan, UP).normalize();
    if (!Number.isFinite(side.x)) continue;
    const bl = len * 0.16 * (1 - t * 0.55);
    [-1, 1].forEach((s) => {
      const d = tan.clone().multiplyScalar(0.6).addScaledVector(side, s).normalize();
      const end = p.clone().addScaledVector(d, bl);
      // 잔가지
      out.push(needleQuad(p, d, bl, 0.0006, FERN));
      // 바늘잎
      for (let k = 1; k <= 7; k++) {
        const q = p.clone().lerp(end, k / 7.5);
        for (let m = 0; m < 4; m++) {
          const nd = d.clone().multiplyScalar(rr(0.2, 1)).addScaledVector(tan, rr(-0.2, 0.9)).addScaledVector(side, rr(-0.7, 0.7) * s).add(V(0, rr(-0.15, 0.25), 0)).normalize();
          const c = mix3(FERN, [0.5, 0.7, 0.34], rnd());
          out.push(needleQuad(q, nd, rr(0.005, 0.008), 0.0009, c));
        }
      }
    });
  }
}

function ribbon() {
  const top = 0.006, bot = -0.092, R = 0.0215;
  let g = new THREE.CylinderGeometry(R, R * 0.93, top - bot, 48, 40, true);
  g.translate(0, (top + bot) / 2, 0);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g); // 이음선 정점 합치기 → 세로 줄 없앰
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    // 사선으로 겹쳐 감긴 새틴 리본
    const s = ((y - bot) / 0.019 + a / (Math.PI * 2)) % 1;
    const k = 1 + 0.05 * (s < 0 ? s + 1 : s) + 0.02 * Math.sin(a * 3 + y * 200) * 0.3;
    p.setXYZ(i, x * k, y, z * k);
  }
  g.computeVertexNormals();
  return paint(g, (x, y, z) => {
    const a = Math.atan2(z, x);
    const s = (((y - bot) / 0.019 + a / (Math.PI * 2)) % 1 + 1) % 1;
    const sh = 0.95 + 0.05 * Math.sin(s * Math.PI);
    return [0.97 * sh, 0.965 * sh, 0.95 * sh];
  });
}


/** 돔 표면에 붙어 바깥을 바라보는 잎 배치 행렬 */
function leafFrame(basePos, radial, upBias, roll = 0) {
  const spine = radial.clone().multiplyScalar(0.75).addScaledVector(UP, upBias).normalize();
  const nrm = radial.clone().addScaledVector(spine, -radial.dot(spine)).normalize(); // 바깥쪽
  // sheet 의 +Y 가 꽃(돔) 안쪽을 향하도록: 법선은 바깥, 그래서 -nrm 을 +Y 로
  const yA = nrm.clone().negate();
  const zA = new THREE.Vector3().crossVectors(spine, yA).normalize();
  yA.crossVectors(zA, spine).normalize();
  const m = new THREE.Matrix4().makeBasis(spine, yA, zA).setPosition(basePos);
  if (roll) m.multiply(new THREE.Matrix4().makeRotationX(roll));
  return m;
}

/* ───────── 배치 (참고 사진의 정면 구도) ───────── */
// [종류, 방위각φ(0=정면, +는 오른쪽), 위에서부터 각도θ, 반경, 스케일]
const LAYOUT = [
  ['Gerbera', -10, 16, 0.15, 1.15],
  ['Gerbera', -60, 40, 0.13, 1.08],
  ['Gerbera', 150, 30, 0.13, 1.05],
  ['Gerbera', 108, 30, 0.13, 1.02],
  ['Rose', 10, 62, 0.115, 1.25],
  ['Rose', -2, 34, 0.12, 1.2],
  ['Rose', 64, 64, 0.11, 1.15],
  ['Rose', -128, 52, 0.112, 1.15],
  ['Tulip', -84, 62, 0.13, 1.15],
  ['Tulip', 50, 26, 0.14, 1.15],
  ['Tulip', -34, 70, 0.125, 1.1],
  ['Tulip', 116, 60, 0.13, 1.1],
  ['Lisianthus', 28, 12, 0.135, 1.1],
  ['Lisianthus', -104, 30, 0.13, 1.05],
  ['Lisianthus', 178, 60, 0.12, 1.05],
  ['Filler', 36, 44, 0.135, 1.15],
  ['Filler', -150, 20, 0.135, 1.15],
];
const DOME = V(0, 0.062, 0);

function sph(phiDeg, thetaDeg) {
  const ph = deg(phiDeg), th = deg(thetaDeg);
  return V(Math.sin(th) * Math.sin(ph), Math.cos(th), Math.sin(th) * Math.cos(ph));
}

function stemPath(head, dir, bind, bottom) {
  const below = head.clone().addScaledVector(dir, -0.02);
  const mid = head.clone().lerp(bind, 0.55);
  mid.x *= 0.85; mid.z *= 0.85;
  return [head.clone().addScaledVector(dir, -0.004), below, mid, bind, V(bind.x, -0.06, bind.z), bottom];
}

export async function loadBouquet() {
  const flowerGeos = [];
  const stems = [];
  const leaves = [];
  const blades = [];
  const fern = [];
  let bindIdx = 0;
  const nextBind = () => {
    const a = bindIdx * 2.39996, r = 0.0035 + 0.0125 * Math.sqrt((bindIdx % 40) / 40);
    bindIdx++;
    return V(Math.cos(a) * r, 0, Math.sin(a) * r);
  };
  const stemTo = (pts, r = 0.0026) => stems.push(tube(pts, r, (x, y) => mix3(STEM, [0.5, 0.66, 0.34], y < -0.09 ? 0.4 : 0), 30, 5));
  const bottomOf = (b) => V(b.x * 1.9 + rr(-0.002, 0.002), -0.168 + rr(-0.006, 0.004), b.z * 1.9);

  // 꽃
  LAYOUT.forEach(([type, ph, th, R, s]) => {
    const radial = sph(ph + rr(-4, 4), th + rr(-3, 3));
    const head = DOME.clone().addScaledVector(radial, R * 1.0);
    const dir = radial.clone().addScaledVector(UP, type === 'Tulip' ? 0.15 : 0.3).add(V(0, 0, radial.z > -0.3 ? 0.25 : 0)).normalize();
    const m = placeMatrix(head, dir, rnd() * Math.PI * 2, s * 1.45);
    const geo = mergeGeometries(BUILDERS[type]().map((g) => g.applyMatrix4(m)));
    flowerGeos.push({ type, geo });
    const bind = nextBind();
    stemTo(stemPath(head, dir, bind, bottomOf(bind)), type === 'Gerbera' ? 0.003 : 0.0026);
  });

  // 무늬 잎 칼라 (리본 위를 감싸며 바깥을 향함)
  for (let i = 0; i < 72; i++) {
    const ph = i * 137.508 + rr(-8, 8);
    const th = rr(68, 128);
    const radial = sph(ph, th);
    const basePos = DOME.clone().addScaledVector(radial, rr(0.055, 0.09));
    const g = variegatedLeaf(rr(0.045, 0.06), rr(0.027, 0.034), i * 1.7);
    g.applyMatrix4(leafFrame(basePos, radial, th > 100 ? rr(-0.7, -0.2) : rr(-0.2, 0.5), rr(-0.35, 0.35)));
    leaves.push(g);
    if (i % 6 === 0) { const bnd = nextBind(); stemTo(stemPath(basePos, radial, bnd, bottomOf(bnd)), 0.0022); }
  }
  // 꽃 사이를 채우는 안쪽 잎 (줄기가 비치지 않도록)
  for (let i = 0; i < 56; i++) {
    const ph = i * 137.508 + 40 + rr(-10, 10);
    const th = rr(24, 86);
    const radial = sph(ph, th);
    const basePos = DOME.clone().addScaledVector(radial, rr(0.06, 0.1));
    const g = variegatedLeaf(rr(0.048, 0.06), rr(0.028, 0.035), i * 2.3 + 5);
    g.applyMatrix4(leafFrame(basePos, radial, rr(0.1, 0.7), rr(-0.4, 0.4)));
    leaves.push(g);
  }

  // 긴 잎 (사진 오른쪽 아래로 길게 뻗은 잎 등)
  [[78, 98, 0.24, -0.9], [-74, 84, 0.2, -0.7], [44, 34, 0.17, 0.25], [-160, 66, 0.18, -0.5], [128, 70, 0.16, -0.6]].forEach(([ph, th, len, curl]) => {
    const radial = sph(ph, th);
    const basePos = DOME.clone().addScaledVector(radial, 0.06);
    const outDir = radial.clone().add(V(0, 0.35, 0)).normalize();
    const nrm = UP.clone().addScaledVector(outDir, -UP.dot(outDir));
    if (nrm.lengthSq() < 1e-4) nrm.set(0, 0, 1);
    nrm.normalize();
    const zA = new THREE.Vector3().crossVectors(outDir, nrm).normalize();
    const g = bladeLeaf(len, 0.024, curl);
    g.rotateX(rr(-0.5, 0.5));
    g.applyMatrix4(new THREE.Matrix4().makeBasis(outDir, nrm, zA).setPosition(basePos));
    blades.push(g);
    const b = nextBind(); stemTo([basePos, basePos.clone().lerp(b, 0.5), b, V(b.x, -0.06, b.z), bottomOf(b)], 0.0024);
  });

  // 아스파라거스 펀
  for (let i = 0; i < 14; i++) {
    const ph = (i / 14) * 360 + rr(-10, 10);
    const th = rr(34, 92);
    const radial = sph(ph, th);
    const base = DOME.clone().addScaledVector(radial, 0.06);
    const tip = DOME.clone().addScaledVector(radial, rr(0.17, 0.21));
    tip.y -= th > 55 ? 0.03 : 0;
    fernFrond(base, tip, V(0, 0.02, 0).addScaledVector(radial, 0.02), fern);
    const b = nextBind(); stemTo([base, base.clone().lerp(b, 0.5), b, V(b.x, -0.06, b.z), bottomOf(b)], 0.0016);
  }

  // 줄기 단면 (아래 잘린 끝)
  const caps = [];
  stems.forEach((s) => {
    s.computeBoundingBox();
  });

  const rib = ribbon();

  // 전체 크기 조정 + 중심 맞추기
  const all = [...flowerGeos.map((f) => f.geo), ...stems, ...leaves, ...blades, ...fern, rib, ...caps];
  all.forEach((g) => g.scale(SCALE, SCALE, SCALE));
  const box = new THREE.Box3();
  all.forEach((g) => { g.computeBoundingBox(); box.union(g.boundingBox); });
  const center = box.getCenter(new THREE.Vector3());
  all.forEach((g) => g.translate(-center.x, -center.y, -center.z));
  box.translate(center.clone().negate());

  const group = new THREE.Group();
  const foliage = new THREE.Group();
  foliage.name = 'foliage';
  const mk = (geos, mat) => {
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    m.castShadow = true;
    foliage.add(m);
    return m;
  };
  mk(stems, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }));
  mk(leaves, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.38, clearcoat: 0.35, clearcoatRoughness: 0.4, side: THREE.DoubleSide }));
  mk(blades, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.42, clearcoat: 0.25, side: THREE.DoubleSide }));
  mk(fern, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide }));
  mk([rib], new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.32, sheen: 1, sheenRoughness: 0.3, sheenColor: new THREE.Color('#ffffff'), clearcoat: 0.15 }));
  group.add(foliage);

  const flowerMat = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.62, metalness: 0, side: THREE.DoubleSide,
    sheen: 0.7, sheenRoughness: 0.45, sheenColor: new THREE.Color('#fffaf0'),
  });

  const counts = {};
  const flowers = flowerGeos.map(({ type, geo }, idx) => {
    counts[type] = (counts[type] || 0) + 1;
    geo.computeBoundingSphere();
    const c = geo.boundingSphere.center.clone();
    const r = geo.boundingSphere.radius;
    geo.translate(-c.x, -c.y, -c.z);
    const mesh = new THREE.Mesh(geo, flowerMat.clone());
    mesh.position.copy(c);
    mesh.castShadow = true;
    mesh.userData.flowerIndex = idx;
    group.add(mesh);

    const proxy = new THREE.Mesh(new THREE.SphereGeometry(r * 1.1, 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
    proxy.position.copy(c);
    proxy.userData.flowerIndex = idx;
    group.add(proxy);

    return {
      index: idx, key: `${type}_${counts[type]}`, type, label: FLOWER_LABEL[type],
      mesh, proxy, center: c, radius: r, hot: 0, read: false, phase: rnd() * Math.PI * 2,
    };
  });

  const size = box.getSize(new THREE.Vector3());
  return { group, flowers, foliage, size, radius: Math.max(size.x, size.z) / 2 };
}
