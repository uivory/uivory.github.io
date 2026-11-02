import * as THREE from 'three';
import { WALL_Z, canvasTexture, wallBlob } from './room.js';

/* 벽에 붙는 위치 슬롯 — [x, y, 최대 변 길이, 기울기(°)]
   tall = 세로(모바일) 화면, wide = 가로(데스크톱) 화면 */
const SLOTS = {
  tall: [
    [-0.44, 1.94, 0.33, -4], [0.04, 1.9, 0.3, 3], [0.5, 1.96, 0.33, 5],
    [-0.46, 2.32, 0.35, 3], [0.06, 2.28, 0.33, -3], [0.5, 2.36, 0.31, -5],
    [-0.44, 2.7, 0.31, -3], [0.04, 2.66, 0.34, 4], [0.5, 2.72, 0.29, -4],
    [-0.66, 1.42, 0.24, -6], [0.68, 1.38, 0.24, 5],
  ],
  wide: [
    [-1.42, 1.7, 0.46, -4], [-0.98, 2.02, 0.38, 3], [-1.62, 1.1, 0.4, 5], [-1.06, 1.36, 0.32, -6],
    [1.42, 1.72, 0.44, 5], [0.98, 2.04, 0.36, -4], [1.62, 1.06, 0.42, -5], [1.04, 1.34, 0.32, 6],
    [-0.36, 2.08, 0.36, -3], [0.34, 2.12, 0.34, 4], [0.0, 1.86, 0.28, 2], [-0.92, 0.78, 0.28, 4],
  ],
};
export const MAX_ON_WALL = SLOTS.wide.length;

const PASTELS = [
  ['#f9e4e6', '#f3cdd3'], ['#e8f0e2', '#cfe2c6'], ['#fdf1d8', '#f7dfae'], ['#e6ecf6', '#cdd9ee'],
  ['#f6e5f0', '#ead0e2'], ['#eef3df', '#dbe6bd'],
];

/** 사진이 없을 때 대신 보여줄 임시 카드 */
export function placeholderCanvas(i, caption, portrait) {
  const w = portrait ? 480 : 640, h = portrait ? 640 : 480;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const [a, b] = PASTELS[i % PASTELS.length];
  const grd = g.createLinearGradient(0, 0, w, h);
  grd.addColorStop(0, a); grd.addColorStop(1, b);
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  // 보케
  for (let k = 0; k < 14; k++) {
    g.fillStyle = `rgba(255,255,255,${0.1 + ((k * 37) % 20) / 100})`;
    g.beginPath(); g.arc(((k * 97) % w), ((k * 61) % h), 20 + ((k * 13) % 50), 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = 'rgba(255,255,255,.75)';
  g.font = `${Math.round(w * 0.2)}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('♡', w / 2, h * 0.42);
  g.fillStyle = 'rgba(90,78,64,.7)';
  g.font = `${Math.round(w * 0.05)}px "Gowun Dodum", sans-serif`;
  g.fillText(`PHOTO ${String(i + 1).padStart(2, '0')}`, w / 2, h * 0.62);
  g.font = `${Math.round(w * 0.04)}px "Gowun Dodum", sans-serif`;
  g.fillStyle = 'rgba(90,78,64,.5)';
  g.fillText('assets/photos 에 사진을 넣어주세요', w / 2, h * 0.7);
  return c;
}

/* 마스킹테이프 텍스처 (끝이 찢어진 느낌) */
let tapeTex;
function getTapeTexture() {
  if (tapeTex) return tapeTex;
  tapeTex = canvasTexture(256, 72, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#ecdcae';
    g.beginPath();
    const z = (x0, dir) => { // 지그재그 끝
      for (let y = 0; y <= h; y += 9) g.lineTo(x0 + dir * (y % 18 === 0 ? 0 : 7), y);
    };
    g.moveTo(6, 0); g.lineTo(w - 6, 0);
    for (let y = 0; y <= h; y += 9) g.lineTo(w - (y % 18 === 0 ? 0 : 7), y);
    g.lineTo(w - 6, h); g.lineTo(6, h);
    for (let y = h; y >= 0; y -= 9) g.lineTo(y % 18 === 0 ? 0 : 7, y);
    g.closePath(); g.fill();
    // 종이 결 + 반투명 줄무늬
    g.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < 400; i++) {
      g.fillStyle = `rgba(${Math.random() > 0.5 ? '255,250,230' : '180,150,90'},${Math.random() * 0.18})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 14, 1);
    }
    const lg = g.createLinearGradient(0, 0, 0, h);
    lg.addColorStop(0, 'rgba(255,255,255,.28)'); lg.addColorStop(0.5, 'rgba(255,255,255,0)'); lg.addColorStop(1, 'rgba(120,95,50,.12)');
    g.fillStyle = lg; g.fillRect(0, 0, w, h);
  });
  return tapeTex;
}
const tapeMat = () => new THREE.MeshStandardMaterial({
  map: getTapeTexture(), transparent: true, opacity: 0.86, roughness: 0.6, depthWrite: false,
  polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
});

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

export function buildWall(photos, onTextureReady) {
  const group = new THREE.Group();
  const loader = new THREE.TextureLoader();
  const items = [];
  const hits = [];

  const count = Math.min(photos.length, MAX_ON_WALL);
  for (let i = 0; i < count; i++) {
    const rnd = (k) => { const s = Math.sin((i + 1) * 91.7 + k * 17.3) * 43758.5453; return s - Math.floor(s); };
    const g = new THREE.Group();
    const geo = paperGeo((rnd(1) - 0.5) * 0.018, (rnd(2) - 0.5) * 0.014, (rnd(3) - 0.5) * 0.012);

    const paper = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#fffdf8', roughness: 0.9, side: THREE.DoubleSide }));
    const imgMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55, metalness: 0 });
    const img = new THREE.Mesh(geo, imgMat);
    img.position.z = 0.0012;
    const blob = wallBlob(1, 1, 0.34);
    blob.position.z = -0.004;
    g.add(blob, paper, img);

    // 테이프: 1~2개, 위쪽 모서리/가운데 랜덤
    const style = Math.floor(rnd(4) * 3); // 0: 양 모서리, 1: 가운데 하나, 2: 한쪽 모서리 두 장
    const tapes = [];
    const addTape = (nx, ny, rot) => {
      const t = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.28), tapeMat());
      t.userData = { nx, ny, rot, len: 0.38 + rnd(7 + tapes.length) * 0.12 };
      tapes.push(t); g.add(t);
    };
    if (style === 0) { addTape(-0.5, 0.5, -0.62 - rnd(5) * 0.2); addTape(0.5, 0.5, 0.62 + rnd(6) * 0.2); }
    else if (style === 1) { addTape(0.02 * (rnd(5) - 0.5), 0.5, (rnd(6) - 0.5) * 0.3); }
    else { addTape(-0.5, 0.5, -0.6); addTape(0.5, -0.5, -0.65); }

    paper.userData.photoIndex = i;
    img.userData.photoIndex = i;
    hits.push(paper, img);
    group.add(g);

    const item = {
      index: i, group: g, paper, img, blob, tapes, hot: 0, aspect: i % 2 ? 4 / 3 : 3 / 4,
      size: 0.3, ok: false, url: photos[i].src,
      placeholder: null, base: new THREE.Vector3(), rot: 0, z: WALL_Z + 0.006 + i * 0.0009,
    };
    items.push(item);

    // 임시 카드 먼저, 실제 사진이 있으면 교체
    item.placeholder = placeholderCanvas(i, photos[i].caption, item.aspect < 1);
    const ph = new THREE.CanvasTexture(item.placeholder); ph.colorSpace = THREE.SRGBColorSpace;
    imgMat.map = ph;
    loader.load(photos[i].src, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      imgMat.map = tex; imgMat.needsUpdate = true;
      item.ok = true; item.aspect = tex.image.width / tex.image.height;
      fit(item); onTextureReady?.(item);
    }, undefined, () => { /* 파일 없음 → 임시 카드 유지 */ });
  }

  function fit(item) {
    const a = item.aspect;
    const w = item.size * Math.min(1, a), h = item.size * Math.min(1, 1 / a);
    const b = 0.014, bb = 0.034;
    item.img.scale.set(w, h, 1);
    item.paper.scale.set(w + b * 2, h + b + bb, 1);
    item.paper.position.y = -(bb - b) / 2;
    item.blob.scale.set((w + 0.1) * 1.25, (h + 0.1) * 1.25, 1);
    item.blob.position.x = 0.01; item.blob.position.y = -0.02;
    item.tapes.forEach((t) => {
      const { nx, ny, rot, len } = t.userData;
      t.scale.set(item.size * (0.34 + len * 0.3), item.size * 0.19, 1);
      t.position.set(nx * (w + b * 2) * 0.96, ny * (h + b * 2) * 0.97 - (ny < 0 ? bb - b : 0), 0.003);
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
      const [x, y, size, rot] = slots[i];
      it.size = size; it.base.set(x, y, it.z); it.rot = THREE.MathUtils.degToRad(rot);
      it.group.position.copy(it.base);
      it.group.rotation.z = it.rot;
      fit(it);
    });
  }

  function update(dt, hoverIndex) {
    items.forEach((it) => {
      const target = it.index === hoverIndex ? 1 : 0;
      it.hot += (target - it.hot) * Math.min(1, dt * 10);
      const s = 1 + it.hot * 0.05;
      it.group.scale.setScalar(s);
      it.group.position.z = it.base.z + it.hot * 0.02;
      it.blob.material.opacity = 0.34 - it.hot * 0.08;
    });
  }

  return { group, items, hits, layout, update, get mode() { return mode; } };
}
