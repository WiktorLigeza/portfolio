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
        
        // Configure orbital movement
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
        
        this.controls.update();
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
        
        // Update controls for smooth orbital movement
        if (this.controls) {
            this.controls.update();
        }
        
        // Update sky dome shader time for animated stars
        const skyDome = this.scene.getObjectByName('skyDome');
        if (skyDome && skyDome.material.uniforms.time) {
            skyDome.material.uniforms.time.value += 0.01;
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
        
        // Get current camera position relative to target
        const targetPosition = this.controls.target.clone();
        const startPosition = this.camera.position.clone().sub(targetPosition);
        
        // Calculate end position
        const rotationMatrix = new THREE.Matrix4().makeRotationY(angle);
        const endPosition = startPosition.clone().applyMatrix4(rotationMatrix);
        
        // Animation parameters
        const duration = 800; // milliseconds
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
                // Update controls after animation completes
                this.controls.update();
            }
        };
        
        requestAnimationFrame(animate);
    }

    // Method to toggle auto-rotation
    toggleAutoRotate() {
        if (this.controls) {
            this.controls.autoRotate = !this.controls.autoRotate;
        }
    }

    // Method to reset camera position
    resetCameraPosition() {
        if (this.camera && this.controls) {
            const initialPosition = {x: 2.8655646377178905, y: 1.861485476788222, z: 4.617727918226375};
            this.camera.position.set(initialPosition.x, initialPosition.y, initialPosition.z);
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
        document.getElementById('rotateLeft').addEventListener('click', () => {
            // Rotate camera
            viewer.rotateViewLeft();
            
            // Control windows with synchronized animation
            if (window.windowManager) {
                window.windowManager.previousWindow();
            }
        });
        
        document.getElementById('rotateRight').addEventListener('click', () => {
            // Rotate camera  
            viewer.rotateViewRight();
            
            // Control windows with synchronized animation
            if (window.windowManager) {
                window.windowManager.nextWindow();
            }
        });
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
        case 'KeyA':
            viewer.toggleAutoRotate();
            break;
    }
});

// Window Manager Class
class WindowManager {
    constructor() {
        this.currentWindow = -1; // Start with no window visible
        this.totalWindows = 4;
        this.isTransitioning = false;
        this.isWindowsVisible = false; // Start hidden
        this.lastDirection = 'right'; // Track animation direction
        
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
    }
    
    hideAllWindows() {
        this.isWindowsVisible = false;
        
        // Hide current window
        if (this.currentWindow >= 0) {
            const currentWindowEl = document.getElementById(`window-${this.currentWindow}`);
            currentWindowEl.classList.remove('active');
            currentWindowEl.classList.add('exiting-right'); // Exit to right
            
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
        }
        
        // Hide current window with exit animation based on direction
        if (this.currentWindow >= 0 && this.currentWindow !== index) {
            const currentWindowEl = document.getElementById(`window-${this.currentWindow}`);
            // Use lastDirection to determine exit direction
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
                // Use lastDirection to determine enter direction  
                const enterDirection = this.lastDirection === 'right' ? 'entering-right' : 'entering-left';
                
                // Reset position for animation
                newWindowEl.classList.remove('exiting-left', 'exiting-right', 'entering-left', 'entering-right');
                newWindowEl.classList.add(enterDirection);
                
                // Trigger reflow
                newWindowEl.offsetHeight;
                
                // Start enter animation
                newWindowEl.classList.remove(enterDirection);
            }
            
            newWindowEl.classList.add('active');
            this.currentWindow = index;
            this.isWindowsVisible = true;
            
            // Clear transition flag
            if (animate) {
                setTimeout(() => {
                    this.isTransitioning = false;
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

// Initialize Window Manager
document.addEventListener('DOMContentLoaded', () => {
    window.windowManager = new WindowManager();
});


