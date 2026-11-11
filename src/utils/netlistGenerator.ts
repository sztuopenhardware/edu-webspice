import { SchematicComponent, SchematicWire, SimulationConfig } from '../types/circuit';
import { getComponentPinWorldCoords } from './componentLibrary';

export interface CompiledCircuit {
  netlist: string;
  /** Maps "x,y" grid coordinate to resolved SPICE node name (e.g. "0", "in", "out", "n001") */
  pointToNode: Record<string, string>;
  /** Maps wire.id to resolved SPICE node name */
  wireToNode: Record<string, string>;
  /** Maps "${comp.id}:${pinId}" to resolved SPICE node name */
  pinToNode: Record<string, string>;
  /** All non-zero node names */
  nodeNames: string[];
  warnings: string[];
}

class UnionFind {
  private parent = new Map<string, string>();

  find(x: string): string {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      return x;
    }
    let root = x;
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root)!;
    }
    let curr = x;
    while (curr !== root) {
      const nxt = this.parent.get(curr)!;
      this.parent.set(curr, root);
      curr = nxt;
    }
    return root;
  }

  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) {
      this.parent.set(ra, rb);
    }
  }

  keys(): string[] {
    return Array.from(this.parent.keys());
  }
}

function ptKey(x: number, y: number): string {
  return `${Math.round(x)},${Math.round(y)}`;
}

export function compileCircuitToSpice(
  components: SchematicComponent[],
  wires: SchematicWire[],
  simConfig: SimulationConfig,
  title = 'WebLTspice Schematic Circuit'
): CompiledCircuit {
  const uf = new UnionFind();
  const warnings: string[] = [];

  // 1. Register all wire points (including interior grid points for automatic T-junction connectivity)
  for (const w of wires) {
    const x1 = Math.round(w.x1);
    const y1 = Math.round(w.y1);
    const x2 = Math.round(w.x2);
    const y2 = Math.round(w.y2);

    if (x1 === x2) {
      const minY = Math.min(y1, y2);
      const maxY = Math.max(y1, y2);
      for (let y = minY; y <= maxY; y++) {
        uf.find(ptKey(x1, y));
        if (y > minY) uf.union(ptKey(x1, y - 1), ptKey(x1, y));
      }
    } else if (y1 === y2) {
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      for (let x = minX; x <= maxX; x++) {
        uf.find(ptKey(x, y1));
        if (x > minX) uf.union(ptKey(x - 1, y1), ptKey(x, y1));
      }
    } else {
      uf.union(ptKey(x1, y1), ptKey(x2, y2));
    }
  }

  // 2. Register all component pin coordinates
  for (const comp of components) {
    const pins = getComponentPinWorldCoords(comp);
    for (const p of pins) {
      uf.find(ptKey(p.x, p.y));
    }
  }

  // 3. Assign node names to connected components (roots)
  const rootToNode = new Map<string, string>();

  // Priority 1: Ground ('0')
  for (const comp of components) {
    if (comp.kind === 'gnd') {
      const pins = getComponentPinWorldCoords(comp);
      for (const p of pins) {
        const root = uf.find(ptKey(p.x, p.y));
        rootToNode.set(root, '0');
      }
    }
  }

  // Priority 2: User-defined Net Labels (e.g. "in", "out", "vcc")
  for (const comp of components) {
    if (comp.kind === 'netlabel') {
      const cleanName = (comp.value || 'net').trim().replace(/\s+/g, '_').toLowerCase();
      const pins = getComponentPinWorldCoords(comp);
      for (const p of pins) {
        const root = uf.find(ptKey(p.x, p.y));
        if (rootToNode.get(root) !== '0') {
          rootToNode.set(root, cleanName);
        }
      }
    }
  }

  // Priority 3: Auto-numbered LTspice-style nodes (n001, n002, ...)
  let autoIndex = 1;
  for (const key of uf.keys()) {
    const root = uf.find(key);
    if (!rootToNode.has(root)) {
      const name = `n${String(autoIndex).padStart(3, '0')}`;
      rootToNode.set(root, name);
      autoIndex++;
    }
  }

  // Build lookup tables for UI probing
  const pointToNode: Record<string, string> = {};
  for (const key of uf.keys()) {
    pointToNode[key] = rootToNode.get(uf.find(key)) || '0';
  }

  const wireToNode: Record<string, string> = {};
  for (const w of wires) {
    const k = ptKey(w.x1, w.y1);
    wireToNode[w.id] = pointToNode[k] || '0';
  }

  const pinToNode: Record<string, string> = {};
  for (const comp of components) {
    const pins = getComponentPinWorldCoords(comp);
    for (const p of pins) {
      pinToNode[`${comp.id}:${p.pinId}`] = pointToNode[ptKey(p.x, p.y)] || '0';
    }
  }

  const allNodesSet = new Set<string>();
  Object.values(pointToNode).forEach((n) => {
    if (n !== '0') allNodesSet.add(n);
  });

  if (!Object.values(pointToNode).includes('0') && components.length > 0) {
    warnings.push('电路中尚未放置 GND (参考地节点 0)，SPICE 矩阵可能奇异，请添加 GND。');
  }

  // 4. Generate SPICE netlist lines (must be pure ASCII so eecircuit-engine's UTF-8 byte offset matches string index)
  const safeAsciiTitle = title.replace(/[^\x20-\x7E]/g, '').trim() || 'WebLTspice Schematic Circuit';
  const lines: string[] = [`* ${safeAsciiTitle}`];
  const modelsNeeded = new Set<string>();
  let needsOpampSubckt = false;

  for (const comp of components) {
    if (comp.kind === 'gnd' || comp.kind === 'netlabel') continue;
    const pins = getComponentPinWorldCoords(comp);
    const n = pins.map((p) => pointToNode[ptKey(p.x, p.y)] || '0');
    const ref = comp.ref.trim();
    const val = comp.value.trim();

    switch (comp.kind) {
      case 'resistor':
      case 'capacitor':
      case 'inductor': {
        lines.push(`${ref} ${n[0]} ${n[1]} ${val}`);
        break;
      }
      case 'diode': {
        const modelName = val || 'D1N4148';
        modelsNeeded.add(modelName.toUpperCase());
        lines.push(`${ref} ${n[0]} ${n[1]} ${modelName}`);
        break;
      }
      case 'npn': {
        // pins: C, B, E
        const modelName = val || 'Q2N2222';
        modelsNeeded.add(modelName.toUpperCase());
        lines.push(`${ref} ${n[0]} ${n[1]} ${n[2]} ${modelName}`);
        break;
      }
      case 'nmos': {
        // pins: D, G, S -> Mxxx D G S B model
        const modelName = val || 'NMOS_STD';
        modelsNeeded.add(modelName.toUpperCase());
        lines.push(`${ref} ${n[0]} ${n[1]} ${n[2]} ${n[2]} ${modelName} W=100u L=1u`);
        break;
      }
      case 'opamp': {
        // pins: inp (+), inn (-), out
        needsOpampSubckt = true;
        lines.push(`X${ref} ${n[0]} ${n[1]} ${n[2]} OPAMP_IDEAL`);
        break;
      }
      case 'vsource': {
        // Support AM(va vo fm fc) syntax via ngspice behavioral voltage source
        const amMatch = val.match(/^AM\s*\(\s*([^\s,)]+)[\s,]+([^\s,)]+)[\s,]+([^\s,)]+)[\s,]+([^\s,)]+)/i);
        if (amMatch && simConfig.type === 'tran') {
          const [, va, vo, fm, fc] = amMatch;
          lines.push(
            `B${ref} ${n[0]} ${n[1]} V=(${vo}+${va}*sin(2*3.14159265*${fm}*time))*sin(2*3.14159265*${fc}*time)`
          );
          break;
        }
        // Support ECG(f_hr amp_v hum_v) synthetic P-QRS-T human electrocardiogram source
        const ecgMatch = val.match(/^ECG\s*\(\s*([^\s,)]+)[\s,]+([^\s,)]+)(?:[\s,]+([^\s,)]+))?/i);
        if (ecgMatch && simConfig.type === 'tran') {
          const f0 = ecgMatch[1];
          const amp = ecgMatch[2];
          const hum = ecgMatch[3] || '0';
          const pWave = `0.15*exp(-40*pow(sin(3.14159265*(${f0}*time-0.22)),2))`;
          const qWave = `-0.15*exp(-400*pow(sin(3.14159265*(${f0}*time-0.37)),2))`;
          const rWave = `1.00*exp(-350*pow(sin(3.14159265*(${f0}*time-0.40)),2))`;
          const sWave = `-0.25*exp(-350*pow(sin(3.14159265*(${f0}*time-0.435)),2))`;
          const tWave = `0.28*exp(-20*pow(sin(3.14159265*(${f0}*time-0.66)),2))`;
          lines.push(
            `B${ref} ${n[0]} ${n[1]} V=${amp}*(${pWave}${qWave}+${rWave}${sWave}+${tWave})+${hum}*sin(2*3.14159265*50*time)`
          );
          break;
        }
        const acPart =
          simConfig.type === 'ac' && comp.params?.ac
            ? ` AC ${comp.params.ac}`
            : simConfig.type === 'ac' && !val.toUpperCase().includes('AC')
              ? ' AC 1'
              : '';
        lines.push(`${ref} ${n[0]} ${n[1]} ${val}${acPart}`);
        break;
      }
      case 'isource': {
        lines.push(`${ref} ${n[0]} ${n[1]} ${val}`);
        break;
      }
    }
  }

  // 5. Append built-in standard semiconductor models & subcircuits
  if (modelsNeeded.has('D1N4148')) {
    lines.push('.model D1N4148 D(Is=2.52n Rs=0.568 N=1.752 Cjo=4p M=0.4 tt=20n BV=100 Ibv=100u)');
  }
  if (modelsNeeded.has('D1N5819')) {
    lines.push('.model D1N5819 D(Is=31.7u Rs=0.051 N=1.379 Cjo=110p M=0.35 BV=40 Ibv=1m)');
  }
  if (modelsNeeded.has('DZ5V1')) {
    lines.push('.model DZ5V1 D(Is=1.5n Rs=1.2 N=1.3 BV=5.1 Ibv=5m Cjo=15p)');
  }
  if (modelsNeeded.has('DLED')) {
    lines.push('.model DLED D(Is=1e-19 Rs=2.5 N=2.0 Cjo=10p)');
  }
  if (modelsNeeded.has('Q2N2222')) {
    lines.push(
      '.model Q2N2222 NPN(Is=14.34f Xti=3 Eg=1.11 Vaf=74.03 Bf=255.9 Ne=1.307 Ise=14.34f Ikf=.2847 Xtb=1.5 Br=6.092 Nc=2 Isc=0 Ikr=0 Rc=1 Cjc=7.306p Mjc=.3416 Vjc=.75 Fc=.5 Cje=22.01p Mje=.377 Vje=.75 Tr=46.91n Tf=411.1p Itf=.6 Vtf=1.7 Xtf=3 Rb=10)'
    );
  }
  if (modelsNeeded.has('NMOS_STD')) {
    lines.push('.model NMOS_STD NMOS(LEVEL=1 VTO=0.7 KP=120u LAMBDA=0.02)');
  }
  if (needsOpampSubckt) {
    lines.push('.subckt OPAMP_IDEAL inp inn out');
    lines.push('Rin inp inn 10Meg');
    lines.push('Bgain int 0 V=10*tanh(5000*V(inp,inn))');
    lines.push('Rbw int out 10');
    lines.push('Cbw out 0 1n');
    lines.push('.ends OPAMP_IDEAL');
  }

  if (simConfig.extraDirectives.trim()) {
    lines.push(simConfig.extraDirectives.trim());
  }

  // Save device currents for interactive LTspice-style current probing in .tran / .dc
  if (simConfig.type === 'tran' || simConfig.type === 'dc') {
    const currentVectors: string[] = [];
    for (const comp of components) {
      const refLower = comp.ref.trim().toLowerCase();
      if (comp.kind === 'resistor' || comp.kind === 'capacitor' || comp.kind === 'isource') {
        currentVectors.push(`@${refLower}[i]`);
      } else if (comp.kind === 'diode') {
        currentVectors.push(`@${refLower}[id]`);
      } else if (comp.kind === 'npn') {
        currentVectors.push(`@${refLower}[ic]`);
      }
    }
    if (currentVectors.length > 0) {
      lines.push(`.save all ${currentVectors.join(' ')}`);
    }
  }

  // 6. Append analysis command
  switch (simConfig.type) {
    case 'tran':
      lines.push(`.tran ${simConfig.tranStep || '10u'} ${simConfig.tranStop || '5m'}`);
      break;
    case 'ac':
      lines.push(
        `.ac ${simConfig.acSweepType || 'dec'} ${simConfig.acPoints || 50} ${simConfig.acStart || '10'} ${simConfig.acStop || '1Meg'}`
      );
      break;
    case 'dc':
      lines.push(
        `.dc ${simConfig.dcSource || 'V1'} ${simConfig.dcStart || '0'} ${simConfig.dcStop || '5'} ${simConfig.dcStep || '0.05'}`
      );
      break;
    case 'op':
      lines.push('.op');
      break;
  }

  lines.push('.end');

  return {
    netlist: lines.join('\n'),
    pointToNode,
    wireToNode,
    pinToNode,
    nodeNames: Array.from(allNodesSet).sort(),
    warnings,
  };
}
