import * as THREE from '../vendor/three/three.module.min.js?v=r170';
import { WALL_Z, wallBlob } from './room.js?v=20261102e';

/* ────────────────────────────────────────────────────────────
   포토월 — 가운데 "Wedding Day!" 포스터 + 주변에 자연스럽게 붙인 사진들.
   슬롯: [x, y, 높이, 가로세로비(null=원본), 기울기(°), 세로 크롭 기준(0=위,1=아래)]
   0번 슬롯 = 포스터
   ──────────────────────────────────────────────────────────── */

// 포스터 높이를 1 로 둔 콜라주 배치 (가로 화면에서 확대해 사용)
const UNIT = [
  [0, 0, 1, null, 0, 0.5],                 // 포스터
  [-0.24, 0.69, 0.34, 1.0, -2.5, 0.35],    // 위 왼쪽 (정사각)
  [0.2, 0.73, 0.42, 0.75, 3, 0.4],         // 위 오른쪽
  [-0.63, 0.24, 0.5, 0.75, -3, 0.5],       // 왼쪽 큰 세로
  [-0.62, -0.35, 0.36, 1.3, 2, 0.55],      // 왼쪽 아래 가로
  [-1.04, 0.52, 0.3, 1.0, 4, 0.4],         // 왼쪽 바깥 위
  [-1.06, -0.04, 0.42, 0.75, -2, 0.5],     // 왼쪽 바깥
  [0.62, 0.3, 0.46, 0.75, 2, 0.5],         // 오른쪽 큰 세로
  [0.6, -0.3, 0.3, 1.0, -4, 0.45],         // 오른쪽 아래 정사각
  [1.0, 0.54, 0.32, 1.3, -2, 0.4],         // 오른쪽 바깥 위 가로
  [1.02, -0.02, 0.42, 0.75, 3, 0.5],       // 오른쪽 바깥
  [-0.72, -0.86, 0.34, 1.3, -2, 0.5],      // 왼쪽 맨 아래
  [0.74, -0.8, 0.3, 1.0, 3, 0.5],          // 오른쪽 맨 아래
];

const SLOTS = {
  // 세로(모바일): 화면 폭에 맞춘 별도 배치
  tall: [
    [0, 2.27, 0.6, null, 0, 0.5],
    [-0.36, 2.52, 0.24, 1.0, -3, 0.35],
    [0.34, 2.62, 0.26, 0.75, 3, 0.4],
    [-0.4, 2.2, 0.34, 0.75, -2, 0.5],
    [0.4, 2.24, 0.3, 1.0, 3, 0.45],
    [-0.67, 2.4, 0.26, 0.75, 4, 0.4],
    [0.67, 2.55, 0.24, 1.0, -3, 0.4],
    [-0.62, 1.86, 0.26, 1.3, 2, 0.5],
    [0.62, 1.93, 0.3, 0.75, -2, 0.5],
    [-0.68, 1.47, 0.22, 1.0, -3, 0.5],
    [0.68, 1.45, 0.24, 0.75, 3, 0.5],
  ],
  // 가로(데스크톱): UNIT × 0.62, 중심 (0, 2.17)
  wide: UNIT.map(([x, y, h, a, r, f]) => [x * 0.62, 2.17 + y * 0.62, h * 0.62, a, r, f]),
};
export const MAX_ON_WALL = UNIT.length;

/* ───────── 임시 카드 (사진 파일이 없을 때) ───────── */
const PASTELS = [
  ['#eef3df', '#dbe6bd'], ['#e8f0e2', '#cfe2c6'], ['#f4f1e4', '#e4e9cf'], ['#e3ece6', '#cbdccf'],
];
export function placeholderCanvas(i, caption, portrait) {
  const w = portrait ? 480 : 640, h = portrait ? 640 : 480;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const [a, b] = PASTELS[i % PASTELS.length];
  const grd = g.createLinearGradient(0, 0, w, h);
  grd.addColorStop(0, a); grd.addColorStop(1, b);
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,.75)';
  g.font = `${Math.round(w * 0.2)}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('♡', w / 2, h * 0.45);
  g.fillStyle = 'rgba(90,100,70,.55)';
  g.font = `${Math.round(w * 0.045)}px "Gowun Dodum", sans-serif`;
  g.fillText(`PHOTO ${String(i + 1).padStart(2, '0')}`, w / 2, h * 0.64);
  return c;
}

/* ───────── 마스킹테이프 (연두 테마, 실제 테이프 이미지) ───────── */
const TAPE_COUNT = 15;
const loader = new THREE.TextureLoader();
const tapeMats = [];
function tapeMat(i) {
  const k = i % TAPE_COUNT;
  if (!tapeMats[k]) {
    const tex = loader.load(`assets/tapes/tape${String(k + 1).padStart(2, '0')}.png`, (t) => {
      tapeMats[k].userData.aspect = t.image.width / t.image.height;
      tapeMats[k].userData.waiting.forEach((fn) => fn());
    });
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const m = new THREE.MeshStandardMaterial({
      map: tex, transparent: true, alphaTest: 0.03, opacity: 0.95, roughness: 0.75, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    });
    m.userData = { aspect: 3.2, waiting: [] };
    tapeMats[k] = m;
  }
  return tapeMats[k];
}

/** 살짝 휘어진 종이 */
function paperGeo(bx, by, twist) {
  const g = new THREE.PlaneGeometry(1, 1, 8, 8);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setZ(i, bx * (x * x - 0.08) + by * (y * y - 0.08) + twist * x * y);
  }
  g.computeVertexNormals();
  return g;
}

export function buildWall(gallery, onTextureReady) {
  const group = new THREE.Group();
  const items = [];
  const hits = [];

  const count = Math.min(gallery.length, MAX_ON_WALL);
  for (let i = 0; i < count; i++) {
    const rnd = (k) => { const s = Math.sin((i + 1) * 91.7 + k * 17.3) * 43758.5453; return s - Math.floor(s); };
    const isPoster = i === 0;
    const g = new THREE.Group();
    const geo = paperGeo((rnd(1) - 0.5) * 0.012, (rnd(2) - 0.5) * 0.01, (rnd(3) - 0.5) * 0.008);

    const paper = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#fffdf8', roughness: 0.9, side: THREE.DoubleSide }));
    const imgMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6, metalness: 0 });
    const img = new THREE.Mesh(geo, imgMat);
    img.position.z = 0.0012;
    const blob = wallBlob(1, 1, 0.3);
    blob.position.z = -0.004;
    g.add(blob, paper, img);

    // 테이프: 사진마다 붙이는 방식이 조금씩 다름
    const tapes = [];
    const addTape = (nx, ny, rot, len) => {
      const t = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), tapeMat(Math.floor(rnd(9 + tapes.length) * TAPE_COUNT)));
      t.userData = { nx, ny, rot, len };
      t.renderOrder = 2;
      tapes.push(t); g.add(t);
    };
    const style = isPoster ? 1 : Math.floor(rnd(4) * 4);
    const jr = (k, a) => (rnd(k) - 0.5) * a;
    if (style === 0) addTape(jr(5, 0.2), 0.5, jr(6, 0.12), 0.62);                                    // 위 가운데 가로
    else if (style === 1) { addTape(-0.5, 0.5, 0.62 + jr(5, 0.2), 0.46); addTape(0.5, 0.5, -0.62 + jr(6, 0.2), 0.46); } // 위 양쪽 모서리
    else if (style === 2) { addTape(-0.5, 0.5, 0.7 + jr(5, 0.2), 0.48); addTape(0.5, -0.5, 0.7 + jr(6, 0.2), 0.48); }  // 대각선 두 모서리
    else addTape(0.5, 0.5, -0.66 + jr(5, 0.2), 0.52);                                                // 오른쪽 위 하나

    paper.userData.photoIndex = i;
    img.userData.photoIndex = i;
    hits.push(paper, img);
    group.add(g);

    const item = {
      index: i, group: g, paper, img, blob, tapes, hot: 0, isPoster,
      imgAspect: 0.75, aspect: 0.75, focus: 0.5, h: 0.3, tex: null,
      ok: false, url: gallery[i].src,
      base: new THREE.Vector3(), rot: 0, z: WALL_Z + (isPoster ? 0.004 : 0.006 + i * 0.0009),
    };
    items.push(item);

    // 임시 카드 먼저, 실제 사진이 있으면 교체
    const ph = new THREE.CanvasTexture(placeholderCanvas(i, '', true));
    ph.colorSpace = THREE.SRGBColorSpace;
    item.tex = ph; imgMat.map = ph;
    // 벽에는 작은 사진(sm/)을 쓰고, 크게 볼 때(라이트박스)만 원본을 불러옴
    const small = gallery[i].src.replace(/([^/]+)$/, 'sm/$1');
    loader.load(small, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      item.tex = tex; imgMat.map = tex; imgMat.needsUpdate = true;
      item.ok = true; item.imgAspect = tex.image.width / tex.image.height;
      fit(item); onTextureReady?.(item);
    }, undefined, () => { /* 파일 없음 → 임시 카드 유지 */ });

    tapes.forEach((t) => t.material.userData.waiting.push(() => fit(item)));
  }

  /** 슬롯 비율에 맞춰 사진을 잘라(텍스처 크롭) 붙이기 */
  function fit(item) {
    const a = item.slotAspect ?? item.imgAspect;
    item.aspect = a;
    const h = item.h, w = h * a;
    const tex = item.tex;
    if (tex) {
      const ia = item.imgAspect;
      if (a > ia) { // 슬롯이 더 넓음 → 위아래를 자름
        const ry = ia / a;
        tex.repeat.set(1, ry); tex.offset.set(0, (1 - ry) * (1 - item.focus));
      } else {
        const rx = a / ia;
        tex.repeat.set(rx, 1); tex.offset.set((1 - rx) / 2, 0);
      }
    }
    const b = item.isPoster ? 0.0 : 0.006;
    item.img.scale.set(w, h, 1);
    item.paper.scale.set(w + b * 2, h + b * 2, 1);
    item.paper.visible = !item.isPoster;
    item.blob.scale.set((w + 0.06) * 1.2, (h + 0.06) * 1.2, 1);
    item.blob.position.set(0.008, -0.014, -0.004);
    item.tapes.forEach((t) => {
      const { nx, ny, rot, len } = t.userData;
      const tw = Math.min(0.19, Math.max(0.09, (w * len + 0.03) * 1.15));
      t.scale.set(tw, tw / Math.min(2.7, t.material.userData.aspect), 1); // 폭 넓은 테이프
      t.position.set(nx * w * 0.86, ny * h * 0.95, 0.003);
      t.rotation.z = rot;
    });
  }

  let mode = null;
  function layout(next) {
    mode = next;
    const slots = SLOTS[mode];
    items.forEach((it, i) => {
      it.group.visible = i < slots.length;
      if (i >= slots.length) return;
      const [x, y, h, a, rot, focus] = slots[i];
      it.h = h; it.slotAspect = a; it.focus = focus;
      it.base.set(x, y, it.z); it.rot = THREE.MathUtils.degToRad(rot);
      it.group.position.copy(it.base);
      it.group.rotation.z = it.rot;
      fit(it);
    });
  }

  function update(dt, hoverIndex) {
    items.forEach((it) => {
      const target = it.index === hoverIndex ? 1 : 0;
      it.hot += (target - it.hot) * Math.min(1, dt * 10);
      it.group.scale.setScalar(1 + it.hot * 0.05);
      it.group.position.z = it.base.z + it.hot * 0.02;
      it.blob.material.opacity = 0.3 - it.hot * 0.08;
    });
  }

  return { group, items, hits, layout, update, get mode() { return mode; } };
}
