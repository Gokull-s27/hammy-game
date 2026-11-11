import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// =====================================================================
// HAMMY GAME v2 – side view, cages + tubes on a grid (like Hammy Home)
// The world is a wall of grid cells. X = left/right, Y = up/down.
// Cages and tube pieces snap to cells. Hamsters travel through them.
// =====================================================================

// =====================================================================
// 1. SETTINGS
// =====================================================================
const CELL = 0.8;            // size of one grid cell
const HALF = CELL / 2;
const TUBE_R = 0.3;          // tube radius
const CAGE_DEPTH = 1.6;      // how deep cages are (front to back)
const FLOOR_Y = 0.1;         // hamster feet height above a cage's bottom
const TUBE_FLOOR = HALF - 0.27;  // hamster feet height inside a tube cell
const ITEM_Z = -0.35;        // items sit in the back half of a cage
const HAM_Z = 0.2;           // hamsters walk in the front half of a cage
const MAX_HAMSTERS = 10;

// Directions: 0 = up (N), 1 = right (E), 2 = down (S), 3 = left (W)
const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]];

// Building pieces. Cages are w x h cells. Tubes list which sides are open (before rotating).
const PIECES = {
  cage_s: { kind: 'cage', w: 3, h: 3, label: 'Small cage', icon: '⬜', code: 's' },
  cage_l: { kind: 'cage', w: 5, h: 3, label: 'Big cage',   icon: '▭',  code: 'l' },
  cage_t: { kind: 'cage', w: 3, h: 4, label: 'Tall cage',  icon: '▯',  code: 't' },
  tube:   { kind: 'tube', open: [1, 3],       label: 'Tube',   icon: '━', code: 'i' },
  corner: { kind: 'tube', open: [1, 2],       label: 'Corner', icon: '┓', code: 'c' },
  tee:    { kind: 'tube', open: [1, 2, 3],    label: 'T tube', icon: '┳', code: 'y' },
  cross:  { kind: 'tube', open: [0, 1, 2, 3], label: 'Cross',  icon: '╋', code: 'x' }
};

// Things that go inside cages (one per floor cell)
const ITEMS = {
  food_bowl:    { label: 'Food',  icon: '🥣', code: 'b' },
  water_bottle: { label: 'Water', icon: '💧', code: 'w' },
  wheel:        { label: 'Wheel', icon: '🎡', code: 'h' },
  house:        { label: 'House', icon: '🛖', code: 'o' }
};

const TUBE_COLORS = ['#e63946', '#43aa8b', '#4ea8de', '#f9c74f', '#f3722c', '#9d4edd', '#ffffff'];
const CAGE_COLORS = ['#f1f1f1', '#d8cfb4', '#bfe6ff', '#ffd6e0', '#c7f9cc', '#4a4a4a'];

const LOOKS = {
  fur:      ['#E89A52', '#F5E6D3', '#8B5E3C', '#9E9E9E', '#3B3B3B', '#FFFFFF', '#D9A066', '#C7B3A3'],
  belly:    ['#FBE6C8', '#FFFFFF', '#E8D9C5', '#F3C9A0'],
  pattern:  ['Plain', 'Spots', 'Band', 'Saddle'],
  patColor: ['#FFFFFF', '#3B3B3B', '#8B5E3C', '#E89A52'],
  eyes:     ['#1E1A1A', '#B3263A']
};
const NAMES = ['Hammy', 'Peanut', 'Mochi', 'Biscuit', 'Nugget', 'Pip', 'Cocoa', 'Toffee', 'Bean',
  'Waffles', 'Pumpkin', 'Sushi', 'Muffin', 'Pebble', 'Honey', 'Oreo', 'Cookie', 'Bun', 'Fudge', 'Maple'];

// Starting layout: small cage – tubes – big cage – tubes going up – small cage on top
const DEFAULT_LAYOUT = 's0.0.0.0_i3.0.0.0_i4.0.0.0_l5.0.0.1_c10.0.2.1_i10.1.1.1_c10.2.0.1_' +
  'i11.2.0.1_s12.2.0.2_w0.0_b1.0_o2.0_h7.0_o9.0_b13.2';
const DEFAULT_HAMSTERS = '0000000';

// =====================================================================
// 2. SCENE, CAMERA, LIGHTS
// =====================================================================
const scene = new THREE.Scene();
scene.background = new THREE.Color('#fdf6ec');

const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 200);
camera.position.set(4, 2.5, 16);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight('white', 0.9));
const sun = new THREE.DirectionalLight('white', 1.4);
sun.position.set(4, 10, 8);
sun.castShadow = true;
sun.shadow.camera.left = -15; sun.shadow.camera.right = 15;
sun.shadow.camera.top = 15;   sun.shadow.camera.bottom = -15;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);
scene.add(sun.target);

// Table top the cages stand on
const table = new THREE.Mesh(
  new THREE.BoxGeometry(200, 0.2, 6),
  new THREE.MeshStandardMaterial({ color: '#e8dcc8' })
);
table.position.set(0, -0.1, 0);
table.receiveShadow = true;
scene.add(table);

// Grid lines (only shown in Build mode)
const grid = new THREE.GridHelper(60 * CELL, 60, '#c9b9a0', '#e3d6c2');
grid.rotation.x = Math.PI / 2;
grid.position.set(HALF, 30 * CELL, -CAGE_DEPTH / 2 - 0.05);
grid.visible = false;
scene.add(grid);

// =====================================================================
// 3. MATERIALS & MESH BUILDERS (cages and tubes are built in code)
// =====================================================================
const matCache = {};
function mat(key, make) { return matCache[key] || (matCache[key] = make()); }

const ringMat = mat('ring', () => new THREE.MeshStandardMaterial({ color: '#f6d32d', roughness: 0.5 }));
const glassMat = mat('glass', () => new THREE.MeshStandardMaterial({
  color: '#e8f4ff', transparent: true, opacity: 0.16, roughness: 0.1, depthWrite: false, side: THREE.DoubleSide }));
const beddingMat = mat('bedding', () => new THREE.MeshStandardMaterial({ color: '#e6d39a', roughness: 1, flatShading: true }));
const tubeMat = (c) => mat('tube' + c, () => new THREE.MeshStandardMaterial({
  color: c, transparent: true, opacity: 0.6, roughness: 0.25, depthWrite: false, side: THREE.DoubleSide }));
const frameMat = (c) => mat('frame' + c, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));

const ringGeo = new THREE.TorusGeometry(TUBE_R + 0.01, 0.035, 8, 28);

// A yellow connector ring at an opening, facing direction d
function addRing(group, d, x = 0, y = 0) {
  const r = new THREE.Mesh(ringGeo, ringMat);
  r.position.set(x + DIRS[d][0] * HALF, y + DIRS[d][1] * HALF, 0);
  if (d === 1 || d === 3) r.rotation.y = Math.PI / 2; else r.rotation.x = Math.PI / 2;
  group.add(r);
}

// A curve for corner tubes: quarter circle
class Arc extends THREE.Curve {
  constructor(cx, cy, r, a0, a1) { super(); Object.assign(this, { cx, cy, r, a0, a1 }); }
  getPoint(t, target = new THREE.Vector3()) {
    const a = this.a0 + (this.a1 - this.a0) * t;
    return target.set(this.cx + Math.cos(a) * this.r, this.cy + Math.sin(a) * this.r, 0);
  }
}

const straightH = new THREE.CylinderGeometry(TUBE_R, TUBE_R, CELL, 20, 1, true).rotateZ(Math.PI / 2);
const straightV = new THREE.CylinderGeometry(TUBE_R, TUBE_R, CELL, 20, 1, true);
const stubDown = new THREE.CylinderGeometry(TUBE_R, TUBE_R, HALF, 20, 1, true).translate(0, -HALF / 2, 0);
const cornerGeo = new THREE.TubeGeometry(new Arc(HALF, -HALF, HALF, Math.PI / 2, Math.PI), 16, TUBE_R, 20, false);

// Tube piece, centred on its cell. Built "unrotated" then turned clockwise.
function makeTubeMesh(type, colorIdx, rot) {
  const g = new THREE.Group();
  const m = tubeMat(TUBE_COLORS[colorIdx]);
  const add = (geo) => { const mesh = new THREE.Mesh(geo, m); mesh.castShadow = true; g.add(mesh); };
  if (type === 'tube')   add(straightH);
  if (type === 'corner') add(cornerGeo);
  if (type === 'tee')    { add(straightH); add(stubDown); }
  if (type === 'cross')  { add(straightH); add(straightV); }
  for (const d of PIECES[type].open) addRing(g, d);
  g.rotation.z = -rot * Math.PI / 2;   // clockwise quarter turns
  return g;
}

// Sandy bedding with little hills toward the back
function makeBedding(W, D, seed) {
  const geo = new THREE.PlaneGeometry(W - 0.08, D - 0.08, Math.max(8, Math.round(W * 8)), 12);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const back = Math.max(0, -z / (D / 2));                     // 0 at front … 1 at back
    const hills = 0.5 + 0.5 * Math.sin(x * 2.3 + seed) * Math.cos(x * 1.1 + seed * 2);
    p.setY(i, 0.02 + back * back * 0.35 * (0.5 + hills) + Math.random() * 0.015);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, beddingMat);
  mesh.receiveShadow = true;
  return mesh;
}

// Cage: open-front box. Origin = bottom-left corner of its cells (z centred).
function makeCageMesh(type, colorIdx, seed = 1) {
  const { w, h } = PIECES[type];
  const W = w * CELL, H = h * CELL, D = CAGE_DEPTH, t = 0.06;
  const fm = frameMat(CAGE_COLORS[colorIdx]);
  const g = new THREE.Group();
  const box = (sx, sy, sz, x, y, z, m = fm) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = m !== glassMat;
    mesh.receiveShadow = true;
    g.add(mesh);
  };
  box(W, 0.08, D, W / 2, 0.04, 0);                       // floor tray
  box(W, 0.14, t, W / 2, 0.07, D / 2);                   // low front lip
  box(W, H, 0.03, W / 2, H / 2, -D / 2, glassMat);       // back wall
  box(0.03, H, D, 0, H / 2, 0, glassMat);                // left wall
  box(0.03, H, D, W, H / 2, 0, glassMat);                // right wall
  for (const x of [0, W]) for (const z of [-D / 2, D / 2]) box(t, H, t, x, H / 2, z);  // corner posts
  for (const z of [-D / 2, D / 2]) box(W + t, t, t, W / 2, H, z);                       // top bars
  for (const x of [0, W]) box(t, t, D, x, H, 0);
  const bed = makeBedding(W, D, seed);
  bed.position.set(W / 2, 0.08, 0);
  g.add(bed);
  addRing(g, 3, HALF, HALF);                 // tube port, left wall
  addRing(g, 1, W - HALF, HALF);             // tube port, right wall
  return g;
}

// =====================================================================
// 4. LOADING
// =====================================================================
const loadingText = document.createElement('div');
loadingText.textContent = 'Loading… 🐹';
loadingText.style.cssText = `position:fixed; inset:0; display:flex; align-items:center;
  justify-content:center; font:bold 28px sans-serif; color:#a0682f; pointer-events:none;`;
document.body.appendChild(loadingText);

const loader = new GLTFLoader();
const itemTemplates = {};
let hamsterTemplate, hamsterClips;

const pieces = [];        // cages and tubes
const items = [];         // things inside cages
const hamsters = [];
const cells = new Map();  // "x,y" -> piece in that cell
let graph = new Map();    // walkable cells for hamsters
let selected = null;      // hamster shown in the panel
let heldHamster = null;

function prepare(obj) {
  obj.traverse((p) => { if (p.isMesh) { p.castShadow = true; p.receiveShadow = true; } });
  return obj;
}

Promise.all(['hamster', ...Object.keys(ITEMS)].map((name) =>
  loader.loadAsync(`models/${name}.glb`).then((gltf) => [name, gltf])
)).then((list) => {
  const loaded = Object.fromEntries(list);
  for (const type of Object.keys(ITEMS)) itemTemplates[type] = loaded[type].scene;
  hamsterTemplate = loaded.hamster.scene;
  hamsterClips = loaded.hamster.animations;
  buildPalette();
  loadGame();
  frameCamera();
  loadingText.remove();
}).catch((err) => {
  loadingText.textContent = '❌ Could not load models – check the models folder (F12 → Console)';
  console.error(err);
});

// =====================================================================
// 5. PIECES (cages & tubes) on the grid
// =====================================================================
const key = (x, y) => `${x},${y}`;

function cellsOf(type, gx, gy) {
  const def = PIECES[type];
  if (def.kind === 'tube') return [[gx, gy]];
  const out = [];
  for (let i = 0; i < def.w; i++) for (let j = 0; j < def.h; j++) out.push([gx + i, gy + j]);
  return out;
}

function canPlacePiece(type, gx, gy, ignore = null) {
  return cellsOf(type, gx, gy).every(([x, y]) => {
    if (y < 0) return false;
    const other = cells.get(key(x, y));
    return !other || other === ignore;
  });
}

function pieceWorldPos(type, gx, gy) {
  return PIECES[type].kind === 'cage'
    ? new THREE.Vector3(gx * CELL - HALF, gy * CELL, 0)     // bottom-left corner
    : new THREE.Vector3(gx * CELL, gy * CELL + HALF, 0);    // cell centre
}

function makePieceMesh(type, color, rot, seed) {
  return PIECES[type].kind === 'cage' ? makeCageMesh(type, color, seed) : makeTubeMesh(type, color, rot);
}

function addPiece(type, gx, gy, rot = 0, color = 0) {
  const piece = { type, gx, gy, rot, color, seed: Math.random() * 10, obj: null, slots: null };
  if (PIECES[type].kind === 'cage') piece.slots = new Array(PIECES[type].w).fill(null);
  pieces.push(piece);
  drawPiece(piece);
  for (const [x, y] of cellsOf(type, gx, gy)) cells.set(key(x, y), piece);
  return piece;
}

function drawPiece(piece) {
  if (piece.obj) scene.remove(piece.obj);
  piece.obj = makePieceMesh(piece.type, piece.color, piece.rot, piece.seed);
  piece.obj.position.copy(pieceWorldPos(piece.type, piece.gx, piece.gy));
  piece.obj.userData.piece = piece;
  scene.add(piece.obj);
}

function removePiece(piece) {
  if (piece.slots) for (const it of piece.slots) if (it) removeItem(it);
  for (const [x, y] of cellsOf(piece.type, piece.gx, piece.gy)) cells.delete(key(x, y));
  scene.remove(piece.obj);
  pieces.splice(pieces.indexOf(piece), 1);
}

function movePiece(piece, gx, gy, rot, color) {
  for (const [x, y] of cellsOf(piece.type, piece.gx, piece.gy)) cells.delete(key(x, y));
  Object.assign(piece, { gx, gy, rot, color });
  for (const [x, y] of cellsOf(piece.type, gx, gy)) cells.set(key(x, y), piece);
  drawPiece(piece);
  if (piece.slots) piece.slots.forEach((it) => it && positionItem(it));
}

// Which sides of a tube are open after rotating
function openSides(piece) {
  return new Set(PIECES[piece.type].open.map((d) => (d + piece.rot) % 4));
}

// =====================================================================
// 6. ITEMS inside cages
// =====================================================================
function addItem(type, cage, slot) {
  const obj = prepare(itemTemplates[type].clone(true));
  const item = { type, cage, slot, obj, food: 5, water: 1, spin: 0 };
  obj.userData.item = item;
  if (type === 'food_bowl') item.foodPieces = [1, 2, 3, 4, 5].map((i) => obj.getObjectByName('food_' + i));
  if (type === 'water_bottle') item.waterLevel = obj.getObjectByName('water_level');
  if (type === 'wheel') { item.spinNode = obj.getObjectByName('wheel_spin'); obj.rotation.y = Math.PI / 2; }
  cage.slots[slot] = item;
  positionItem(item);
  scene.add(obj);
  items.push(item);
  return item;
}

function positionItem(item) {
  const c = item.cage;
  item.obj.position.set((c.gx + item.slot) * CELL, c.gy * CELL + 0.08, ITEM_Z);
}

function removeItem(item) {
  releaseHamstersFrom(item);
  item.cage.slots[item.slot] = null;
  scene.remove(item.obj);
  items.splice(items.indexOf(item), 1);
}

function moveItem(item, cage, slot) {
  item.cage.slots[item.slot] = null;
  item.cage = cage;
  item.slot = slot;
  cage.slots[slot] = item;
  positionItem(item);
}

// The cage floor cell under a grid cell (or null)
function cageSlotAt(gx, gy) {
  const p = cells.get(key(gx, gy));
  if (!p || PIECES[p.type].kind !== 'cage') return null;
  return { cage: p, slot: gx - p.gx };
}

const itemCell = (it) => key(it.cage.gx + it.slot, it.cage.gy);

function refillFood() { items.forEach((it) => { if (it.type === 'food_bowl') it.food = 5; }); }
function fillWater()  { items.forEach((it) => { if (it.type === 'water_bottle') it.water = 1; }); }

// =====================================================================
// 7. PATHS: which cells connect, and how to get from A to B
// =====================================================================
function rebuildGraph() {
  graph = new Map();
  for (const p of pieces) {
    if (PIECES[p.type].kind === 'cage') {
      for (let i = 0; i < PIECES[p.type].w; i++) {
        const gx = p.gx + i;
        graph.set(key(gx, p.gy), { key: key(gx, p.gy), gx, gy: p.gy, open: new Set([1, 3]), nbrs: [],
          pos: new THREE.Vector3(gx * CELL, p.gy * CELL + FLOOR_Y, HAM_Z) });
      }
    } else {
      graph.set(key(p.gx, p.gy), { key: key(p.gx, p.gy), gx: p.gx, gy: p.gy, open: openSides(p), nbrs: [],
        pos: new THREE.Vector3(p.gx * CELL, p.gy * CELL + TUBE_FLOOR, 0) });
    }
  }
  // Two cells connect when both are open toward each other
  for (const node of graph.values()) {
    for (const d of node.open) {
      const other = graph.get(key(node.gx + DIRS[d][0], node.gy + DIRS[d][1]));
      if (other && other.open.has((d + 2) % 4)) node.nbrs.push(other.key);
    }
  }
  // Hamsters re-plan after the world changes
  for (const h of hamsters) {
    if (h.brain.mood === 'held' || h.brain.mood === 'fall') continue;
    if (!graph.has(h.node)) relocateHamster(h);
    h.path = [];
    h.brain.item = null;
    startResting(h, 0.5);
  }
}

// Breadth-first search: distance and route to every reachable cell
function explore(startKey) {
  const prev = new Map([[startKey, null]]);
  const dist = new Map([[startKey, 0]]);
  const queue = [startKey];
  while (queue.length) {
    const k = queue.shift();
    for (const n of graph.get(k)?.nbrs || []) {
      if (dist.has(n)) continue;
      dist.set(n, dist.get(k) + 1);
      prev.set(n, k);
      queue.push(n);
    }
  }
  return { dist, prev };
}

function routeTo(prev, target) {
  const path = [];
  for (let k = target; k !== null && k !== undefined; k = prev.get(k)) path.unshift(k);
  path.shift();   // drop the cell we're already in
  return path;
}

// =====================================================================
// 8. HAMSTERS
// =====================================================================
function createHamster(look, nodeKey) {
  const obj = prepare(hamsterTemplate.clone(true));
  obj.rotation.order = 'YXZ';   // turn left/right first, then tilt nose up/down
  const mats = {};
  obj.traverse((p) => {
    if (!p.isMesh) return;
    const name = p.material.name;
    if (!mats[name]) mats[name] = p.material.clone();
    p.material = mats[name];
  });
  const h = {
    obj, mats, look: { ...look }, patternGroup: null, node: nodeKey, path: [],
    mixer: new THREE.AnimationMixer(obj), actions: {}, current: null,
    brain: {
      mood: 'rest', timer: Math.random() * 2, item: null, fallSpeed: 0,
      speed: THREE.MathUtils.randFloat(0.55, 0.8),
      hunger: THREE.MathUtils.randFloat(60, 100), thirst: THREE.MathUtils.randFloat(60, 100),
      fun: THREE.MathUtils.randFloat(60, 100)
    }
  };
  for (const clip of hamsterClips) h.actions[clip.name] = h.mixer.clipAction(clip);
  obj.userData.hamster = h;
  const n = graph.get(nodeKey);
  if (n) obj.position.copy(n.pos);
  obj.rotation.y = Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
  applyLook(h);
  playAnim(h, 'idle');
  scene.add(obj);
  hamsters.push(h);
  return h;
}

function applyLook(h) {
  const L = h.look;
  h.mats.fur_main?.color.set(LOOKS.fur[L.fur]);
  h.mats.fur_belly?.color.set(LOOKS.belly[L.belly]);
  h.mats.eyes?.color.set(LOOKS.eyes[L.eyes]);
  buildPattern(h);
}

const patchGeo = new THREE.SphereGeometry(1, 14, 10);
function buildPattern(h) {
  const body = h.obj.getObjectByName('body');
  if (!body) return;
  if (h.patternGroup) body.remove(h.patternGroup);
  const group = new THREE.Group();
  h.patternGroup = group;
  body.add(group);
  const pattern = LOOKS.pattern[h.look.pattern];
  if (pattern === 'Plain') return;
  const m = new THREE.MeshStandardMaterial({ color: LOOKS.patColor[h.look.patColor], roughness: 0.9 });
  const C = new THREE.Vector3(0, 0.216, 0), R = new THREE.Vector3(0.252, 0.204, 0.30);
  const patch = (scale, pos, normal) => {
    const mesh = new THREE.Mesh(patchGeo, m);
    mesh.scale.copy(scale);
    mesh.position.copy(pos);
    if (normal) mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    group.add(mesh);
  };
  if (pattern === 'Spots') {
    for (const d of [[0.45, 0.8, -0.35], [-0.5, 0.75, -0.1], [0.1, 0.95, -0.6], [-0.2, 0.9, 0.25], [0.55, 0.6, 0.15]]) {
      const u = new THREE.Vector3(...d).normalize();
      patch(new THREE.Vector3(0.07, 0.025, 0.07), C.clone().add(u.clone().multiply(R)), u.clone().divide(R).normalize());
    }
  }
  if (pattern === 'Band') patch(new THREE.Vector3(R.x * 1.04, R.y * 1.04, 0.07), new THREE.Vector3(0, C.y, -0.07));
  if (pattern === 'Saddle') patch(new THREE.Vector3(0.24, 0.186, 0.29), new THREE.Vector3(0, 0.25, -0.03));
}

function playAnim(h, name, speed = 1) {
  const next = h.actions[name];
  if (!next) return;
  next.timeScale = speed;
  if (next === h.current) return;
  next.reset().play();
  if (h.current) h.current.crossFadeTo(next, 0.2, false);
  h.current = next;
}

// Nearest walkable cell to a point (used when dropping a hamster or after deleting its tube)
function nearestNode(pos, maxDist = Infinity) {
  let best = null, bd = maxDist;
  for (const n of graph.values()) {
    const d = Math.hypot(n.pos.x - pos.x, n.pos.y - pos.y);
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

function relocateHamster(h) {
  const n = nearestNode(h.obj.position);
  h.node = n ? n.key : null;
  if (n) h.obj.position.copy(n.pos);
}

function randomCageCell() {
  const floors = [...graph.values()].filter((n) => cells.get(n.key) && PIECES[cells.get(n.key).type].kind === 'cage');
  const list = floors.length ? floors : [...graph.values()];
  return list.length ? list[Math.floor(Math.random() * list.length)].key : null;
}

function removeHamster(h) {
  if (heldHamster === h) heldHamster = null;
  scene.remove(h.obj);
  hamsters.splice(hamsters.indexOf(h), 1);
  if (selected === h) selected = hamsters[0] || null;
}

function randomLook() {
  const pick = (arr) => Math.floor(Math.random() * arr.length);
  const used = hamsters.map((h) => h.look.name);
  const free = NAMES.map((_, i) => i).filter((i) => !used.includes(i));
  return { fur: pick(LOOKS.fur), belly: pick(LOOKS.belly), pattern: pick(LOOKS.pattern),
           patColor: pick(LOOKS.patColor), eyes: Math.random() < 0.8 ? 0 : 1,
           name: free.length ? free[Math.floor(Math.random() * free.length)] : pick(NAMES) };
}

function addHamster() {
  if (hamsters.length >= MAX_HAMSTERS) { showToast(`Max ${MAX_HAMSTERS} hamsters!`); return; }
  const cell = randomCageCell();
  if (!cell) { showToast('Build a cage first! 🏠'); return; }
  selected = createHamster(randomLook(), cell);
  saveGame();
  refreshHamsterUI();
  showToast(`Say hi to ${NAMES[selected.look.name]}! 🐹`);
}

// =====================================================================
// 9. HAMSTER BRAIN
// =====================================================================
const DRAIN = { hunger: 2, thirst: 2.5, fun: 3 };   // per second (fast so you can test)
const LOW = 40;
const BUSY = ['goEat', 'eat', 'goDrink', 'drink', 'goWheel', 'run'];

function takenByOther(item, h) {
  return hamsters.some((o) => o !== h && o.brain.item === item && BUSY.includes(o.brain.mood));
}

// Closest reachable, free item of a type
function findItem(h, type, test, reach) {
  let best = null, bd = Infinity;
  for (const it of items) {
    if (it.type !== type || !test(it) || takenByOther(it, h)) continue;
    const d = reach.dist.get(itemCell(it));
    if (d !== undefined && d < bd) { bd = d; best = it; }
  }
  return best;
}

function decideWhatToDo(h) {
  const b = h.brain;
  if (!h.node || !graph.has(h.node)) return 'rest';
  const reach = explore(h.node);
  const wants = [
    [b.thirst < LOW, 'water_bottle', (i) => i.water > 0.01, 'goDrink'],
    [b.hunger < LOW, 'food_bowl', (i) => i.food > 0, 'goEat'],
    [b.fun < LOW, 'wheel', () => true, 'goWheel']
  ];
  for (const [need, type, test, mood] of wants) {
    if (!need) continue;
    const it = findItem(h, type, test, reach);
    if (it) { b.item = it; h.path = routeTo(reach.prev, itemCell(it)); return mood; }
  }
  // Otherwise wander to a random cell we can reach (not too far)
  b.item = null;
  const options = [...reach.dist].filter(([, d]) => d > 0 && d < 10).map(([k]) => k);
  if (!options.length) return 'rest';
  h.path = routeTo(reach.prev, options[Math.floor(Math.random() * options.length)]);
  return 'walk';
}

function releaseHamstersFrom(item) {
  for (const h of hamsters) {
    if (h.brain.item !== item) continue;
    h.brain.item = null;
    if (BUSY.includes(h.brain.mood)) { h.path = []; startResting(h, 0.5); }
  }
}

function startResting(h, seconds) {
  h.brain.mood = 'rest';
  h.brain.timer = seconds;
}

function turnToward(current, target, amount) {
  let diff = target - current;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  return current + diff * amount;
}

// Follow the path one cell at a time. Returns true when the path is finished.
function followPath(h, dt) {
  if (!h.path.length) return true;
  const next = graph.get(h.path[0]);
  if (!next) { h.path = []; return true; }
  const o = h.obj;
  const to = next.pos.clone().sub(o.position);
  const dist = to.length();
  const step = h.brain.speed * dt;
  playAnim(h, 'walk', 1.4);

  // Face the way we're going: sideways in cages, nose up/down when climbing
  if (Math.abs(to.x) > 0.01) o.rotation.y = turnToward(o.rotation.y, to.x > 0 ? Math.PI / 2 : -Math.PI / 2, 0.2);
  const climb = Math.abs(to.y) > Math.abs(to.x) + 0.01 ? (to.y > 0 ? -1.2 : 1.2) : 0;
  o.rotation.x = THREE.MathUtils.lerp(o.rotation.x, climb, 0.2);

  if (dist <= step) {
    o.position.copy(next.pos);
    h.node = h.path.shift();
  } else {
    o.position.addScaledVector(to, step / dist);
  }
  return false;
}

// Where a hamster stands to use an item
function useSpot(item) {
  const c = item.cage;
  const x = (c.gx + item.slot) * CELL, y = c.gy * CELL + 0.08;
  if (item.type === 'wheel') return new THREE.Vector3(x, y + 0.09, ITEM_Z);
  return new THREE.Vector3(x, y + 0.02, ITEM_Z + 0.4);
}

function updateHamster(h, dt, time) {
  const b = h.brain, o = h.obj, it = b.item;
  const busy = b.mood === 'run' ? 2 : 1;
  b.hunger = Math.max(0, b.hunger - DRAIN.hunger * busy * dt);
  b.thirst = Math.max(0, b.thirst - DRAIN.thirst * busy * dt);
  if (b.mood !== 'run') b.fun = Math.max(0, b.fun - DRAIN.fun * dt);
  const alive = (x) => x && items.includes(x);

  switch (b.mood) {
    case 'rest': {
      playAnim(h, 'idle');
      const n = graph.get(h.node);
      if (n) o.position.lerp(n.pos, 0.15);           // settle back onto the path
      o.rotation.x = THREE.MathUtils.lerp(o.rotation.x, 0, 0.2);
      o.rotation.z = 0;
      o.scale.set(1, 1, 1);
      b.timer -= dt;
      if (b.timer <= 0) { b.mood = decideWhatToDo(h); if (b.mood === 'rest') b.timer = 1; }
      break;
    }
    case 'walk':
      if (followPath(h, dt)) startResting(h, THREE.MathUtils.randFloat(1, 3));
      break;

    case 'goEat': case 'goDrink': case 'goWheel':
      if (!alive(it)) { startResting(h, 0.5); break; }
      if (followPath(h, dt)) {
        b.mood = { goEat: 'eat', goDrink: 'drink', goWheel: 'run' }[b.mood];
        b.timer = b.mood === 'run' ? THREE.MathUtils.randFloat(5, 8) : 1;
      }
      break;

    case 'eat': case 'drink': {
      if (!alive(it)) { startResting(h, 0.5); break; }
      o.position.lerp(useSpot(it), 0.15);
      o.rotation.y = turnToward(o.rotation.y, Math.PI, 0.15);   // face the back of the cage
      o.rotation.x = 0;
      playAnim(h, 'eat', b.mood === 'drink' ? 0.6 : 1);
      b.timer -= dt;
      if (b.timer <= 0) {
        b.timer = 1;
        if (b.mood === 'eat') {
          if (it.food > 0) { it.food--; b.hunger = Math.min(100, b.hunger + 20); }
          if (b.hunger >= 100 || it.food === 0) { b.item = null; startResting(h, 1.5); }
        } else {
          it.water = Math.max(0, it.water - 0.1);
          b.thirst = Math.min(100, b.thirst + 15);
          if (b.thirst >= 100 || it.water <= 0.01) { b.item = null; startResting(h, 1.5); }
        }
      }
      break;
    }
    case 'run':
      if (!alive(it)) { startResting(h, 0.5); break; }
      o.position.lerp(useSpot(it), 0.2);
      o.rotation.set(0, Math.PI / 2, 0);
      playAnim(h, 'walk', 3);
      it.spin = THREE.MathUtils.lerp(it.spin, 9, 0.05);
      b.fun = Math.min(100, b.fun + 15 * dt);
      b.timer -= dt;
      if (b.timer <= 0 || b.fun >= 100 || b.hunger < LOW || b.thirst < LOW) { b.item = null; startResting(h, 1); }
      break;

    case 'held':
      playAnim(h, 'walk', 4);
      o.position.lerp(dragPoint, 0.3);
      o.rotation.z = Math.sin(time * 30) * 0.12;
      o.rotation.x = -0.2;
      break;

    case 'fall': {
      const n = graph.get(h.node);
      const floor = n ? n.pos.y : 0;
      b.fallSpeed -= 9.8 * dt;
      o.position.y += b.fallSpeed * dt;
      o.rotation.z *= 0.9;
      if (o.position.y <= floor) {
        o.position.y = floor;
        if (b.fallSpeed < -1) { b.fallSpeed = -b.fallSpeed * 0.3; o.scale.set(1.1, 0.8, 1.1); }
        else startResting(h, 1);
      } else {
        o.scale.lerp(new THREE.Vector3(1, 1, 1), 0.2);
      }
      break;
    }
  }
  h.mixer.update(dt);
}

function updateItems(dt) {
  for (const it of items) {
    if (it.type === 'wheel') {
      const running = hamsters.some((h) => h.brain.mood === 'run' && h.brain.item === it);
      if (!running) it.spin *= Math.pow(0.4, dt);
      it.spinNode.rotation.x += it.spin * dt;
    }
    if (it.type === 'food_bowl') it.foodPieces.forEach((p, i) => { if (p) p.visible = i < it.food; });
    if (it.type === 'water_bottle' && it.waterLevel) {
      it.waterLevel.scale.y = Math.max(it.water, 0.001);
      it.waterLevel.visible = it.water > 0.01;
    }
  }
}

// Ring under the selected hamster
const selectRing = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.34, 32),
  new THREE.MeshBasicMaterial({ color: '#8e7dbe', transparent: true, opacity: 0.85, depthTest: false }));
selectRing.rotation.x = -Math.PI / 2;
selectRing.renderOrder = 5;
scene.add(selectRing);

// =====================================================================
// 10. SAVE & SHARE
// Layout code: s0.0.0.0_i3.0.1.2_b1.0
//   pieces: letter gx.gy.rotation.colour   items: letter gx.gy (a cage floor cell)
// =====================================================================
const SAVE_KEY = 'hammy-save-v3';
const PIECE_BY_CODE = Object.fromEntries(Object.entries(PIECES).map(([t, d]) => [d.code, t]));
const ITEM_BY_CODE = Object.fromEntries(Object.entries(ITEMS).map(([t, d]) => [d.code, t]));

function encodeLayout() {
  const p = pieces.map((x) => `${PIECES[x.type].code}${x.gx}.${x.gy}.${x.rot}.${x.color}`);
  const i = items.map((x) => `${ITEMS[x.type].code}${x.cage.gx + x.slot}.${x.cage.gy}`);
  return [...p, ...i].join('_');
}

function decodeLayout(code) {
  const out = { pieces: [], items: [] };
  for (const part of (code || '').split('_')) {
    const nums = part.slice(1).split('.').map(Number);
    if (!nums.every(Number.isInteger)) continue;
    if (PIECE_BY_CODE[part[0]] && nums.length === 4) {
      out.pieces.push({ type: PIECE_BY_CODE[part[0]], gx: nums[0], gy: Math.max(0, nums[1]),
        rot: ((nums[2] % 4) + 4) % 4, color: nums[3] });
    } else if (ITEM_BY_CODE[part[0]] && nums.length === 2) {
      out.items.push({ type: ITEM_BY_CODE[part[0]], gx: nums[0], gy: nums[1] });
    }
  }
  return out;
}

function encodeHamsters() {
  return hamsters.map(({ look: L }) =>
    `${L.fur}${L.belly}${L.pattern}${L.patColor}${L.eyes}${String(L.name).padStart(2, '0')}`).join('-');
}

function decodeHamsters(code) {
  const list = [];
  for (const part of (code || '').split('-')) {
    if (!/^\d{7}$/.test(part) || list.length >= MAX_HAMSTERS) continue;
    const n = part.split('').map(Number);
    list.push({
      fur: Math.min(n[0], LOOKS.fur.length - 1), belly: Math.min(n[1], LOOKS.belly.length - 1),
      pattern: Math.min(n[2], LOOKS.pattern.length - 1), patColor: Math.min(n[3], LOOKS.patColor.length - 1),
      eyes: Math.min(n[4], LOOKS.eyes.length - 1), name: Math.min(n[5] * 10 + n[6], NAMES.length - 1)
    });
  }
  return list;
}

function buildGame(layoutCode, hamsterCode) {
  while (hamsters.length) removeHamster(hamsters[0]);
  while (items.length) removeItem(items[0]);
  while (pieces.length) removePiece(pieces[0]);
  const L = decodeLayout(layoutCode);
  for (const p of L.pieces) {
    const color = Math.min(p.color, (PIECES[p.type].kind === 'cage' ? CAGE_COLORS : TUBE_COLORS).length - 1);
    if (canPlacePiece(p.type, p.gx, p.gy)) addPiece(p.type, p.gx, p.gy, p.rot, color);
  }
  for (const it of L.items) {
    const s = cageSlotAt(it.gx, it.gy);
    if (s && !s.cage.slots[s.slot]) addItem(it.type, s.cage, s.slot);
  }
  rebuildGraph();
  let looks = decodeHamsters(hamsterCode);
  if (!looks.length) looks = decodeHamsters(DEFAULT_HAMSTERS);
  for (const look of looks) { const cell = randomCageCell(); if (cell) createHamster(look, cell); }
  selected = hamsters[0] || null;
  refreshHamsterUI();
}

function saveGame() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ layout: encodeLayout(), ham: encodeHamsters() })); }
  catch (e) { /* storage not available */ }
}

function loadGame() {
  const params = new URLSearchParams(location.search);
  if (params.has('home')) {
    buildGame(params.get('home'), params.get('ham') ?? DEFAULT_HAMSTERS);
    history.replaceState(null, '', location.pathname);
    saveGame();
    showToast('Loaded a shared home! 🐹');
    return;
  }
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { /* nothing saved */ }
  if (saved && saved.layout) buildGame(saved.layout, saved.ham);
  else buildGame(DEFAULT_LAYOUT, DEFAULT_HAMSTERS);
}

async function shareHome() {
  const url = `${location.origin}${location.pathname}?home=${encodeLayout()}&ham=${encodeHamsters()}`;
  try {
    await navigator.clipboard.writeText(url);
    showToast('🔗 Link copied! Paste it anywhere to share your hamster home.');
  } catch (e) {
    showToast(`Copy this link:<br><input value="${url}" style="width:340px; margin-top:6px;"
               onclick="this.select()" readonly>`, 8000);
  }
}

function confirmClick(button, label, action) {
  if (button.dataset.armed === '1') { button.dataset.armed = '0'; button.textContent = label; action(); return; }
  button.dataset.armed = '1';
  button.textContent = 'Sure? Click again';
  setTimeout(() => { button.dataset.armed = '0'; button.textContent = label; }, 3000);
}

function newHome() {
  cancelTool();
  buildGame(DEFAULT_LAYOUT, DEFAULT_HAMSTERS);
  saveGame();
  frameCamera();
  showToast('Fresh home! ✨');
}

const toast = document.createElement('div');
toast.style.cssText = `position:fixed; top:16px; left:50%; transform:translateX(-50%); background:#333;
  color:white; padding:10px 16px; border-radius:10px; font:14px sans-serif; display:none; z-index:10; text-align:center;`;
document.body.appendChild(toast);
let toastTimer;
function showToast(html, ms = 2500) {
  toast.innerHTML = html;
  toast.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.style.display = 'none'), ms);
}

// =====================================================================
// 11. BUILD MODE
// =====================================================================
let mode = 'care';
let tool = null;   // { kind:'new'|'move', what:'piece'|'item', type, rot, color, ghost, target? }
const wallPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const wallPoint = new THREE.Vector3();

function ghostify(obj) {
  obj.traverse((p) => {
    if (!p.isMesh) return;
    p.material = p.material.clone();
    p.material.transparent = true;
    p.material.opacity = Math.min(p.material.opacity, 1) * 0.55;
    p.material.depthWrite = false;
    p.castShadow = false;
  });
  return obj;
}

function makeGhost() {
  if (tool.ghost) scene.remove(tool.ghost);
  tool.ghost = tool.what === 'piece'
    ? ghostify(makePieceMesh(tool.type, tool.color, tool.rot, 1))
    : ghostify(itemTemplates[tool.type].clone(true));
  if (tool.what === 'item' && tool.type === 'wheel') tool.ghost.rotation.y = Math.PI / 2;
  tool.ghost.visible = false;
  scene.add(tool.ghost);
}

function tintGhost(ok) {
  tool.ghost.traverse((p) => { if (p.isMesh && p.material.emissive) p.material.emissive.set(ok ? 0x000000 : 0xcc0000); });
}

function startNew(what, type) {
  cancelTool();
  tool = { kind: 'new', what, type, rot: 0, color: what === 'piece' && PIECES[type].kind === 'tube' ? 0 : 0 };
  makeGhost();
  updateBuildUI();
}

function startMove(what, thing) {
  cancelTool();
  if (what === 'item') releaseHamstersFrom(thing);
  tool = { kind: 'move', what, type: thing.type, target: thing,
           rot: thing.rot || 0, color: thing.color || 0 };
  thing.obj.visible = false;
  makeGhost();
  updateBuildUI();
}

function cancelTool() {
  if (!tool) return;
  scene.remove(tool.ghost);
  if (tool.kind === 'move') tool.target.obj.visible = true;
  tool = null;
  updateBuildUI();
}

function rotateTool() {
  if (!tool || tool.what !== 'piece' || PIECES[tool.type].kind !== 'tube') return;
  tool.rot = (tool.rot + 1) % 4;
  makeGhost();
  updateGhost();
}

function paintTool() {
  if (!tool || tool.what !== 'piece') return;
  const list = PIECES[tool.type].kind === 'cage' ? CAGE_COLORS : TUBE_COLORS;
  tool.color = (tool.color + 1) % list.length;
  makeGhost();
  updateGhost();
}

function deleteTool() {
  if (!tool || tool.kind !== 'move') return;
  const thing = tool.target, what = tool.what;
  scene.remove(tool.ghost);
  tool = null;
  if (what === 'piece') removePiece(thing); else removeItem(thing);
  rebuildGraph();
  saveGame();
  updateBuildUI();
}

// Snap the ghost to the grid under the mouse
function updateGhost() {
  if (!tool || !raycaster.ray.intersectPlane(wallPlane, wallPoint)) return;
  const g = tool.ghost;
  if (tool.what === 'piece') {
    const def = PIECES[tool.type];
    let gx, gy;
    if (def.kind === 'cage') {
      gx = Math.round(wallPoint.x / CELL - (def.w - 1) / 2);
      gy = Math.max(0, Math.round(wallPoint.y / CELL - def.h / 2));
    } else {
      gx = Math.round(wallPoint.x / CELL);
      gy = Math.max(0, Math.floor(wallPoint.y / CELL));
    }
    tool.gx = gx; tool.gy = gy;
    g.position.copy(pieceWorldPos(tool.type, gx, gy));
    tool.ok = canPlacePiece(tool.type, gx, gy, tool.kind === 'move' ? tool.target : null);
  } else {
    const gx = Math.round(wallPoint.x / CELL), gy = Math.floor(wallPoint.y / CELL);
    const s = cageSlotAt(gx, gy);
    if (s) {
      tool.slot = s;
      g.position.set((s.cage.gx + s.slot) * CELL, s.cage.gy * CELL + 0.08, ITEM_Z);
      const there = s.cage.slots[s.slot];
      tool.ok = !there || there === tool.target;
    } else {
      tool.slot = null;
      g.position.set(gx * CELL, gy * CELL + 0.08, ITEM_Z);
      tool.ok = false;
    }
  }
  g.visible = true;
  tintGhost(tool.ok);
}

function buildClick() {
  if (!tool) {
    // pick something up: items first (they're inside cages), then pieces
    const it = thingUnderMouse('item');
    if (it) return startMove('item', it);
    const p = thingUnderMouse('piece');
    if (p) startMove('piece', p);
    return;
  }
  if (!tool.ok || !tool.ghost.visible) return;
  if (tool.what === 'piece') {
    if (tool.kind === 'new') addPiece(tool.type, tool.gx, tool.gy, tool.rot, tool.color);
    else { movePiece(tool.target, tool.gx, tool.gy, tool.rot, tool.color); cancelTool(); }
  } else {
    if (tool.kind === 'new') addItem(tool.type, tool.slot.cage, tool.slot.slot);
    else { moveItem(tool.target, tool.slot.cage, tool.slot.slot); cancelTool(); }
  }
  rebuildGraph();
  saveGame();
}

function setMode(m) {
  mode = m;
  cancelTool();
  grid.visible = mode === 'build';
  document.getElementById('careBtn').style.opacity = mode === 'care' ? 1 : 0.45;
  document.getElementById('buildBtn').style.opacity = mode === 'build' ? 1 : 0.45;
  document.getElementById('careTools').style.display = mode === 'care' ? 'block' : 'none';
  buildBar.style.display = mode === 'build' ? 'flex' : 'none';
  if (mode === 'build') closeCustomize();
}

// =====================================================================
// 12. UI
// =====================================================================
const panelStyle = `background:white; border-radius:14px; font-family:sans-serif; user-select:none;
  box-shadow:0 4px 14px rgba(0,0,0,0.12);`;
const btn = (id, text, color, extra = '') => `<button id="${id}" style="padding:8px; border:none;
  border-radius:8px; background:${color}; color:white; font-weight:bold; cursor:pointer; ${extra}">${text}</button>`;
const bar = (label, id) => `<div style="font-size:13px; margin-bottom:3px;">${label}</div>
  <div style="background:#eee; border-radius:8px; height:12px; overflow:hidden; margin-bottom:7px;">
  <div id="${id}" style="height:100%; width:100%;"></div></div>`;

const ui = document.createElement('div');
ui.style.cssText = `position:fixed; top:16px; left:16px; padding:14px 16px; width:240px; ${panelStyle}`;
ui.innerHTML = `
  <div style="display:flex; gap:6px; margin-bottom:12px;">
    ${btn('careBtn', '🐹 Care', '#6cc070', 'flex:1;')}
    ${btn('buildBtn', '🛠️ Build', '#8e7dbe', 'flex:1; opacity:0.45;')}
  </div>
  <div id="careTools">
    <div style="font-size:12px; color:#666; margin-bottom:4px;">Hamsters (<span id="hamCount">0</span>/${MAX_HAMSTERS})</div>
    <div id="hamList" style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:10px;"></div>
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
      <span><b id="hamName"></b> <span id="moodIcon"></span></span>
      ${btn('customBtn', '🎨 Customize', '#e07a5f', 'font-size:12px; padding:5px 8px;')}
    </div>
    ${bar('🍽️ Hunger', 'hungerFill')}${bar('💧 Thirst', 'thirstFill')}${bar('🎉 Fun', 'funFill')}
    <div id="stockText" style="font-size:12px; color:#666;"></div>
    ${btn('feedBtn', '🥣 Refill food', '#f4a261', 'width:100%; margin-top:8px;')}
    ${btn('waterBtn', '💧 Fill water', '#4ea8de', 'width:100%; margin-top:6px;')}
  </div>
  <div style="display:flex; gap:6px; margin-top:10px;">
    ${btn('shareBtn', '🔗 Share', '#2a9d8f', 'flex:1; font-size:12px;')}
    ${btn('resetBtn', '🧹 New home', '#999', 'flex:1; font-size:12px;')}
  </div>
  <div style="font-size:11px; color:#999; margin-top:8px;">Drag to look around · scroll to zoom</div>`;
document.body.appendChild(ui);
document.getElementById('feedBtn').onclick = refillFood;
document.getElementById('waterBtn').onclick = fillWater;
document.getElementById('careBtn').onclick = () => setMode('care');
document.getElementById('buildBtn').onclick = () => setMode('build');
document.getElementById('shareBtn').onclick = shareHome;
document.getElementById('resetBtn').onclick = (e) => confirmClick(e.currentTarget, '🧹 New home', newHome);
document.getElementById('customBtn').onclick = () =>
  (customPanel.style.display === 'block' ? closeCustomize() : openCustomize());

// Zoom buttons (right side)
const zoomBox = document.createElement('div');
zoomBox.style.cssText = 'position:fixed; right:16px; top:50%; transform:translateY(-50%); display:flex; flex-direction:column; gap:8px;';
zoomBox.innerHTML = `${btn('zoomIn', '+', '#8e7dbe', 'width:44px; height:44px; font-size:22px;')}
  ${btn('zoomOut', '−', '#8e7dbe', 'width:44px; height:44px; font-size:22px;')}
  ${btn('zoomFit', '⤢', '#8e7dbe', 'width:44px; height:44px; font-size:18px;')}`;
document.body.appendChild(zoomBox);
const zoom = (f) => {
  const offset = camera.position.clone().sub(controls.target).multiplyScalar(f);
  if (offset.length() > 3 && offset.length() < 60) camera.position.copy(controls.target).add(offset);
};
document.getElementById('zoomIn').onclick = () => zoom(0.8);
document.getElementById('zoomOut').onclick = () => zoom(1.25);
document.getElementById('zoomFit').onclick = () => frameCamera();

function refreshHamsterUI() {
  const list = document.getElementById('hamList');
  list.innerHTML = '';
  for (const h of hamsters) {
    const chip = document.createElement('button');
    chip.textContent = NAMES[h.look.name];
    const on = h === selected;
    chip.style.cssText = `padding:3px 8px; border-radius:12px; font-size:12px; cursor:pointer;
      border:2px solid ${on ? '#8e7dbe' : '#ddd'}; background:${on ? '#efeaff' : 'white'};
      border-left:8px solid ${LOOKS.fur[h.look.fur]};`;
    chip.onclick = () => { selected = h; refreshHamsterUI(); };
    list.appendChild(chip);
  }
  if (hamsters.length < MAX_HAMSTERS) {
    const add = document.createElement('button');
    add.textContent = '+ Add';
    add.style.cssText = `padding:3px 8px; border-radius:12px; font-size:12px; cursor:pointer;
      border:2px dashed #6cc070; background:white; color:#3c8d40; font-weight:bold;`;
    add.onclick = addHamster;
    list.appendChild(add);
  }
  document.getElementById('hamCount').textContent = hamsters.length;
  document.getElementById('hamName').textContent = selected ? NAMES[selected.look.name] : 'No hamsters';
  if (customPanel.style.display === 'block') openCustomize();
}

const customPanel = document.createElement('div');
customPanel.style.cssText = `position:fixed; top:16px; right:76px; padding:14px 16px; width:250px; display:none; ${panelStyle}`;
document.body.appendChild(customPanel);

function swatchRow(title, k, colors) {
  const cur = selected.look[k];
  return `<div style="font-size:12px; color:#666; margin:8px 0 4px;">${title}</div>
    <div style="display:flex; flex-wrap:wrap; gap:6px;">${colors.map((c, i) => `
      <button data-key="${k}" data-val="${i}" style="width:26px; height:26px; border-radius:50%; cursor:pointer;
        background:${c}; border:3px solid ${i === cur ? '#8e7dbe' : '#ddd'};"></button>`).join('')}</div>`;
}

function openCustomize() {
  if (!selected) return;
  const L = selected.look;
  customPanel.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <b>🎨 ${NAMES[L.name]}</b>
      <button id="closeCustom" style="border:none; background:none; font-size:18px; cursor:pointer;">✕</button>
    </div>
    ${swatchRow('Fur colour', 'fur', LOOKS.fur)}
    ${swatchRow('Belly colour', 'belly', LOOKS.belly)}
    <div style="font-size:12px; color:#666; margin:8px 0 4px;">Pattern</div>
    <div style="display:flex; flex-wrap:wrap; gap:4px;">${LOOKS.pattern.map((p, i) => `
      <button data-key="pattern" data-val="${i}" style="padding:4px 8px; border-radius:8px; cursor:pointer; font-size:12px;
        background:${i === L.pattern ? '#efeaff' : 'white'}; border:2px solid ${i === L.pattern ? '#8e7dbe' : '#ddd'};">${p}</button>`).join('')}
    </div>
    ${L.pattern !== 0 ? swatchRow('Pattern colour', 'patColor', LOOKS.patColor) : ''}
    ${swatchRow('Eyes', 'eyes', LOOKS.eyes)}
    <div style="display:flex; gap:6px; margin-top:12px;">
      ${btn('randomBtn', '🎲 Random', '#8e7dbe', 'flex:1; font-size:12px;')}
      ${btn('renameBtn', '🔤 New name', '#2a9d8f', 'flex:1; font-size:12px;')}
    </div>
    ${hamsters.length > 1 ? btn('removeHamBtn', '👋 Remove hamster', '#e5604f', 'width:100%; margin-top:6px; font-size:12px;') : ''}`;
  customPanel.style.display = 'block';
  customPanel.querySelectorAll('button[data-key]').forEach((b) => {
    b.onclick = () => { selected.look[b.dataset.key] = Number(b.dataset.val); applyLook(selected); saveGame(); refreshHamsterUI(); };
  });
  document.getElementById('closeCustom').onclick = closeCustomize;
  document.getElementById('randomBtn').onclick = () => {
    selected.look = { ...randomLook(), name: selected.look.name };
    applyLook(selected); saveGame(); refreshHamsterUI();
  };
  document.getElementById('renameBtn').onclick = () => {
    const used = hamsters.map((h) => h.look.name);
    const free = NAMES.map((_, i) => i).filter((i) => !used.includes(i));
    if (free.length) selected.look.name = free[Math.floor(Math.random() * free.length)];
    saveGame(); refreshHamsterUI();
  };
  const rm = document.getElementById('removeHamBtn');
  if (rm) rm.onclick = (e) => confirmClick(e.currentTarget, '👋 Remove hamster', () => {
    const name = NAMES[selected.look.name];
    removeHamster(selected); saveGame(); refreshHamsterUI(); showToast(`Bye ${name}! 👋`);
  });
}
function closeCustomize() { customPanel.style.display = 'none'; }

// Build bar (bottom)
const buildBar = document.createElement('div');
buildBar.style.cssText = `position:fixed; bottom:16px; left:50%; transform:translateX(-50%); display:none;
  flex-direction:column; align-items:center; gap:8px; padding:12px 14px; ${panelStyle}`;
buildBar.innerHTML = `
  <div id="palette" style="display:flex; gap:5px; flex-wrap:wrap; justify-content:center; max-width:820px;"></div>
  <div style="display:flex; gap:6px; align-items:center;">
    ${btn('rotateBtn', '🔄 Rotate (R)', '#8e7dbe')}
    ${btn('paintBtn', '🖌️ Paint (P)', '#e07a5f')}
    ${btn('deleteBtn', '🗑️ Delete', '#e5604f')}
    ${btn('doneBtn', '✋ Stop (Esc)', '#999')}
    <span id="buildHint" style="font-size:12px; color:#666; margin-left:6px; min-width:220px;"></span>
  </div>`;
document.body.appendChild(buildBar);
document.getElementById('rotateBtn').onclick = rotateTool;
document.getElementById('paintBtn').onclick = paintTool;
document.getElementById('deleteBtn').onclick = deleteTool;
document.getElementById('doneBtn').onclick = cancelTool;

function buildPalette() {
  const pal = document.getElementById('palette');
  const addBtn = (what, type, info) => {
    const b = document.createElement('button');
    b.dataset.what = what;
    b.dataset.type = type;
    b.innerHTML = `<div style="font-size:22px; line-height:26px;">${info.icon}</div><div style="font-size:11px;">${info.label}</div>`;
    b.style.cssText = 'width:76px; padding:6px 2px; border:2px solid #eee; border-radius:10px; background:#fafafa; cursor:pointer;';
    b.onclick = () => startNew(what, type);
    pal.appendChild(b);
  };
  for (const [t, d] of Object.entries(PIECES)) addBtn('piece', t, d);
  for (const [t, d] of Object.entries(ITEMS)) addBtn('item', t, d);
}

function updateBuildUI() {
  document.querySelectorAll('#palette button').forEach((b) => {
    const on = tool && tool.kind === 'new' && tool.type === b.dataset.type;
    b.style.borderColor = on ? '#8e7dbe' : '#eee';
    b.style.background = on ? '#efeaff' : '#fafafa';
  });
  const hint = document.getElementById('buildHint');
  if (!hint) return;
  const isTube = tool && tool.what === 'piece' && PIECES[tool.type].kind === 'tube';
  hint.textContent = !tool ? 'Pick a piece, or click one to move it'
    : tool.what === 'item' ? 'Put it inside a cage'
    : tool.kind === 'new' ? 'Click to place · tubes join at the yellow rings' : 'Click to drop it here';
  document.getElementById('rotateBtn').style.opacity = isTube ? 1 : 0.4;
  document.getElementById('paintBtn').style.opacity = tool && tool.what === 'piece' ? 1 : 0.4;
  document.getElementById('deleteBtn').style.opacity = tool && tool.kind === 'move' ? 1 : 0.4;
}
updateBuildUI();

const MOOD_ICONS = { rest: '😌', walk: '🐾', goEat: '🤤', eat: '😋', goDrink: '🥤', drink: '💧',
  goWheel: '🤩', run: '🏃', held: '😲', fall: '😵' };
const colorFor = (v) => v > 60 ? '#6cc070' : v > 30 ? '#f2b84b' : '#e5604f';
function setBar(id, v) { const el = document.getElementById(id); el.style.width = v + '%'; el.style.background = colorFor(v); }

function updateUI(time) {
  selectRing.visible = !!selected && mode === 'care' && selected.brain.mood !== 'held';
  if (selected) {
    selectRing.position.set(selected.obj.position.x, selected.obj.position.y + 0.01, selected.obj.position.z);
    selectRing.scale.setScalar(1 + Math.sin(time * 4) * 0.05);
    const b = selected.brain;
    setBar('hungerFill', b.hunger); setBar('thirstFill', b.thirst); setBar('funFill', b.fun);
    const sad = b.mood === 'rest' && (b.hunger < LOW || b.thirst < LOW) && b.timer > 0.5;
    document.getElementById('moodIcon').textContent = sad ? '😢' : MOOD_ICONS[b.mood];
  }
  const bowls = items.filter((i) => i.type === 'food_bowl'), bottles = items.filter((i) => i.type === 'water_bottle');
  const water = bottles.length ? bottles.reduce((s, x) => s + x.water, 0) / bottles.length : 0;
  document.getElementById('stockText').textContent =
    (bowls.length ? `Food: ${bowls.reduce((s, x) => s + x.food, 0)}` : 'No food bowl!') + '  •  ' +
    (bottles.length ? `Water: ${Math.round(water * 100)}%` : 'No water bottle!');
}

// =====================================================================
// 13. MOUSE & KEYBOARD
// =====================================================================
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.3);
const dragPoint = new THREE.Vector3();
const canvas = renderer.domElement;
const downAt = new THREE.Vector2();

function updateMouse(e) {
  mouse.x = (e.clientX / innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
}

function thingUnderMouse(what) {
  const list = what === 'item' ? items : what === 'piece' ? pieces : hamsters;
  const tag = what === 'item' ? 'item' : what === 'piece' ? 'piece' : 'hamster';
  const hits = raycaster.intersectObjects(list.map((x) => x.obj).filter((o) => o.visible), true);
  for (const hit of hits) {
    let o = hit.object;
    while (o && !o.userData[tag]) o = o.parent;
    if (o) return o.userData[tag];
  }
  return null;
}

function updateDragPoint() {
  raycaster.ray.intersectPlane(dragPlane, dragPoint);
  dragPoint.y = Math.max(dragPoint.y, 0.2);
}

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('pointerdown', (e) => {
  downAt.set(e.clientX, e.clientY);
  updateMouse(e);
  if (mode !== 'care' || e.button !== 0) return;
  const h = thingUnderMouse('hamster');
  if (h) {
    h.brain.item = null;
    h.path = [];
    h.brain.mood = 'held';
    heldHamster = h;
    selected = h;
    refreshHamsterUI();
    controls.enabled = false;
    canvas.style.cursor = 'grabbing';
    updateDragPoint();
  }
});

canvas.addEventListener('pointermove', (e) => {
  updateMouse(e);
  if (mode === 'build') {
    updateGhost();
    canvas.style.cursor = tool ? 'crosshair' : (thingUnderMouse('item') || thingUnderMouse('piece') ? 'pointer' : 'grab');
  } else if (heldHamster) {
    updateDragPoint();
  } else {
    const it = thingUnderMouse('item');
    canvas.style.cursor = thingUnderMouse('hamster') ? 'grab' : (it && it.type === 'wheel' ? 'pointer' : 'default');
  }
});

canvas.addEventListener('pointerup', (e) => {
  if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) >= 5) return;   // that was a drag
  updateMouse(e);
  if (mode === 'build') {
    if (e.button === 2) cancelTool(); else if (e.button === 0) buildClick();
  } else if (e.button === 0 && !heldHamster) {
    const it = thingUnderMouse('item');
    if (it && it.type === 'wheel') it.spin += 6;   // spin the wheel for fun
  }
});

// Drop a carried hamster into the nearest cage or tube
addEventListener('pointerup', () => {
  if (!heldHamster) return;
  const h = heldHamster;
  heldHamster = null;
  controls.enabled = true;
  canvas.style.cursor = 'grab';
  const n = nearestNode(h.obj.position, 1.6);
  if (n) {
    h.node = n.key;
    h.obj.position.x = n.pos.x;
    h.obj.position.z = n.pos.z;
  } else {
    showToast('Put hamsters inside a cage or tube 🐹');
    const back = graph.get(h.node) || nearestNode(h.obj.position);
    if (back) { h.node = back.key; h.obj.position.x = back.pos.x; h.obj.position.z = back.pos.z; }
  }
  h.brain.mood = 'fall';
  h.brain.fallSpeed = 0;
});

addEventListener('keydown', (e) => {
  if (mode !== 'build') return;
  const k = e.key.toLowerCase();
  if (k === 'r') rotateTool();
  if (k === 'p') paintTool();
  if (k === 'escape') cancelTool();
  if (k === 'delete' || k === 'backspace') deleteTool();
});

// =====================================================================
// 14. CAMERA: front view, drag to pan, scroll to zoom (no spinning)
// =====================================================================
const controls = new OrbitControls(camera, canvas);
controls.enableRotate = false;
controls.screenSpacePanning = true;
controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
controls.minDistance = 3;
controls.maxDistance = 60;
controls.enableDamping = true;

// Fit everything on screen
function frameCamera() {
  if (!pieces.length) return;
  const box = new THREE.Box3();
  for (const p of pieces) box.expandByObject(p.obj);
  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const dist = Math.max(s.y / (2 * Math.tan(fov / 2)), s.x / (2 * Math.tan(fov / 2) * camera.aspect)) * 1.25 + CAGE_DEPTH;
  controls.target.copy(c);
  camera.position.set(c.x, c.y + dist * 0.12, c.z + dist);
  controls.update();
}

// =====================================================================
// 15. GAME LOOP
// =====================================================================
const clock = new THREE.Clock();
function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;
  for (const h of hamsters) updateHamster(h, dt, time);
  updateItems(dt);
  if (hamsters.length) updateUI(time);
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});