# Aylmer Madness — Multiplayer Architecture & Zero-Edit Overlay Design (B6)

**Philosophy:** Peer-to-Peer Friends-Only Multiplayer  
**Implementation Constraint:** **Zero game source modification**. The core game engine (`src/`, `index.html`) remains 100% pristine.  
**PoC Implementation:** `gemini-inbox/multiplayer/poc/index.html` + `overlay.js`  
**Author:** Gemini CLI  
**Date:** September 2026  

---

## 1. Zero-Edit Non-Invasive Architecture

Because Thomas has instituted the strict rule that the single-player game code must never be compromised or destabilized by external frameworks, multiplayer is architected as an **out-of-tree parent envelope**:

```
+-------------------------------------------------------------------+
| gemini-inbox/multiplayer/poc/index.html (Parent Wrapper)           |
|                                                                   |
|  +-------------------------------------------------------------+  |
|  | <iframe id="game-frame" src="/index.html">                  |  |
|  |   - Unmodified Aylmer Madness game                          |  |
|  |   - Exposes window.AYLMER = { G, step, render, ... }        |  |
|  +-------------------------------------------------------------+  |
|                                                                   |
|  +-------------------------------------------------------------+  |
|  | <canvas id="multiplayer-overlay">                           |  |
|  |   - Reads iframe.contentWindow.AYLMER.G.veh per frame       |  |
|  |   - WebRTC DataChannel send/receive: { x, z, yaw, carId }   |  |
|  |   - Renders remote friend vehicles & nametags               |  |
|  |   - Renders multiplayer HUD & peer lobby                    |  |
|  +-------------------------------------------------------------+  |
+-------------------------------------------------------------------+
```

### Same-Origin Window Access
When served from the same host (`http://127.0.0.1:8151/` or production domain), the parent wrapper page accesses `iframe.contentWindow.AYLMER` directly without CORS restrictions:
- **Telemetry Extraction:** At 20–30 Hz, `overlay.js` samples `G.veh.x`, `G.veh.y`, `G.veh.z`, `G.veh.yaw`, `G.veh.speedKmh`, `G.carId`, `G.horn`.
- **Peer Interpolation:** Incoming peer packets update remote player dead-reckoning buffers.
- **Rendering Modes:**
  1. **Canvas2D Overlay (HUD/Nametags/Minimap):** Projects 3D world coordinates of peers onto screen space using `G.renderer.camera` matrices, drawing player tags (« Sayyad », « Thomas »), chat bubbles, and minimap blips.
  2. **WebGL Injected Remote Cars:** The overlay dynamically instantiates remote vehicle instances and calls `car.draw(renderer, viewProj)` during the rendering cycle, completely transparent to the base game logic.

---

## 2. Network Protocol: WebRTC DataChannels

For an 8-player friend group, a dedicated central game server is an unnecessary operational expense. WebRTC mesh networking provides the optimal solution:
- **Signaling:** Lightweight public STUN server (e.g. Google's public STUN `stun:stun.l.google.com:19302`) with manual copy-paste room codes or an ephemeral Firebase/MQTT signal relay.
- **Transport:** Unreliable, unordered WebRTC DataChannels (`maxRetransmits: 0`) for continuous vehicle state packets (20 bytes per tick).
- **Reliable Channel:** Ordered reliable channel for one-shot events (horn honks, chat messages, radio station synchronizations).

### Binary Packet Specification (24 Bytes per State Tick)
```
Offset  Type     Field          Description
------------------------------------------------------------
0x00    uint8    packetType     0x01 = VehicleState
0x01    uint8    playerId       Peer ID (0..7)
0x02    uint8    carId          Vehicle enum (0=Ranger, 1=Civic, ...)
0x03    uint8    flags          Bit 0: Horn, Bit 1: Headlights, Bit 2: Brake
0x04    float32  posX           X coordinate in world meters
0x08    float32  posZ           Z coordinate in world meters
0x0C    float16  posY           Y coordinate / terrain elevation
0x0E    int16    yaw            Heading quantized to [-32768, 32767]
0x10    float16  vx             Longitudinal velocity
0x12    float16  vz             Lateral velocity
0x14    uint32   timestamp      Client millisecond timestamp
```

---

## 3. Remote Vehicle Interpolation & Smoothing

To prevent jitter caused by internet latency or packet jitter:
- **Hermite Spline Interpolation:** Remote vehicles render with a fixed $80 \text{ ms}$ interpolation delay. When a new packet arrives, a cubic Hermite spline is fitted between previous position $P_0, V_0$ and target position $P_1, V_1$.
- **Dead Reckoning Fallback:** If a packet is dropped, the remote car projects forward along its last known velocity vector $P(t) = P_0 + V_0 \cdot \Delta t$ for up to $400 \text{ ms}$ before gently fading into an idle coast.

---

## 4. Friend-Group Physics & Collision Model

In a cooperative open-world setting among 8 friends who grew up on the same streets, rigorous anti-cheat server arbitration is unnecessary.
- **Client-Authoritative Bumping:** When player A collides with remote player B, player A's client detects the intersection using the bounding boxes from `cars.js` and applies an elastic rebound impulse locally. Player A broadcasts an impulse notice `{ type: 'BUMP', target: 'peer_B', impulseX, impulseZ }`.
- **Peer Rebound:** Peer B applies the impulse to their own physics simulation on the next tick, creating satisfying physical car tag and bumper taps along Rue Principale.

---

## 5. Synchronized Summer Radio

One of the most evocative aspects of driving with friends is listening to the same song at the same time.
- The host peer broadcasts their active radio station index and playback offset:
  `{ type: 'RADIO_SYNC', station: 'CHEZ_106', trackId: 4, offsetSec: 42.5 }`
- Connecting peers align their synthesized procedural radio tracks to match within $100 \text{ ms}$, creating the authentic feeling of cruising together down Chemin Fraser with windows down and stereos blaring in unison.
