import { Simulation } from 'eecircuit-engine';
import { SimulationOutput } from '../types/circuit';
import { parseNgspiceResult } from './parseNgspiceResult';

class SpiceEngineRunner {
  private worker: Worker | null = null;
  private workerFailed = false;
  private fallbackSim: Simulation | null = null;
  private reqId = 1;
  private pending = new Map<
    number,
    { resolve: (val: any) => void; reject: (err: Error) => void }
  >();

  private getOrCreateWorker(): Worker | null {
    if (this.workerFailed) return null;
    if (this.worker) return this.worker;

    try {
      const w = new Worker(new URL('./spiceWorker.ts', import.meta.url), {
        type: 'module',
      });
      w.onmessage = (ev) => {
        const { id, ok, output, initInfo, error } = ev.data;
        const entry = this.pending.get(id);
        if (!entry) return;
        this.pending.delete(id);
        if (ok) {
          entry.resolve(output ?? initInfo);
        } else {
          entry.reject(new Error(error || 'ngspice worker error'));
        }
      };
      w.onerror = (err) => {
        console.warn('[SpiceEngineRunner] Worker error, switching to direct WASM mode:', err);
        this.workerFailed = true;
        this.worker = null;
        for (const [, p] of this.pending) {
          p.reject(new Error('Worker initialization error'));
        }
        this.pending.clear();
      };
      this.worker = w;
      return w;
    } catch (e) {
      this.workerFailed = true;
      return null;
    }
  }

  private async ensureFallbackSim(): Promise<Simulation> {
    if (!this.fallbackSim) {
      this.fallbackSim = new Simulation();
      await this.fallbackSim.start();
    }
    return this.fallbackSim;
  }

  async warmup(): Promise<string> {
    const w = this.getOrCreateWorker();
    if (w) {
      try {
        const id = this.reqId++;
        return await new Promise<string>((resolve, reject) => {
          this.pending.set(id, { resolve, reject });
          w.postMessage({ id, type: 'init' });
        });
      } catch {
        this.workerFailed = true;
      }
    }
    const sim = await this.ensureFallbackSim();
    return sim.getInitInfo();
  }

  async runNetlist(netlist: string): Promise<SimulationOutput> {
    const w = this.getOrCreateWorker();
    if (w) {
      try {
        const id = this.reqId++;
        return await new Promise<SimulationOutput>((resolve, reject) => {
          this.pending.set(id, { resolve, reject });
          w.postMessage({ id, type: 'run', netlist });
        });
      } catch (e) {
        console.warn('[SpiceEngineRunner] Worker run failed, falling back to direct WASM:', e);
        this.workerFailed = true;
      }
    }

    // Fallback direct WASM execution
    const t0 = performance.now();
    const sim = await this.ensureFallbackSim();
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

    return parseNgspiceResult(rawResult, netlist, rawLogs, elapsedMs);
  }
}

export const spiceRunner = new SpiceEngineRunner();
