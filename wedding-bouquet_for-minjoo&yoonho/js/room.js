import * as THREE from 'three';

export const WALL_Z = -0.95;
export const TABLE_TOP_Y = 0.66;

/* ───────── helpers ───────── */
export function canvasTexture(w, h, draw, { srgb = true, repeat } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

function grain(ctx, w, h, amount = 10, alpha = 1) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount * alpha;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

let _blobTex;
function blobTexture() {
  if (_blobTex) return _blobTex;
  _blobTex = canvasTexture(128, 128, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, 'rgba(60,45,30,1)');
    grd.addColorStop(0.45, 'rgba(60,45,30,.55)');
    grd.addColorStop(1, 'rgba(60,45,30,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  }, { srgb: false });
  return _blobTex;
}

/** 바닥/테이블 위에 놓는 부드러운 그림자 */
export function blobShadow(w, d, opacity = 0.35) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshBasicMaterial({
      map: blobTexture(), transparent: true, opacity, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }),
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  return m;
}

/** 벽에 붙는 사진용 그림자 (평면 벽 기준, 정면을 향함) */
export function wallBlob(w, h, opacity = 0.3) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, opacity, depthWrite: false }),
  );
  return m;
}

/* ───────── room ───────── */
export function buildRoom() {
  const room = new THREE.Group();
  const shadowReceivers = [];

  // wall ---------------------------------------------------
  const wallTex = canvasTexture(1024, 640, (g, w, h) => {
    g.fillStyle = '#c4beb2'; g.fillRect(0, 0, w, h);
    // 창가(왼쪽 위)에서 들어오는 부드러운 빛
    let grd = g.createRadialGradient(w * 0.18, h * 0.22, 0, w * 0.18, h * 0.22, w * 0.75);
    grd.addColorStop(0, 'rgba(255,248,232,.7)');
    grd.addColorStop(0.55, 'rgba(255,246,228,.2)');
    grd.addColorStop(1, 'rgba(255,248,232,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    // 아래쪽이 살짝 어두워지는 비네팅
    grd = g.createLinearGradient(0, h * 0.55, 0, h);
    grd.addColorStop(0, 'rgba(120,108,90,0)'); grd.addColorStop(1, 'rgba(120,108,90,.18)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    grain(g, w, h, 9);
  });
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 5.6),
    new THREE.MeshStandardMaterial({ map: wallTex, roughness: 1, metalness: 0 }),
  );
  wall.position.set(0.4, 2.35, WALL_Z);
  wall.receiveShadow = true;
  room.add(wall);
  shadowReceivers.push(wall);

  // baseboard
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(9, 0.11, 0.025),
    new THREE.MeshStandardMaterial({ color: '#eeeae2', roughness: 0.8 }),
  );
  base.position.set(0.4, 0.055, WALL_Z + 0.0125);
  base.receiveShadow = true;
  room.add(base);

  // floor ---------------------------------------------------
  const floorTex = canvasTexture(1024, 1024, (g, w, h) => {
    g.fillStyle = '#c2b8a6'; g.fillRect(0, 0, w, h);
    const planks = 8;
    for (let i = 0; i < planks; i++) {
      const x = (i * w) / planks;
      const tone = 178 + Math.random() * 18;
      g.fillStyle = `rgb(${tone + 14},${tone + 4},${tone - 14})`;
      g.fillRect(x, 0, w / planks, h);
      g.fillStyle = 'rgba(120,100,70,.28)';
      g.fillRect(x, 0, 2, h);
      // 이음매
      for (let y = Math.random() * 300; y < h; y += 260 + Math.random() * 260) g.fillRect(x, y, w / planks, 2);
    }
    // 나뭇결
    for (let i = 0; i < 260; i++) {
      g.strokeStyle = `rgba(140,115,80,${Math.random() * 0.08})`;
      g.lineWidth = 1 + Math.random() * 2;
      const x = Math.random() * w;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (Math.random() - 0.5) * 10, h); g.stroke();
    }
    grain(g, w, h, 8);
  }, { repeat: [3, 2] });
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 6),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0.4, 0, WALL_Z + 3);
  floor.receiveShadow = true;
  room.add(floor);
  shadowReceivers.push(floor);

  // rug -----------------------------------------------------
  const rugTex = canvasTexture(512, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#f1ece1';
    g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(190,175,150,.55)'; g.lineWidth = 6;
    g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 22, 0, Math.PI * 2); g.stroke();
    // 보송한 질감
    for (let i = 0; i < 5000; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * (w / 2 - 4);
      g.fillStyle = `rgba(${Math.random() > 0.5 ? '255,255,252' : '200,185,160'},${Math.random() * 0.35})`;
      g.fillRect(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r, 2, 2);
    }
  });
  const rug = new THREE.Mesh(
    new THREE.CircleGeometry(1.0, 64),
    new THREE.MeshStandardMaterial({ map: rugTex, transparent: true, roughness: 1 }),
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.004, 0.25);
  rug.scale.set(1.05, 0.8, 1);
  rug.receiveShadow = true;
  room.add(rug);
  shadowReceivers.push(rug);

  // curtain (왼쪽 얇은 커튼) ---------------------------------
  const curtainGeo = new THREE.PlaneGeometry(1.05, 4.6, 90, 1);
  const pos = curtainGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    pos.setZ(i, Math.sin(x * 20) * 0.045 + Math.sin(x * 47 + 1.3) * 0.012);
  }
  curtainGeo.computeVertexNormals();
  const curtain = new THREE.Mesh(
    curtainGeo,
    new THREE.MeshStandardMaterial({
      color: '#ffffff', roughness: 1, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  curtain.position.set(-2.3, 2.2, WALL_Z + 0.28);
  curtain.renderOrder = 3;
  room.add(curtain);
  // 커튼 뒤 밝은 빛
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 4.2),
    new THREE.MeshBasicMaterial({
      map: canvasTexture(64, 256, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, w, 0);
        gr.addColorStop(0, 'rgba(255,252,244,.95)'); gr.addColorStop(1, 'rgba(255,252,244,0)');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
      }),
      transparent: true, depthWrite: false,
    }),
  );
  glow.position.set(-2.55, 2.2, WALL_Z + 0.01);
  room.add(glow);

  // table ---------------------------------------------------
  const table = new THREE.Group();
  const R = 0.47;
  const topMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff8ee', emissiveIntensity: 0.12, roughness: 0.34, metalness: 0 });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.026, 72), topMat);
  top.position.y = TABLE_TOP_Y - 0.013;
  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(R + 0.003, R + 0.003, 0.03, 72),
    new THREE.MeshStandardMaterial({ color: '#e1c49c', roughness: 0.6 }),
  );
  rim.position.y = TABLE_TOP_Y - 0.03;
  const under = new THREE.Mesh(
    new THREE.CylinderGeometry(R - 0.02, R - 0.04, 0.02, 48),
    new THREE.MeshStandardMaterial({ color: '#efece6', roughness: 0.6 }),
  );
  under.position.y = TABLE_TOP_Y - 0.05;
  // 다리/받침: 공간에 어울리는 무광 화이트 (분체도장 느낌)
  const steel = new THREE.MeshStandardMaterial({ color: '#f6f4ef', metalness: 0.05, roughness: 0.42 });
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.038, TABLE_TOP_Y - 0.06, 32), steel);
  stem.position.y = (TABLE_TOP_Y - 0.06) / 2 + 0.015;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.022, 56), steel);
  foot.position.y = 0.011;
  [top, rim, under, stem, foot].forEach((m) => { m.castShadow = true; m.receiveShadow = true; table.add(m); });
  room.add(table);
  shadowReceivers.push(top);

  // 테이블 / 바닥 접지 그림자
  const tableFloorShadow = blobShadow(1.5, 1.2, 0.4);
  tableFloorShadow.position.set(0.05, 0.008, 0.05);
  room.add(tableFloorShadow);

  return { room, table, tableTop: top, shadowReceivers, wall, curtain, glow };
}
