import { ThreeJSManager } from './ThreeJSManager.js';

// Global variables
let socket;
let config = null;
let threeJSManager = null;

// Stream window variables
let streamWindow = null;
let streamVideo = null;
let streamStatus = null;
let streamConnected = false;

// FPS tracking variables
let dataFps = 0;
let dataFrameCount = 0;
let dataLastTime = performance.now();

// List window variables
let listWindow = null;
let measurementsList = [];
let measurementsTracker = new Map(); // Track frame activity for each measurement

// Load configuration
async function loadConfig() {
    try {
        const response = await fetch('/static/js/config.json');
        config = await response.json();
    } catch (error) {
        console.error('Failed to load config:', error);
        // Fallback config
        config = {
            camera: { fov: 75, near: 0.1, far: 1000, position: { x: 10, y: 10, z: 10 }, lookAt: { x: 0, y: 0, z: 0 } },
            colorMap: { red: "0xff0000", green: "0x00ff00", blue: "0x0000ff", white: "0xffffff", apenum: "0x00ffc1" }
        };
    }
}

// Initialize Three.js scene
async function initThreeJS() {
    await loadConfig();
    
    threeJSManager = new ThreeJSManager();
    await threeJSManager.init(config);
        // 🎬 Usage in your main scene setup:
    // Handle window resize
    window.addEventListener('resize', () => threeJSManager.onWindowResize());
}

function updateVisualization(data) {
    if (!threeJSManager) return;
    
    const { boxCount, pointCount } = threeJSManager.updateVisualization(data);
    
    // Update measurements list if available
    if (data.measurements) {
        updateMeasurementsList(data.measurements);
    }
    
    // Use FPS from server/MQTT if provided; fallback to local estimate
    if (typeof data.fps === 'number' && isFinite(data.fps)) {
        dataFps = data.fps;
        const fpsEl = document.getElementById('fpsCounter');
        if (fpsEl) fpsEl.textContent = Math.round(dataFps);
        // Reset local counters to avoid stale accumulation
        dataFrameCount = 0;
        dataLastTime = performance.now();
    } else {
        // Calculate data FPS
        dataFrameCount++;
        const currentTime = performance.now();
        if (currentTime - dataLastTime >= 1000) {
            dataFps = Math.round((dataFrameCount * 1000) / (currentTime - dataLastTime));
            const fpsEl = document.getElementById('fpsCounter');
            if (fpsEl) fpsEl.textContent = dataFps;
            dataFrameCount = 0;
            dataLastTime = currentTime;
        }
    }
}

// Measurements list functions
function initListWindow() {
    listWindow = document.getElementById('listWindow');
}

function updateMeasurementsList(measurements) {
    // Update tracker with current measurements
    const currentIds = new Set();

    measurements.forEach(measurement => {
        currentIds.add(measurement.id);
        if (measurementsTracker.has(measurement.id)) {
            // Reset frame counter for active measurement
            measurementsTracker.get(measurement.id).inactiveFrames = 0;
            measurementsTracker.get(measurement.id).data = measurement;
        } else {
            // Add new measurement
            measurementsTracker.set(measurement.id, {
                data: measurement,
                inactiveFrames: 0
            });
        }
    });

    // Increment inactive frame counter for measurements not in current update
    for (let [id, tracker] of measurementsTracker.entries()) {
        if (!currentIds.has(id)) {
            tracker.inactiveFrames++;
            // Remove if inactive for 50 frames
            if (tracker.inactiveFrames >= 50) {
                measurementsTracker.delete(id);
            }
        }
    }

    // Find max width/height for scaling
    let maxWidth = 0, maxHeight = 0;
    for (let tracker of measurementsTracker.values()) {
        maxWidth = Math.max(maxWidth, tracker.data.width);
        maxHeight = Math.max(maxHeight, tracker.data.height);
    }
    // Store for use in rendering
    updateMeasurementsList.maxWidth = maxWidth;
    updateMeasurementsList.maxHeight = maxHeight;

    // Update measurements list with active measurements
    measurementsList = Array.from(measurementsTracker.values()).map(tracker => tracker.data);
    renderMeasurements();
}

// Patch createPalletElement to use scaling and even slot spacing
const origCreatePalletElement = createPalletElement;
createPalletElement = function(measurement) {
    const container = document.createElement('div');
    container.className = 'pallet-container';

    // Use max width/height for scaling
    const maxSize = 150;
    const maxWidth = updateMeasurementsList.maxWidth || measurement.width;
    const maxHeight = updateMeasurementsList.maxHeight || measurement.height;
    const scale = Math.min(maxSize / maxWidth, maxSize / maxHeight);

    const palletWidth = measurement.width * scale;
    const palletHeight = measurement.height * scale;
    const slotWidth = measurement.slot_width * scale;
    const slotHeight = measurement.slot_height * scale;

    // Evenly spaced slots (2 slots, 3 gaps: left, between, right)
    const slotCount = 2;
    const gapCount = slotCount + 1;
    const totalSlotWidth = slotCount * slotWidth;
    const gap = (palletWidth - totalSlotWidth) / gapCount;

    const slotY = (palletHeight - slotHeight) / 2;

    let slotsHtml = '';
    for (let i = 0; i < slotCount; i++) {
        const left = gap + i * (slotWidth + gap);
        slotsHtml += `<div class="pallet-slot" style="
            width: ${slotWidth}px; 
            height: ${slotHeight}px;
            left: ${left}px;
            top: ${slotY}px;
        "></div>`;
    }

    container.innerHTML = `
        <div class="pallet-info">
            <h4>Pallet ID: ${measurement.id}</h4>
            <div class="measurements">
                <span>Side: ${measurement.width.toFixed(2)}m × ${measurement.height.toFixed(2)}m</span>
                <span>Slot: ${measurement.slot_width.toFixed(2)}m × ${measurement.slot_height.toFixed(2)}m</span>
                <span>due ${measurement.due.toFixed(3)*1000}mm | dc: ${measurement.dc.toFixed(3)*1000}mm </span>
                <span>Level: ${-1*measurement.origin[1].toFixed(3)}m, Distance ${-1*measurement.origin[2].toFixed(3)}m  </span>
            </div>
        </div>
        <div class="pallet-visual" style="width: ${palletWidth}px; height: ${palletHeight}px; position: relative;">
            <div class="pallet-face"></div>
            ${slotsHtml}
        </div>
    `;

    return container;
};

function renderMeasurements() {
    if (!listWindow) return;
    
    listWindow.innerHTML = '';
    
    if (measurementsList.length === 0) {
        listWindow.innerHTML += '<p>No measurements available</p>';
        return;
    }
    
    measurementsList.forEach(measurement => {
        const palletElement = createPalletElement(measurement);
        listWindow.appendChild(palletElement);
    });
}

function createPalletElement(measurement) {
    const container = document.createElement('div');
    container.className = 'pallet-container';
    
    // Scale factor: Limit max size to fit in window
    const maxSize = 150; // Maximum dimension in pixels
    const scale = Math.min(maxSize / Math.max(measurement.width, measurement.height));
    
    const palletWidth = measurement.width * scale;
    const palletHeight = measurement.height * scale;
    const slotWidth = measurement.slot_width * scale;
    const slotHeight = measurement.slot_height * scale;
    
    // Calculate positions for two evenly separated slots
    const slotSpacing = palletWidth / 3; // Divide width into 3 parts
    const slot1X = slotSpacing - (slotWidth / 2); // Center first slot in first third
    const slot2X = (2 * slotSpacing) - (slotWidth / 2); // Center second slot in second third
    const slotY = (palletHeight - slotHeight) / 2; // Center vertically
    
    container.innerHTML = `
        <div class="pallet-info">
            <h4>Pallet ID: ${measurement.id}</h4>
            <div class="measurements">
                <span>Width: ${measurement.width.toFixed(2)}m</span>
                <span>Height: ${measurement.height.toFixed(2)}m</span>
                <span>Slot: ${measurement.slot_width.toFixed(2)}m × ${measurement.slot_height.toFixed(2)}m</span>
            </div>
        </div>
        <div class="pallet-visual" style="width: ${palletWidth}px; height: ${palletHeight}px;">
            <div class="pallet-face"></div>
            <div class="pallet-slot" style="
                width: ${slotWidth}px; 
                height: ${slotHeight}px;
                left: ${slot1X}px;
                top: ${slotY}px;
            "></div>
            <div class="pallet-slot" style="
                width: ${slotWidth}px; 
                height: ${slotHeight}px;
                left: ${slot2X}px;
                top: ${slotY}px;
            "></div>
        </div>
    `;
    
    return container;
}

// Socket.IO and control functions
function initSocket() {
    socket = io();
    
    socket.on('connect', () => {
        console.log('Connected to server');
        document.getElementById('connectionStatus').textContent = 'Connected';
        document.getElementById('connectionStatus').className = 'connected';
        requestData();
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        document.getElementById('connectionStatus').textContent = 'Disconnected';
        document.getElementById('connectionStatus').className = 'disconnected';
    });
    
    socket.on('visualization_update', (data) => {
        // console.log('Received visualization update:', data);
        updateVisualization(data);
    });
}

function requestData() {
    if (socket) {
        socket.emit('request_data');
    }
}

function sendSampleData() {
    fetch('/api/sample', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        }
    })
    .then(response => response.json())
    .then(data => {
        console.log('Sample data sent:', data);
    })
    .catch(error => {
        console.error('Error sending sample data:', error);
    });
}

function resetCamera() {
    if (threeJSManager) {
        threeJSManager.resetCamera();
    }
}

function toggleWireframe() {
    if (threeJSManager) {
        threeJSManager.toggleWireframe();
    }
}

// Stream window functions
function initStreamWindow() {
    streamWindow = document.getElementById('streamWindow');
    streamVideo = document.getElementById('streamVideo');
    streamStatus = document.getElementById('streamStatus');
    
    // Connect to streams on initialization
    connectToStreams();
    
    // Prevent context menu on stream images
    streamVideo.addEventListener('contextmenu', (e) => e.preventDefault());
}

function connectToStreams() {
    const host = window.location.hostname;
    const streamUrl = `http://${host}:8080/stream`;
    
    streamStatus.textContent = 'Connecting...';
    streamStatus.className = 'stream-status';
    
    streamVideo.src = streamUrl;
    streamVideo.style.display = 'block';
    
    streamVideo.onload = () => {
        streamConnected = true;
        streamStatus.style.display = 'none';
        console.log('Combined RGB+Depth stream connected successfully');
    };
    
    streamVideo.onerror = () => {
        streamConnected = false;
        streamStatus.style.display = 'block';
        streamStatus.textContent = 'Connection Failed';
        streamStatus.className = 'stream-status error';
        console.error('Failed to connect to combined stream at', streamUrl);
    };
}

function disconnectFromStreams() {
    streamVideo.src = '';
    streamVideo.style.display = 'none';
    streamStatus.style.display = 'block';
    streamStatus.textContent = 'Disconnected';
    streamStatus.className = 'stream-status';
    streamConnected = false;
}

// Initialize everything
window.addEventListener('load', () => {
    initThreeJS();
    initSocket();
    initStreamWindow();
    initListWindow();
});