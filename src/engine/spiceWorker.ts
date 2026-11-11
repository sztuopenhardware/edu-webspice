import { Simulation } from 'eecircuit-engine';
import { parseNgspiceResult } from './parseNgspiceResult';

let simInstance: Simulation | null = null;

async function ensureSim(): Promise<Simulation> {
  if (!simInstance) {
    simInstance = new Simulation();
    await simInstance.start();
  }
  return simInstance;
}

self.onmessage = async (event: MessageEvent<{ id: number; type: 'init' | 'run'; netlist?: string }>) => {
  const { id, type, netlist } = event.data;
  try {
    if (type === 'init') {
      const sim = await ensureSim();
      self.postMessage({
        id,
        ok: true,
        initInfo: sim.getInitInfo(),
      });
      return;
    }

    if (type === 'run' && netlist) {
      const t0 = performance.now();
      const sim = await ensureSim();
      const asciiNetlist = netlist.replace(/[^\x00-\x7F]/g, '');
      sim.setNetList(asciiNetlist);
      const rawResult = await sim.runSim();
      const elapsedMs = Math.round((performance.now() - t0) * 10) / 10;

      const infoLines = (sim.getInfo() || '')
        .split('\n')
        .map((s) => s.trimEnd())
        .filter(Boolean);
      const errLines = sim.getError() || [];
      const rawLogs = [...infoLines, ...errLines.map((e) => `[ERROR] ${e}`)];

      const output = parseNgspiceResult(rawResult, netlist, rawLogs, elapsedMs);
      self.postMessage({
        id,
        ok: true,
        output,
      });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    self.postMessage({
      id,
      ok: false,
      error: message,
    });
  }
};
