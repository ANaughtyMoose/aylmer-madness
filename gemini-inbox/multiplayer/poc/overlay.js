// Aylmer Madness — Zero-Edit Multiplayer Overlay PoC
// Hooks into the same-origin game iframe, reads AYLMER.G, and renders peer tags.

const iframe = document.getElementById('game-frame');
const canvas = document.getElementById('overlay-canvas');
const ctx = canvas.getContext('2d');
const telemetryEl = document.getElementById('telemetry-bar');
const selfCarEl = document.getElementById('self-car');

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// Simulated peer state (Sayyad cruising in his 1988 Civic Si)
const peers = [
  {
    id: 'peer_sayyad',
    name: 'Sayyad',
    car: '1988 Civic Si',
    x: 950.0,
    z: 160.0,
    speed: 48,
    heading: 0,
  },
  {
    id: 'peer_mike',
    name: 'Mike McDonald',
    car: '1998 Forester',
    x: 820.0,
    z: 210.0,
    speed: 35,
    heading: Math.PI * 0.5,
  }
];

function getGameInstance() {
  try {
    return iframe.contentWindow && iframe.contentWindow.AYLMER ? iframe.contentWindow.AYLMER : null;
  } catch (e) {
    return null;
  }
}

// 3D world to 2D screen coordinate projection approximation based on camera state
function projectWorldToScreen(worldX, worldY, worldZ, camX, camY, camZ, camYaw, camPitch, fov = 1.0) {
  const dx = worldX - camX;
  const dy = worldY - camY;
  const dz = worldZ - camZ;

  // Rotate by camera yaw
  const cosY = Math.cos(-camYaw);
  const sinY = Math.sin(-camYaw);
  const rx = dx * cosY - dz * sinY;
  const rz = dx * sinY + dz * cosY;

  // Rotate by camera pitch
  const cosP = Math.cos(-camPitch);
  const sinP = Math.sin(-camPitch);
  const ry = dy * cosP - rz * sinP;
  const depth = dy * sinP + rz * cosP;

  if (depth <= 1.0) return null; // Behind camera

  const aspect = canvas.width / canvas.height;
  const screenX = (canvas.width / 2) + (rx / depth) * (canvas.width / (2 * Math.tan(fov / 2)));
  const screenY = (canvas.height / 2) - (ry / depth) * (canvas.height / (2 * Math.tan(fov / 2))) * aspect;

  return { x: screenX, y: screenY, depth };
}

function tick() {
  requestAnimationFrame(tick);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const AYLMER = getGameInstance();
  if (!AYLMER || !AYLMER.G || !AYLMER.G.veh) return;

  const G = AYLMER.G;
  const veh = G.veh;

  // Update telemetry bar
  if (telemetryEl) {
    telemetryEl.textContent = `Pos: X: ${veh.x.toFixed(1)}, Z: ${veh.z.toFixed(1)} · ${veh.speedKmh.toFixed(0)} km/h · ${G.carId}`;
  }
  if (selfCarEl) {
    selfCarEl.textContent = G.carId || 'Ranger XL';
  }

  // Camera coordinates
  const camDist = 5.2;
  const camPitch = G.camPitch || 0.22;
  const camYaw = G.camYaw || veh.yaw;
  const camX = veh.x - Math.sin(camYaw) * camDist;
  const camZ = veh.z - Math.cos(camYaw) * camDist;
  const camY = (veh.y || 0) + 1.6 + Math.sin(camPitch) * camDist;

  // Move simulated peer slightly in circles to simulate cruising
  const t = Date.now() * 0.001;
  peers[0].x = veh.x + Math.sin(t * 0.4) * 45;
  peers[0].z = veh.z + Math.cos(t * 0.4) * 45;

  // Render peer tags
  for (const peer of peers) {
    const dist = Math.hypot(peer.x - veh.x, peer.z - veh.z);
    if (dist > 500) continue; // Out of range

    const screen = projectWorldToScreen(peer.x, 1.2, peer.z, camX, camY, camZ, camYaw, camPitch);
    if (!screen || screen.x < -100 || screen.x > canvas.width + 100 || screen.y < -100 || screen.y > canvas.height + 100) continue;

    // Draw Nametag Badge
    const tag = `${peer.name} [${peer.car}] · ${dist.toFixed(0)}m`;
    ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, sans-serif';
    const textWidth = ctx.measureText(tag).width;

    // Background pill
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.beginPath();
    ctx.roundRect(screen.x - textWidth / 2 - 8, screen.y - 18, textWidth + 16, 24, 6);
    ctx.fill();

    // Border
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Text
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.fillText(tag, screen.x, screen.y - 2);

    // Indicator downward caret
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(screen.x - 5, screen.y + 6);
    ctx.lineTo(screen.x + 5, screen.y + 6);
    ctx.lineTo(screen.x, screen.y + 11);
    ctx.fill();
  }
}

requestAnimationFrame(tick);
console.log('Aylmer Madness Zero-Edit Multiplayer Overlay Active');
