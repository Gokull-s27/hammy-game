import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ============ 1. SCENE, CAMERA, RENDERER, LIGHTS ============
const scene = new THREE.Scene();
scene.background = new THREE.Color('#fdf1e1');

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 3.6, 4.6);

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

// ============ 2. LAYOUT (where everything goes) ============
const CAGE_W = 4, CAGE_D = 3;
const GROUND_Y = 0.11;   // top of the bedding = where feet touch

const BOWL_POS   = new THREE.Vector3(1.3, GROUND_Y, -0.8);
const BOTTLE_POS = new THREE.Vector3(1.75, GROUND_Y, 0.6);
const WHEEL_POS  = new THREE.Vector3(-1.2, GROUND_Y, -0.6);
const HOUSE_POS  = new THREE.Vector3(-1.4, GROUND_Y, 0.8);

// Spots where the hamster stands to do things
const EAT_SPOT      = new THREE.Vector3(1.3 - 0.32, GROUND_Y, -0.8 + 0.32);
const DRINK_SPOT    = new THREE.Vector3(1.36, GROUND_Y, 0.6);
const WHEEL_ENTRY   = new THREE.Vector3(-1.2, GROUND_Y, 0.15);
const IN_WHEEL_POS  = new THREE.Vector3(-1.2, GROUND_Y + 0.09, -0.6);

// Places the hamster shouldn't pick as a random walking target
const OBSTACLES = [
  { pos: BOWL_POS, r: 0.4 }, { pos: BOTTLE_POS, r: 0.4 },
  { pos: WHEEL_POS, r: 0.6 }, { pos: HOUSE_POS, r: 0.6 }
];

// ============ 3. LOADING SCREEN ============
const loadingText = document.createElement('div');
loadingText.textContent = 'Loading… 🐹';
loadingText.style.cssText = `position:fixed; inset:0; display:flex; align-items:center;
  justify-content:center; font:bold 28px sans-serif; color:#a0682f; pointer-events:none;`;
document.body.appendChild(loadingText);

// ============ 4. LOAD MODELS ============
const loader = new GLTFLoader();
const loadModel = (name) => loader.loadAsync(`models/${name}.glb`);

function addToScene(gltf, position, rotationY = 0) {
  const obj = gltf.scene;
  obj.position.copy(position);
  obj.rotation.y = rotationY;
  obj.traverse((p) => {
    if (p.isMesh) { p.castShadow = true; p.receiveShadow = true; }
  });
  scene.add(obj);
  return obj;
}

// Things we need to control later
let hamster, mixer, actions = {}, currentAction = null;
let wheelSpin, foodPieces = [], waterLevel;

Promise.all([
  loadModel('cage_base'), loadModel('cage_walls_clear'), loadModel('bedding'),
  loadModel('food_bowl'), loadModel('water_bottle'), loadModel('wheel'),
  loadModel('house'), loadModel('hamster')
]).then(([cageBase, walls, bedding, bowl, bottle, wheel, house, ham]) => {

  addToScene(cageBase, new THREE.Vector3(0, 0, 0));
  addToScene(walls, new THREE.Vector3(0, 0, 0));
  addToScene(bedding, new THREE.Vector3(0, 0, 0));

  const bowlObj = addToScene(bowl, BOWL_POS);
  for (let i = 1; i <= 5; i++) foodPieces.push(bowlObj.getObjectByName('food_' + i));

  const bottleObj = addToScene(bottle, BOTTLE_POS, -Math.PI / 2); // nozzle faces into the cage
  waterLevel = bottleObj.getObjectByName('water_level');

  const wheelObj = addToScene(wheel, WHEEL_POS);
  wheelSpin = wheelObj.getObjectByName('wheel_spin');

  addToScene(house, HOUSE_POS, Math.PI / 4);

  // Hamster + its animations
  hamster = addToScene(ham, new THREE.Vector3(0, GROUND_Y, 0.3));
  mixer = new THREE.AnimationMixer(hamster);
  for (const clip of ham.animations) actions[clip.name] = mixer.clipAction(clip);
  playAnim('idle');

  loadingText.remove();
}).catch((err) => {
  loadingText.textContent = '❌ Could not load models – check the models folder (F12 → Console)';
  console.error(err);
});

// Smoothly switch animation: 'idle' | 'walk' | 'eat'
function playAnim(name, speed = 1) {
  const next = actions[name];
  if (!next) return;
  next.timeScale = speed;
  if (next === currentAction) return;
  next.reset().play();
  if (currentAction) currentAction.crossFadeTo(next, 0.2, false);
  currentAction = next;
}

// ============ 5. FOOD & WATER ============
let foodCount = 5;
let water = 1;   // 1 = full bottle, 0 = empty

function updateFoodAndWater() {
  foodPieces.forEach((p, i) => { if (p) p.visible = i < foodCount; });
  if (waterLevel) {
    waterLevel.scale.y = Math.max(water, 0.001);
    waterLevel.visible = water > 0.01;
  }
}
function refillFood() { foodCount = 5; }
function fillWater() { water = 1; }

// ============ 6. HAMSTER BRAIN ============
// Moods: rest | walk | goEat | eat | goDrink | drink | goWheel | run | held | fall
const brain = {
  mood: 'rest', timer: 1, target: new THREE.Vector3(), speed: 0.55, fallSpeed: 0,
  hunger: 100, thirst: 100, fun: 100        // 100 = perfectly happy
};
const DRAIN = { hunger: 2.5, thirst: 3, fun: 3.5 };  // per second (fast for testing)
const LOW = 40;

const isHungry  = () => brain.hunger < LOW && foodCount > 0;
const isThirsty = () => brain.thirst < LOW && water > 0.01;
const isBored   = () => brain.fun < LOW;

function decideWhatToDo() {
  if (isThirsty()) return 'goDrink';
  if (isHungry())  return 'goEat';
  if (isBored())   return 'goWheel';
  pickRandomSpot();
  return 'walk';
}

function pickRandomSpot() {
  const m = 0.45;
  for (let tries = 0; tries < 20; tries++) {
    brain.target.set(
      THREE.MathUtils.randFloat(-CAGE_W / 2 + m, CAGE_W / 2 - m), GROUND_Y,
      THREE.MathUtils.randFloat(-CAGE_D / 2 + m, CAGE_D / 2 - m)
    );
    const blocked = OBSTACLES.some(o =>
      Math.hypot(o.pos.x - brain.target.x, o.pos.z - brain.target.z) < o.r);
    if (!blocked) return;
  }
}

function turnToward(current, target, amount) {
  let diff = target - current;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  return current + diff * amount;
}

function faceDirection(x, z, amount = 0.15) {
  hamster.rotation.y = turnToward(hamster.rotation.y, Math.atan2(x, z), amount);
}

function startResting(seconds) {
  brain.mood = 'rest';
  brain.timer = seconds;
}

// Walk toward a point (plays the walk animation). Returns true on arrival.
function walkTo(target, dt) {
  const dx = target.x - hamster.position.x;
  const dz = target.z - hamster.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.05) return true;
  playAnim('walk', 1.3);
  faceDirection(dx, dz, 0.12);
  hamster.position.x += (dx / dist) * brain.speed * dt;
  hamster.position.z += (dz / dist) * brain.speed * dt;
  hamster.position.y = GROUND_Y;
  return false;
}

function resetPose() {
  hamster.rotation.x = 0;
  hamster.rotation.z = 0;
  hamster.scale.set(1, 1, 1);
}

function updateHamster(dt, time) {
  if (!hamster) return;

  // Needs go down over time (running makes it hungry and thirsty faster)
  const busy = brain.mood === 'run' ? 2 : 1;
  brain.hunger = Math.max(0, brain.hunger - DRAIN.hunger * busy * dt);
  brain.thirst = Math.max(0, brain.thirst - DRAIN.thirst * busy * dt);
  if (brain.mood !== 'run') brain.fun = Math.max(0, brain.fun - DRAIN.fun * dt);

  switch (brain.mood) {

    case 'rest':
      playAnim('idle');
      resetPose();
      hamster.position.y = GROUND_Y;
      brain.timer -= dt;
      if (brain.timer <= 0) brain.mood = decideWhatToDo();
      break;

    case 'walk':
      if (isThirsty() || isHungry() || isBored()) { brain.mood = decideWhatToDo(); break; }
      if (walkTo(brain.target, dt)) startResting(THREE.MathUtils.randFloat(1, 4));
      break;

    case 'goEat':
      if (foodCount === 0) { startResting(2); break; }
      if (walkTo(EAT_SPOT, dt)) { brain.mood = 'eat'; brain.timer = 1; }
      break;

    case 'eat':
      playAnim('eat');
      faceDirection(BOWL_POS.x - hamster.position.x, BOWL_POS.z - hamster.position.z);
      brain.timer -= dt;
      if (brain.timer <= 0) {
        brain.timer = 1;
        if (foodCount > 0) { foodCount--; brain.hunger = Math.min(100, brain.hunger + 20); }
        if (brain.hunger >= 100 || foodCount === 0) startResting(2);
      }
      break;

    case 'goDrink':
      if (water <= 0.01) { startResting(2); break; }
      if (walkTo(DRINK_SPOT, dt)) { brain.mood = 'drink'; brain.timer = 1; }
      break;

    case 'drink':
      playAnim('eat', 0.6);                 // reuse the eat animation, slower = sipping
      faceDirection(1, 0);                  // face the bottle (+X)
      brain.timer -= dt;
      if (brain.timer <= 0) {
        brain.timer = 1;
        water = Math.max(0, water - 0.1);
        brain.thirst = Math.min(100, brain.thirst + 15);
        if (brain.thirst >= 100 || water <= 0.01) startResting(2);
      }
      break;

    case 'goWheel':
      if (isThirsty() || isHungry()) { brain.mood = decideWhatToDo(); break; }
      if (walkTo(WHEEL_ENTRY, dt)) {
        hamster.position.copy(IN_WHEEL_POS);   // hop in
        hamster.rotation.set(0, 0, 0);         // face along the wheel (+Z)
        brain.mood = 'run';
        brain.timer = THREE.MathUtils.randFloat(5, 8);
      }
      break;

    case 'run':
      playAnim('walk', 3);                     // walk animation, 3× faster = running
      wheelSpeed = THREE.MathUtils.lerp(wheelSpeed, 9, 0.05);
      brain.fun = Math.min(100, brain.fun + 15 * dt);
      brain.timer -= dt;
      if (brain.timer <= 0 || brain.fun >= 100 || isThirsty() || isHungry()) {
        hamster.position.copy(WHEEL_ENTRY);    // hop out
        startResting(1.5);
      }
      break;

    case 'held':
      playAnim('walk', 4);                     // legs paddle in the air
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
          brain.fallSpeed = -brain.fallSpeed * 0.3;   // bounce
          hamster.scale.set(1.1, 0.8, 1.1);           // squash
        } else {
          startResting(1.5);
        }
      } else {
        hamster.scale.lerp(new THREE.Vector3(1, 1, 1), 0.2);
      }
      break;
  }
}

// ============ 7. WHEEL ============
let wheelSpeed = 0;
function updateWheel(dt) {
  if (!wheelSpin) return;
  if (brain.mood !== 'run') wheelSpeed *= Math.pow(0.4, dt);   // coast to a stop
  wheelSpin.rotation.x += wheelSpeed * dt;
}

// ============ 8. UI ============
const ui = document.createElement('div');
ui.style.cssText = `position:fixed; top:16px; left:16px; padding:14px 16px; width:220px;
  background:white; border-radius:14px; font-family:sans-serif; user-select:none;
  box-shadow:0 4px 14px rgba(0,0,0,0.12);`;
const bar = (label, id) => `
  <div style="font-size:13px; margin-bottom:3px;">${label}</div>
  <div style="background:#eee; border-radius:8px; height:14px; overflow:hidden; margin-bottom:8px;">
    <div id="${id}" style="height:100%; width:100%;"></div>
  </div>`;
const button = (id, text, color) => `
  <button id="${id}" style="width:100%; padding:8px; margin-top:6px; border:none; border-radius:8px;
    background:${color}; color:white; font-weight:bold; cursor:pointer;">${text}</button>`;
ui.innerHTML = `
  <div style="font-weight:bold; margin-bottom:8px;">🐹 Hammy <span id="moodIcon"></span></div>
  ${bar('🍽️ Hunger', 'hungerFill')}
  ${bar('💧 Thirst', 'thirstFill')}
  ${bar('🎉 Fun', 'funFill')}
  <div id="stockText" style="font-size:12px; color:#666;"></div>
  ${button('feedBtn', '🥣 Refill food', '#f4a261')}
  ${button('waterBtn', '💧 Fill water', '#4ea8de')}
`;
document.body.appendChild(ui);
document.getElementById('feedBtn').onclick = refillFood;
document.getElementById('waterBtn').onclick = fillWater;

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
  document.getElementById('stockText').textContent =
    `Food: ${foodCount}/5   •   Water: ${Math.round(water * 100)}%`;
  const sad = brain.mood === 'rest' &&
    ((brain.hunger < LOW && foodCount === 0) || (brain.thirst < LOW && water <= 0.01));
  document.getElementById('moodIcon').textContent = sad ? '😢' : MOOD_ICONS[brain.mood];
}

// ============ 9. MOUSE: PICK UP & DROP ============
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const HOLD_HEIGHT = 1.0;
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -HOLD_HEIGHT);
const dragPoint = new THREE.Vector3();
const canvas = renderer.domElement;

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

canvas.addEventListener('pointerdown', (e) => {
  updateMouse(e);
  if (isMouseOverHamster()) {
    brain.mood = 'held';
    controls.enabled = false;
    canvas.style.cursor = 'grabbing';
    updateDragPoint();
  }
});
canvas.addEventListener('pointermove', (e) => {
  updateMouse(e);
  if (brain.mood === 'held') updateDragPoint();
  else canvas.style.cursor = isMouseOverHamster() ? 'grab' : 'default';
});
addEventListener('pointerup', () => {
  if (brain.mood === 'held') {
    brain.mood = 'fall';
    brain.fallSpeed = 0;
    controls.enabled = true;
    canvas.style.cursor = 'grab';
  }
});

// ============ 10. CAMERA CONTROLS ============
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.3, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2.1;   // don't let the camera go under the floor

// ============ 11. GAME LOOP ============
const clock = new THREE.Clock();
function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;
  updateHamster(dt, time);
  if (mixer) mixer.update(dt);    // advance the hamster's animations
  updateWheel(dt);
  updateFoodAndWater();
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