import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

// --- Configuration ---
const SCENE_CONFIG = {
    backgroundColor: 0xa0a0a0,
    fogColor: 0xa0a0a0,
    groundColor: 0x999999,
};

// --- Globals ---
let camera, scene, renderer, clock;
let characterMixer;
let characterActions = {};
let activeAction, previousAction;
let playerGroup; // Container for the animated character
let moveState = { forward: false, backward: false, left: false, right: false };

init();
animate();

function init() {
    // 1. Setup Scene
    const container = document.createElement('div');
    document.body.appendChild(container);

    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 2000);
    camera.position.set(0, 200, 400);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(SCENE_CONFIG.backgroundColor);
    scene.fog = new THREE.Fog(SCENE_CONFIG.fogColor, 200, 1000);

    clock = new THREE.Clock();

    // 2. Lighting
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 3);
    hemiLight.position.set(0, 200, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 3);
    dirLight.position.set(0, 200, 100);
    dirLight.castShadow = true;
    dirLight.shadow.camera.top = 180;
    dirLight.shadow.camera.bottom = -100;
    dirLight.shadow.camera.left = -120;
    dirLight.shadow.camera.right = 120;
    scene.add(dirLight);

    // 3. Ground
    const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(2000, 2000),
        new THREE.MeshPhongMaterial({ color: SCENE_CONFIG.groundColor, depthWrite: false })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    scene.add(mesh);

    const grid = new THREE.GridHelper(2000, 20, 0x000000, 0x000000);
    grid.material.opacity = 0.2;
    grid.material.transparent = true;
    scene.add(grid);

    // 4. Load Assets
    loadAssets();

    // 5. Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    // 6. Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 100, 0);
    controls.update();

    // 7. Inputs
    window.addEventListener('resize', onWindowResize);
    document.addEventListener('keydown', (e) => onKey(e, true));
    document.addEventListener('keyup', (e) => onKey(e, false));
}

function loadAssets() {
    const loadingEl = document.getElementById('loading');
    const manager = new THREE.LoadingManager();
    
    manager.onLoad = function () {
        loadingEl.style.display = 'none';
        console.log('All assets loaded');
    };

    manager.onError = function (url) {
        console.error('There was an error loading ' + url);
        loadingEl.textContent = 'Error loading assets. Check console.';
    };

    // --- Load Animated Character (FBX) ---
    const fbxLoader = new FBXLoader(manager);
    
    // Load Idle (Base Model + Animation)
    fbxLoader.load('/idle.fbx', (object) => {
        characterMixer = new THREE.AnimationMixer(object);
        
        // Setup Action: Idle
        const idleAction = characterMixer.clipAction(object.animations[0]);
        characterActions['idle'] = idleAction;
        activeAction = idleAction;
        idleAction.play();

        object.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        // Set up player group
        playerGroup = new THREE.Group();
        playerGroup.add(object);
        playerGroup.position.set(-50, 0, 0); // Position to left
        scene.add(playerGroup);

        // Load Walk (Animation only)
        fbxLoader.load('/walk.fbx', (walkObject) => {
            // Create an action for the walk animation on the existing mixer
            const walkAction = characterMixer.clipAction(walkObject.animations[0]);
            characterActions['walk'] = walkAction;
            console.log("Walk animation loaded");
        });

    }, undefined, (e) => console.error(e));

    // --- Load Static OBJ Reference ---
    const objLoader = new OBJLoader(manager);
    objLoader.load('/character.obj', (object) => {
        object.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                // Give it a generic material since OBJ doesn't imply one without MTL
                child.material = new THREE.MeshStandardMaterial({ 
                    color: 0x88ccff, 
                    roughness: 0.7,
                    metalness: 0.1
                });
            }
        });
        
        // Scale normalize roughly (assuming character is ~1.8m or 180 units)
        // We'll trust the import scale for now, but might need adjustment.
        // Usually raw OBJs are huge or tiny.
        
        // Auto-centering and basic scaling if needed could go here, 
        // but let's see it raw first as requested.
        
        object.position.set(50, 0, 0); // Position to right
        scene.add(object);
    });
}

function onKey(event, pressed) {
    switch (event.code) {
        case 'ArrowUp':
        case 'KeyW': moveState.forward = pressed; break;
        case 'ArrowDown':
        case 'KeyS': moveState.backward = pressed; break;
        case 'ArrowLeft':
        case 'KeyA': moveState.left = pressed; break;
        case 'ArrowRight':
        case 'KeyD': moveState.right = pressed; break;
    }
}

function updateMovement(delta) {
    if (!playerGroup || !characterActions['walk'] || !characterActions['idle']) return;

    const moveSpeed = 200;
    const rotateSpeed = 2.5;
    let isMoving = false;

    // Rotation
    if (moveState.left) {
        playerGroup.rotation.y += rotateSpeed * delta;
        isMoving = true;
    }
    if (moveState.right) {
        playerGroup.rotation.y -= rotateSpeed * delta;
        isMoving = true;
    }

    // Translation
    if (moveState.forward) {
        playerGroup.translateZ(moveSpeed * delta);
        isMoving = true;
    }
    if (moveState.backward) {
        playerGroup.translateZ(-moveSpeed * delta);
        isMoving = true;
    }

    // Animation State Machine
    const desiredAction = isMoving || moveState.forward || moveState.backward ? characterActions['walk'] : characterActions['idle'];

    if (activeAction !== desiredAction) {
        previousAction = activeAction;
        activeAction = desiredAction;

        previousAction.fadeOut(0.2);
        activeAction.reset().fadeIn(0.2).play();
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    if (characterMixer) characterMixer.update(delta);
    
    updateMovement(delta);

    renderer.render(scene, camera);
}

