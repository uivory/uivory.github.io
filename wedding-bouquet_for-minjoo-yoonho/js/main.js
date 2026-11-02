import * as THREE from '../vendor/three/three.module.min.js?v=r170';
import { RoomEnvironment } from '../vendor/three/addons/environments/RoomEnvironment.js?v=r170';
import { site, photos, poster, music } from '../data/content.js?v=20261102c';
import { letters, refreshLetters } from './letters.js?v=20261102c';
import { buildRoom, TABLE_TOP_Y, WALL_Z, blobShadow, canvasTexture } from './room.js?v=20261102c';
import { loadBouquet } from './bouquet.js?v=20261102c';
import { createDogs } from './dogs.js?v=20261102c';
import { buildWall } from './wall.js?v=20261102c';
import { createUI } from './ui.js?v=20261102c';

const $ = (id) => document.getElementById(id);
const canvas = $('stage');
const isTouch = matchMedia('(pointer: coarse)').matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = THREE.MathUtils.lerp;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/* ───────── renderer / scene ───────── */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.75 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 0.92;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#c4beb2');
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.3;

const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);

// 조명: 왼쪽 창에서 들어오는 부드러운 아침 햇살
scene.add(new THREE.HemisphereLight('#fffaf0', '#cfc6b6', 0.75));
const key = new THREE.DirectionalLight('#fff1da', 1.9);
key.position.set(-2.4, 4.4, 3.4);
key.target.position.set(0, 1.0, -0.2);
key.castShadow = true;
key.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
Object.assign(key.shadow.camera, { left: -2.2, right: 2.2, top: 2.6, bottom: -1.2, near: 1, far: 12 });
key.shadow.intensity = 0.28; key.shadow.radius = 14; key.shadow.blurSamples = 16; key.shadow.bias = -0.0004;
scene.add(key, key.target);
const fill = new THREE.DirectionalLight('#e8eeff', 0.4);
fill.position.set(3, 2, 3);
scene.add(fill);

/* ───────── room ───────── */
const { room } = buildRoom();
scene.add(room);

/* ───────── dogs ───────── */
const dogCtl = createDogs();
const [pom, bichon] = dogCtl.dogs;
pom.root.position.set(-0.38, 0, 0.62); pom.root.rotation.y = 0.42;
bichon.root.position.set(0.37, 0, 0.66); bichon.root.rotation.y = -0.42;
scene.add(pom.root, bichon.root);
// 터치용 투명 충돌체
const dogHits = [pom, bichon].map((d) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8), new THREE.MeshBasicMaterial({ visible: false }));
  m.position.set(0, 0.22, 0.02); m.userData.dog = d; d.root.add(m);
  return m;
});

/* ───────── photo wall ───────── */
// 포토월/라이트박스 순서: 포스터 → 사진들
const gallery = [poster, ...photos];
const wall = buildWall(gallery);
scene.add(wall.group);

/* ───────── bouquet (비동기) ───────── */
const BQ_Y = TABLE_TOP_Y + 0.68;
const BASE_PITCH = 0.18;
const holder = new THREE.Group(); // 위치 + 기울기(피치)
const spin = new THREE.Group();   // 자체 회전(요)
holder.position.set(0, BQ_Y, 0.02);
holder.add(spin);
scene.add(holder);
const bqShadow = blobShadow(1.1, 0.9, 0.3);
bqShadow.position.set(0.04, TABLE_TOP_Y + 0.003, 0.02);
scene.add(bqShadow);

let bq = null;
let ui = null;

/* 반짝이 (안 읽은 꽃 표시) */
const starTex = canvasTexture(128, 128, (g, w, h) => {
  const c = w / 2;
  const grd = g.createRadialGradient(c, c, 0, c, c, c);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.18, 'rgba(255,236,180,.95)'); grd.addColorStop(0.5, 'rgba(255,214,140,.25)'); grd.addColorStop(1, 'rgba(255,214,140,0)');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,248,224,.95)';
  g.beginPath();
  g.moveTo(c, 6); g.lineTo(c + 5, c - 5); g.lineTo(w - 6, c); g.lineTo(c + 5, c + 5); g.lineTo(c, h - 6); g.lineTo(c - 5, c + 5); g.lineTo(6, c); g.lineTo(c - 5, c - 5); g.closePath(); g.fill();
});

/* 먼지 입자 */
const dust = (() => {
  const N = 70;
  const pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 3.2; pos[i * 3 + 1] = Math.random() * 3; pos[i * 3 + 2] = -0.6 + Math.random() * 1.8; seed[i] = Math.random() * 10; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({
    map: canvasTexture(32, 32, (c, w, h) => {
      const gr = c.createRadialGradient(16, 16, 0, 16, 16, 16);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, h);
    }),
    size: 0.045, transparent: true, opacity: 0.55, depthWrite: false, color: '#fff8e6', sizeAttenuation: true,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  scene.add(p);
  return { p, pos, seed, N };
})();

/* ───────── view / camera rig ───────── */
const view = {
  yaw: 0.15, yawT: 0.15, pitch: BASE_PITCH, pitchT: BASE_PITCH, yawV: 0,
  zoom: 0, zoomT: 0, pan: new THREE.Vector2(), panT: new THREE.Vector2(),
  focus: null,           // 편지를 열었을 때 꽃 위치
  shift: new THREE.Vector2(), shiftT: new THREE.Vector2(),
  idle: 0, mode: 'tall', dist0: 5, distMin: 1.05, lookY: 1.4,
};
const FOV = camera.fov;
const tanHalf = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const ELEV = THREE.MathUtils.degToRad(7);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const mode = camera.aspect < 0.9 ? 'tall' : 'wide';
  const fitH = mode === 'tall' ? 2.9 : 3.2;
  const fitW = mode === 'tall' ? 1.5 : 3.4;
  view.dist0 = Math.max(fitH / 2 / tanHalf, fitW / camera.aspect / 2 / tanHalf);
  view.lookY = mode === 'tall' ? 1.1 : 1.3;
  if (mode !== view.mode || !wall.mode) { view.mode = mode; wall.layout(mode); }
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const tmpV = new THREE.Vector3();
const T0 = new THREE.Vector3();
const BC = new THREE.Vector3();
function updateCamera(dt) {
  view.zoom = damp(view.zoom, view.zoomT, 9, dt);
  view.pan.lerp(view.panT, 1 - Math.exp(-9 * dt));
  view.shift.lerp(view.shiftT, 1 - Math.exp(-5 * dt));

  const z = view.zoom;
  const dist = view.dist0 * Math.pow(view.distMin / view.dist0, z);
  const zt = smooth(0, 0.5, z);
  T0.set(0, view.lookY, 0);
  holder.getWorldPosition(BC);
  const focus = view.focus ? view.focus : tmpV.set(BC.x + view.pan.x, BC.y + view.pan.y, BC.z);
  const target = new THREE.Vector3().lerpVectors(T0, focus, zt);
  camera.position.set(target.x, target.y + Math.sin(ELEV) * dist, target.z + Math.cos(ELEV) * dist);
  camera.lookAt(target);

  // 편지 시트가 가리는 만큼 화면 속 장면을 밀어올림 (뷰 오프셋)
  const W = renderer.domElement.clientWidth, H = renderer.domElement.clientHeight;
  if (Math.abs(view.shift.x) + Math.abs(view.shift.y) > 0.0005) {
    camera.setViewOffset(W, H, view.shift.x * W, view.shift.y * H, W, H);
  } else camera.clearViewOffset();
}

/* ───────── picking ───────── */
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function setRay(cx, cy) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
}
function pick(cx, cy) {
  setRay(cx, cy);
  const cand = [...wall.hits.filter((h) => h.parent.visible), ...dogHits];
  if (bq) cand.push(...bq.flowers.map((f) => f.mesh), ...bq.foliage.children);
  const hit = ray.intersectObjects(cand, false)[0];
  if (hit) {
    const o = hit.object;
    if (o.userData.photoIndex !== undefined) return { type: 'photo', index: o.userData.photoIndex };
    if (o.userData.dog) return { type: 'dog', dog: o.userData.dog, point: hit.point };
    return { type: 'bouquet' };
  }
  // 손가락으로 누르기 쉽게: 부케를 감싸는 투명 구체
  if (bqHit && ray.intersectObject(bqHit, false)[0]) return { type: 'bouquet' };
  return null;
}

function worldToScreen(v) {
  const p = v.clone().project(camera);
  const r = canvas.getBoundingClientRect();
  return { x: r.left + (p.x * 0.5 + 0.5) * r.width, y: r.top + (-p.y * 0.5 + 0.5) * r.height };
}

/* ───────── 동작: 꽃 / 사진 / 강아지 ───────── */
let selected = -1;
let hoverBouquet = false, hoverPhoto = -1;
let bqHit = null;

function flowerWorldAt(f, yaw) {
  const old = spin.rotation.y;
  spin.rotation.y = yaw;
  holder.updateMatrixWorld(true);
  const v = f.mesh.getWorldPosition(new THREE.Vector3());
  spin.rotation.y = old;
  holder.updateMatrixWorld(true);
  return v;
}

function focusFlower(i) {
  const f = bq.flowers[i];
  selected = i;
  // 선택한 꽃이 정면을 향하도록 부케를 돌림
  const r = Math.hypot(f.center.x, f.center.z);
  if (r > 0.05) {
    let target = Math.atan2(-f.center.x, f.center.z);
    let d = ((target - view.yawT) % (Math.PI * 2));
    if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
    view.yawT += d;
  }
  view.yawV = 0;
  view.pitchT = BASE_PITCH + 0.12;
  view.zoomT = isTouch ? 0.5 : 0.42;
  view.focus = flowerWorldAt(f, view.yawT);
  view.focus.y -= 0.0;
  const wide = window.innerWidth >= 760;
  view.shiftT.set(wide ? 0.16 : 0, wide ? 0 : 0.2);
}


function unfocus() {
  selected = -1;
  view.focus = null;
  view.shiftT.set(0, 0);
}

function resetView() {
  ui.closeLetter();
  view.zoomT = 0; view.panT.set(0, 0);
  const turns = Math.round(view.yaw / (Math.PI * 2));
  view.yawT = turns * Math.PI * 2 + 0.15; view.yawV = 0;
  view.pitchT = BASE_PITCH;
}
$('btn-reset').onclick = (e) => { e.stopPropagation(); resetView(); };

function photoScreenInfo(item) {
  const g = item.group;
  const c = g.getWorldPosition(new THREE.Vector3());
  const half = item.img.scale.x / 2 + 0.02;
  const a = worldToScreen(c.clone().add(new THREE.Vector3(-half, 0, 0)));
  const b = worldToScreen(c.clone().add(new THREE.Vector3(half, 0, 0)));
  const m = worldToScreen(c);
  return { x: m.x, y: m.y, w: Math.hypot(b.x - a.x, b.y - a.y), rot: -THREE.MathUtils.radToDeg(item.rot) };
}

function handleTap(cx, cy, dbl) {
  // 편지를 쓰는 중에는 장면을 눌러도 아무 일도 일어나지 않게 (쓰던 내용 보호)
  if (ui.editing) { document.activeElement?.blur?.(); return; }
  const hit = pick(cx, cy);
  if (!hit) {
    if (ui.letterOpen) ui.closeLetter();
    else if (dbl) resetView();
    else spark(cx, cy);
    return;
  }
  if (hit.type === 'bouquet') ui.openLetter(0); // 부케 어디를 눌러도 항상 1번 편지부터
  else if (hit.type === 'photo') {
    ui.closeLetter();
    ui.openPhoto(hit.index, photoScreenInfo(wall.items[hit.index]));
  } else if (hit.type === 'dog') {
    dogCtl.poke(hit.dog);
    const s = worldToScreen(hit.point);
    ui.pop(s.x, s.y - 30, '🤍');
    ui.pop(s.x + (Math.random() - 0.5) * 50, s.y - 70, hit.dog.say, true);
    dogCombo(s);
  }
}
/* 강아지 연타 → 랜덤 이벤트 */
const combo = { n: 0, t: 0, cool: 0, last: '' };
function dogCombo(s) {
  const now = performance.now();
  combo.n = now - combo.t < 650 ? combo.n + 1 : 1;
  combo.t = now;
  if (combo.n < 4 || now < combo.cool) return;
  combo.n = 0; combo.cool = now + 3200;
  const events = ['confetti', 'beg', 'spin', 'hearts'].filter((e) => e !== combo.last);
  const ev = events[Math.floor(Math.random() * events.length)];
  combo.last = ev;
  const both = dogCtl.dogs;
  const at = (d) => worldToScreen(d.root.localToWorld(new THREE.Vector3(0, 0.42, 0)));
  if (ev === 'confetti') {
    ui.confetti(s.x, s.y - 20);
    both.forEach((d, i) => setTimeout(() => dogCtl.poke(d), i * 160));
  } else if (ev === 'beg') {
    dogCtl.beg();
    both.forEach((d, i) => { const p = at(d); setTimeout(() => { ui.pop(p.x, p.y - 20, '💕'); ui.pop(p.x, p.y - 60, i ? '헤헤' : '이뻐해줘요', true); }, 300 + i * 250); });
  } else if (ev === 'spin') {
    dogCtl.spin();
    both.forEach((d, i) => { const p = at(d); setTimeout(() => ui.pop(p.x, p.y - 50, i ? '빙글!' : '뱅글~', true), 200 + i * 200); });
  } else {
    ui.rain('🤍', 22);
    both.forEach((d, i) => { dogCtl.poke(d); const p = at(d); setTimeout(() => ui.pop(p.x, p.y - 60, '사랑해요!', true), i * 300); });
  }
}
function spark(x, y) { ui.pop(x, y, ['✨', '🌸', '🤍'][Math.floor(Math.random() * 3)]); }

/* ───────── pointer controls ───────── */
const ptrs = new Map();
let down = null, pinch = null, lastTap = { t: 0, x: 0, y: 0 };
const pointerLook = { yaw: 0, pitch: 0 };

function onDown(e) {
  canvas.setPointerCapture?.(e.pointerId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  view.idle = 0;
  if (ptrs.size === 1) {
    down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0, id: e.pointerId };
    view.yawV = 0;
  } else if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    if (down) down.moved = 999;
  }
  canvas.classList.add('grabbing');
}
function onMove(e) {
  const p = ptrs.get(e.pointerId);
  const r = canvas.getBoundingClientRect();
  pointerLook.yaw = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
  pointerLook.pitch = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1);
  if (!p) {
    if (!isTouch && !ui.photoOpen) updateHover(e.clientX, e.clientY);
    return;
  }
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  view.idle = 0;

  if (ptrs.size === 1 && down) {
    down.moved += Math.abs(dx) + Math.abs(dy);
    if (down.moved > 7) {
      const k = 0.0072 / (1 + view.zoomT * 0.6);
      view.yawT += dx * k; view.yaw += dx * k;
      view.yawV = dx * k / Math.max(0.008, (e.timeStamp - (down.lt || e.timeStamp - 16)) / 1000);
      down.lt = e.timeStamp;
      view.pitchT = clamp(view.pitchT + dy * 0.0046, -0.35, 1.05);
      if (view.zoomT > 0.15) { // 확대 상태에서는 한 손가락으로도 살짝 이동
        const per = (view.dist0 * Math.pow(view.distMin / view.dist0, view.zoom)) * tanHalf * 2 / r.height;
        view.panT.x = clamp(view.panT.x - dx * per * 0.5, -0.45, 0.45);
        view.panT.y = clamp(view.panT.y + dy * per * 0.5, -0.4, 0.4);
      }
    }
  } else if (ptrs.size === 2 && pinch) {
    const [a, b] = [...ptrs.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const range = Math.log(view.dist0 / view.distMin);
    view.zoomT = clamp(view.zoomT + Math.log(d / pinch.d) / range, 0, 1);
    const per = (view.dist0 * Math.pow(view.distMin / view.dist0, view.zoom)) * tanHalf * 2 / r.height;
    view.panT.x = clamp(view.panT.x - (mx - pinch.mx) * per, -0.45, 0.45);
    view.panT.y = clamp(view.panT.y + (my - pinch.my) * per, -0.4, 0.4);
    pinch.d = d; pinch.mx = mx; pinch.my = my;
    if (view.focus && view.zoomT < 0.25) view.focus = null;
  }
}
function onUp(e) {
  const had = ptrs.delete(e.pointerId);
  if (!had) return;
  if (ptrs.size < 2) pinch = null;
  if (ptrs.size === 0) {
    canvas.classList.remove('grabbing');
    if (down && down.moved <= 7 && performance.now() - down.t < 500 && e.type === 'pointerup') {
      const now = performance.now();
      const dbl = now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30;
      lastTap = { t: now, x: e.clientX, y: e.clientY };
      handleTap(e.clientX, e.clientY, dbl);
    }
    down = null;
  } else if (ptrs.size === 1) {
    const [rest] = [...ptrs.values()];
    down = { x: rest.x, y: rest.y, t: performance.now(), moved: 999 };
  }
}
canvas.addEventListener('pointerdown', onDown);
canvas.addEventListener('pointermove', onMove);
canvas.addEventListener('pointerup', onUp);
canvas.addEventListener('pointercancel', onUp);
canvas.addEventListener('pointerleave', () => { hoverBouquet = false; hoverPhoto = -1; canvas.classList.remove('point'); });
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  view.idle = 0;
  const range = Math.log(view.dist0 / view.distMin);
  view.zoomT = clamp(view.zoomT - (e.deltaY * (e.ctrlKey ? 0.012 : 0.0018)) / range * 1.0, 0, 1);
  if (view.focus && view.zoomT < 0.25) view.focus = null;
}, { passive: false });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function updateHover(x, y) {
  const hit = pick(x, y);
  hoverBouquet = hit?.type === 'bouquet';
  hoverPhoto = hit?.type === 'photo' ? hit.index : -1;
  canvas.classList.toggle('point', !!hit);
  canvas.classList.toggle('grab', !hit);
}

/* ───────── 편지함 목록용 꽃 썸네일 (꽃 한 송이씩 3D 렌더) ───────── */
let thumbs = null;
function flowerThumbs() {
  if (thumbs || !bq) return thumbs || [];
  const SIZE = 220;
  const r2 = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r2.setPixelRatio(1);
  r2.setSize(SIZE, SIZE, false);
  r2.outputColorSpace = THREE.SRGBColorSpace;
  r2.toneMapping = THREE.NeutralToneMapping;
  r2.toneMappingExposure = 1.0;
  const sc = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(r2);
  sc.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  sc.environmentIntensity = 0.45;
  sc.add(new THREE.HemisphereLight('#fffaf0', '#cfc6b6', 0.9));
  const dl = new THREE.DirectionalLight('#fff3e0', 1.7);
  sc.add(dl);
  const cam = new THREE.PerspectiveCamera(28, 1, 0.005, 10);
  const half = THREE.MathUtils.degToRad(cam.fov / 2);
  thumbs = bq.flowers.map((f) => {
    const mat = f.mesh.material.clone();
    mat.emissiveIntensity = 0.04;
    const m = new THREE.Mesh(f.mesh.geometry, mat);
    sc.add(m);
    // 꽃이 바라보는 방향(부케 중심에서 바깥·위쪽)에서 비춰 찍기
    const dir = f.center.clone().setY(Math.max(f.center.y, 0) + 0.12).normalize();
    const dist = (f.radius * 1.08) / Math.sin(half);
    cam.position.copy(dir).multiplyScalar(dist);
    cam.up.set(0, 1, 0);
    cam.lookAt(0, 0, 0);
    dl.position.copy(cam.position).add(new THREE.Vector3(-0.4, 0.8, 0).multiplyScalar(dist));
    r2.render(sc, cam);
    const url = r2.domElement.toDataURL('image/png');
    sc.remove(m); mat.dispose();
    return url;
  });
  pm.dispose(); sc.environment.dispose();
  r2.dispose(); r2.forceContextLoss();
  return thumbs;
}

/* ───────── UI ───────── */
ui = createUI({
  site, photos: gallery, music,
  flowerInfo: (i) => bq?.flowers[i]?.label ?? { icon: '🌸', ko: '꽃' },
  hooks: {
    onLetter: (i) => focusFlower(i),
    thumbs: () => flowerThumbs(),
    flowerLabel: (i) => bq?.flowers[i]?.label,
    onLetterClose: () => unfocus(),
    onRead: (i) => { if (bq) bq.flowers[i].read = true; },
    onViewing: () => {},
  },
});

/* ───────── loop ───────── */
const clock = new THREE.Clock();
let t = 0;
const sparkleV = new THREE.Vector3(), tc = new THREE.Vector3();

function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  t += dt;

  // 회전 관성 + 한가할 때 천천히 자동 회전
  view.idle += dt;
  if (!down || down.moved <= 7) {
    if (Math.abs(view.yawV) > 0.01) {
      const step = view.yawV * dt;
      view.yawT += step; view.yaw += step;
      view.yawV *= Math.exp(-3.2 * dt);
    } else if (view.idle > 4 && !ui.letterOpen && !ui.photoOpen && view.zoomT < 0.2) {
      view.yawT += 0.16 * dt;
    }
  }
  view.yaw = damp(view.yaw, view.yawT, 14, dt);
  view.pitch = damp(view.pitch, view.pitchT, 10, dt);
  spin.rotation.y = view.yaw;
  // 둥실둥실
  holder.position.y = BQ_Y + Math.sin(t * 1.15) * 0.02;
  holder.rotation.set(view.pitch + Math.sin(t * 0.7) * 0.015, 0, Math.sin(t * 0.9 + 1) * 0.03);
  const lift = (Math.sin(t * 1.15) + 1) / 2;
  bqShadow.scale.setScalar(0.94 + (1 - lift) * 0.08);
  bqShadow.material.opacity = 0.27 + (1 - lift) * 0.05;

  // 꽃 강조 / 숨쉬기 / 반짝이
  if (bq) {
    holder.getWorldPosition(BC);
    bq.flowers.forEach((f) => {
      const on = f.index < letters.length;
      const target = f.index === selected ? 1 : hoverBouquet ? 0.35 : 0;
      f.hot = damp(f.hot, target, 12, dt);
      const unread = on && !f.read;
      const breathe = unread ? Math.sin(t * 2 + f.phase) * 0.018 : 0;
      f.mesh.scale.setScalar(1 + f.hot * 0.13 + breathe);
      f.mesh.material.emissive.setRGB(1, 0.86, 0.88);
      f.mesh.material.emissiveIntensity = 0.06 + f.hot * 0.26;

      if (f.sprite) {
        f.mesh.getWorldPosition(sparkleV);
        tc.copy(sparkleV).sub(BC).normalize();
        const toCam = camera.position.clone().sub(sparkleV).normalize();
        const facing = tc.dot(toCam);
        const vis = unread ? smooth(-0.1, 0.4, facing) : 0;
        const pulse = 0.65 + 0.35 * Math.sin(t * 2.6 + f.phase * 2);
        f.sprite.material.opacity = vis * pulse * (1 - view.zoom * 0.5);
        const s = Math.min(f.radius, 0.07) * (0.75 + 0.25 * pulse);
        f.sprite.scale.set(s, s, 1);
      }
    });
  }

  wall.update(dt, hoverPhoto);
  dogCtl.update(t, dt, pointerLook);

  // 먼지
  const p = dust.pos;
  for (let i = 0; i < dust.N; i++) {
    p[i * 3 + 1] += dt * 0.025;
    p[i * 3] += Math.sin(t * 0.3 + dust.seed[i]) * dt * 0.012;
    if (p[i * 3 + 1] > 3.1) p[i * 3 + 1] = 0;
  }
  dust.p.geometry.attributes.position.needsUpdate = true;
  dust.p.material.opacity = 0.35 + Math.sin(t * 0.5) * 0.1;

  updateCamera(dt);
  renderer.render(scene, camera);
}

/* ───────── boot ───────── */
(async function boot() {
  try {
    bq = await loadBouquet();
    spin.add(bq.group);
    bq.flowers.forEach((f) => {
      if (ui.isRead(f.index)) f.read = true;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, transparent: true, depthTest: false, depthWrite: false, opacity: 0 }));
      sp.renderOrder = 10;
      const dir = f.center.clone().normalize();
      sp.position.copy(f.center).addScaledVector(dir, f.radius * 0.55).add(new THREE.Vector3(0, f.radius * 0.5, 0));
      bq.group.add(sp);
      f.sprite = sp;
      f.mesh.material.emissive = new THREE.Color(1, 0.86, 0.88);
    });
    wall.group.visible = true;
  } catch (err) {
    console.error(err);
    window.__bootFail?.('부케를 불러오지 못했어요. 다시 불러와 주세요.');
    return;
  }
  {
    const box = new THREE.Box3().setFromObject(bq.group);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    bqHit = new THREE.Mesh(new THREE.SphereGeometry(sphere.radius * 0.78, 16, 12), new THREE.MeshBasicMaterial({ visible: false }));
    bqHit.position.copy(sphere.center).add(new THREE.Vector3(0, sphere.radius * 0.15, 0));
    spin.add(bqHit);
  }
  refreshLetters(true);
  // 셰이더를 미리(가능하면 병렬로) 준비해서 첫 화면 멈춤을 줄임
  updateCamera(0);
  try { await renderer.compileAsync(scene, camera); } catch { /* 지원 안 하면 첫 프레임에서 준비 */ }
  renderer.setAnimationLoop(frame);
  requestAnimationFrame(() => requestAnimationFrame(() => $('loader').classList.add('done')));

  // 안내 문구 순서대로
  const hintText = $('hint-text');
  setTimeout(() => { if (!ui.readCount) { $('hint').classList.remove('gone'); } }, 300);
  setTimeout(() => { hintText.textContent = '부케를 누르면 편지가 열려요 💌'; }, 6500);
  setTimeout(() => { $('hint').classList.add('gone'); }, 14000);
  if (!document.getElementById('bgm').error) {
    setTimeout(() => { if (document.getElementById('bgm').paused && !document.getElementById('btn-music').classList.contains('on')) ui.toast('화면을 한 번 터치하면 음악이 시작돼요 ♪', 3200); }, 1800);
  }
})();

/* 디버그/테스트용 */
window.__bq = {
  get ready() { return !!bq; },
  view, camera, flowerScreen: (i) => worldToScreen(bq.flowers[i].mesh.getWorldPosition(new THREE.Vector3())),
  photoScreen: (i) => photoScreenInfo(wall.items[i]), dogScreen: (i) => worldToScreen(dogHits[i].getWorldPosition(new THREE.Vector3())),
  tap: (x, y) => handleTap(x, y, false), ui, dogs: dogCtl,
};
