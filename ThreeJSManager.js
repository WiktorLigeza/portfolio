import { ModelLoader } from './ModelLoader.js';
import { GeometryHelpers } from './GeometryHelpers.js';
import  StarrySkyShader  from './StarrySkyShader.js';

export class ThreeJSManager {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.config = null;
        this.visualizationObjects = [];
        this.wireframeMode = false;
        this.currentGround = null;
        this.gridHelper = null;
        this.axesHelper = null;
        this.cameraFOVVisualization = null;
        
        this.modelLoader = new ModelLoader();
        this.geometryHelpers = new GeometryHelpers();
        this.measurementSprites = []; // Track measurement sprites separately
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
        
        // Load forklift model
        await this.modelLoader.loadForkliftModel(this.scene, 0);
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
        })
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
        this.scene.add(directionalLight);
    }

    async initHelpers() {
        this.createGridAndAxes(0);
        this.createCameraFOV(0);
    }

    createGridAndAxes(cameraZ) {
        // Remove existing grid and axes
        if (this.gridHelper) {
            this.scene.remove(this.gridHelper);
        }
        if (this.axesHelper) {
            this.scene.remove(this.axesHelper);
        }
        
        const groundLevel = -cameraZ;
        this.gridHelper = new THREE.GridHelper(
            this.config.scene.gridSize,
            this.config.scene.gridDivisions,
            parseInt(this.config.scene.gridColorCenter.replace('0x', ''), 16),
            parseInt(this.config.scene.gridColorGrid.replace('0x', ''), 16)
        );
        this.gridHelper.position.y = groundLevel;
        this.scene.add(this.gridHelper);
        
        this.axesHelper = new THREE.AxesHelper(this.config.scene.axesSize);
        this.axesHelper.position.y = groundLevel;
        this.scene.add(this.axesHelper);
    }

    createCameraFOV(cameraZ = 0) {
        // Remove existing FOV visualization if it exists
        if (this.cameraFOVVisualization) {
            this.scene.remove(this.cameraFOVVisualization);
            if (this.cameraFOVVisualization.geometry) this.cameraFOVVisualization.geometry.dispose();
            if (this.cameraFOVVisualization.material) this.cameraFOVVisualization.material.dispose();
        }
        
        // Camera FOV parameters
        const fovDegrees = 60;
        const fovRadians = fovDegrees * (Math.PI / 180);
        const maxDistance = 5;
        const tiltDegrees = -15;
        const tiltRadians = tiltDegrees * (Math.PI / 180);
        const alpha = 0.1;
        const color = 0xff00ff;
        
        const farWidth = 2 * maxDistance * Math.tan(fovRadians / 2);
        const farHeight = farWidth;
        
        const geometry = new THREE.BufferGeometry();
        const vertices = new Float32Array([
            0, 0, 0,
            -farWidth/2, -farHeight/2, -maxDistance,
            farWidth/2, -farHeight/2, -maxDistance,
            farWidth/2, farHeight/2, -maxDistance,
            -farWidth/2, farHeight/2, -maxDistance
        ]);
        
        const indices = [
            1, 2, 3, 1, 3, 4,
            0, 2, 1, 0, 3, 2, 0, 4, 3, 0, 1, 4
        ];
        
        geometry.setIndex(indices);
        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geometry.computeVertexNormals();
        
        const material = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: alpha,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        
        const pyramid = new THREE.Mesh(geometry, material);
        const wireframeGeometry = new THREE.EdgesGeometry(geometry);
        const wireframeMaterial = new THREE.LineBasicMaterial({ color: color });
        const wireframe = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);
        pyramid.add(wireframe);
        
        pyramid.position.set(0, -cameraZ, 0);
        pyramid.rotation.x = tiltRadians;
        
        this.scene.add(pyramid);
        this.cameraFOVVisualization = pyramid;
        
        return pyramid;
    }

    updateGroundPlane(cameraZ) {
        if (this.currentGround) {
            this.scene.remove(this.currentGround);
            this.currentGround.geometry.dispose();
            this.currentGround.material.dispose();
            this.currentGround = null;
        }

        const groundY = -(cameraZ + 0.1);
        const geometry = new THREE.PlaneGeometry(this.config.scene.gridSize+2, this.config.scene.gridSize+2);
        const material = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
        const plane = new THREE.Mesh(geometry, material);

        plane.rotation.x = -Math.PI / 2;
        plane.position.y = groundY;

        this.scene.add(plane);
        this.currentGround = plane;
    }

    setupControls() {
        let mouseDown = false;
        let mouseX = 0, mouseY = 0;
        
        const initialPosition = this.camera.position.clone();
        const radius = Math.sqrt(initialPosition.x * initialPosition.x + initialPosition.y * initialPosition.y + initialPosition.z * initialPosition.z);
        let targetRotationX = Math.asin(initialPosition.y / radius);
        let targetRotationY = Math.atan2(initialPosition.x, initialPosition.z);
        let rotationX = targetRotationX;
        let rotationY = targetRotationY;
        
        this.renderer.domElement.addEventListener('mousedown', (event) => {
            mouseDown = true;
            mouseX = event.clientX;
            mouseY = event.clientY;
        });
        
        this.renderer.domElement.addEventListener('mouseup', () => {
            mouseDown = false;
        });
        
        this.renderer.domElement.addEventListener('mousemove', (event) => {
            if (mouseDown) {
                const deltaX = event.clientX - mouseX;
                const deltaY = event.clientY - mouseY;
                
                targetRotationY += deltaX * this.config.controls.mouseSpeed;
                targetRotationX += deltaY * this.config.controls.mouseSpeed;
                targetRotationX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, targetRotationX));
                
                mouseX = event.clientX;
                mouseY = event.clientY;
            }
        });
        
        this.renderer.domElement.addEventListener('wheel', (event) => {
            const delta = event.deltaY * 0.01;
            this.camera.position.multiplyScalar(1 + delta * this.config.controls.zoomSpeed);
            this.camera.position.clampLength(this.config.controls.minDistance, this.config.controls.maxDistance);
        });
        
        const updateCamera = () => {
            rotationX += (targetRotationX - rotationX) * this.config.controls.smoothness;
            rotationY += (targetRotationY - rotationY) * this.config.controls.smoothness;
            
            const radius = this.camera.position.length();
            this.camera.position.x = radius * Math.sin(rotationY) * Math.cos(rotationX);
            this.camera.position.y = Math.max(0, radius * Math.sin(rotationX)); // clamp to min 0
            this.camera.position.z = radius * Math.cos(rotationY) * Math.cos(rotationX);
            this.camera.lookAt(0, 0, 0);

            requestAnimationFrame(updateCamera);
        };
        updateCamera();
    }

    createMeasurementSprite(measurement, cameraZ = 0) {
        // console.log('Creating sprite for measurement:', measurement, 'cameraZ:', cameraZ);
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 50;
        canvas.height = 50;
        
        // Clear canvas with solid background for debugging
        context.fillStyle = 'rgba(0, 255, 191, 0.2)';
        context.clearRect(0, 0, canvas.width, canvas.height);
        
        // Set text properties
        context.font = 'bold 36px Orbitron, monospace'; // Use Orbitron if loaded
        context.fillStyle = '#cc00ff'; // Purple neon text
        context.strokeStyle = 'rgba(0, 0, 0, 0.7)';
        context.lineWidth = 3;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        
        // Format ID as two-digit number (01, 02, etc.)
        const formattedId = measurement.id.toString();
        
        // Draw text with outline
        context.strokeText(formattedId, canvas.width / 2, canvas.height / 2);
        context.fillText(formattedId, canvas.width / 2, canvas.height / 2);
        
        // Create texture and sprite
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        
        const spriteMaterial = new THREE.SpriteMaterial({ 
            map: texture,
            transparent: true,
            alphaTest: 0.01,
            depthTest: true
        });
        
        const sprite = new THREE.Sprite(spriteMaterial);
        
        // Position sprite at measurement origin, applying camera_y coordinate system
        const spritePosition = {
            x: measurement.origin.x,
            y: measurement.origin.y - cameraZ,
            z: measurement.origin.z
        };
        
        // console.log('Sprite position:', spritePosition);

        sprite.position.set(measurement.origin[0], measurement.origin[1]+0.3, measurement.origin[2]);

        // Scale sprite appropriately (larger for better visibility)
        sprite.scale.set(0.5, 0.5, 0.5);
        
        // Set render order to ensure sprite is rendered on top
        sprite.renderOrder = 1000;
        
        return sprite;
    }

    clearVisualization() {
        this.visualizationObjects.forEach(obj => {
            this.scene.remove(obj);
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) {
                    obj.material.forEach(mat => mat.dispose());
                } else {
                    obj.material.dispose();
                }
            }
        });
        this.visualizationObjects = [];
        
        // Clear measurement sprites
        this.measurementSprites.forEach(sprite => {
            this.scene.remove(sprite);
            if (sprite.material && sprite.material.map) {
                sprite.material.map.dispose();
            }
            if (sprite.material) sprite.material.dispose();
        });
        this.measurementSprites = [];
    }

    updateVisualization(data) {
        // console.log('UpdateVisualization called with data:', data);
        this.clearVisualization();
        this.updateGroundPlane(data.camera_y || 0);
        
        if (data.camera_y !== undefined) {
            this.createGridAndAxes(data.camera_y);
            this.modelLoader.updateForkliftPosition(data.camera_y);
            this.createCameraFOV(0);
        }
        
        let boxCount = 0;
        let pointCount = 0;
        
        if (data.pointcloud) {
            const pointCloud = this.geometryHelpers.createPointCloud(data.pointcloud);
            if (pointCloud) {
                this.scene.add(pointCloud);
                this.visualizationObjects.push(pointCloud);
                pointCount = data.pointcloud.points.length;
            }
        }
        
        if (data.boxes) {
            data.boxes.forEach(boxData => {
                const box = this.geometryHelpers.createBox(boxData, this.wireframeMode);
                this.scene.add(box);
                this.visualizationObjects.push(box);
                boxCount++;
            });
        }
        
        if (data.arrows) {
            data.arrows.forEach(arrowData => {
                const arrow = this.geometryHelpers.createArrow(arrowData);
                this.scene.add(arrow);
                this.visualizationObjects.push(arrow);
            });
        }
        
        if (data.markers) {
            data.markers.forEach(markerData => {
                const marker = this.geometryHelpers.createMarker(markerData);
                this.scene.add(marker);
                this.visualizationObjects.push(marker);
            });
        }
        
        // Add measurement sprites
        if (data.measurements) {
            // console.log('Processing measurements:', data.measurements);
            data.measurements.forEach(measurement => {
                if (measurement.origin) {
                    const sprite = this.createMeasurementSprite(measurement, data.camera_y || 0);
                    this.scene.add(sprite);
                    this.measurementSprites.push(sprite);
                    // console.log('Added sprite to scene');
                }
            });
            // console.log('Total sprites created:', this.measurementSprites.length);
        } else {
            console.log('No measurements data found');
        }
        
        return { boxCount, pointCount };
    }

    toggleWireframe() {
        this.wireframeMode = !this.wireframeMode;
        // Re-render current visualization with new wireframe mode
        // This would need to be triggered from the main viewer
    }

    resetCamera() {
        const distance = 15;
        const angle = Math.PI / 4;
        this.camera.position.set(
            distance * Math.cos(angle),
            distance * Math.sin(angle),
            distance * Math.cos(angle)
        );
        this.camera.lookAt(0, 0, 0);
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.renderer.render(this.scene, this.camera);
    }

    
}
