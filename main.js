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
const GROUND_Y = 0.05; // hamster's feet height when standing on the bedding

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

// ============ 6. HAMSTER ============
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
    console.log('Hamster loaded! 🐹');
  },
  undefined,
  (err) => console.error('Could not load hamster.glb', err)
);

// ============ 7. HAMSTER BRAIN ============
// Moods: 'rest' | 'walk' | 'held' | 'fall'
const brain = {
  mood: 'rest',
  timer: 1,
  target: new THREE.Vector3(),
  speed: 0.6,
  fallSpeed: 0          // how fast it's falling (used in 'fall')
};

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

function updateHamster(dt, time) {
  if (!hamster) return;

  // ---- REST: breathe, then go walking ----
  if (brain.mood === 'rest') {
    hamster.scale.y = SIZE * (1 + Math.sin(time * 3) * 0.03);
    hamster.position.y = GROUND_Y;
    hamster.rotation.z = 0;
    hamster.rotation.x = 0;
    brain.timer -= dt;
    if (brain.timer <= 0) {
      pickRandomSpot();
      brain.mood = 'walk';
    }
  }

  // ---- WALK: go to the target with a waddle ----
  else if (brain.mood === 'walk') {
    const toTarget = brain.target.clone().sub(hamster.position);
    toTarget.y = 0;
    if (toTarget.length() < 0.05) {
      startResting(THREE.MathUtils.randFloat(1, 4));
      return;
    }
    hamster.rotation.y = turnToward(hamster.rotation.y, Math.atan2(toTarget.x, toTarget.z), 0.1);
    toTarget.normalize();
    hamster.position.x += toTarget.x * brain.speed * dt;
    hamster.position.z += toTarget.z * brain.speed * dt;
    hamster.position.y = GROUND_Y + Math.abs(Math.sin(time * 14)) * 0.03;
    hamster.rotation.z = Math.sin(time * 14) * 0.08;
    hamster.scale.y = SIZE;
  }

  // ---- HELD: follow the mouse in the air, wiggle ----
  else if (brain.mood === 'held') {
    hamster.position.lerp(dragPoint, 0.25);            // glide toward the mouse
    hamster.rotation.z = Math.sin(time * 30) * 0.15;   // wiggle wiggle
    hamster.rotation.x = -0.2;                         // tilt a little, like being held
    hamster.scale.y = SIZE * 1.08;                     // stretched when lifted
  }

  // ---- FALL: gravity + a small bounce ----
  else if (brain.mood === 'fall') {
    brain.fallSpeed -= 9.8 * dt;                       // gravity pulls down
    hamster.position.y += brain.fallSpeed * dt;
    hamster.rotation.z *= 0.9;
    hamster.rotation.x *= 0.9;

    if (hamster.position.y <= GROUND_Y) {              // hit the floor
      hamster.position.y = GROUND_Y;
      if (brain.fallSpeed < -1) {
        brain.fallSpeed = -brain.fallSpeed * 0.3;      // bounce!
        hamster.scale.y = SIZE * 0.8;                  // squash on landing
      } else {
        startResting(1.5);                             // a little dizzy, rest
      }
    }
  }
}

// ============ 8. MOUSE: PICK UP & DROP ============
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const HOLD_HEIGHT = 0.9;                                                // how high it's lifted
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -HOLD_HEIGHT); // invisible floor in the air
const dragPoint = new THREE.Vector3();

// Convert the mouse position to the -1..+1 range three.js uses
function updateMouse(event) {
  mouse.x = (event.clientX / innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
}

// Shoot an invisible laser from the camera through the mouse: did it hit the hamster?
function isMouseOverHamster() {
  return hamster && raycaster.intersectObject(hamster, true).length > 0;
}

// Where the mouse points on the invisible "air floor", kept inside the cage
function updateDragPoint() {
  raycaster.ray.intersectPlane(dragPlane, dragPoint);
  const m = 0.3;
  dragPoint.x = THREE.MathUtils.clamp(dragPoint.x, -CAGE_W / 2 + m, CAGE_W / 2 - m);
  dragPoint.z = THREE.MathUtils.clamp(dragPoint.z, -CAGE_D / 2 + m, CAGE_D / 2 - m);
  dragPoint.y = HOLD_HEIGHT;
}

const canvas = renderer.domElement;

canvas.addEventListener('pointerdown', (event) => {
  updateMouse(event);
  if (isMouseOverHamster()) {
    brain.mood = 'held';
    controls.enabled = false;       // stop the camera rotating while carrying
    canvas.style.cursor = 'grabbing';
    updateDragPoint();
  }
});

canvas.addEventListener('pointermove', (event) => {
  updateMouse(event);
  if (brain.mood === 'held') {
    updateDragPoint();
  } else {
    canvas.style.cursor = isMouseOverHamster() ? 'grab' : 'default';
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

// ============ 9. CAMERA CONTROLS ============
// (created AFTER our mouse code so our click is checked first)
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.2, 0);
controls.enableDamping = true;

// ============ 10. GAME LOOP ============
const clock = new THREE.Clock();
function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;
  updateHamster(dt, time);
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