import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// =====================================================================
// 1. SCENE, CAMERA, RENDERER, LIGHTS
// =====================================================================
const scene = new THREE.Scene();
scene.background = new THREE.Color('#fdf1e1');

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 3.8, 4.8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight('white', 0.8));
const sun = new THREE.DirectionalLight('white', 1.6);
sun.position.set(3, 6, 4);
sun.castShadow = true;
sun.shadow.camera.left = -4; sun.shadow.camera.right = 4;
sun.shadow.camera.top = 4;   sun.shadow.camera.bottom = -4;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);

const room = new THREE.Mesh(
  new THREE.PlaneGeometry(30, 30),
  new THREE.MeshStandardMaterial({ color: '#f3e3cc' })
);
room.rotation.x = -Math.PI / 2;
room.receiveShadow = true;
scene.add(room);

// =====================================================================
// 2. SETTINGS
// =====================================================================
const CAGE_W = 4, CAGE_D = 3;
const GROUND_Y = 0.11;   // top of the bedding
const GRID = 0.25;       // items snap to this grid

// Everything you can place in Build mode. r = how much floor space it needs.
const ITEM_TYPES = {
  food_bowl:    { label: 'Food bowl', icon: '🥣', r: 0.3 },
  water_bottle: { label: 'Water',     icon: '💧', r: 0.25 },
  wheel:        { label: 'Wheel',     icon: '🎡', r: 0.45 },
  house:        { label: 'House',     icon: '🛖', r: 0.5 },
  ramp:         { label: 'Ramp',      icon: '📐', r: 0.5 },
  platform:     { label: 'Platform',  icon: '🟨', r: 0.55 },
  bridge:       { label: 'Bridge',    icon: '🌉', r: 0.75 },
  swing:        { label: 'Swing',     icon: '🎠', r: 0.4 },
  chew_toy:     { label: 'Chew ball', icon: '🪵', r: 0.15 }
};

// =====================================================================
// 3. LOADING
// =====================================================================
const loadingText = document.createElement('div');
loadingText.textContent = 'Loading… 🐹';
loadingText.style.cssText = `position:fixed; inset:0; display:flex; align-items:center;
  justify-content:center; font:bold 28px sans-serif; color:#a0682f; pointer-events:none;`;
document.body.appendChild(loadingText);

const loader = new GLTFLoader();
const templates = {};          // one loaded copy of every item, used to make clones
const items = [];              // every item currently in the cage
let hamster, mixer, actions = {}, currentAction = null;

function prepare(obj) {
  obj.traverse((p) => { if (p.isMesh) { p.castShadow = true; p.receiveShadow = true; } });
  return obj;
}

const FIXED = ['cage_base', 'cage_walls_clear', 'bedding'];
const ALL_FILES = [...FIXED, 'hamster', ...Object.keys(ITEM_TYPES)];

Promise.all(ALL_FILES.map((name) =>
  loader.loadAsync(`models/${name}.glb`).then((gltf) => [name, gltf])
)).then((list) => {
  const loaded = Object.fromEntries(list);

  for (const name of FIXED) scene.add(prepare(loaded[name].scene));
  for (const type of Object.keys(ITEM_TYPES)) templates[type] = loaded[type].scene;

  // Hamster + animations
  hamster = prepare(loaded.hamster.scene);
  hamster.position.set(0, GROUND_Y, 0.3);
  scene.add(hamster);
  mixer = new THREE.AnimationMixer(hamster);
  for (const clip of loaded.hamster.animations) actions[clip.name] = mixer.clipAction(clip);
  playAnim('idle');

  // Starting layout
  placeItem('food_bowl', 1.25, -0.75);
  placeItem('water_bottle', 1.75, 0.5, -Math.PI / 2);
  placeItem('wheel', -1.25, -0.5);
  placeItem('house', -1.25, 0.75);

  buildPalette();
  loadingText.remove();
}).catch((err) => {
  loadingText.textContent = '❌ Could not load models – check the models folder (F12 → Console)';
  console.error(err);
});

function playAnim(name, speed = 1) {
  const next = actions[name];
  if (!next) return;
  next.timeScale = speed;
  if (next === currentAction) return;
  next.reset().play();
  if (currentAction) currentAction.crossFadeTo(next, 0.2, false);
  currentAction = next;
}

// =====================================================================
// 4. ITEMS: place, find, remove
// =====================================================================
function placeItem(type, x, z, rotY = 0) {
  const obj = prepare(templates[type].clone(true));
  obj.position.set(x, GROUND_Y, z);
  obj.rotation.y = rotY;

  const item = { type, obj, food: 5, water: 1, spin: 0, swingAngle: 0, swingVel: 0,
                 vel: new THREE.Vector3() };
  obj.userData.item = item;

  if (type === 'food_bowl') item.foodPieces = [1, 2, 3, 4, 5].map((i) => obj.getObjectByName('food_' + i));
  if (type === 'water_bottle') item.waterLevel = obj.getObjectByName('water_level');
  if (type === 'wheel') item.spinNode = obj.getObjectByName('wheel_spin');
  if (type === 'swing') item.seat = obj.getObjectByName('swing_seat');

  scene.add(obj);
  items.push(item);
  return item;
}

function removeItem(item) {
  releaseHamsterFrom(item);
  scene.remove(item.obj);
  items.splice(items.indexOf(item), 1);
}

const itemExists = (item) => items.includes(item);

// A point near an item, given in the item's own directions (so it turns with the item)
function spotNear(item, localX, localZ) {
  item.obj.updateMatrixWorld();
  return item.obj.localToWorld(new THREE.Vector3(localX, 0, localZ)).setY(GROUND_Y);
}

// Closest item of a type that passes a test
function nearest(type, test = () => true) {
  let best = null, bestDist = Infinity;
  for (const it of items) {
    if (it.type !== type || !test(it)) continue;
    const d = hamster ? it.obj.position.distanceTo(hamster.position) : 0;
    if (d < bestDist) { bestDist = d; best = it; }
  }
  return best;
}

// Which item (if any) is under the mouse?
function itemUnderMouse() {
  const hits = raycaster.intersectObjects(items.map((it) => it.obj), true);
  for (const hit of hits) {
    let o = hit.object;
    while (o && !o.userData.item) o = o.parent;
    if (o && o.visible) return o.userData.item;
  }
  return null;
}

// Is there room for an item here?
function canPlace(type, x, z, ignore = null) {
  const r = ITEM_TYPES[type].r;
  return items.every((it) => it === ignore ||
    Math.hypot(it.obj.position.x - x, it.obj.position.z - z) >= r + ITEM_TYPES[it.type].r - 0.05);
}

function refillFood()  { items.forEach((it) => { if (it.type === 'food_bowl') it.food = 5; }); }
function fillWater()   { items.forEach((it) => { if (it.type === 'water_bottle') it.water = 1; }); }

// =====================================================================
// 5. HAMSTER BRAIN
// =====================================================================
const brain = {
  mood: 'rest', timer: 1, target: new THREE.Vector3(), spot: new THREE.Vector3(),
  item: null, speed: 0.55, fallSpeed: 0,
  hunger: 100, thirst: 100, fun: 100
};
const DRAIN = { hunger: 2.5, thirst: 3, fun: 3.5 };   // per second (fast for testing)
const LOW = 40;

const findWater = () => nearest('water_bottle', (b) => b.water > 0.01);
const findFood  = () => nearest('food_bowl', (b) => b.food > 0);
const findWheel = () => nearest('wheel');

function wantsSomething() {
  return (brain.thirst < LOW && findWater()) || (brain.hunger < LOW && findFood()) ||
         (brain.fun < LOW && findWheel());
}

function goTo(item, mood, spot) {
  brain.item = item;
  brain.spot.copy(spot);
  return mood;
}

function decideWhatToDo() {
  if (brain.thirst < LOW) { const b = findWater(); if (b) return goTo(b, 'goDrink', spotNear(b, 0, 0.38)); }
  if (brain.hunger < LOW) { const b = findFood();  if (b) return goTo(b, 'goEat',   spotNear(b, 0, 0.32)); }
  if (brain.fun < LOW)    { const w = findWheel(); if (w) return goTo(w, 'goWheel', spotNear(w, 0, 0.75)); }
  brain.item = null;
  pickRandomSpot();
  return 'walk';
}

function pickRandomSpot() {
  const m = 0.45;
  for (let tries = 0; tries < 25; tries++) {
    brain.target.set(
      THREE.MathUtils.randFloat(-CAGE_W / 2 + m, CAGE_W / 2 - m), GROUND_Y,
      THREE.MathUtils.randFloat(-CAGE_D / 2 + m, CAGE_D / 2 - m)
    );
    const blocked = items.some((it) => Math.hypot(it.obj.position.x - brain.target.x,
      it.obj.position.z - brain.target.z) < ITEM_TYPES[it.type].r + 0.2);
    if (!blocked) return;
  }
}

// If an item the hamster is using gets moved or deleted, let go of it
function releaseHamsterFrom(item) {
  if (brain.item !== item) return;
  brain.item = null;
  if (['goEat', 'eat', 'goDrink', 'drink', 'goWheel', 'run'].includes(brain.mood)) {
    hamster.position.y = GROUND_Y;
    hamster.rotation.x = hamster.rotation.z = 0;
    startResting(1);
  }
}

function turnToward(current, target, amount) {
  let diff = target - current;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  return current + diff * amount;
}

function faceToward(point, amount = 0.15) {
  const a = Math.atan2(point.x - hamster.position.x, point.z - hamster.position.z);
  hamster.rotation.y = turnToward(hamster.rotation.y, a, amount);
}

function startResting(seconds) {
  brain.mood = 'rest';
  brain.timer = seconds;
}

function walkTo(target, dt) {
  const dx = target.x - hamster.position.x;
  const dz = target.z - hamster.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.05) return true;
  playAnim('walk', 1.3);
  hamster.rotation.y = turnToward(hamster.rotation.y, Math.atan2(dx, dz), 0.12);
  hamster.position.x += (dx / dist) * brain.speed * dt;
  hamster.position.z += (dz / dist) * brain.speed * dt;
  hamster.position.y = GROUND_Y;
  return false;
}

function updateHamster(dt, time) {
  if (!hamster) return;

  const busy = brain.mood === 'run' ? 2 : 1;
  brain.hunger = Math.max(0, brain.hunger - DRAIN.hunger * busy * dt);
  brain.thirst = Math.max(0, brain.thirst - DRAIN.thirst * busy * dt);
  if (brain.mood !== 'run') brain.fun = Math.max(0, brain.fun - DRAIN.fun * dt);

  const it = brain.item;

  switch (brain.mood) {

    case 'rest':
      playAnim('idle');
      hamster.rotation.x = hamster.rotation.z = 0;
      hamster.scale.set(1, 1, 1);
      hamster.position.y = GROUND_Y;
      brain.timer -= dt;
      if (brain.timer <= 0) brain.mood = decideWhatToDo();
      break;

    case 'walk':
      if (wantsSomething()) { brain.mood = decideWhatToDo(); break; }
      if (walkTo(brain.target, dt)) startResting(THREE.MathUtils.randFloat(1, 4));
      break;

    case 'goEat':
      if (!itemExists(it) || it.food === 0) { startResting(1); break; }
      if (walkTo(brain.spot, dt)) { brain.mood = 'eat'; brain.timer = 1; }
      break;

    case 'eat':
      if (!itemExists(it)) { startResting(1); break; }
      playAnim('eat');
      faceToward(it.obj.position);
      brain.timer -= dt;
      if (brain.timer <= 0) {
        brain.timer = 1;
        if (it.food > 0) { it.food--; brain.hunger = Math.min(100, brain.hunger + 20); }
        if (brain.hunger >= 100 || it.food === 0) startResting(2);
      }
      break;

    case 'goDrink':
      if (!itemExists(it) || it.water <= 0.01) { startResting(1); break; }
      if (walkTo(brain.spot, dt)) { brain.mood = 'drink'; brain.timer = 1; }
      break;

    case 'drink':
      if (!itemExists(it)) { startResting(1); break; }
      playAnim('eat', 0.6);
      faceToward(it.obj.position);
      brain.timer -= dt;
      if (brain.timer <= 0) {
        brain.timer = 1;
        it.water = Math.max(0, it.water - 0.1);
        brain.thirst = Math.min(100, brain.thirst + 15);
        if (brain.thirst >= 100 || it.water <= 0.01) startResting(2);
      }
      break;

    case 'goWheel':
      if (!itemExists(it)) { startResting(1); break; }
      if ((brain.thirst < LOW && findWater()) || (brain.hunger < LOW && findFood())) {
        brain.mood = decideWhatToDo(); break;
      }
      if (walkTo(brain.spot, dt)) {
        it.obj.updateMatrixWorld();
        hamster.position.copy(it.obj.localToWorld(new THREE.Vector3(0, 0, 0)));
        hamster.position.y = GROUND_Y + 0.09;          // hop into the wheel
        hamster.rotation.set(0, it.obj.rotation.y, 0); // face along the wheel
        brain.mood = 'run';
        brain.timer = THREE.MathUtils.randFloat(5, 8);
      }
      break;

    case 'run':
      if (!itemExists(it)) { startResting(1); break; }
      playAnim('walk', 3);
      it.spin = THREE.MathUtils.lerp(it.spin, 9, 0.05);
      brain.fun = Math.min(100, brain.fun + 15 * dt);
      brain.timer -= dt;
      if (brain.timer <= 0 || brain.fun >= 100 ||
          (brain.thirst < LOW && findWater()) || (brain.hunger < LOW && findFood())) {
        hamster.position.copy(spotNear(it, 0, 0.75));  // hop out
        brain.item = null;
        startResting(1.5);
      }
      break;

    case 'held':
      playAnim('walk', 4);
      hamster.position.lerp(dragPoint, 0.25);
      hamster.rotation.z = Math.sin(time * 30) * 0.12;
      hamster.rotation.x = -0.2;
      break;

    case 'fall':
      brain.fallSpeed -= 9.8 * dt;
      hamster.position.y += brain.fallSpeed * dt;
      hamster.rotation.z *= 0.9;
      hamster.rotation.x *= 0.9;
      if (hamster.position.y <= GROUND_Y) {
        hamster.position.y = GROUND_Y;
        if (brain.fallSpeed < -1) {
          brain.fallSpeed = -brain.fallSpeed * 0.3;
          hamster.scale.set(1.1, 0.8, 1.1);
        } else {
          startResting(1.5);
        }
      } else {
        hamster.scale.lerp(new THREE.Vector3(1, 1, 1), 0.2);
      }
      break;
  }
}

// =====================================================================
// 6. ITEM ANIMATION (wheels, swings, chew balls, food & water levels)
// =====================================================================
function updateItems(dt) {
  const lx = CAGE_W / 2 - 0.2, lz = CAGE_D / 2 - 0.2;
  for (const it of items) {
    if (it.type === 'wheel') {
      const running = brain.mood === 'run' && brain.item === it;
      if (!running) it.spin *= Math.pow(0.4, dt);
      it.spinNode.rotation.x += it.spin * dt;
    }
    if (it.type === 'swing') {
      // pendulum: pulled back to the middle, slowly loses energy
      it.swingVel += (-9 * it.swingAngle - 0.8 * it.swingVel) * dt;
      it.swingAngle += it.swingVel * dt;
      it.seat.rotation.x = it.swingAngle;
    }
    if (it.type === 'chew_toy' && it.vel.lengthSq() > 0.0001) {
      it.obj.position.addScaledVector(it.vel, dt);
      it.obj.rotation.y += it.vel.length() * dt * 4;
      if (Math.abs(it.obj.position.x) > lx) { it.obj.position.x = Math.sign(it.obj.position.x) * lx; it.vel.x *= -0.6; }
      if (Math.abs(it.obj.position.z) > lz) { it.obj.position.z = Math.sign(it.obj.position.z) * lz; it.vel.z *= -0.6; }
      it.vel.multiplyScalar(Math.pow(0.25, dt));
    }
    if (it.type === 'food_bowl') it.foodPieces.forEach((p, i) => { if (p) p.visible = i < it.food; });
    if (it.type === 'water_bottle' && it.waterLevel) {
      it.waterLevel.scale.y = Math.max(it.water, 0.001);
      it.waterLevel.visible = it.water > 0.01;
    }
  }
}

// Care mode: clicking a toy plays with it
function poke(item) {
  if (item.type === 'swing') item.swingVel += 3;
  if (item.type === 'wheel') item.spin += 6;
  if (item.type === 'chew_toy') {
    const a = Math.random() * Math.PI * 2;
    item.vel.set(Math.cos(a) * 1.5, 0, Math.sin(a) * 1.5);
  }
}

// =====================================================================
// 7. BUILD MODE
// =====================================================================
let mode = 'care';     // 'care' or 'build'
let tool = null;       // null, { kind:'new', type, ghost, rot } or { kind:'move', item, ghost, rot }
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -GROUND_Y);
const floorPoint = new THREE.Vector3();

// A see-through copy that follows the mouse
function makeGhost(type) {
  const g = templates[type].clone(true);
  g.traverse((p) => {
    if (p.isMesh) {
      p.material = p.material.clone();
      p.material.transparent = true;
      p.material.opacity = 0.55;
      p.material.depthWrite = false;
    }
  });
  g.visible = false;
  scene.add(g);
  return g;
}

function tintGhost(ghost, ok) {
  ghost.traverse((p) => { if (p.isMesh && p.material.emissive) p.material.emissive.set(ok ? 0x000000 : 0xcc0000); });
}

function selectNewItem(type) {
  cancelTool();
  tool = { kind: 'new', type, ghost: makeGhost(type), rot: 0 };
  updatePaletteHighlight();
}

function startMoving(item) {
  cancelTool();
  releaseHamsterFrom(item);
  item.obj.visible = false;
  tool = { kind: 'move', type: item.type, item, ghost: makeGhost(item.type), rot: item.obj.rotation.y };
  tool.ghost.position.copy(item.obj.position);
  tool.ghost.rotation.y = tool.rot;
  tool.ghost.visible = true;
  tool.ok = true;
  updatePaletteHighlight();
}

function cancelTool() {
  if (!tool) return;
  scene.remove(tool.ghost);
  if (tool.kind === 'move') tool.item.obj.visible = true;
  tool = null;
  updatePaletteHighlight();
}

function deleteSelected() {
  if (tool && tool.kind === 'move') {
    const item = tool.item;
    scene.remove(tool.ghost);
    tool = null;
    removeItem(item);
    updatePaletteHighlight();
  }
}

function rotateSelected() {
  if (!tool) return;
  tool.rot += Math.PI / 2;
  tool.ghost.rotation.y = tool.rot;
}

// Move the ghost to the mouse, snapped to the grid and kept inside the cage
function updateGhost() {
  if (!tool) return;
  if (!raycaster.ray.intersectPlane(floorPlane, floorPoint)) return;
  const r = ITEM_TYPES[tool.type].r;
  const lx = CAGE_W / 2 - r - 0.05, lz = CAGE_D / 2 - r - 0.05;
  const x = THREE.MathUtils.clamp(Math.round(floorPoint.x / GRID) * GRID, -lx, lx);
  const z = THREE.MathUtils.clamp(Math.round(floorPoint.z / GRID) * GRID, -lz, lz);
  tool.ghost.position.set(x, GROUND_Y, z);
  tool.ghost.rotation.y = tool.rot;
  tool.ghost.visible = true;
  tool.ok = canPlace(tool.type, x, z, tool.kind === 'move' ? tool.item : null);
  tintGhost(tool.ghost, tool.ok);
}

function buildClick() {
  if (tool) {
    if (!tool.ok || !tool.ghost.visible) return;
    const { x, z } = tool.ghost.position;
    if (tool.kind === 'new') {
      placeItem(tool.type, x, z, tool.rot);          // keep the tool so you can place more
    } else {
      tool.item.obj.position.set(x, GROUND_Y, z);
      tool.item.obj.rotation.y = tool.rot;
      tool.item.vel.set(0, 0, 0);
      cancelTool();
    }
  } else {
    const item = itemUnderMouse();
    if (item) startMoving(item);
  }
}

function setMode(newMode) {
  mode = newMode;
  cancelTool();
  document.getElementById('careBtn').style.opacity = mode === 'care' ? 1 : 0.45;
  document.getElementById('buildBtn').style.opacity = mode === 'build' ? 1 : 0.45;
  document.getElementById('careTools').style.display = mode === 'care' ? 'block' : 'none';
  buildBar.style.display = mode === 'build' ? 'flex' : 'none';
}

// =====================================================================
// 8. UI
// =====================================================================
const panelStyle = `background:white; border-radius:14px; font-family:sans-serif; user-select:none;
  box-shadow:0 4px 14px rgba(0,0,0,0.12);`;
const btn = (id, text, color, extra = '') => `<button id="${id}" style="padding:8px; border:none;
  border-radius:8px; background:${color}; color:white; font-weight:bold; cursor:pointer; ${extra}">${text}</button>`;
const bar = (label, id) => `
  <div style="font-size:13px; margin-bottom:3px;">${label}</div>
  <div style="background:#eee; border-radius:8px; height:14px; overflow:hidden; margin-bottom:8px;">
    <div id="${id}" style="height:100%; width:100%;"></div></div>`;

// Top-left panel
const ui = document.createElement('div');
ui.style.cssText = `position:fixed; top:16px; left:16px; padding:14px 16px; width:230px; ${panelStyle}`;
ui.innerHTML = `
  <div style="display:flex; gap:6px; margin-bottom:12px;">
    ${btn('careBtn', '🐹 Care', '#6cc070', 'flex:1;')}
    ${btn('buildBtn', '🛠️ Build', '#8e7dbe', 'flex:1; opacity:0.45;')}
  </div>
  <div style="font-weight:bold; margin-bottom:8px;">Hammy <span id="moodIcon"></span></div>
  ${bar('🍽️ Hunger', 'hungerFill')}
  ${bar('💧 Thirst', 'thirstFill')}
  ${bar('🎉 Fun', 'funFill')}
  <div id="stockText" style="font-size:12px; color:#666;"></div>
  <div id="careTools">
    ${btn('feedBtn', '🥣 Refill food', '#f4a261', 'width:100%; margin-top:8px;')}
    ${btn('waterBtn', '💧 Fill water', '#4ea8de', 'width:100%; margin-top:6px;')}
    <div style="font-size:11px; color:#888; margin-top:8px;">Tip: click toys to play with them!</div>
  </div>`;
document.body.appendChild(ui);
document.getElementById('feedBtn').onclick = refillFood;
document.getElementById('waterBtn').onclick = fillWater;
document.getElementById('careBtn').onclick = () => setMode('care');
document.getElementById('buildBtn').onclick = () => setMode('build');

// Bottom build bar
const buildBar = document.createElement('div');
buildBar.style.cssText = `position:fixed; bottom:16px; left:50%; transform:translateX(-50%);
  display:none; flex-direction:column; align-items:center; gap:8px; padding:12px 14px; ${panelStyle}`;
buildBar.innerHTML = `
  <div id="palette" style="display:flex; gap:6px; flex-wrap:wrap; justify-content:center;"></div>
  <div style="display:flex; gap:6px; align-items:center;">
    ${btn('rotateBtn', '🔄 Rotate (R)', '#8e7dbe')}
    ${btn('deleteBtn', '🗑️ Delete', '#e5604f')}
    ${btn('doneBtn', '✋ Stop (Esc)', '#999')}
    <span id="buildHint" style="font-size:12px; color:#666; margin-left:6px;"></span>
  </div>`;
document.body.appendChild(buildBar);
document.getElementById('rotateBtn').onclick = rotateSelected;
document.getElementById('deleteBtn').onclick = deleteSelected;
document.getElementById('doneBtn').onclick = cancelTool;

function buildPalette() {
  const pal = document.getElementById('palette');
  for (const [type, info] of Object.entries(ITEM_TYPES)) {
    const b = document.createElement('button');
    b.dataset.type = type;
    b.innerHTML = `<div style="font-size:24px;">${info.icon}</div><div style="font-size:11px;">${info.label}</div>`;
    b.style.cssText = `width:72px; padding:6px 2px; border:2px solid #eee; border-radius:10px;
      background:#fafafa; cursor:pointer;`;
    b.onclick = () => selectNewItem(type);
    pal.appendChild(b);
  }
}

function updatePaletteHighlight() {
  document.querySelectorAll('#palette button').forEach((b) => {
    const on = tool && tool.kind === 'new' && tool.type === b.dataset.type;
    b.style.borderColor = on ? '#8e7dbe' : '#eee';
    b.style.background = on ? '#efeaff' : '#fafafa';
  });
  const hint = document.getElementById('buildHint');
  if (!hint) return;
  hint.textContent = !tool ? 'Pick an item, or click one in the cage to move it'
    : tool.kind === 'new' ? 'Click in the cage to place'
    : 'Click to drop it here';
  document.getElementById('deleteBtn').style.opacity = tool && tool.kind === 'move' ? 1 : 0.4;
}
updatePaletteHighlight();

const MOOD_ICONS = { rest: '😌', walk: '🐾', goEat: '🤤', eat: '😋', goDrink: '🥤', drink: '💧',
                     goWheel: '🤩', run: '🏃', held: '😲', fall: '😵' };
const colorFor = (v) => v > 60 ? '#6cc070' : v > 30 ? '#f2b84b' : '#e5604f';

function setBar(id, value) {
  const el = document.getElementById(id);
  el.style.width = value + '%';
  el.style.background = colorFor(value);
}

function updateUI() {
  setBar('hungerFill', brain.hunger);
  setBar('thirstFill', brain.thirst);
  setBar('funFill', brain.fun);
  const bowls = items.filter((i) => i.type === 'food_bowl');
  const bottles = items.filter((i) => i.type === 'water_bottle');
  const food = bowls.reduce((s, b) => s + b.food, 0);
  const water = bottles.length ? bottles.reduce((s, b) => s + b.water, 0) / bottles.length : 0;
  document.getElementById('stockText').textContent =
    (bowls.length ? `Food: ${food}` : 'No food bowl!') + '  •  ' +
    (bottles.length ? `Water: ${Math.round(water * 100)}%` : 'No water bottle!');
  const sad = brain.mood === 'rest' &&
    ((brain.hunger < LOW && !findFood()) || (brain.thirst < LOW && !findWater()));
  document.getElementById('moodIcon').textContent = sad ? '😢' : MOOD_ICONS[brain.mood];
}

// =====================================================================
// 9. MOUSE & KEYBOARD
// =====================================================================
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const HOLD_HEIGHT = 1.0;
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -HOLD_HEIGHT);
const dragPoint = new THREE.Vector3();
const canvas = renderer.domElement;
const downAt = new THREE.Vector2();

function updateMouse(e) {
  mouse.x = (e.clientX / innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
}
const isMouseOverHamster = () => hamster && raycaster.intersectObject(hamster, true).length > 0;

function updateDragPoint() {
  raycaster.ray.intersectPlane(dragPlane, dragPoint);
  const m = 0.35;
  dragPoint.x = THREE.MathUtils.clamp(dragPoint.x, -CAGE_W / 2 + m, CAGE_W / 2 - m);
  dragPoint.z = THREE.MathUtils.clamp(dragPoint.z, -CAGE_D / 2 + m, CAGE_D / 2 - m);
  dragPoint.y = HOLD_HEIGHT;
}

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('pointerdown', (e) => {
  downAt.set(e.clientX, e.clientY);
  updateMouse(e);
  if (mode === 'care' && e.button === 0 && isMouseOverHamster()) {
    brain.item = null;
    brain.mood = 'held';
    controls.enabled = false;
    canvas.style.cursor = 'grabbing';
    updateDragPoint();
  }
});

canvas.addEventListener('pointermove', (e) => {
  updateMouse(e);
  if (mode === 'build') {
    updateGhost();
    canvas.style.cursor = tool ? 'crosshair' : (itemUnderMouse() ? 'pointer' : 'default');
  } else if (brain.mood === 'held') {
    updateDragPoint();
  } else {
    canvas.style.cursor = isMouseOverHamster() ? 'grab' : (itemUnderMouse() ? 'pointer' : 'default');
  }
});

canvas.addEventListener('pointerup', (e) => {
  const wasClick = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 5;
  if (!wasClick) return;
  updateMouse(e);
  if (mode === 'build') {
    if (e.button === 2) cancelTool();           // right-click = cancel
    else if (e.button === 0) buildClick();
  } else if (e.button === 0 && brain.mood !== 'held' && brain.mood !== 'fall') {
    const item = itemUnderMouse();
    if (item) poke(item);
  }
});

addEventListener('pointerup', () => {
  if (brain.mood === 'held') {
    brain.mood = 'fall';
    brain.fallSpeed = 0;
    controls.enabled = true;
    canvas.style.cursor = 'grab';
  }
});

addEventListener('keydown', (e) => {
  if (mode !== 'build') return;
  if (e.key === 'r' || e.key === 'R') rotateSelected();
  if (e.key === 'Escape') cancelTool();
  if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
});

// =====================================================================
// 10. CAMERA CONTROLS (created after our mouse code so our clicks come first)
// =====================================================================
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.3, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2.1;

// =====================================================================
// 11. GAME LOOP
// =====================================================================
const clock = new THREE.Clock();
function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;
  updateHamster(dt, time);
  if (mixer) mixer.update(dt);
  updateItems(dt);
  updateUI();
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