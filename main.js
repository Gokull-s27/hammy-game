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
const CAGE_W = 4;   // width  (left-right)
const CAGE_D = 3;   // depth  (front-back)
const WALL_H = 0.6; // wall height

// Room floor
const room = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.MeshStandardMaterial({ color: '#f3e3cc' })
);
room.rotation.x = -Math.PI / 2;
room.receiveShadow = true;
scene.add(room);

// Bedding (a thin box inside the cage)
const bedding = new THREE.Mesh(
  new THREE.BoxGeometry(CAGE_W, 0.05, CAGE_D),
  new THREE.MeshStandardMaterial({ color: '#e8c99b' })
);
bedding.position.y = 0.025;
bedding.receiveShadow = true;
scene.add(bedding);

// Clear plastic walls
const wallMat = new THREE.MeshStandardMaterial({
  color: '#bfe6ff', transparent: true, opacity: 0.35
});
function addWall(w, d, x, z) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_H, d), wallMat);
  wall.position.set(x, WALL_H / 2, z);
  scene.add(wall);
}
addWall(CAGE_W, 0.05, 0, -CAGE_D / 2); // back
addWall(CAGE_W, 0.05, 0,  CAGE_D / 2); // front
addWall(0.05, CAGE_D, -CAGE_W / 2, 0); // left
addWall(0.05, CAGE_D,  CAGE_W / 2, 0); // right

// ============ 6. HAMSTER ============
let hamster = null;
new GLTFLoader().load(
  'models/hamster.glb',
  (gltf) => {
    hamster = gltf.scene;
    hamster.scale.setScalar(0.6); // make it hamster-sized for this cage
    hamster.traverse((p) => { if (p.isMesh) p.castShadow = true; });
    scene.add(hamster);
    console.log('Hamster loaded! 🐹');
  },
  undefined,
  (err) => console.error('Could not load hamster.glb', err)
);

// ============ 7. HAMSTER BRAIN (state machine) ============
// The hamster is always in ONE mood: 'rest' or 'walk'
const brain = {
  mood: 'rest',
  timer: 1,                        // seconds left to rest
  target: new THREE.Vector3(),     // where it wants to walk
  speed: 0.6                       // walking speed (units per second)
};

// Pick a random spot inside the cage (keep away from the walls)
function pickRandomSpot() {
  const margin = 0.4;
  brain.target.set(
    THREE.MathUtils.randFloat(-CAGE_W / 2 + margin, CAGE_W / 2 - margin),
    0,
    THREE.MathUtils.randFloat(-CAGE_D / 2 + margin, CAGE_D / 2 - margin)
  );
}

// Turn smoothly toward an angle (always the short way round)
function turnToward(current, target, amount) {
  let diff = target - current;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  return current + diff * amount;
}

function updateHamster(dt, time) {
  if (!hamster) return;

  if (brain.mood === 'rest') {
    // Breathing: gently grow and shrink
    hamster.scale.y = 0.6 * (1 + Math.sin(time * 3) * 0.03);
    hamster.position.y = 0.05;
    hamster.rotation.z = 0;

    brain.timer -= dt;
    if (brain.timer <= 0) {
      pickRandomSpot();
      brain.mood = 'walk';
    }
  }

  else if (brain.mood === 'walk') {
    const toTarget = brain.target.clone().sub(hamster.position);
    toTarget.y = 0;
    const distance = toTarget.length();

    if (distance < 0.05) {
      // Arrived! Rest for 1–4 seconds
      brain.mood = 'rest';
      brain.timer = THREE.MathUtils.randFloat(1, 4);
      return;
    }

    // Face the target (the model faces +Z, so use atan2(x, z))
    const wantAngle = Math.atan2(toTarget.x, toTarget.z);
    hamster.rotation.y = turnToward(hamster.rotation.y, wantAngle, 0.1);

    // Step forward
    toTarget.normalize();
    hamster.position.x += toTarget.x * brain.speed * dt;
    hamster.position.z += toTarget.z * brain.speed * dt;

    // Waddle: little hops + side-to-side sway
    hamster.position.y = 0.05 + Math.abs(Math.sin(time * 14)) * 0.03;
    hamster.rotation.z = Math.sin(time * 14) * 0.08;
    hamster.scale.y = 0.6;
  }
}

// ============ 8. MOUSE CONTROLS ============
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.2, 0);
controls.enableDamping = true;

// ============ 9. GAME LOOP ============
const clock = new THREE.Clock();
function animate() {
  const dt = Math.min(clock.getDelta(), 0.05); // time since last frame (seconds)
  const time = clock.elapsedTime;              // total time since start

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