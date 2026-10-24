// The shared rig, restricted to reserved ports and a newly created profile.
import net from 'node:net';
import { startServer, startChrome, Page, boot, CLEAR_SCRIPT, SHIM, onCleanup, sleep } from './rig.mjs';
import { RESOURCE_SCRIPT, SUSPEND_NATIVE_SCRIPT, timingScript, preserveTrafficScript } from './perf-instrument.mjs';

export function reservedPorts(args = {}, env = process.env) {
  const srv = Number(args['server-port'] ?? env.CMP_SRV_PORT ?? 8244);
  const cdp = Number(args['cdp-port'] ?? env.CMP_CDP_PORT ?? 9544);
  if (!Number.isInteger(srv) || srv < 8240 || srv > 8299) throw new Error('server port must be in 8240-8299');
  if (!Number.isInteger(cdp) || cdp < 9540 || cdp > 9599) throw new Error('CDP port must be in 9540-9599');
  return { srv, cdp };
}
export async function assertPortFree(port) {
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', (e) => reject(new Error(`port ${port} cannot be reserved: ${e.code}; existing processes were not touched`)));
    probe.listen(port, '127.0.0.1', () => probe.close(resolve));
  });
}
// The display a perf row is drawn on. `air` (the default) is Tom's M4 MacBook Air
// at its default "looks like" 1470x956 with a Retina devicePixelRatio of 2: at med
// (options.js: dpr cap 1.5, scale 0.85) gl.js draws 1470x956 x 1.275 = 1874x1219,
// 2.28 Mpx. `legacy` is the old 1280x800 at DPR 1 (1088x680 at med, 0.74 Mpx, a
// third of the Air's fill), kept for comparison with earlier reports.
export const DISPLAYS = {
  air: { name: 'air', w: 1470, h: 956, dpr: 2, about: 'M4 MacBook Air 13 default scaled 1470x956 CSS, devicePixelRatio 2' },
  legacy: { name: 'legacy', w: 1280, h: 800, dpr: 1, about: 'pre-20 Oct perf rig: 1280x800 CSS, devicePixelRatio 1' },
};
export function display(name = 'air') {
  const d = DISPLAYS[name];
  if (!d) throw new Error(`--display must be ${Object.keys(DISPLAYS).join(' or ')}`);
  return d;
}
export async function openRig({ srv, cdp, timer = true, resourceCounts = true, view = DISPLAYS.legacy }) {   // perf.mjs passes air; measure_memory keeps the old rig
  await assertPortFree(srv); await assertPortFree(cdp);
  let server, chrome; const pages = new Set(), allPages = [];
  const result = {
    get errors() { return allPages.flatMap((p) => p.errors); },
    async page(url, { entry = 'index' } = {}) {
      const p = await Page.open(cdp, view); pages.add(p); allPages.push(p);
      // Close only this CDP target. If the renderer died, do not hang forever.
      p.close = async () => {
        try {
          const disposed = await p.eval('window.__qa?.perf?.dispose() ?? window.__qa?.nativeTiming?.restore() ?? null', 5000);
          if (disposed?.glErrors?.length) p.errors.push('GL errors during timing: ' + JSON.stringify(disposed.glErrors));
        } catch (e) { p.errors.push('timing cleanup: ' + e.message); }
        await fetch(`http://127.0.0.1:${cdp}/json/close/${p.tabId}`, { signal: AbortSignal.timeout(5000) }).catch(() => {});
        p.ws.close(); pages.delete(p);
      };
      try {
        if (resourceCounts) await p.send('Page.addScriptToEvaluateOnNewDocument', { source: RESOURCE_SCRIPT });
        const b = await boot(p, url, { entry });
        p.bootResult = b;
        p.renderer = await p.eval(`(() => { const gl = window.AYLMER.G.renderer.gl, d = gl.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); })()`);
        if (!/metal/i.test(p.renderer) || /swiftshader|software|llvmpipe/i.test(p.renderer)) throw new Error(`ANGLE/Metal required, got ${p.renderer}`);
        await p.eval(preserveTrafficScript(CLEAR_SCRIPT)); await p.eval(SHIM);
        p.nativeTiming = await p.eval(SUSPEND_NATIVE_SCRIPT);
        p.timing = await p.eval(timingScript({ timer }));
        return p;
      } catch (e) { await p.close(); throw e; }
    },
    async stop() {
      for (const p of [...pages]) await p.close();
      if (chrome) await chrome.stop();
      if (server) await server.stop();
      await assertPortFree(cdp); await assertPortFree(srv);
    },
  };
  // rig registers synchronous signal/exit cleanup for its own child handles.
  server = await startServer(srv);
  try { chrome = await startChrome({ gpu: true, port: cdp, w: view.w, h: view.h }); }
  catch (e) { await server.stop(); throw e; }
  result.browser = chrome.version;
  return result;
}
export async function drainTiming(page, timeoutMs = 5000) {
  let pending = await page.eval('window.__qa.perf.stop()');
  const deadline = Date.now() + timeoutMs;
  while (pending && Date.now() < deadline) { await sleep(50); pending = await page.eval('window.__qa.perf.stop()'); }
  return pending;
}
export async function takeTimingWindow(page, id, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await page.eval(`window.__qa.perf.takeWindow(${JSON.stringify(id)})`);
    if (result.ready) return result.timing;
    if (Date.now() >= deadline) throw new Error(`timing window ${id} has ${result.pending} unresolved queries`);
    await sleep(50);
  }
}
export { onCleanup };
