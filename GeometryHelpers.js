export class GeometryHelpers {
    constructor() {
        this.config = null;
    }

    setConfig(config) {
        this.config = config;
    }

    getColor(colorName) {
        const colorHex = this.config.colorMap[colorName.toLowerCase()] || this.config.colorMap.apenum;
        return parseInt(colorHex.replace('0x', ''), 16);
    }

    createBox(boxData, wireframeMode = false) {
        const { position, shape, orientation = null, color = 'green' } = boxData;
        const [width, height, length] = shape;
        
        const geometry = new THREE.BoxGeometry(width, height, length);
        const material = wireframeMode ? 
            new THREE.MeshBasicMaterial({ color: this.getColor(color), wireframe: true }) :
            new THREE.MeshLambertMaterial({ color: this.getColor(color), transparent: true, opacity: 0.3 });
        
        const mesh = new THREE.Mesh(geometry, material);
        
        const boxCenter = [
            position[0],
            position[1], 
            position[2] - (length / 2) - 0.1
        ];
        
        mesh.position.set(boxCenter[0], boxCenter[1], boxCenter[2]);
        
        if (orientation && orientation.length >= 2) {
            let normalXZ;
            
            if (orientation.length === 2) {
                normalXZ = [orientation[0], orientation[1]];
            } else if (orientation.length === 3) {
                normalXZ = [orientation[0], orientation[2]];
            }
            
            const angle = Math.atan2(normalXZ[0], normalXZ[1]);
            mesh.rotation.y = angle;
            
            const frontFaceOffset = new THREE.Vector3(0, 0, length / 2);
            frontFaceOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
            
            mesh.position.set(
                position[0] - frontFaceOffset.x,
                position[1] - frontFaceOffset.y,
                position[2] - frontFaceOffset.z
            );
        }
        
        if (!wireframeMode) {
            const wireframeGeometry = new THREE.EdgesGeometry(geometry);
            const wireframeMaterial = new THREE.LineBasicMaterial({ color: this.getColor(color) });
            const wireframe = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);
            mesh.add(wireframe);
        }
        
        mesh.userData = { type: 'box', name: boxData.name || 'box' };
        return mesh;
    }

    createArrow(arrowData) {
        const { position, orientation, length = 1.0, color = 'red' } = arrowData;
        
        const arrowGroup = new THREE.Group();
        const direction = new THREE.Vector3(orientation[0], orientation[1], orientation[2]).normalize();
        
        const shaftLength = length * 0.8;
        const shaftRadius = length * 0.02;
        const shaftGeometry = new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLength, 8);
        const shaftMaterial = new THREE.MeshLambertMaterial({ color: this.getColor(color) });
        const shaft = new THREE.Mesh(shaftGeometry, shaftMaterial);
        
        const headLength = length * 0.2;
        const headRadius = length * 0.05;
        const headGeometry = new THREE.ConeGeometry(headRadius, headLength, 8);
        const headMaterial = new THREE.MeshLambertMaterial({ color: this.getColor(color) });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        
        shaft.position.set(0, shaftLength / 2, 0);
        head.position.set(0, shaftLength + headLength / 2, 0);
        
        arrowGroup.add(shaft);
        arrowGroup.add(head);
        arrowGroup.position.set(position[0], position[1], position[2]);
        
        const up = new THREE.Vector3(0, 1, 0);
        const quaternion = new THREE.Quaternion().setFromUnitVectors(up, direction);
        arrowGroup.setRotationFromQuaternion(quaternion);
        
        arrowGroup.userData = { type: 'arrow', name: arrowData.name || 'arrow' };
        return arrowGroup;
    }

    createMarker(markerData) {
        const { position, color = 'blue', marker_size = 0.1 } = markerData;
        
        const geometry = new THREE.SphereGeometry(0.02, 16, 16);
        const material = new THREE.MeshLambertMaterial({ color: this.getColor(color) });
        const sphere = new THREE.Mesh(geometry, material);
        
        sphere.position.set(position[0], position[1], position[2]);
        sphere.userData = { type: 'marker', name: markerData.name || 'marker' };
        return sphere;
    }

    createPointCloud(pointCloudData, cameraY = 0) {
        const { points, colors = null, size = 0.01 } = pointCloudData;
        
        if (!points || points.length === 0) {
            return null;
        }
        
        const geometry = new THREE.BufferGeometry();
        
        const positions = new Float32Array(points.length * 3);
        for (let i = 0; i < points.length; i++) {
            positions[i * 3] = points[i][0];
            positions[i * 3 + 1] = points[i][1] - cameraY;
            positions[i * 3 + 2] = points[i][2];
        }
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        if (colors && colors.length === points.length) {
            const colorArray = new Float32Array(points.length * 3);
            for (let i = 0; i < colors.length; i++) {
                colorArray[i * 3] = colors[i][0];
                colorArray[i * 3 + 1] = colors[i][1];
                colorArray[i * 3 + 2] = colors[i][2];
            }
            geometry.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
        }
        
        const material = new THREE.PointsMaterial({
            size: 0.01,
            vertexColors: false,
            color: 0xffffff,
            sizeAttenuation: true
        });
        
        const pointCloud = new THREE.Points(geometry, material);
        pointCloud.userData = { type: 'pointcloud', name: 'scene_pointcloud' };
        
        return pointCloud;
    }
}
