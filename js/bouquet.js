import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const FLOWER_RE = /^(Gerbera|Rose|Tulip|Lisianthus|Filler)_(\d+)/;
export const FLOWER_LABEL = {
  Gerbera: { ko: '거베라', icon: '🌼' },
  Rose: { ko: '장미', icon: '🌹' },
  Tulip: { ko: '튤립', icon: '🌷' },
  Lisianthus: { ko: '리시안셔스', icon: '🤍' },
  Filler: { ko: '작은 들꽃', icon: '✿' },
};

const SCALE = 1.6;

/** glTF 메쉬 → 월드 변환/회전/스케일이 구워진 단순 지오메트리 */
function bake(mesh, matrix) {
  const src = mesh.geometry;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', src.attributes.position.clone());
  const n = src.attributes.position.count;
  const col = new Float32Array(n * 3);
  const sc = src.attributes.color;
  for (let i = 0; i < n; i++) {
    col[i * 3] = sc ? sc.getX(i) : 0.9;
    col[i * 3 + 1] = sc ? sc.getY(i) : 0.9;
    col[i * 3 + 2] = sc ? sc.getZ(i) : 0.9;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (src.index) g.setIndex(src.index.clone());
  g.applyMatrix4(matrix);
  g.computeVertexNormals();
  return g;
}

export async function loadBouquet(url, onProgress) {
  const gltf = await new GLTFLoader().loadAsync(url, (e) => onProgress?.(e.loaded / (e.total || 1)));
  // ※ 이 GLB는 메쉬 641개 중 260개만 노드에 연결되어 있어(꽃잎 대부분이 누락),
  //   노드 대신 메쉬 목록을 직접 읽어서 모든 꽃잎/잎사귀를 복원합니다. (정점은 이미 월드 좌표)
  const parser = gltf.parser;
  const meshCount = parser.json.meshes.length;
  const meshes = [];
  for (let i = 0; i < meshCount; i++) {
    const obj = await parser.getDependency('mesh', i);
    obj.traverse((o) => { if (o.isMesh) meshes.push(o); });
  }

  // z-up → y-up, 스케일
  const fix = new THREE.Matrix4().makeRotationX(-Math.PI / 2).premultiply(new THREE.Matrix4().makeScale(SCALE, SCALE, SCALE));

  const groups = new Map(); // key -> geometry[]
  const foliage = [];
  meshes.forEach((o) => {
    const g = bake(o, fix);
    const hit = FLOWER_RE.exec(o.name);
    if (hit) {
      const key = `${hit[1]}_${hit[2]}`;
      if (!groups.has(key)) groups.set(key, { type: hit[1], geos: [] });
      groups.get(key).geos.push(g);
    } else {
      foliage.push(g);
    }
  });

  // 전체 중심 맞추기
  const all = [...foliage, ...[...groups.values()].flatMap((v) => v.geos)];
  const box = new THREE.Box3();
  all.forEach((g) => { g.computeBoundingBox(); box.union(g.boundingBox); });
  const center = box.getCenter(new THREE.Vector3());
  all.forEach((g) => g.translate(-center.x, -center.y, -center.z));
  box.translate(center.clone().negate());

  const group = new THREE.Group();
  const flowerMat = new THREE.MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.72, metalness: 0, side: THREE.DoubleSide,
    sheen: 0.6, sheenRoughness: 0.5, sheenColor: new THREE.Color('#fff4f4'),
  });
  const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0, side: THREE.DoubleSide });

  // 줄기/잎/리본
  const foliageMesh = new THREE.Mesh(mergeGeometries(foliage, false), leafMat);
  foliageMesh.castShadow = true;
  foliageMesh.name = 'foliage';
  group.add(foliageMesh);

  // 꽃 (송이별)
  const order = { Gerbera: 0, Rose: 1, Tulip: 2, Lisianthus: 3, Filler: 4 };
  const entries = [...groups.entries()].sort((a, b) => {
    const [ta, ia] = a[0].split('_'); const [tb, ib] = b[0].split('_');
    return order[ta] - order[tb] || +ia - +ib;
  });

  const flowers = entries.map(([key, v], idx) => {
    const geo = mergeGeometries(v.geos, false);
    geo.computeBoundingSphere();
    const c = geo.boundingSphere.center.clone();
    const r = geo.boundingSphere.radius;
    geo.translate(-c.x, -c.y, -c.z);
    const mesh = new THREE.Mesh(geo, flowerMat.clone());
    mesh.position.copy(c);
    mesh.castShadow = true;
    mesh.userData.flowerIndex = idx;
    group.add(mesh);

    const proxy = new THREE.Mesh(
      new THREE.SphereGeometry(r * 1.12, 12, 8),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    proxy.position.copy(c);
    proxy.userData.flowerIndex = idx;
    group.add(proxy);

    return {
      index: idx, key, type: v.type, label: FLOWER_LABEL[v.type],
      mesh, proxy, center: c, radius: r,
      hot: 0,          // hover/선택 강도 (0~1, 애니메이션)
      read: false,
      phase: Math.random() * Math.PI * 2,
    };
  });

  const size = box.getSize(new THREE.Vector3());
  return { group, flowers, foliage: foliageMesh, size, radius: Math.max(size.x, size.z) / 2 };
}
