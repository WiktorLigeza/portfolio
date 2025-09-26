// Using global THREE from CDN

class ThreeJSViewer {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.geometryHelpers = new GeometryHelpers();
        this.modelLoader = new ModelLoader();
        this.config = null;
        this.animationId = null;
        this.isRotating = false;
        
        // Mouse following properties
        this.mouse = { x: 0, y: 0 };
        this.mouseFollowSpeed = 0.08;
        this.mouseFollowSensitivity = 1.5;
        this.cameraDistance = 6;
        this.mouseFollowEnabled = true; // Add flag to control mouse following
        this.lastMouseX = 0;
        this.lastMouseY = 0;
    }

    async init(config) {
        this.config = config;
        this.geometryHelpers.setConfig(config);
        
        await this.initScene();
        await this.initCamera();
        await this.initRenderer();
        await this.initLighting();
        await this.initHelpers();
        await this.setupControls();
        
        // Start render loop
        this.animate();
        
        // Removed placeholder forklift model
        // await this.modelLoader.loadForkliftModel(this.scene, 0);
    }

    async initScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(parseInt(this.config.scene.background.replace('0x', ''), 16));
        
        var skyDomeRadius = 500.01;
        var sphereMaterial = new THREE.ShaderMaterial({
            uniforms: {
                skyRadius: { value: skyDomeRadius },
                env_c1: { value: new THREE.Color("#0d1a2f") },
                env_c2: { value: new THREE.Color("#0f8682") },
                noiseOffset: { value: new THREE.Vector3(100.01, 100.01, 100.01) },
                starSize: { value: 0.01 },
                starDensity: { value: 0.09 },
                clusterStrength: { value: 0.2 },
                clusterSize: { value: 0.2 },
                time: { value: 0 },
            },
            vertexShader: StarrySkyShader.vertexShader,
            fragmentShader: StarrySkyShader.fragmentShader,
            side: THREE.DoubleSide,
        });
        
        var sphereGeometry = new THREE.SphereGeometry(skyDomeRadius, 20, 20);
        var skyDome = new THREE.Mesh(sphereGeometry, sphereMaterial);
        this.scene.add(skyDome);
        
        // Add Earth and Moon
        await this.initEarthMoon();
    }

    async initEarthMoon() {
        const loader = new THREE.TextureLoader();
        const detail = 12;
        
        // Create Earth group with rotation
        this.earthGroup = new THREE.Group();
        this.earthGroup.rotation.z = -23.4 * Math.PI / 180;
        this.scene.add(this.earthGroup);
        
        // Earth geometry
        const earthGeometry = new THREE.IcosahedronGeometry(1, detail);
        
        // Earth material with textures
        const earthMaterial = new THREE.MeshPhongMaterial({
            map: loader.load("./textures/00_earthmap1k.jpg"),
            specularMap: loader.load("./textures/02_earthspec1k.jpg"),
            bumpMap: loader.load("./textures/01_earthbump1k.jpg"),
            bumpScale: 0.0001,
        });
        this.earthMesh = new THREE.Mesh(earthGeometry, earthMaterial);
        this.earthGroup.add(this.earthMesh);
        
        // Earth lights (city lights on dark side)
        const lightsMaterial = new THREE.MeshBasicMaterial({
            map: loader.load("./textures/03_earthlights1k.jpg"),
            blending: THREE.AdditiveBlending,
        });
        this.lightsMesh = new THREE.Mesh(earthGeometry, lightsMaterial);
        this.earthGroup.add(this.lightsMesh);
        
        // Earth clouds
        const cloudsMaterial = new THREE.MeshStandardMaterial({
            map: loader.load("./textures/04_earthcloudmap.jpg"),
            transparent: true,
            opacity: 0.5,
            blending: THREE.AdditiveBlending,
            alphaMap: loader.load('./textures/05_earthcloudmaptrans.jpg'),
        });
        this.cloudsMesh = new THREE.Mesh(earthGeometry, cloudsMaterial);
        this.cloudsMesh.scale.setScalar(1.003);
        this.earthGroup.add(this.cloudsMesh);
        
        // Earth atmosphere glow using Fresnel material
        const fresnelMaterial = this.getFresnelMat();
        this.glowMesh = new THREE.Mesh(earthGeometry, fresnelMaterial);
        this.glowMesh.scale.setScalar(1.01);
        this.earthGroup.add(this.glowMesh);
        
        // Moon group for orbital movement
        this.moonGroup = new THREE.Group();
        this.scene.add(this.moonGroup);
        
        // Moon material and mesh
        const moonMaterial = new THREE.MeshStandardMaterial({
            map: loader.load("./textures/06_moonmap4k.jpg"),
            bumpMap: loader.load("./textures/07_moonbump4k.jpg"),
            bumpScale: 0.04,
        });
        this.moonMesh = new THREE.Mesh(earthGeometry, moonMaterial);
        this.moonMesh.position.set(100, 0, 0); // 50x bigger radius (2 * 50 = 100)
        this.moonMesh.scale.setScalar(5); // 10x bigger (0.27 * 10 = 2.7)
        this.moonGroup.add(this.moonMesh);
    }

    getFresnelMat({rimHex = 0x0088ff, facingHex = 0x000000} = {}) {
        const uniforms = {
            color1: { value: new THREE.Color(rimHex) },
            color2: { value: new THREE.Color(facingHex) },
            fresnelBias: { value: 0.1 },
            fresnelScale: { value: 1.0 },
            fresnelPower: { value: 4.0 },
        };
        const vs = `
        uniform float fresnelBias;
        uniform float fresnelScale;
        uniform float fresnelPower;
        
        varying float vReflectionFactor;
        
        void main() {
            vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
            vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
        
            vec3 worldNormal = normalize( mat3( modelMatrix[0].xyz, modelMatrix[1].xyz, modelMatrix[2].xyz ) * normal );
        
            vec3 I = worldPosition.xyz - cameraPosition;
        
            vReflectionFactor = fresnelBias + fresnelScale * pow( 1.0 + dot( normalize( I ), worldNormal ), fresnelPower );
        
            gl_Position = projectionMatrix * mvPosition;
        }
        `;
        const fs = `
        uniform vec3 color1;
        uniform vec3 color2;
        
        varying float vReflectionFactor;
        
        void main() {
            float f = clamp( vReflectionFactor, 0.0, 1.0 );
            gl_FragColor = vec4(mix(color2, color1, vec3(f)), f);
        }
        `;
        const fresnelMat = new THREE.ShaderMaterial({
            uniforms: uniforms,
            vertexShader: vs,
            fragmentShader: fs,
            transparent: true,
            blending: THREE.AdditiveBlending,
        });
        return fresnelMat;
    }

    async initCamera() {
        this.camera = new THREE.PerspectiveCamera(
            this.config.camera.fov,
            window.innerWidth / window.innerHeight,
            this.config.camera.near,
            this.config.camera.far
        );
        
        const initialPosition = {x: 2.8655646377178905, y: 1.861485476788222, z: 4.617727918226375};
        this.camera.position.set(initialPosition.x, initialPosition.y, initialPosition.z);
    }

    async initRenderer() {
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.setClearColor(0x263238, 1);
        document.getElementById('container').appendChild(this.renderer.domElement);
    }

    async initLighting() {
        const ambientLight = new THREE.AmbientLight(
            parseInt(this.config.lighting.ambient.color.replace('0x', ''), 16),
            this.config.lighting.ambient.intensity
        );
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(
            parseInt(this.config.lighting.directional.color.replace('0x', ''), 16),
            this.config.lighting.directional.intensity
        );
        directionalLight.position.set(
            this.config.lighting.directional.position.x,
            this.config.lighting.directional.position.y,
            this.config.lighting.directional.position.z
        );
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 0.5;
        directionalLight.shadow.camera.far = 500;
        this.scene.add(directionalLight);
    }

    async initHelpers() {
        // Removed grid and axes helpers
        // this.createGridAndAxes(0);
        // this.createCameraFOV(0);
    }

    async setupControls() {
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        
        // Disable default mouse controls since we'll implement custom mouse following
        this.controls.enabled = false;
        
        // Configure orbital movement for when we manually update
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.screenSpacePanning = false;
        
        // Set limits for orbital movement
        this.controls.minDistance = 1;
        this.controls.maxDistance = 100;
        this.controls.maxPolarAngle = Math.PI;
        
        // Set rotation speed
        this.controls.rotateSpeed = 0.5;
        this.controls.zoomSpeed = 1.2;
        this.controls.panSpeed = 0.8;
        
        // Set target (what the camera orbits around)
        this.controls.target.set(0, 0, 0);
        
        // Enable auto-rotate for continuous orbital movement
        this.controls.autoRotate = false; // Set to true for automatic rotation
        this.controls.autoRotateSpeed = 2.0;
        
        // Initialize mouse following
        this.setupMouseFollowing();
        
        this.controls.update();
    }

    setupMouseFollowing() {
        // Initialize mouse position based on current camera position
        this.updateMouseFromCamera();
        
        // Add mouse move listener to track mouse position
        document.addEventListener('mousemove', (event) => {
            // Only update mouse tracking when not rotating
            if (!this.isRotating && this.mouseFollowEnabled) {
                // Convert mouse coordinates to normalized device coordinates (-1 to +1)
                const mouseX = (event.clientX / window.innerWidth) * 2 - 1;
                const mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
                
                // Apply mouse delta to current mouse position instead of absolute positioning
                const deltaX = mouseX - this.lastMouseX;
                const deltaY = mouseY - this.lastMouseY;
                
                // Update mouse position with delta
                this.mouse.x += deltaX * this.mouseFollowSensitivity;
                this.mouse.y += deltaY * this.mouseFollowSensitivity;
                
                // Clamp mouse values to reasonable range
                this.mouse.x = Math.max(-2, Math.min(2, this.mouse.x));
                this.mouse.y = Math.max(-1, Math.min(1, this.mouse.y));
            }
            
            // Always track last mouse position for delta calculation
            this.lastMouseX = (event.clientX / window.innerWidth) * 2 - 1;
            this.lastMouseY = -(event.clientY / window.innerHeight) * 2 + 1;
        });
        
        // Initialize last mouse position
        this.lastMouseX = 0;
        this.lastMouseY = 0;
    }

    updateCameraFromMouse() {
        // Calculate spherical coordinates based on mouse position
        const theta = this.mouse.x * this.mouseFollowSensitivity; // Apply sensitivity here
        const phi = (this.mouse.y * 0.5 + 0.5) * Math.PI * 0.8 + 0.1; // Vertical rotation (limited range)
        
        // Ensure phi is within valid bounds
        const clampedPhi = Math.max(0.1, Math.min(Math.PI - 0.1, phi));
        
        // Convert spherical to cartesian coordinates
        const x = this.cameraDistance * Math.sin(clampedPhi) * Math.cos(theta);
        const z = this.cameraDistance * Math.sin(clampedPhi) * Math.sin(theta);
        const y = this.cameraDistance * Math.cos(clampedPhi);
        
        // Smoothly interpolate to new position to avoid jittery movement
        const targetPosition = new THREE.Vector3(x, y, z);
        this.camera.position.lerp(targetPosition, this.mouseFollowSpeed);
        this.camera.lookAt(0, 0, 0); // Always look at center
    }

    // Method to update mouse position based on current camera position
    updateMouseFromCamera() {
        // Get current camera position relative to center
        const position = this.camera.position.clone();
        const distance = position.length();
        
        // Update camera distance to match current position
        this.cameraDistance = distance;
        
        // Convert to spherical coordinates
        const phi = Math.acos(Math.max(-1, Math.min(1, position.y / distance))); // Clamp to avoid NaN
        const theta = Math.atan2(position.z, position.x);
        
        // Convert back to mouse coordinates with proper normalization
        this.mouse.x = theta / this.mouseFollowSensitivity;
        this.mouse.y = ((phi - 0.1) / (Math.PI * 0.8) - 0.5) * 2;
        
        // Normalize theta to stay within -π to π range
        while (this.mouse.x > Math.PI / this.mouseFollowSensitivity) {
            this.mouse.x -= (2 * Math.PI) / this.mouseFollowSensitivity;
        }
        while (this.mouse.x < -Math.PI / this.mouseFollowSensitivity) {
            this.mouse.x += (2 * Math.PI) / this.mouseFollowSensitivity;
        }
        
        // Clamp mouse values to reasonable range
        this.mouse.x = Math.max(-4, Math.min(4, this.mouse.x)); // Increased range for better rotation
        this.mouse.y = Math.max(-1, Math.min(1, this.mouse.y));
    }

    createGridAndAxes(warehouseId) {
        // Create grid helper
        const gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x444444);
        gridHelper.name = `grid_${warehouseId}`;
        this.scene.add(gridHelper);
        
        // Create axes helper
        const axesHelper = new THREE.AxesHelper(5);
        axesHelper.name = `axes_${warehouseId}`;
        this.scene.add(axesHelper);
    }

    createCameraFOV(warehouseId) {
        // Create camera frustum helper
        const cameraHelper = new THREE.CameraHelper(this.camera);
        cameraHelper.name = `cameraFOV_${warehouseId}`;
        cameraHelper.visible = false; // Initially hidden
        this.scene.add(cameraHelper);
    }

    animate() {
        this.animationId = requestAnimationFrame(() => this.animate());
        
        // Only update camera position based on mouse movement when enabled and not rotating
        if (!this.isRotating && this.mouseFollowEnabled) {
            this.updateCameraFromMouse();
        }
        
        // Update controls for smooth orbital movement
        if (this.controls) {
            this.controls.update();
        }
        
        // Update sky dome shader time for animated stars
        const skyDome = this.scene.getObjectByName('skyDome');
        if (skyDome && skyDome.material.uniforms.time) {
            skyDome.material.uniforms.time.value += 0.01;
        }
        
        // Animate Earth and Moon
        if (this.earthMesh) {
            this.earthMesh.rotation.y += 0.002;
        }
        if (this.lightsMesh) {
            this.lightsMesh.rotation.y += 0.002;
        }
        if (this.cloudsMesh) {
            this.cloudsMesh.rotation.y += 0.0023;
        }
        if (this.glowMesh) {
            this.glowMesh.rotation.y += 0.002;
        }
        if (this.moonGroup) {
            this.moonGroup.rotation.y += 0.01;
        }
        
        this.render();
        this.updateFPS();
    }

    render() {
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    updateFPS() {
        // Simple FPS counter
        if (!this.lastTime) this.lastTime = performance.now();
        if (!this.frameCount) this.frameCount = 0;
        
        this.frameCount++;
        const currentTime = performance.now();
        
        if (currentTime >= this.lastTime + 1000) {
            const fps = Math.round((this.frameCount * 1000) / (currentTime - this.lastTime));
            const fpsElement = document.getElementById('fpsCounter');
            if (fpsElement) {
                fpsElement.textContent = fps;
            }
            this.frameCount = 0;
            this.lastTime = currentTime;
        }
    }

    rotateViewLeft() {
        if (this.controls && !this.isRotating) {
            this.animateRotation(Math.PI / 2); // 45 degrees to the left
        }
    }

    rotateViewRight() {
        if (this.controls && !this.isRotating) {
            this.animateRotation(-Math.PI / 2); // 45 degrees to the right
        }
    }

    animateRotation(angle) {
        if (this.isRotating) return; // Prevent multiple simultaneous rotations
        
        this.isRotating = true;
        
        // Disable mouse following during rotation
        this.mouseFollowEnabled = false;
        
        // Disable navigation buttons during camera rotation
        if (window.windowManager) {
            window.windowManager.toggleNavigationButtons(false);
        }
        
        // Get current camera position relative to target
        const targetPosition = this.controls.target.clone();
        const startPosition = this.camera.position.clone().sub(targetPosition);
        
        // Calculate end position
        const rotationMatrix = new THREE.Matrix4().makeRotationY(angle);
        const endPosition = startPosition.clone().applyMatrix4(rotationMatrix);
        
        // Animation parameters
        const duration = 1500; // milliseconds
        const startTime = performance.now();
        
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Easing function (ease-out-cubic)
            const eased = 1 - Math.pow(1 - progress, 3);
            
            // Interpolate position
            const currentPosition = startPosition.clone().lerp(endPosition, eased);
            
            // Set camera position
            this.camera.position.copy(targetPosition.clone().add(currentPosition));
            this.camera.lookAt(this.controls.target);
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                this.isRotating = false;
                
                // Ensure camera is exactly at end position to avoid floating point errors
                this.camera.position.copy(targetPosition.clone().add(endPosition));
                this.camera.lookAt(this.controls.target);
                
                // Update mouse position to match the new camera position with a small delay
                setTimeout(() => {
                    this.updateMouseFromCamera();
                    
                    // Re-enable mouse following
                    this.mouseFollowEnabled = true;
                    
                    // Update controls after animation completes
                    this.controls.update();
                    
                    // Re-enable navigation buttons after camera animation completes
                    if (window.windowManager) {
                        window.windowManager.toggleNavigationButtons(true);
                    }
                }, 50);
            }
        };
        
        requestAnimationFrame(animate);
    }

    // Method to reset camera position
    resetCameraPosition() {
        if (this.camera && this.controls) {
            // Reset mouse tracking to center
            this.mouse.x = 0;
            this.mouse.y = 0;
            
            this.controls.target.set(0, 0, 0);
            this.controls.update();
        }
    }

    // Handle window resize
    onWindowResize() {
        if (this.camera && this.renderer) {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        }
    }

    // Clean up
    dispose() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        if (this.renderer) {
            this.renderer.dispose();
        }
        if (this.controls) {
            this.controls.dispose();
        }
    }
}

// Helper classes
class GeometryHelpers {
    constructor() {
        this.config = null;
    }
    
    setConfig(config) {
        this.config = config;
    }
}

class ModelLoader {
    constructor() {
        this.loader = new THREE.GLTFLoader();
    }
    
    async loadForkliftModel(scene, warehouseId) {
        try {
            // Placeholder for forklift model loading when needed
            console.log(`Model loader ready for warehouse ${warehouseId}`);
            
            // No placeholder objects added - clean scene
            
        } catch (error) {
            console.error('Error loading forklift model:', error);
        }
    }
}

// Default configuration
const defaultConfig = {
    scene: {
        background: '0x263238'
    },
    camera: {
        fov: 75,
        near: 0.1,
        far: 1000
    },
    lighting: {
        ambient: {
            color: '0x404040',
            intensity: 0.4
        },
        directional: {
            color: '0xffffff',
            intensity: 0.8,
            position: {
                x: 10,
                y: 10,
                z: 5
            }
        }
    }
};

// Initialize the viewer when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Wait for Three.js to load
    if (typeof THREE !== 'undefined') {
        const viewer = new ThreeJSViewer();
        viewer.init(defaultConfig);
        
        // Export viewer for global access
        window.viewer = viewer;
        
        // Add event listeners for navigation buttons - rotate camera AND control windows
        const leftBtn = document.getElementById('rotateLeft');
        const rightBtn = document.getElementById('rotateRight');
        
        if (leftBtn) {
            leftBtn.addEventListener('click', () => {
                // Check if animations are already running
                if (viewer.isRotating || (window.windowManager && window.windowManager.isTransitioning)) {
                    return; // Block action if any animation is running
                }
                
                // Rotate camera
                viewer.rotateViewLeft();
                
                // Control windows with synchronized animation
                if (window.windowManager) {
                    window.windowManager.previousWindow();
                }
            });
        }
        
        if (rightBtn) {
            rightBtn.addEventListener('click', () => {
                // Check if animations are already running
                if (viewer.isRotating || (window.windowManager && window.windowManager.isTransitioning)) {
                    return; // Block action if any animation is running
                }
                
                // Rotate camera  
                viewer.rotateViewRight();
                
                // Control windows with synchronized animation
                if (window.windowManager) {
                    window.windowManager.nextWindow();
                }
            });
        }
    } else {
        console.error('Three.js not loaded');
    }
});

// Handle window resize
window.addEventListener('resize', () => {
    viewer.onWindowResize();
});

// Keyboard controls for orbital movement
document.addEventListener('keydown', (event) => {
    switch(event.code) {
        case 'KeyR':
            viewer.resetCameraPosition();
            break;
    }
});

// Window Manager Class
class WindowManager {
    constructor() {
        this.currentWindow = -1; // Start with no window visible
        this.totalWindows = 5;
        this.isTransitioning = false;
        this.isWindowsVisible = false; // Start hidden
        this.lastDirection = 'right'; // Track animation direction
        this.defaultWindow = 0; // Default window to show first
        
        this.init();
    }
    
    init() {
        // Add close button handlers
        document.querySelectorAll('.close-btn').forEach((btn, index) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.hideAllWindows();
            });
        });
        
        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (this.currentWindow >= 0 && !this.isTransitioning) {
                if (e.key === 'ArrowLeft') {
                    this.previousWindow();
                } else if (e.key === 'ArrowRight') {
                    this.nextWindow();
                } else if (e.key === 'Escape') {
                    this.hideAllWindows();
                }
            }
        });

        // Show default window after a short delay
        setTimeout(() => {
            this.showWindow(this.defaultWindow, false); // Show without animation initially
        }, 1000);
    }
    
    // Method to disable/enable navigation buttons
    toggleNavigationButtons(enabled) {
        const leftBtn = document.getElementById('rotateLeft');
        const rightBtn = document.getElementById('rotateRight');
        
        if (leftBtn && rightBtn) {
            leftBtn.disabled = !enabled;
            rightBtn.disabled = !enabled;
            
            // Add visual feedback
            if (enabled) {
                leftBtn.classList.remove('disabled');
                rightBtn.classList.remove('disabled');
            } else {
                leftBtn.classList.add('disabled');
                rightBtn.classList.add('disabled');
            }
        }
    }
    
    hideAllWindows() {
        this.isWindowsVisible = false;
        
        // Hide current window
        if (this.currentWindow >= 0) {
            const currentWindowEl = document.getElementById(`window-${this.currentWindow}`);
            currentWindowEl.classList.remove('active');
            currentWindowEl.classList.add('exiting-right'); // Always exit to right when closing
            
            // Reset after animation
            setTimeout(() => {
                currentWindowEl.classList.remove('exiting-right', 'exiting-left', 'entering-right', 'entering-left');
            }, 800);
        }
        
        this.currentWindow = -1;
    }
    
    showWindow(index, animate = true) {
        if (this.isTransitioning || index === this.currentWindow) return;
        
        if (animate) {
            this.isTransitioning = true;
            // Disable navigation buttons during transition
            this.toggleNavigationButtons(false);
        }
        
        // Hide current window with exit animation based on direction
        if (this.currentWindow >= 0 && this.currentWindow !== index) {
            const currentWindowEl = document.getElementById(`window-${this.currentWindow}`);
            // When going right (next), current window exits to the left
            // When going left (previous), current window exits to the right
            const exitDirection = this.lastDirection === 'right' ? 'exiting-left' : 'exiting-right';
            
            if (animate) {
                currentWindowEl.classList.add(exitDirection);
            }
            currentWindowEl.classList.remove('active');
        }
        
        // Show new window with enter animation
        setTimeout(() => {
            const newWindowEl = document.getElementById(`window-${index}`);
            
            if (animate && this.currentWindow >= 0) {
                // When going right (next), new window enters from the right
                // When going left (previous), new window enters from the left
                const enterDirection = this.lastDirection === 'right' ? 'entering-right' : 'entering-left';
                
                // Reset all animation classes first
                newWindowEl.classList.remove('exiting-left', 'exiting-right', 'entering-left', 'entering-right', 'active');
                
                // Set the starting position for the animation (no transition)
                newWindowEl.classList.add(enterDirection);
                
                // Force a reflow to ensure the starting position is applied
                newWindowEl.offsetHeight;
                
                // Remove entering class to enable transitions, then add active class
                requestAnimationFrame(() => {
                    newWindowEl.classList.remove(enterDirection);
                    // Small delay to ensure transition is re-enabled
                    setTimeout(() => {
                        newWindowEl.classList.add('active');
                    }, 10);
                });
            } else {
                // No animation needed, just show directly
                newWindowEl.classList.add('active');
            }
            
            
            this.currentWindow = index;
            this.isWindowsVisible = true;
            
            // Clean up classes after animation completes
            setTimeout(() => {
                // Clean up old window
                const allWindows = document.querySelectorAll('.floating-window');
                allWindows.forEach(window => {
                    if (window.id !== `window-${index}`) {
                        window.classList.remove('exiting-left', 'exiting-right', 'entering-left', 'entering-right');
                    }
                });
            }, 800);
            
            // Clear transition flag and re-enable buttons
            if (animate) {
                setTimeout(() => {
                    this.isTransitioning = false;
                    // Re-enable navigation buttons after transition completes
                    this.toggleNavigationButtons(true);
                }, 800);
            } else {
                this.isTransitioning = false;
            }
            
        }, (animate && this.currentWindow >= 0) ? 200 : 0);
    }
    
    nextWindow() {
        this.lastDirection = 'right';
        if (this.currentWindow === -1) {
            // First time showing a window
            this.showWindow(0);
        } else {
            const nextIndex = (this.currentWindow + 1) % this.totalWindows;
            this.showWindow(nextIndex);
        }
    }
    
    previousWindow() {
        this.lastDirection = 'left';
        if (this.currentWindow === -1) {
            // First time showing a window, start from last
            this.showWindow(this.totalWindows - 1);
        } else {
            const prevIndex = this.currentWindow === 0 ? this.totalWindows - 1 : this.currentWindow - 1;
            this.showWindow(prevIndex);
        }
    }
    

}

// Initialize Window Manager - separate from viewer initialization
document.addEventListener('DOMContentLoaded', () => {
    // Initialize window manager
    window.windowManager = new WindowManager();
    
    // Initialize popup windows
    initPopupWindows();
    
    // Debug: Check if elements exist
    console.log('Navigation buttons found:', {
        left: !!document.getElementById('rotateLeft'),
        right: !!document.getElementById('rotateRight')
    });
    
    console.log('Windows found:', {
        window0: !!document.getElementById('window-0'),
        window1: !!document.getElementById('window-1'),
        window2: !!document.getElementById('window-2'),
        window3: !!document.getElementById('window-3'),
        window4: !!document.getElementById('window-4')
    });
});

// Popup window management
function initPopupWindows() {
    // Get all popup elements
    const aboutBtn = document.getElementById('aboutBtn');
    const experienceBtn = document.getElementById('experienceBtn');
    const educationBtn = document.getElementById('educationBtn');
    const contactBtn = document.getElementById('contactBtn');
    
    const aboutPopup = document.getElementById('aboutPopup');
    const experiencePopup = document.getElementById('experiencePopup');
    const educationPopup = document.getElementById('educationPopup');
    const contactPopup = document.getElementById('contactPopup');
    
    // Ensure all popups are hidden by default
    hideAllPopups();
    
    // Add click handlers for buttons
    if (aboutBtn) {
        aboutBtn.addEventListener('click', () => showPopup(aboutPopup));
    }
    
    if (experienceBtn) {
        experienceBtn.addEventListener('click', () => showPopup(experiencePopup));
    }
    
    if (educationBtn) {
        educationBtn.addEventListener('click', () => showPopup(educationPopup));
    }
    
    if (contactBtn) {
        contactBtn.addEventListener('click', () => showPopup(contactPopup));
    }
    
    // Add close button handlers
    document.querySelectorAll('.popup-close').forEach(closeBtn => {
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const popup = e.target.closest('.popup-overlay');
            hidePopup(popup);
        });
    });
    
    // Close popup when clicking overlay
    document.querySelectorAll('.popup-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                hidePopup(overlay);
            }
        });
    });
    
    // Close popup with Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const activePopup = document.querySelector('.popup-overlay.active');
            if (activePopup) {
                hidePopup(activePopup);
            }
        }
    });
}

function showPopup(popup) {
    if (popup) {
        // Hide any currently active popup first
        hideAllPopups();
        
        // Show the requested popup
        setTimeout(() => {
            popup.classList.add('active');
            document.body.style.overflow = 'hidden';
        }, 50); // Small delay to ensure smooth transition
    }
}

function hidePopup(popup) {
    if (popup) {
        popup.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function hideAllPopups() {
    const allPopups = document.querySelectorAll('.popup-overlay');
    allPopups.forEach(popup => {
        popup.classList.remove('active');
    });
    document.body.style.overflow = '';
}


// Image rotation functionality for multiple containers
class ImageRotationManager {
    constructor() {
        this.containers = new Map();
        this.angleStep = 45; // each image is 45deg apart
        this.frontOffset = 45; // offset the focus to one image left
        this.init();
    }

    init() {
        // Find all image containers and initialize them
        document.querySelectorAll('.image-container').forEach(container => {
            const containerId = container.id;
            this.containers.set(containerId, {
                element: container,
                spans: container.querySelectorAll('span'),
                x: 0
            });

            // Add click listener for each container
            container.addEventListener("click", (e) => {
                this.handleContainerClick(e, containerId);
            });

            // Initial rotation
            this.rotate(containerId);
        });
    }

    handleContainerClick(e, containerId) {
        const containerData = this.containers.get(containerId);
        if (!containerData) return;

        const rect = containerData.element.getBoundingClientRect();
        const clickX = e.clientX - rect.left; // click position inside container
        const width = rect.width;

        if (clickX < width * 0.25) {
            // clicked left 25%
            containerData.x += this.angleStep;
            this.rotate(containerId);
        } else if (clickX > width * 0.75) {
            // clicked right 25%
            containerData.x -= this.angleStep;
            this.rotate(containerId);
        }
        // middle 50% does nothing
    }

    rotate(containerId) {
        const containerData = this.containers.get(containerId);
        if (!containerData) return;

        const { element, spans, x } = containerData;
        
        element.style.transform = `perspective(1000px) rotateY(${x}deg)`;

        spans.forEach((span, i) => {
            const relativeAngle = ((i * this.angleStep + x + this.frontOffset) % 360 + 360) % 360; // normalize 0-360
            const angleDistance = Math.min(relativeAngle, 360 - relativeAngle);

            const blur = Math.min(angleDistance / 10, 8); // max 8px blur
            const opacity = Math.max(1 - angleDistance / 180, 0.3); // min 0.3 opacity

            span.style.filter = `blur(${blur}px)`;
            span.style.opacity = opacity;
        });
    }

    // Method to add new container dynamically
    addContainer(containerId) {
        const container = document.getElementById(containerId);
        if (container && !this.containers.has(containerId)) {
            this.containers.set(containerId, {
                element: container,
                spans: container.querySelectorAll('span'),
                x: 0
            });

            container.addEventListener("click", (e) => {
                this.handleContainerClick(e, containerId);
            });

            this.rotate(containerId);
        }
    }
}

// Initialize the image rotation manager
let imageRotationManager;
document.addEventListener('DOMContentLoaded', () => {
    // Small delay to ensure all elements are loaded
    setTimeout(() => {
        imageRotationManager = new ImageRotationManager();
    }, 100);
});

