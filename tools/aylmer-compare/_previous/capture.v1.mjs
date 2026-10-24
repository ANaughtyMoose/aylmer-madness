// Screenshot driver for Aylmer compare tool (Look tab)
// Uses headless Chrome over DevTools protocol (Node 22+, no dependencies)
// Modelled on tools/shots_landmarks.mjs and tools/headless.mjs

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const PLACES_DIR = path.join(REPO_ROOT, "references/places");
const FEEDBACK_DIR = path.join(PLACES_DIR, "_feedback");
const REPORT_PATH = path.join(PLACES_DIR, "COMPARE-REPORT.md");
const INDEX_PATH = path.join(FEEDBACK_DIR, "compare-index.json");

fs.mkdirSync(FEEDBACK_DIR, { recursive: true });

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function getCommitSha() {
  try {
    const head = fs.readFileSync(path.join(REPO_ROOT, ".git/HEAD"), "utf8").trim();
    if (head.startsWith("ref: ")) {
      const ref = head.slice(5);
      const refPath = path.join(REPO_ROOT, ".git", ref);
      if (fs.existsSync(refPath)) return fs.readFileSync(refPath, "utf8").trim();
    }
    return head;
  } catch {
    return "unknown";
  }
}

// 1. Load data
const { MAP, latLonToXZ } = await import(path.join(REPO_ROOT, "src/game/mapdata.js"));
const { PLACES } = await import(path.join(REPO_ROOT, "src/game/places.js"));

const svData = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "gemini-inbox/look/streetview/index.json"), "utf8"));
const svCrops = svData.crops || [];

const facadesData = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "gemini-inbox/look/facades/facades.json"), "utf8"));
const facades = facadesData.facades || [];

// Load manifest TSVs
const manifest = {};
const manifestDir = path.join(PLACES_DIR, "_manifest");
if (fs.existsSync(manifestDir)) {
  for (const f of fs.readdirSync(manifestDir)) {
    if (!f.endsWith(".tsv")) continue;
    const lines = fs.readFileSync(path.join(manifestDir, f), "utf8").split("\n");
    const headers = lines[0].split("\t").map((h) => h.trim());
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = line.split("\t");
      const row = {};
      headers.forEach((h, idx) => { row[h] = parts[idx] || ""; });
      const dest = row.dest_path || "";
      manifest[dest] = row;
      manifest[dest.replace("references/places/", "")] = row;
      manifest[path.basename(dest)] = row;
    }
  }
}

// Group by slug
const svBySlug = {};
for (const c of svCrops) {
  if (c.slug) {
    if (!svBySlug[c.slug]) svBySlug[c.slug] = [];
    svBySlug[c.slug].push(c);
  }
}

const facadesBySlug = {};
for (const f of facades) {
  if (f.slug) {
    if (!facadesBySlug[f.slug]) facadesBySlug[f.slug] = [];
    facadesBySlug[f.slug].push(f);
  }
}

// Enumerate all slugs
const allSlugsSet = new Set([...Object.keys(svBySlug), ...Object.keys(facadesBySlug)]);
for (const item of fs.readdirSync(PLACES_DIR)) {
  const p = path.join(PLACES_DIR, item);
  if (!item.startsWith("_") && fs.statSync(p).isDirectory()) {
    allSlugsSet.add(item);
  }
}

// Order: tom-upload first, then alphabetical
const tomUploadSlugs = [];
const otherSlugs = [];
for (const s of [...allSlugsSet].sort()) {
  const tuDir = path.join(PLACES_DIR, s, "tom-upload");
  if (fs.existsSync(tuDir) && fs.readdirSync(tuDir).filter((x) => !x.startsWith(".")).length > 0) {
    tomUploadSlugs.push(s);
  } else {
    otherSlugs.push(s);
  }
}
const orderedSlugs = [...tomUploadSlugs, ...otherSlugs];

console.log(`Found ${orderedSlugs.length} places to process (${tomUploadSlugs.length} with tom-upload).`);

export function buildIndexData() {
  const placesIndex = [];
  for (const slug of orderedSlugs) {
    const slugDir = path.join(PLACES_DIR, slug);
    const tuDir = path.join(slugDir, "tom-upload");
    const scDir = path.join(slugDir, "streetview-capture");
    const aiDir = path.join(slugDir, "ai-rectified");
    const gsDir = path.join(slugDir, "game-shots");

    const getFiles = (dir) => {
      if (!fs.existsSync(dir)) return [];
      const res = [];
      const walk = (d) => {
        for (const item of fs.readdirSync(d)) {
          if (item.startsWith(".")) continue;
          const full = path.join(d, item);
          if (fs.statSync(full).isDirectory()) {
            walk(full);
          } else if (/\.(jpg|jpeg|png|webp)$/i.test(item)) {
            res.push(path.relative(REPO_ROOT, full));
          }
        }
      };
      walk(dir);
      return res;
    };

    const tuFiles = getFiles(tuDir).map((rel) => {
      const m = manifest[rel] || manifest[path.basename(rel)] || {};
      return { file: rel, what_it_shows: m.what_it_shows || "", tom_said: m.tom_said || "" };
    });

    const scFiles = getFiles(scDir).map((rel) => {
      const m = manifest[rel] || manifest[path.basename(rel)] || {};
      const crop = svCrops.find((c) => path.basename(c.file || "") === path.basename(rel)) || {};
      return {
        file: rel,
        what_it_shows: m.what_it_shows || crop.description || "",
        tom_said: m.tom_said || "",
        changed_since_2004: crop.changed_since_2004 || null,
        heading: crop.heading ?? null,
        view: crop.view || null,
      };
    });

    const aiFiles = getFiles(aiDir).map((rel) => {
      const m = manifest[rel] || manifest[path.basename(rel)] || {};
      return { file: rel, what_it_shows: m.what_it_shows || "", tom_said: m.tom_said || "" };
    });

    const gameShots = [];
    if (fs.existsSync(gsDir)) {
      for (const item of fs.readdirSync(gsDir)) {
        if (!item.startsWith(".") && /\.png$/i.test(item)) {
          const sidecar = path.join(gsDir, item.replace(/\.png$/i, ".json"));
          let meta = {};
          if (fs.existsSync(sidecar)) {
            try { meta = JSON.parse(fs.readFileSync(sidecar, "utf8")); } catch {}
          }
          gameShots.push({
            file: path.relative(REPO_ROOT, path.join(gsDir, item)),
            name: item,
            meta,
          });
        }
      }
    }
    gameShots.sort((a, b) => b.name.localeCompare(a.name));

    placesIndex.push({
      slug,
      tom_upload: tuFiles,
      streetview_capture: scFiles,
      ai_rectified: aiFiles,
      game_shots: gameShots,
      facades: facadesBySlug[slug] || [],
      streetview_crops: svBySlug[slug] || [],
    });
  }
  return placesIndex;
}

fs.writeFileSync(INDEX_PATH, JSON.stringify(buildIndexData(), null, 2));
console.log(`Wrote ${INDEX_PATH}`);

const KNOWN_PLACES = {
  "philemon-wright-high": { x: 6800, z: -8000, route: "landmarks" },
  "heritage-college": { x: 5533, z: -6856, route: "landmarks" },
  "parliament-hill-centre": { x: 10609, z: -3426, route: "landmarks" },
  "chateau-laurier": { x: 10987, z: -3479, route: "landmarks" },
  "byward-market-building": { x: 11181, z: -3727, route: "landmarks" },
  "rideau-canal-nac": { x: 11284, z: -3454, route: "landmarks" },
  "marina-parc-des-cedres": { x: -1780, z: -38, route: "landmarks" },
  "symmes-junior-high": { x: -318, z: 382, route: "landmarks" },
  "canadian-tire-aylmer": { x: -157, z: -236, route: "PLACES" },
  "garage-norm-lafleur": { x: -514, z: -137, route: "PLACES" },
  "golf-gatineau-clubhouse": { x: 1256.8, z: -1320.9, route: "PLACES" },
  "841-boulevard-wilfrid-lavigne": { x: -182, z: -998, route: "PLACES" },
  "rue-samuel-edey-312": { x: 600, z: -535, route: "PLACES" },
  "museum-of-civilization": { x: 9827, z: -4016, route: "PLACES" },
  "place-du-portage": { x: 9510, z: -3364, route: "PLACES" },
  "casino-lac-leamy": { x: 8622, z: -5768, route: "PLACES" },
  "route-105-chelsea": { x: 3092, z: -12175, route: "PLACES" },
};

function resolveTarget(slug) {
  const facs = facadesBySlug[slug] || [];
  const crops = svBySlug[slug] || [];

  for (const f of facs) {
    if (typeof f.polygon_id === "number") {
      const b = MAP.buildings?.find((x) => x.id === f.polygon_id);
      if (b) {
        return {
          x: b.c[0],
          z: b.c[1],
          route: "polygon_id",
          polygon_id: f.polygon_id,
        };
      }
    }
  }

  if (KNOWN_PLACES[slug]) {
    return {
      x: KNOWN_PLACES[slug].x,
      z: KNOWN_PLACES[slug].z,
      route: KNOWN_PLACES[slug].route,
      polygon_id: facs.find((f) => f.polygon_id)?.polygon_id || null,
    };
  }

  if (crops.length > 0 && crops[0].lat != null && crops[0].lng != null) {
    const [x, z] = latLonToXZ(crops[0].lat, crops[0].lng);
    return {
      x: +x.toFixed(1),
      z: +z.toFixed(1),
      route: "lat/lng",
      polygon_id: facs.find((f) => f.polygon_id)?.polygon_id || null,
    };
  }

  return { x: null, z: null, route: "none", polygon_id: null };
}

if (!fs.existsSync(REPORT_PATH)) {
  const initialReport = [
    "# Aylmer Madness - Look + Audio Comparison Report",
    "",
    "Generated during review tool build and screenshot capture pass.",
    "",
    "## 1. Places Screenshot Log",
    "",
  ].join("\n");
  fs.writeFileSync(REPORT_PATH, initialReport);
}

async function captureAll() {
  const CDP_PORT = 9222;
  let chromeProcess = null;

  try {
    const v = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`).then((r) => r.json());
    if (!v.Browser) throw new Error();
  } catch {
    console.log("Starting headless Chrome on port " + CDP_PORT + "...");
    chromeProcess = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
      "--headless=new",
      `--remote-debugging-port=${CDP_PORT}`,
      "--use-angle=swiftshader",
      "--window-size=1280,800",
      "--no-first-run",
      "--no-default-browser-check",
    ]);
    await new Promise((r) => setTimeout(r, 2000));
  }

  const list = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: "PUT" }).then((r) => r.json());
  const ws = new WebSocket(list.webSocketDebuggerUrl);
  await new Promise((res) => (ws.onopen = res));

  let msgId = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((res, rej) => {
    const n = ++msgId;
    pending.set(n, { res, rej });
    ws.send(JSON.stringify({ id: n, method, params }));
  });

  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
    }
  };

  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

  console.log("Navigating to http://localhost:8123/index.html ...");
  await send("Page.navigate", { url: "http://localhost:8123/index.html" });

  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const ready = await evaluate("document.readyState + '|' + !!document.getElementById('start')").catch(() => "false");
    if (String(ready).startsWith("complete|true")) break;
  }

  await evaluate("document.getElementById('start').click()");
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const count = await evaluate("document.getElementById('startpoints')?.childElementCount || 0").catch(() => 0);
    if (count > 0) break;
  }

  await evaluate("document.getElementById('startpoints').children[0].click()");
  await new Promise((r) => setTimeout(r, 400));
  await evaluate("document.getElementById('startconfirm').click()");

  console.log("Waiting for game drive mode (world baking)...");
  let driveMode = false;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const m = await evaluate("window.AYLMER?.G?.mode || 'none'").catch(() => "none");
    if (m === "drive") {
      driveMode = true;
      console.log(`Drive mode active after ${(i + 1) * 2}s!`);
      break;
    }
  }

  if (!driveMode) {
    console.error("Game did not reach drive mode!");
    ws.close();
    if (chromeProcess) chromeProcess.kill();
    return;
  }

  await evaluate(`(() => {
    window.AYLMER.env('day');
    window.AYLMER.weather('clear');
    for (const id of ['story', 'pause', 'bigmap', 'options', 'garage', 'radio']) {
      document.getElementById(id)?.classList.add('hidden');
    }
    const hud = document.getElementById('hud');
    if (hud) hud.classList.add('hidden');
    window.AYLMER.G.mode = 'drive';
  })()`);

  const commitSha = getCommitSha();
  const dateStamp = timestamp();

  console.log(`Starting capture for ${orderedSlugs.length} places (commit: ${commitSha})...`);

  for (const slug of orderedSlugs) {
    const loc = resolveTarget(slug);
    const gsDir = path.join(PLACES_DIR, slug, "game-shots");
    fs.mkdirSync(gsDir, { recursive: true });

    if (!loc.x || !loc.z) {
      const failLine = `- ${slug}: FAILED - no position found.`;
      console.log(failLine);
      fs.appendFileSync(REPORT_PATH, failLine + "\n");
      continue;
    }

    const crops = svBySlug[slug] || [];
    const viewsToShoot = [];
    if (crops.length > 0) {
      for (const c of crops.slice(0, 3)) {
        viewsToShoot.push({
          viewName: c.view || "view",
          heading: c.heading != null ? c.heading : 90,
          refImage: c.file || null,
        });
      }
    } else {
      viewsToShoot.push({ viewName: "front_elevation", heading: 90, refImage: null });
    }

    let shotCount = 0;
    const shotFiles = [];

    for (const v of viewsToShoot) {
      const heading = v.heading;
      const dist = 32;
      const rad = (heading * Math.PI) / 180;
      const dx = Math.sin(rad);
      const dz = -Math.cos(rad);
      const initialCamX = loc.x - dx * dist;
      const initialCamZ = loc.z - dz * dist;

      const posResult = await evaluate(`(() => {
        const A = window.AYLMER, G = A.G;
        G.cam = 0;
        let px = ${initialCamX}, pz = ${initialCamZ};
        const r = G.world.nearestRoad(px, pz);
        if (r) { px = r.x; pz = r.z; }
        const yaw = Math.atan2(${loc.x} - px, ${loc.z} - pz);
        A.teleport(px, pz, yaw);
        G.veh.vx = 0; G.veh.vz = 0; G.veh.speed = 0;
        for (let i = 0; i < 8; i++) { A.step(1/60); }
        A.render();
        A.render();
        const stats = A.stats() || {};
        return { px, pz, yaw, tris: stats.tris || 0 };
      })()`);

      if (!posResult || posResult.tris === 0) {
        await evaluate(`(() => {
          const A = window.AYLMER, G = A.G;
          let px = ${initialCamX - dx * 10}, pz = ${initialCamZ - dz * 10};
          const r = G.world.nearestRoad(px, pz);
          if (r) { px = r.x; pz = r.z; }
          const yaw = Math.atan2(${loc.x} - px, ${loc.z} - pz);
          A.teleport(px, pz, yaw);
          G.veh.vx = 0; G.veh.vz = 0; G.veh.speed = 0;
          for (let i = 0; i < 8; i++) { A.step(1/60); }
          A.render();
          A.render();
        })()`);
      }

      await new Promise((r) => setTimeout(r, 300));
      const shotData = await send("Page.captureScreenshot", { format: "png" });

      const baseName = `${slug}_${v.viewName}_${dateStamp}`;
      let shotFileName = `${baseName}.png`;
      let sidecarFileName = `${baseName}.json`;
      if (fs.existsSync(path.join(gsDir, shotFileName))) {
        shotFileName = `${baseName}_2.png`;
        sidecarFileName = `${baseName}_2.json`;
      }

      fs.writeFileSync(path.join(gsDir, shotFileName), Buffer.from(shotData.data, "base64"));
      const sidecar = {
        slug,
        view: v.viewName,
        polygon_id: loc.polygon_id,
        building_centre: [loc.x, loc.z],
        camera: { x: +posResult.px.toFixed(1), z: +posResult.pz.toFixed(1), yaw: +posResult.yaw.toFixed(3) },
        G_cam: 0,
        env: "day",
        weather: "clear",
        window_size: [1280, 800],
        game_commit: commitSha,
        reference_image: v.refImage,
      };
      fs.writeFileSync(path.join(gsDir, sidecarFileName), JSON.stringify(sidecar, null, 2));

      shotCount++;
      shotFiles.push(shotFileName);
    }

    const checkpointLine = `- ${slug}: ${shotCount} shots (${shotFiles.join(", ")}) positioned via ${loc.route}.`;
    console.log(checkpointLine);
    fs.appendFileSync(REPORT_PATH, checkpointLine + "\n");

    fs.writeFileSync(INDEX_PATH, JSON.stringify(buildIndexData(), null, 2));
  }

  await send("Page.close").catch(() => {});
  ws.close();
  if (chromeProcess) {
    chromeProcess.kill();
    console.log("Headless Chrome closed cleanly.");
  }
  console.log("Capture pass completed successfully.");
}

await captureAll();
