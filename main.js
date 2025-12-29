// Game state
let scene, camera, renderer, clock;
let player = {
    mesh: null,
    velocity: new THREE.Vector3(),
    speed: 3.0,
    jumpStrength: 8,
    isJumping: false,
    coresCollected: 0,
    currentSurface: null,
    gravity: new THREE.Vector3(0, -20, 0)
};

let keys = {};
let mouseMovement = { x: 0, y: 0 };
let rooms = [];
let corridors = [];
let dataCores = [];
let exitPortal = null;
let gameActive = false;
let gameStartTime = 0;
let collapseInterval = 5000; // milliseconds
let lastCollapseTime = 0;
let collapsedRooms = [];

// Initialize the game
function init() {
    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000510);
    scene.fog = new THREE.Fog(0x000510, 50, 200);
    
    // Camera setup (first-person)
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 2, 0);
    
    // Renderer setup
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);
    
    // Clock
    clock = new THREE.Clock();
    
    // Lights
    const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(10, 50, 10);
    scene.add(directionalLight);
    
    // Generate level
    generateLevel();
    
    // Player representation (invisible, just for collision)
    const playerGeometry = new THREE.BoxGeometry(1, 2, 1);
    const playerMaterial = new THREE.MeshBasicMaterial({ visible: false });
    player.mesh = new THREE.Mesh(playerGeometry, playerMaterial);
    player.mesh.position.copy(camera.position);
    scene.add(player.mesh);
    
    // Event listeners
    document.addEventListener('click', () => {
        if (!gameActive) {
            startGame();
        }
    });
    
    window.addEventListener('resize', onWindowResize);
    
    // Start animation loop
    animate();
}

function generateLevel() {
    // Room layout: 3x4 grid with some rooms missing for variety
    const roomSize = 15;
    const corridorWidth = 3;
    const spacing = 25;
    
    const roomPositions = [
        { x: 0, z: 0 },      // 0 - Start
        { x: 1, z: 0 },      // 1
        { x: 2, z: 0 },      // 2
        { x: 0, z: 1 },      // 3
        { x: 1, z: 1 },      // 4 - Center
        { x: 2, z: 1 },      // 5
        { x: 0, z: 2 },      // 6
        { x: 1, z: 2 },      // 7
        { x: 2, z: 2 },      // 8
        { x: 0, z: 3 },      // 9
        { x: 1, z: 3 },      // 10
        { x: 2, z: 3 }       // 11 - Exit
    ];
    
    // Create rooms
    for (let i = 0; i < 12; i++) {
        const pos = roomPositions[i];
        const room = createRoom(
            pos.x * spacing - spacing,
            0,
            pos.z * spacing - spacing,
            roomSize
        );
        room.userData.index = i;
        room.userData.isCollapsed = false;
        rooms.push(room);
        
        // Start room - special color
        if (i === 0) {
            room.children.forEach(child => {
                if (child.material) {
                    child.material.color.setHex(0x003300);
                }
            });
        }
        
        // Exit room - special color
        if (i === 11) {
            room.children.forEach(child => {
                if (child.material) {
                    child.material.color.setHex(0x330033);
                }
            });
        }
    }
    
    // Create corridors connecting adjacent rooms
    const connections = [
        [0, 1], [1, 2], [0, 3], [1, 4], [2, 5],
        [3, 4], [4, 5], [3, 6], [4, 7], [5, 8],
        [6, 7], [7, 8], [6, 9], [7, 10], [8, 11],
        [9, 10], [10, 11]
    ];
    
    for (const [from, to] of connections) {
        const fromPos = roomPositions[from];
        const toPos = roomPositions[to];
        const fromWorld = new THREE.Vector3(fromPos.x * spacing - spacing, 0, fromPos.z * spacing - spacing);
        const toWorld = new THREE.Vector3(toPos.x * spacing - spacing, 0, toPos.z * spacing - spacing);
        
        const corridor = createCorridor(fromWorld, toWorld, corridorWidth);
        corridors.push(corridor);
    }
    
    // Place data cores (not in start or exit room)
    const coreRooms = [2, 4, 6, 9]; // Place cores in these rooms
    for (let i = 0; i < 4; i++) {
        const roomIdx = coreRooms[i];
        const pos = roomPositions[roomIdx];
        const core = createDataCore(
            pos.x * spacing - spacing,
            3,
            pos.z * spacing - spacing
        );
        dataCores.push(core);
    }
    
    // Create exit portal in last room
    const exitPos = roomPositions[11];
    exitPortal = createExitPortal(
        exitPos.x * spacing - spacing,
        3,
        exitPos.z * spacing - spacing
    );
}

function createRoom(x, y, z, size) {
    const room = new THREE.Group();
    room.position.set(x, y, z);
    
    const wallHeight = 8;
    const thickness = 0.5;
    
    // Materials
    const wallMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x222222,
        metalness: 0.3,
        roughness: 0.7
    });
    const floorMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x444444,
        metalness: 0.2,
        roughness: 0.8
    });
    
    // Floor
    const floor = new THREE.Mesh(
        new THREE.BoxGeometry(size, thickness, size),
        floorMaterial
    );
    floor.position.y = 0;
    floor.userData.isSurface = true;
    floor.userData.normal = new THREE.Vector3(0, 1, 0);
    room.add(floor);
    
    // Ceiling
    const ceiling = new THREE.Mesh(
        new THREE.BoxGeometry(size, thickness, size),
        wallMaterial
    );
    ceiling.position.y = wallHeight;
    ceiling.userData.isSurface = true;
    ceiling.userData.normal = new THREE.Vector3(0, -1, 0);
    room.add(ceiling);
    
    // Walls (4 sides)
    // North wall
    const northWall = new THREE.Mesh(
        new THREE.BoxGeometry(size, wallHeight, thickness),
        wallMaterial
    );
    northWall.position.set(0, wallHeight / 2, -size / 2);
    northWall.userData.isSurface = true;
    northWall.userData.normal = new THREE.Vector3(0, 0, 1);
    room.add(northWall);
    
    // South wall
    const southWall = new THREE.Mesh(
        new THREE.BoxGeometry(size, wallHeight, thickness),
        wallMaterial
    );
    southWall.position.set(0, wallHeight / 2, size / 2);
    southWall.userData.isSurface = true;
    southWall.userData.normal = new THREE.Vector3(0, 0, -1);
    room.add(southWall);
    
    // East wall
    const eastWall = new THREE.Mesh(
        new THREE.BoxGeometry(thickness, wallHeight, size),
        wallMaterial
    );
    eastWall.position.set(size / 2, wallHeight / 2, 0);
    eastWall.userData.isSurface = true;
    eastWall.userData.normal = new THREE.Vector3(-1, 0, 0);
    room.add(eastWall);
    
    // West wall
    const westWall = new THREE.Mesh(
        new THREE.BoxGeometry(thickness, wallHeight, size),
        wallMaterial
    );
    westWall.position.set(-size / 2, wallHeight / 2, 0);
    westWall.userData.isSurface = true;
    westWall.userData.normal = new THREE.Vector3(1, 0, 0);
    room.add(westWall);
    
    scene.add(room);
    return room;
}

function createCorridor(from, to, width) {
    const corridor = new THREE.Group();
    
    const direction = new THREE.Vector3().subVectors(to, from);
    const length = direction.length();
    const midpoint = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
    
    const wallHeight = 8;
    const thickness = 0.5;
    
    const material = new THREE.MeshStandardMaterial({ 
        color: 0x333333,
        metalness: 0.3,
        roughness: 0.7
    });
    
    // Floor
    const floor = new THREE.Mesh(
        new THREE.BoxGeometry(length, thickness, width),
        material
    );
    floor.position.copy(midpoint);
    floor.position.y = 0;
    
    // Rotate to align with direction
    const angle = Math.atan2(direction.x, direction.z);
    floor.rotation.y = angle;
    
    floor.userData.isSurface = true;
    floor.userData.normal = new THREE.Vector3(0, 1, 0);
    corridor.add(floor);
    
    scene.add(corridor);
    return corridor;
}

function createDataCore(x, y, z) {
    const geometry = new THREE.SphereGeometry(0.5, 16, 16);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0xffff00,
        emissive: 0xffff00,
        emissiveIntensity: 0.8
    });
    
    const core = new THREE.Mesh(geometry, material);
    core.position.set(x, y, z);
    core.userData.isCore = true;
    core.userData.collected = false;
    
    // Add point light for glow effect
    const light = new THREE.PointLight(0xffff00, 1, 10);
    light.position.copy(core.position);
    scene.add(light);
    core.userData.light = light;
    
    scene.add(core);
    return core;
}

function createExitPortal(x, y, z) {
    const geometry = new THREE.TorusGeometry(2, 0.3, 16, 32);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0x00ffff,
        emissive: 0x00ffff,
        emissiveIntensity: 1
    });
    
    const portal = new THREE.Mesh(geometry, material);
    portal.position.set(x, y, z);
    portal.userData.isPortal = true;
    
    // Add point light
    const light = new THREE.PointLight(0x00ffff, 2, 15);
    light.position.copy(portal.position);
    scene.add(light);
    portal.userData.light = light;
    
    scene.add(portal);
    return portal;
}

function startGame() {
    const instructions = document.getElementById('instructions');
    instructions.classList.add('hidden');
    
    // Pointer lock
    renderer.domElement.requestPointerLock();
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    
    gameActive = true;
    gameStartTime = Date.now();
    lastCollapseTime = gameStartTime;
}

function onMouseMove(event) {
    if (!gameActive) return;
    
    mouseMovement.x += event.movementX * 0.002;
    mouseMovement.y += event.movementY * 0.002;
    
    // Clamp vertical rotation
    mouseMovement.y = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, mouseMovement.y));
}

function onKeyDown(event) {
    keys[event.code] = true;
}

function onKeyUp(event) {
    keys[event.code] = false;
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function updatePlayer(deltaTime) {
    if (!gameActive) return;
    
    // Apply mouse look
    camera.rotation.order = 'YXZ';
    camera.rotation.y = -mouseMovement.x;
    camera.rotation.x = -mouseMovement.y;
    
    // Get forward and right vectors
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0;
    forward.normalize();
    
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    right.y = 0;
    right.normalize();
    
    // Constant forward movement
    player.velocity.x = forward.x * player.speed;
    player.velocity.z = forward.z * player.speed;
    
    // Strafe (A/D or Left/Right)
    if (keys['KeyA'] || keys['ArrowLeft']) {
        player.velocity.x -= right.x * player.speed * 0.7;
        player.velocity.z -= right.z * player.speed * 0.7;
    }
    if (keys['KeyD'] || keys['ArrowRight']) {
        player.velocity.x += right.x * player.speed * 0.7;
        player.velocity.z += right.z * player.speed * 0.7;
    }
    
    // Jump
    if ((keys['Space'] || keys['KeyW'] || keys['ArrowUp']) && !player.isJumping && player.currentSurface) {
        player.velocity.y = player.jumpStrength;
        player.isJumping = true;
    }
    
    // Apply gravity
    if (!player.currentSurface || player.isJumping) {
        player.velocity.add(player.gravity.clone().multiplyScalar(deltaTime));
    } else {
        player.velocity.y = 0;
    }
    
    // Move player
    const movement = player.velocity.clone().multiplyScalar(deltaTime);
    player.mesh.position.add(movement);
    
    // Find nearest surface and snap to it
    findNearestSurface();
    
    // Update camera to follow player
    camera.position.copy(player.mesh.position);
    camera.position.y += 1; // Eye height
    
    // Check for collectibles and portal
    checkCollisions();
    
    // Check if player fell into void
    if (player.mesh.position.y < -50) {
        endGame(false, "You fell into the void!");
    }
}

function findNearestSurface() {
    let nearestSurface = null;
    let nearestDistance = Infinity;
    
    // Check all room surfaces
    for (const room of rooms) {
        if (room.userData.isCollapsed) continue;
        
        for (const child of room.children) {
            if (!child.userData.isSurface) continue;
            
            // Get world position of surface
            const surfaceWorldPos = new THREE.Vector3();
            child.getWorldPosition(surfaceWorldPos);
            
            const distance = player.mesh.position.distanceTo(surfaceWorldPos);
            
            if (distance < nearestDistance && distance < 10) {
                nearestDistance = distance;
                nearestSurface = child;
            }
        }
    }
    
    // Check corridors
    for (const corridor of corridors) {
        for (const child of corridor.children) {
            if (!child.userData.isSurface) continue;
            
            const surfaceWorldPos = new THREE.Vector3();
            child.getWorldPosition(surfaceWorldPos);
            
            const distance = player.mesh.position.distanceTo(surfaceWorldPos);
            
            if (distance < nearestDistance && distance < 10) {
                nearestDistance = distance;
                nearestSurface = child;
            }
        }
    }
    
    if (nearestSurface) {
        player.currentSurface = nearestSurface;
        
        // Snap to surface if close enough
        if (nearestDistance < 3) {
            const surfaceWorldPos = new THREE.Vector3();
            nearestSurface.getWorldPosition(surfaceWorldPos);
            
            const normal = nearestSurface.userData.normal;
            const snapDistance = 1;
            
            // Align player to surface
            player.mesh.position.copy(surfaceWorldPos).add(normal.clone().multiplyScalar(snapDistance));
            
            // Update gravity direction based on surface normal
            player.gravity.copy(normal).multiplyScalar(-20);
            
            if (player.isJumping && player.velocity.y < 0) {
                player.isJumping = false;
            }
        }
    } else {
        player.currentSurface = null;
    }
}

function checkCollisions() {
    // Check data cores
    for (const core of dataCores) {
        if (core.userData.collected) continue;
        
        const distance = player.mesh.position.distanceTo(core.position);
        if (distance < 2) {
            collectCore(core);
        }
    }
    
    // Check exit portal
    if (exitPortal) {
        const distance = player.mesh.position.distanceTo(exitPortal.position);
        if (distance < 3) {
            if (player.coresCollected >= 2) {
                endGame(true, "You escaped the collapsing vault!");
            }
        }
    }
}

function collectCore(core) {
    core.userData.collected = true;
    core.visible = false;
    core.userData.light.intensity = 0;
    
    player.coresCollected++;
    player.speed += 1.5; // Increase speed
    collapseInterval = Math.max(2000, collapseInterval - 1000); // Faster collapse
    
    updateHUD();
}

function updateHUD() {
    document.getElementById('cores-counter').textContent = `Cores: ${player.coresCollected}/2`;
    document.getElementById('speed-indicator').textContent = `Speed: ${(player.speed / 3).toFixed(1)}x`;
    
    if (gameActive) {
        const elapsed = Math.floor((Date.now() - gameStartTime) / 1000);
        document.getElementById('timer').textContent = `Time: ${elapsed}s`;
    }
}

function collapseRandomRoom() {
    // Find rooms that haven't collapsed yet
    const availableRooms = rooms.filter(room => !room.userData.isCollapsed && room.userData.index !== 0);
    
    if (availableRooms.length === 0) return;
    
    // Pick a random room
    const room = availableRooms[Math.floor(Math.random() * availableRooms.length)];
    room.userData.isCollapsed = true;
    room.userData.collapseStartTime = Date.now();
    room.userData.collapsePhase = 'shake'; // shake -> fall
    
    collapsedRooms.push(room);
}

function updateCollapsingRooms() {
    for (const room of collapsedRooms) {
        const elapsed = Date.now() - room.userData.collapseStartTime;
        
        if (room.userData.collapsePhase === 'shake') {
            // Shake for 1 second
            if (elapsed < 1000) {
                const shake = Math.sin(elapsed * 0.05) * 0.3;
                room.position.y = shake;
            } else {
                room.userData.collapsePhase = 'fall';
                room.userData.fallStartY = room.position.y;
            }
        } else if (room.userData.collapsePhase === 'fall') {
            // Fall and rotate
            const fallTime = (elapsed - 1000) / 1000;
            room.position.y = room.userData.fallStartY - fallTime * fallTime * 10;
            room.rotation.x += 0.02;
            room.rotation.z += 0.015;
        }
    }
}

function endGame(won, message) {
    gameActive = false;
    
    const gameOver = document.getElementById('game-over');
    const title = document.getElementById('game-over-title');
    const messageEl = document.getElementById('game-over-message');
    
    if (won) {
        title.textContent = 'YOU ESCAPED!';
        gameOver.classList.add('win');
    } else {
        title.textContent = 'GAME OVER';
        gameOver.classList.remove('win');
    }
    
    messageEl.textContent = message;
    gameOver.classList.remove('hidden');
    
    document.exitPointerLock();
}

function animate() {
    requestAnimationFrame(animate);
    
    const deltaTime = clock.getDelta();
    
    if (gameActive) {
        updatePlayer(deltaTime);
        updateHUD();
        
        // Animate data cores
        for (const core of dataCores) {
            if (!core.userData.collected) {
                core.rotation.y += deltaTime * 2;
                core.position.y += Math.sin(Date.now() * 0.003) * 0.01;
            }
        }
        
        // Animate exit portal
        if (exitPortal) {
            exitPortal.rotation.y += deltaTime;
            exitPortal.rotation.x = Math.sin(Date.now() * 0.001) * 0.2;
        }
        
        // Check if it's time to collapse a room
        if (Date.now() - lastCollapseTime > collapseInterval) {
            collapseRandomRoom();
            lastCollapseTime = Date.now();
        }
        
        // Update collapsing rooms
        updateCollapsingRooms();
    }
    
    renderer.render(scene, camera);
}

// Start the game
init();
