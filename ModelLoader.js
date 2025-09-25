import { GLTFLoader } from "../modules/GLTFLoader.js";

export class ModelLoader {
    constructor() {
        this.loader = new GLTFLoader();
        this.forkliftModel = null;
    }

    loadModel(url) {
        return new Promise((resolve, reject) => {
            this.loader.load(
                url,
                function (gltf) {
                    resolve(gltf.scene);
                },
                function (xhr) {
                    console.log((xhr.loaded / xhr.total * 100) + '% loaded');
                },
                function (error) {
                    console.error("Model loading error:", error);
                    reject("Model loading error:", error);
                }
            );
        });
    }

    async loadForkliftModel(scene, cameraZ = 0) {
        try {
            const forkliftScene = await this.loadModel('/static/models/forklift/forklift.gltf');
            
            // Rotate 180 degrees around Y-axis
            forkliftScene.rotation.y = Math.PI;
            
            // Scale down by 2 times
            forkliftScene.scale.set(0.5, 0.5, 0.5);
            
            // Position the forklift at the center with camera_y offset
            forkliftScene.position.set(0, -cameraZ, 0);
            
            // Apply apenum color to all materials
            const apenumColor = "0x00ffc1";
            forkliftScene.traverse((child) => {
                if (child.isMesh && child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => {
                            mat.color.setHex(apenumColor);
                        });
                    } else {
                        child.material.color.setHex(apenumColor);
                    }
                }
            });
            
            // Add the forklift to the scene
            scene.add(forkliftScene);
            this.forkliftModel = forkliftScene;
            
            console.log('Forklift model loaded successfully at center (0,' + (-cameraZ) + ',0) with apenum color');
        } catch (error) {
            console.error('Failed to load forklift model:', error);
        }
    }

    updateForkliftPosition(cameraZ) {
        if (this.forkliftModel) {
            this.forkliftModel.position.y = -cameraZ;
        }
    }
}
