export type ComponentKind =
  | 'resistor'
  | 'capacitor'
  | 'inductor'
  | 'diode'
  | 'npn'
  | 'nmos'
  | 'opamp'
  | 'vsource'
  | 'isource'
  | 'gnd'
  | 'netlabel';

export type Rotation = 0 | 90 | 180 | 270;

export interface PinDef {
  id: string;
  name: string;
  /** Offset from component center in grid units (1 grid unit = 20px) */
  dx: number;
  dy: number;
}

export interface SchematicComponent {
  id: string;
  kind: ComponentKind;
  ref: string; // e.g. R1, C1, V1, D1, Q1, M1, U1, GND, LBL
  value: string; // e.g. "1k", "100n", "SINE(0 5 1k)", "1N4148"
  /** Extra parameters (e.g. AC amplitude/phase, model name, label name) */
  params?: Record<string, string>;
  /** Grid coordinates (multiples of 1 grid unit = 20px) */
  x: number;
  y: number;
  rotation: Rotation;
}

export interface SchematicWire {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export type AnalysisType = 'tran' | 'ac' | 'dc' | 'op';

export interface SimulationConfig {
  type: AnalysisType;
  // Transient (.tran tstep tstop [tstart])
  tranStep: string;
  tranStop: string;
  tranStart?: string;
  // AC (.ac dec/oct/lin npoints fstart fstop)
  acSweepType: 'dec' | 'oct' | 'lin';
  acPoints: number;
  acStart: string;
  acStop: string;
  // DC (.dc srcname vstart vstop vincr)
  dcSource: string;
  dcStart: string;
  dcStop: string;
  dcStep: string;
  // Custom directives (.model, .options, etc.)
  extraDirectives: string;
}

export interface ProbeSignal {
  id: string;
  label: string; // e.g. "V(out)", "V(in)", "I(R1)"
  kind: 'voltage' | 'current';
  target: string; // node name like "out" or component ref like "R1"
  color: string;
}

export interface DataSeries {
  name: string; // e.g. "v(out)", "i(v1)"
  unit: 'V' | 'A' | 'dB' | 'deg' | 's' | 'Hz' | '';
  values: number[];
  /** Present in AC analysis for phase in degrees */
  phaseValues?: number[];
}

export interface SimulationOutput {
  engineName: 'ngspice-wasm' | 'builtin-mna';
  analysisType: AnalysisType;
  xAxis: DataSeries;
  series: Record<string, DataSeries>;
  operatingPoint?: Record<string, number>;
  rawLogs: string[];
  netlistUsed: string;
  elapsedMs: number;
}

export interface CircuitTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  components: SchematicComponent[];
  wires: SchematicWire[];
  simConfig: SimulationConfig;
  defaultProbes: ProbeSignal[];
}
