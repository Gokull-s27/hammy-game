import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ============ 1. SCENE ============
const scene = new THREE.Scene();
scene.background = new THREE.Color('#fdf1e1');

// ============ 2. CAMERA ============
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 3.5, 4.5);

// ============ 3. RENDERER ============
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// ============ 4. LIGHTS ============
scene.add(new THREE.AmbientLight('white', 0.8));
const sun = new THREE.DirectionalLight('white', 1.5);
sun.position.set(3, 6, 4);
sun.castShadow = true;
scene.add(sun);

// ============ 5. CAGE ============
const CAGE_W = 4;
const CAGE_D = 3;
const WALL_H = 0.6;
const GROUND_Y = 0.05;

const room = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.MeshStandardMaterial({ color: '#f3e3cc' })
);
room.rotation.x = -Math.PI / 2;
room.receiveShadow = true;
scene.add(room);

const bedding = new THREE.Mesh(
  new THREE.BoxGeometry(CAGE_W, 0.05, CAGE_D),
  new THREE.MeshStandardMaterial({ color: '#e8c99b' })
);
bedding.position.y = 0.025;
bedding.receiveShadow = true;
scene.add(bedding);

const wallMat = new THREE.MeshStandardMaterial({ color: '#bfe6ff', transparent: true, opacity: 0.35 });
function addWall(w, d, x, z) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_H, d), wallMat);
  wall.position.set(x, WALL_H / 2, z);
  scene.add(wall);
}
addWall(CAGE_W, 0.05, 0, -CAGE_D / 2);
addWall(CAGE_W, 0.05, 0,  CAGE_D / 2);
addWall(0.05, CAGE_D, -CAGE_W / 2, 0);
addWall(0.05, CAGE_D,  CAGE_W / 2, 0);

// ============ 6. FOOD BOWL ============
const BOWL_POS = new THREE.Vector3(1.3, 0, -0.8);
const MAX_FOOD = 5;
let foodCount = MAX_FOOD;

const bowl = new THREE.Group();
bowl.position.copy(BOWL_POS);
scene.add(bowl);

// The bowl itself (a cylinder that's wider at the top)
const bowlMesh = new THREE.Mesh(
  new THREE.CylinderGeometry(0.22, 0.17, 0.1, 24),
  new THREE.MeshStandardMaterial({ color: '#6fb3e0' })
);
bowlMesh.position.y = 0.1;
bowlMesh.castShadow = true;
bowl.add(bowlMesh);

// Food pellets (little brown balls on top)
const pellets = [];
const pelletMat = new THREE.MeshStandardMaterial({ color: '#a0682f' });
for (let i = 0; i < MAX_FOOD; i++) {
  const pellet = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), pelletMat);
  const angle = (i / MAX_FOOD) * Math.PI * 2;
  pellet.position.set(Math.cos(angle) * 0.09, 0.17, Math.sin(angle) * 0.09);
  bowl.add(pellet);
  pellets.push(pellet);
}

function showPellets() {
  pellets.forEach((p, i) => (p.visible = i < foodCount));
}

function refillFood() {
  foodCount = MAX_FOOD;
  showPellets();
}

// The spot where the hamster stands to eat (in front of the bowl, toward the cage centre)
const EAT_SPOT = BOWL_POS.clone().add(
  new THREE.Vector3(0, 0, 0).sub(BOWL_POS).setY(0).normalize().multiplyScalar(0.45)
);

// ============ 7. HAMSTER ============
const SIZE = 0.6;
let hamster = null;
new GLTFLoader().load(
  'models/hamster.glb',
  (gltf) => {
    hamster = gltf.scene;
    hamster.scale.setScalar(SIZE);
    hamster.position.y = GROUND_Y;
    hamster.traverse((p) => { if (p.isMesh) p.castShadow = true; });
    scene.add(hamster);
  },
  undefined,
  (err) => console.error('Could not load hamster.glb', err)
);

// ============ 8. HAMSTER BRAIN ============
// Moods: 'rest' | 'walk' | 'goEat' | 'eat' | 'held' | 'fall'
const HUNGER_DRAIN = 4;     // hunger lost per second (fast, so you can test)
const HUNGRY_BELOW = 40;    // goes to eat when hunger is under this

const brain = {
  mood: 'rest',
  timer: 1,
  target: new THREE.Vector3(),
  speed: 0.6,
  fallSpeed: 0,
  hunger: 100               // 100 = full, 0 = starving
};

const isHungry = () => brain.hunger < HUNGRY_BELOW;

function pickRandomSpot() {
  const m = 0.4;
  brain.target.set(
    THREE.MathUtils.randFloat(-CAGE_W / 2 + m, CAGE_W / 2 - m), 0,
    THREE.MathUtils.randFloat(-CAGE_D / 2 + m, CAGE_D / 2 - m)
  );
}

function turnToward(current, target, amount) {
  let diff = target - current;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  return current + diff * amount;
}

function startResting(seconds) {
  brain.mood = 'rest';
  brain.timer = seconds;
}

// Walk toward a point with a waddle. Returns true when it arrives.
function walkTo(target, dt, time) {
  const toTarget = target.clone().sub(hamster.position);
  toTarget.y = 0;
  if (toTarget.length() < 0.05) return true;

  hamster.rotation.y = turnToward(hamster.rotation.y, Math.atan2(toTarget.x, toTarget.z), 0.1);
  toTarget.normalize();
  hamster.position.x += toTarget.x * brain.speed * dt;
  hamster.position.z += toTarget.z * brain.speed * dt;
  hamster.position.y = GROUND_Y + Math.abs(Math.sin(time * 14)) * 0.03;
  hamster.rotation.z = Math.sin(time * 14) * 0.08;
  hamster.rotation.x = 0;
  hamster.scale.y = SIZE;
  return false;
}

function updateHamster(dt, time) {
  if (!hamster) return;

  // Hunger always goes down slowly
  brain.hunger = Math.max(0, brain.hunger - HUNGER_DRAIN * dt);

  // ---- REST ----
  if (brain.mood === 'rest') {
    hamster.scale.y = SIZE * (1 + Math.sin(time * 3) * 0.03);
    hamster.position.y = GROUND_Y;
    hamster.rotation.z = 0;
    hamster.rotation.x = 0;
    brain.timer -= dt;
    if (brain.timer <= 0) {
      if (isHungry() && foodCount > 0) {
        brain.mood = 'goEat';
      } else {
        pickRandomSpot();
        brain.mood = 'walk';
      }
    }
  }

  // ---- WALK (wander) ----
  else if (brain.mood === 'walk') {
    if (isHungry() && foodCount > 0) {          // tummy rumbles → go to food
      brain.mood = 'goEat';
      return;
    }
    if (walkTo(brain.target, dt, time)) {
      startResting(THREE.MathUtils.randFloat(1, 4));
    }
  }

  // ---- GO EAT (walk to the bowl) ----
  else if (brain.mood === 'goEat') {
    if (foodCount === 0) {                      // food gone while walking
      startResting(2);
      return;
    }
    if (walkTo(EAT_SPOT, dt, time)) {
      brain.mood = 'eat';
      brain.timer = 1;                          // 1 second per bite
    }
  }

  // ---- EAT (nod and munch) ----
  else if (brain.mood === 'eat') {
    // Face the bowl
    const toBowl = BOWL_POS.clone().sub(hamster.position);
    hamster.rotation.y = turnToward(hamster.rotation.y, Math.atan2(toBowl.x, toBowl.z), 0.15);
    // Nod head down and up (munch munch)
    hamster.rotation.x = Math.abs(Math.sin(time * 10)) * 0.2;
    hamster.rotation.z = 0;
    hamster.position.y = GROUND_Y;

    brain.timer -= dt;
    if (brain.timer <= 0) {
      if (foodCount > 0) {
        foodCount--;                            // eat one pellet
        showPellets();
        brain.hunger = Math.min(100, brain.hunger + 20);
      }
      brain.timer = 1;
      if (brain.hunger >= 100 || foodCount === 0) {
        startResting(2);                        // full (or bowl empty)
      }
    }
  }

  // ---- HELD ----
  else if (brain.mood === 'held') {
    hamster.position.lerp(dragPoint, 0.25);
    hamster.rotation.z = Math.sin(time * 30) * 0.15;
    hamster.rotation.x = -0.2;
    hamster.scale.y = SIZE * 1.08;
  }

  // ---- FALL ----
  else if (brain.mood === 'fall') {
    brain.fallSpeed -= 9.8 * dt;
    hamster.position.y += brain.fallSpeed * dt;
    hamster.rotation.z *= 0.9;
    hamster.rotation.x *= 0.9;
    if (hamster.position.y <= GROUND_Y) {
      hamster.position.y = GROUND_Y;
      if (brain.fallSpeed < -1) {
        brain.fallSpeed = -brain.fallSpeed * 0.3;
        hamster.scale.y = SIZE * 0.8;
      } else {
        startResting(1.5);
      }
    }
  }
}

// ============ 9. UI (hunger bar + button) ============
const ui = document.createElement('div');
ui.style.cssText = `
  position: fixed; top: 16px; left: 16px; padding: 14px 16px;
  background: white; border-radius: 14px; font-family: sans-serif;
  box-shadow: 0 4px 14px rgba(0,0,0,0.12); width: 220px; user-select: none;
`;
ui.innerHTML = `
  <div style="font-weight:bold; margin-bottom:6px;">🐹 Hammy <span id="moodIcon"></span></div>
  <div style="font-size:13px; margin-bottom:4px;">Hunger</div>
  <div style="background:#eee; border-radius:8px; height:14px; overflow:hidden;">
    <div id="hungerFill" style="height:100%; width:100%; background:#6cc070;"></div>
  </div>
  <div id="foodText" style="font-size:13px; margin:8px 0;">Food in bowl: 5</div>
  <button id="feedBtn" style="width:100%; padding:8px; border:none; border-radius:8px;
          background:#f4a261; color:white; font-weight:bold; cursor:pointer;">
    🥣 Refill food
  </button>
`;
document.body.appendChild(ui);

const hungerFill = document.getElementById('hungerFill');
const foodText = document.getElementById('foodText');
const moodIcon = document.getElementById('moodIcon');
document.getElementById('feedBtn').addEventListener('click', refillFood);

const MOOD_ICONS = { rest: '😌', walk: '🐾', goEat: '🤤', eat: '😋', held: '😲', fall: '😵' };

function updateUI() {
  const h = brain.hunger;
  hungerFill.style.width = h + '%';
  hungerFill.style.background = h > 60 ? '#6cc070' : h > 30 ? '#f2b84b' : '#e5604f';
  foodText.textContent = 'Food in bowl: ' + foodCount;
  moodIcon.textContent = (isHungry() && foodCount === 0 && brain.mood === 'rest')
    ? '😢' : MOOD_ICONS[brain.mood];
}

// ============ 10. MOUSE: PICK UP & DROP ============
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const HOLD_HEIGHT = 0.9;
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -HOLD_HEIGHT);
const dragPoint = new THREE.Vector3();
const canvas = renderer.domElement;

function updateMouse(event) {
  mouse.x = (event.clientX / innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
}

function isMouseOverHamster() {
  return hamster && raycaster.intersectObject(hamster, true).length > 0;
}

function updateDragPoint() {
  raycaster.ray.intersectPlane(dragPlane, dragPoint);
  const m = 0.3;
  dragPoint.x = THREE.MathUtils.clamp(dragPoint.x, -CAGE_W / 2 + m, CAGE_W / 2 - m);
  dragPoint.z = THREE.MathUtils.clamp(dragPoint.z, -CAGE_D / 2 + m, CAGE_D / 2 - m);
  dragPoint.y = HOLD_HEIGHT;
}

canvas.addEventListener('pointerdown', (event) => {
  updateMouse(event);
  if (isMouseOverHamster()) {
    brain.mood = 'held';
    controls.enabled = false;
    canvas.style.cursor = 'grabbing';
    updateDragPoint();
  }
});

canvas.addEventListener('pointermove', (event) => {
  updateMouse(event);
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

// ============ 11. CAMERA CONTROLS ============
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.2, 0);
controls.enableDamping = true;

// ============ 12. GAME LOOP ============
const clock = new THREE.Clock();
function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;
  updateHamster(dt, time);
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