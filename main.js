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

// Movement constants
const FORWARD_SPEED_MODIFIER = 0.5;  // Speed boost when pressing W
const STRAFE_SPEED_MODIFIER = 0.7;   // Strafe speed multiplier for A/D

let keys = {};
let mouseMovement = { x: 0, y: 0 };
let rooms = [];
let corridors = [];
let dataCores = [];
let exitPortal = null;
let gameActive = false;
let gameStartTime = 0;
let collapsedRooms = [];
let collapsedCorridors = [];
let debrisParticles = []; // Visual debris from collapse

// Map movement state
let mapDrift = {
    offset: new THREE.Vector3(0, 0, 0),
    velocity: new THREE.Vector3(0, 0, 0),
    swayTime: 0
};

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
    const ambientLight = new THREE.AmbientLight(0x404040, 0.4);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(10, 50, 10);
    scene.add(directionalLight);
    
    // Add dramatic spotlights along the path
    for (let i = 0; i < 5; i++) {
        const spotLight = new THREE.SpotLight(0xff6600, 0.8, 100, Math.PI / 6, 0.5, 2);
        spotLight.position.set(0, 30, i * 125);
        spotLight.target.position.set(0, 0, i * 125);
        scene.add(spotLight);
        scene.add(spotLight.target);
    }
    
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
    // Linear progressive map - long forward path
    const roomSize = 15;
    const corridorWidth = 3;
    const spacing = 25;
    const numRooms = 25; // Extended path for running through
    
    // Create a winding path forward with some lateral variation
    const roomPositions = [];
    for (let i = 0; i < numRooms; i++) {
        // Primary forward movement (z-axis)
        const z = i;
        // Add slight lateral variation for visual interest
        const x = Math.floor(Math.sin(i * 0.5) * 1.5);
        roomPositions.push({ x, z });
    }
    
    // Create rooms
    for (let i = 0; i < numRooms; i++) {
        const pos = roomPositions[i];
        const room = createRoom(
            pos.x * spacing,
            0,
            pos.z * spacing,
            roomSize
        );
        room.userData.index = i;
        room.userData.isCollapsed = false;
        rooms.push(room);
        
        // Start room - green glow
        if (i === 0) {
            room.children.forEach(child => {
                if (child.material) {
                    child.material.color.setHex(0x003300);
                    child.material.emissive = new THREE.Color(0x002200);
                    child.material.emissiveIntensity = 0.3;
                }
            });
        }
        
        // Exit room - purple glow at the end
        if (i === numRooms - 1) {
            room.children.forEach(child => {
                if (child.material) {
                    child.material.color.setHex(0x330033);
                    child.material.emissive = new THREE.Color(0x220022);
                    child.material.emissiveIntensity = 0.3;
                }
            });
        }
        
        // Mid-path rooms - subtle color variation for visual interest
        if (i > 0 && i < numRooms - 1) {
            const colorVariation = Math.floor(i / 5) % 3;
            room.children.forEach(child => {
                if (child.material) {
                    if (colorVariation === 0) {
                        child.material.color.setHex(0x222233);
                    } else if (colorVariation === 1) {
                        child.material.color.setHex(0x332222);
                    } else {
                        child.material.color.setHex(0x223322);
                    }
                }
            });
        }
    }
    
    // Create corridors connecting sequential rooms
    const connections = [];
    for (let i = 0; i < numRooms - 1; i++) {
        connections.push([i, i + 1]);
    }
    
    for (const [from, to] of connections) {
        const fromPos = roomPositions[from];
        const toPos = roomPositions[to];
        const fromWorld = new THREE.Vector3(fromPos.x * spacing, 0, fromPos.z * spacing);
        const toWorld = new THREE.Vector3(toPos.x * spacing, 0, toPos.z * spacing);
        
        const corridor = createCorridor(fromWorld, toWorld, corridorWidth);
        corridor.userData.connectedRooms = [from, to];
        corridor.userData.isCollapsed = false;
        corridors.push(corridor);
    }
    
    // Place data cores along the path (every 6 rooms)
    for (let i = 5; i < numRooms - 2; i += 6) {
        const pos = roomPositions[i];
        const core = createDataCore(
            pos.x * spacing,
            3,
            pos.z * spacing
        );
        dataCores.push(core);
    }
    
    // Create exit portal in last room
    const exitPos = roomPositions[numRooms - 1];
    exitPortal = createExitPortal(
        exitPos.x * spacing,
        3,
        exitPos.z * spacing
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
    
    // Forward/Backward movement (W/S)
    if (keys['KeyW'] || keys['ArrowUp']) {
        player.velocity.x += forward.x * player.speed * FORWARD_SPEED_MODIFIER;
        player.velocity.z += forward.z * player.speed * FORWARD_SPEED_MODIFIER;
    }
    if (keys['KeyS'] || keys['ArrowDown']) {
        player.velocity.x -= forward.x * player.speed * FORWARD_SPEED_MODIFIER;
        player.velocity.z -= forward.z * player.speed * FORWARD_SPEED_MODIFIER;
    }
    
    // Strafe (A/D or Left/Right)
    if (keys['KeyA'] || keys['ArrowLeft']) {
        player.velocity.x -= right.x * player.speed * STRAFE_SPEED_MODIFIER;
        player.velocity.z -= right.z * player.speed * STRAFE_SPEED_MODIFIER;
    }
    if (keys['KeyD'] || keys['ArrowRight']) {
        player.velocity.x += right.x * player.speed * STRAFE_SPEED_MODIFIER;
        player.velocity.z += right.z * player.speed * STRAFE_SPEED_MODIFIER;
    }
    
    // Jump
    if (keys['Space'] && !player.isJumping && player.currentSurface) {
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
        if (corridor.userData.isCollapsed) continue;
        
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
            endGame(true, "You escaped! The vault collapsed behind you!");
        }
    }
}

function collectCore(core) {
    core.userData.collected = true;
    core.visible = false;
    core.userData.light.intensity = 0;
    
    player.coresCollected++;
    player.speed += 1.5; // Increase speed
    
    updateHUD();
}

function updateHUD() {
    // Calculate progress through the map
    const spacing = 25;
    const totalRooms = 25;
    const currentRoomIndex = Math.floor(player.mesh.position.z / spacing);
    const progress = Math.min(100, Math.floor((currentRoomIndex / totalRooms) * 100));
    
    document.getElementById('cores-counter').textContent = `Progress: ${progress}%`;
    document.getElementById('speed-indicator').textContent = `Speed: ${(player.speed / 3).toFixed(1)}x`;
    
    if (gameActive) {
        const elapsed = Math.floor((Date.now() - gameStartTime) / 1000);
        document.getElementById('timer').textContent = `Time: ${elapsed}s`;
    }
}

function collapseRoomsBehindPlayer() {
    // Calculate which room the player is currently in based on Z position
    const playerZ = player.mesh.position.z;
    const spacing = 25;
    const currentRoomIndex = Math.floor(playerZ / spacing);
    
    // Collapse rooms that are more than 3 rooms behind the player
    const collapseThreshold = currentRoomIndex - 3;
    
    for (const room of rooms) {
        if (room.userData.isCollapsed) continue;
        
        const roomIndex = room.userData.index;
        
        // Collapse rooms behind the threshold
        if (roomIndex < collapseThreshold && roomIndex > 0) {
            room.userData.isCollapsed = true;
            room.userData.collapseStartTime = Date.now();
            room.userData.collapsePhase = 'shake';
            room.userData.rotationVelocity = new THREE.Vector3(
                (Math.random() - 0.5) * 0.04,
                (Math.random() - 0.5) * 0.02,
                (Math.random() - 0.5) * 0.04
            );
            
            collapsedRooms.push(room);
            
            // Create debris particles for visual effect
            createDebrisEffect(room.position);
            
            // Collapse connected corridors
            collapseConnectedCorridors(roomIndex);
        }
    }
}

function createDebrisEffect(position) {
    // Create 10-15 small debris particles
    const numParticles = 10 + Math.floor(Math.random() * 6);
    
    for (let i = 0; i < numParticles; i++) {
        const size = 0.2 + Math.random() * 0.5;
        const geometry = new THREE.BoxGeometry(size, size, size);
        const material = new THREE.MeshStandardMaterial({
            color: 0x444444,
            metalness: 0.3,
            roughness: 0.7
        });
        
        const particle = new THREE.Mesh(geometry, material);
        particle.position.copy(position);
        particle.position.x += (Math.random() - 0.5) * 10;
        particle.position.y += Math.random() * 5;
        particle.position.z += (Math.random() - 0.5) * 10;
        
        particle.userData.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 5,
            Math.random() * 3 - 1,
            (Math.random() - 0.5) * 5
        );
        particle.userData.rotationSpeed = new THREE.Vector3(
            (Math.random() - 0.5) * 0.1,
            (Math.random() - 0.5) * 0.1,
            (Math.random() - 0.5) * 0.1
        );
        particle.userData.lifetime = 3000; // 3 seconds
        particle.userData.spawnTime = Date.now();
        
        scene.add(particle);
        debrisParticles.push(particle);
    }
}

function updateDebrisParticles(deltaTime) {
    const gravity = -15;
    const currentTime = Date.now();
    
    for (let i = debrisParticles.length - 1; i >= 0; i--) {
        const particle = debrisParticles[i];
        const age = currentTime - particle.userData.spawnTime;
        
        // Remove old particles
        if (age > particle.userData.lifetime) {
            scene.remove(particle);
            debrisParticles.splice(i, 1);
            continue;
        }
        
        // Update physics
        particle.userData.velocity.y += gravity * deltaTime;
        particle.position.add(particle.userData.velocity.clone().multiplyScalar(deltaTime));
        
        // Rotation
        particle.rotation.x += particle.userData.rotationSpeed.x;
        particle.rotation.y += particle.userData.rotationSpeed.y;
        particle.rotation.z += particle.userData.rotationSpeed.z;
        
        // Fade out
        const fadeProgress = age / particle.userData.lifetime;
        particle.material.opacity = 1 - fadeProgress;
        particle.material.transparent = true;
    }
}

function collapseConnectedCorridors(roomIndex) {
    for (const corridor of corridors) {
        if (corridor.userData.isCollapsed) continue;
        
        // Check if this corridor connects to the collapsed room
        if (corridor.userData.connectedRooms.includes(roomIndex)) {
            // Check if both connected rooms are collapsed
            const [room1, room2] = corridor.userData.connectedRooms;
            const room1Collapsed = rooms[room1].userData.isCollapsed;
            const room2Collapsed = rooms[room2].userData.isCollapsed;
            
            // Corridor collapses when either connected room collapses
            if (room1Collapsed || room2Collapsed) {
                corridor.userData.isCollapsed = true;
                corridor.userData.collapseStartTime = Date.now();
                corridor.userData.collapsePhase = 'shake';
                corridor.userData.rotationVelocity = new THREE.Vector3(
                    (Math.random() - 0.5) * 0.06,
                    (Math.random() - 0.5) * 0.03,
                    (Math.random() - 0.5) * 0.06
                );
                collapsedCorridors.push(corridor);
            }
        }
    }
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
            // Fall with acceleration and rotation
            const fallTime = (elapsed - 1000) / 1000;
            room.position.y = room.userData.fallStartY - fallTime * fallTime * 10;
            
            // Apply rotational velocity with acceleration
            room.rotation.x += room.userData.rotationVelocity.x * fallTime;
            room.rotation.y += room.userData.rotationVelocity.y * fallTime;
            room.rotation.z += room.userData.rotationVelocity.z * fallTime;
        }
    }
}

function updateCollapsingCorridors() {
    for (const corridor of collapsedCorridors) {
        const elapsed = Date.now() - corridor.userData.collapseStartTime;
        
        if (corridor.userData.collapsePhase === 'shake') {
            // Shake for 0.5 seconds (faster than rooms)
            if (elapsed < 500) {
                const shake = Math.sin(elapsed * 0.08) * 0.2;
                corridor.position.y = shake;
            } else {
                corridor.userData.collapsePhase = 'fall';
                corridor.userData.fallStartY = corridor.position.y;
            }
        } else if (corridor.userData.collapsePhase === 'fall') {
            // Fall faster than rooms (they're lighter)
            const fallTime = (elapsed - 500) / 1000;
            corridor.position.y = corridor.userData.fallStartY - fallTime * fallTime * 15;
            
            // Apply rotational velocity with acceleration
            corridor.rotation.x += corridor.userData.rotationVelocity.x * fallTime;
            corridor.rotation.y += corridor.userData.rotationVelocity.y * fallTime;
            corridor.rotation.z += corridor.userData.rotationVelocity.z * fallTime;
        }
    }
}

function updateMapMovement(deltaTime) {
    if (!gameActive) return;
    
    // Global sway/drift effect - increases as game progresses
    const gameTime = (Date.now() - gameStartTime) / 1000;
    const intensity = Math.min(gameTime / 30, 1.0); // Ramps up over 30 seconds
    
    mapDrift.swayTime += deltaTime;
    
    // Sinusoidal drift in multiple axes
    const swayX = Math.sin(mapDrift.swayTime * 0.3) * 0.5 * intensity;
    const swayY = Math.sin(mapDrift.swayTime * 0.2) * 0.3 * intensity;
    const swayZ = Math.cos(mapDrift.swayTime * 0.25) * 0.5 * intensity;
    
    mapDrift.offset.set(swayX, swayY, swayZ);
    
    // Apply drift to all non-collapsed structures
    for (const room of rooms) {
        if (!room.userData.isCollapsed) {
            const basePos = room.userData.basePosition || room.position.clone();
            if (!room.userData.basePosition) {
                room.userData.basePosition = basePos.clone();
            }
            room.position.copy(basePos).add(mapDrift.offset);
        }
    }
    
    for (const corridor of corridors) {
        if (!corridor.userData.isCollapsed) {
            const basePos = corridor.userData.basePosition || corridor.position.clone();
            if (!corridor.userData.basePosition) {
                corridor.userData.basePosition = basePos.clone();
            }
            corridor.position.copy(basePos).add(mapDrift.offset);
        }
    }
    
    // Apply to data cores
    for (const core of dataCores) {
        if (!core.userData.collected) {
            const basePos = core.userData.basePosition || core.position.clone();
            if (!core.userData.basePosition) {
                core.userData.basePosition = basePos.clone();
            }
            core.position.copy(basePos).add(mapDrift.offset);
            core.userData.light.position.copy(core.position);
        }
    }
    
    // Apply to exit portal
    if (exitPortal) {
        const basePos = exitPortal.userData.basePosition || exitPortal.position.clone();
        if (!exitPortal.userData.basePosition) {
            exitPortal.userData.basePosition = basePos.clone();
        }
        exitPortal.position.copy(basePos).add(mapDrift.offset);
        exitPortal.userData.light.position.copy(exitPortal.position);
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
        updateMapMovement(deltaTime);
        updatePlayer(deltaTime);
        updateHUD();
        
        // Animate data cores
        for (const core of dataCores) {
            if (!core.userData.collected) {
                core.rotation.y += deltaTime * 2;
                const baseY = core.userData.basePosition ? core.userData.basePosition.y : core.position.y;
                core.position.y = baseY + mapDrift.offset.y + Math.sin(Date.now() * 0.003) * 0.1;
                core.userData.light.position.copy(core.position);
            }
        }
        
        // Animate exit portal
        if (exitPortal) {
            exitPortal.rotation.y += deltaTime;
            exitPortal.rotation.x = Math.sin(Date.now() * 0.001) * 0.2;
        }
        
        // Continuously check and collapse rooms behind player
        collapseRoomsBehindPlayer();
        
        // Update collapsing rooms and corridors
        updateCollapsingRooms();
        updateCollapsingCorridors();
        
        // Update debris particles
        updateDebrisParticles(deltaTime);
    }
    
    renderer.render(scene, camera);
}

// Start the game
init();
