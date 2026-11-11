import { ComponentKind, PinDef, Rotation, SchematicComponent } from '../types/circuit';

export interface ComponentMeta {
  kind: ComponentKind;
  label: string;
  shortLabel: string;
  prefix: string;
  defaultValue: string;
  defaultParams?: Record<string, string>;
  shortcut?: string;
  pins: PinDef[];
  description: string;
}

export const COMPONENT_LIBRARY: Record<ComponentKind, ComponentMeta> = {
  resistor: {
    kind: 'resistor',
    label: '电阻 (Resistor)',
    shortLabel: 'R',
    prefix: 'R',
    defaultValue: '1k',
    shortcut: 'R',
    pins: [
      { id: 'p1', name: '1', dx: -3, dy: 0 },
      { id: 'p2', name: '2', dx: 3, dy: 0 },
    ],
    description: '线性无源电阻，支持 k/M/m/u/n 等 SPICE 单位后缀',
  },
  capacitor: {
    kind: 'capacitor',
    label: '电容 (Capacitor)',
    shortLabel: 'C',
    prefix: 'C',
    defaultValue: '100n',
    shortcut: 'C',
    pins: [
      { id: 'p1', name: '1', dx: -3, dy: 0 },
      { id: 'p2', name: '2', dx: 3, dy: 0 },
    ],
    description: '理想电容，支持 u/n/p 等单位后缀',
  },
  inductor: {
    kind: 'inductor',
    label: '电感 (Inductor)',
    shortLabel: 'L',
    prefix: 'L',
    defaultValue: '10m',
    shortcut: 'L',
    pins: [
      { id: 'p1', name: '1', dx: -3, dy: 0 },
      { id: 'p2', name: '2', dx: 3, dy: 0 },
    ],
    description: '理想电感，支持 m/u/n 等单位后缀',
  },
  diode: {
    kind: 'diode',
    label: '二极管 (Diode)',
    shortLabel: 'D',
    prefix: 'D',
    defaultValue: 'D1N4148',
    shortcut: 'D',
    pins: [
      { id: 'p1', name: 'A', dx: -3, dy: 0 }, // Anode
      { id: 'p2', name: 'K', dx: 3, dy: 0 },  // Cathode
    ],
    description: 'PN 结二极管 (内置 D1N4148 / DLED 模型)',
  },
  npn: {
    kind: 'npn',
    label: 'NPN 三极管 (BJT)',
    shortLabel: 'Q',
    prefix: 'Q',
    defaultValue: 'Q2N2222',
    shortcut: 'Q',
    pins: [
      { id: 'c', name: 'C', dx: 2, dy: -3 }, // Collector
      { id: 'b', name: 'B', dx: -3, dy: 0 }, // Base
      { id: 'e', name: 'E', dx: 2, dy: 3 },  // Emitter
    ],
    description: '双极型 NPN 晶体管 (内置 Q2N2222 模型, 引脚顺序 C-B-E)',
  },
  nmos: {
    kind: 'nmos',
    label: 'NMOS 场效应管',
    shortLabel: 'M',
    prefix: 'M',
    defaultValue: 'NMOS_STD',
    shortcut: 'M',
    pins: [
      { id: 'd', name: 'D', dx: 2, dy: -3 }, // Drain
      { id: 'g', name: 'G', dx: -3, dy: 0 }, // Gate
      { id: 's', name: 'S', dx: 2, dy: 3 },  // Source
    ],
    description: 'N 沟道增强型 MOSFET (D-G-S-S 四端映射)',
  },
  opamp: {
    kind: 'opamp',
    label: '理想运放 (Op-Amp)',
    shortLabel: 'U',
    prefix: 'U',
    defaultValue: '100k',
    shortcut: 'U',
    pins: [
      { id: 'inp', name: '+', dx: -3, dy: -1 },
      { id: 'inn', name: '-', dx: -3, dy: 1 },
      { id: 'out', name: 'OUT', dx: 3, dy: 0 },
    ],
    description: '高增益差分运算放大器子电路模型 (VCVS + 极点)',
  },
  vsource: {
    kind: 'vsource',
    label: '电压源 (Voltage)',
    shortLabel: 'V',
    prefix: 'V',
    defaultValue: 'SINE(0 5 1k)',
    defaultParams: { ac: '1' },
    shortcut: 'V',
    pins: [
      { id: 'p', name: '+', dx: 0, dy: -3 },
      { id: 'n', name: '-', dx: 0, dy: 3 },
    ],
    description: '独立电压源，支持 DC 5 / SINE(0 5 1k) / PULSE(0 5 0 1n 1n 0.5m 1m)',
  },
  isource: {
    kind: 'isource',
    label: '电流源 (Current)',
    shortLabel: 'I',
    prefix: 'I',
    defaultValue: '1m',
    shortcut: 'I',
    pins: [
      { id: 'p', name: '+', dx: 0, dy: -3 },
      { id: 'n', name: '-', dx: 0, dy: 3 },
    ],
    description: '独立电流源，支持直流、正弦及脉冲激励',
  },
  gnd: {
    kind: 'gnd',
    label: '接地 (GND / 0)',
    shortLabel: 'GND',
    prefix: 'GND',
    defaultValue: '0',
    shortcut: 'G',
    pins: [{ id: 'gnd', name: '0', dx: 0, dy: -1 }],
    description: 'SPICE 全局参考零电位节点 (Node 0)',
  },
  netlabel: {
    kind: 'netlabel',
    label: '网络标号 (Net Name)',
    shortLabel: 'NET',
    prefix: 'LBL',
    defaultValue: 'out',
    shortcut: 'N',
    pins: [{ id: 'pin', name: 'NET', dx: 0, dy: 0 }],
    description: '为导线命名 (如 in, out, vcc) 以便直接观测和跨区域连接',
  },
};

export function rotateOffset(dx: number, dy: number, rotation: Rotation): { dx: number; dy: number } {
  switch (rotation) {
    case 0:
      return { dx, dy };
    case 90:
      return { dx: -dy, dy: dx };
    case 180:
      return { dx: -dx, dy: -dy };
    case 270:
      return { dx: dy, dy: -dx };
  }
}

export function getComponentPinWorldCoords(comp: SchematicComponent): Array<{
  pinId: string;
  pinName: string;
  x: number;
  y: number;
}> {
  const meta = COMPONENT_LIBRARY[comp.kind];
  return meta.pins.map((pin) => {
    const rot = rotateOffset(pin.dx, pin.dy, comp.rotation);
    return {
      pinId: pin.id,
      pinName: pin.name,
      x: comp.x + rot.dx,
      y: comp.y + rot.dy,
    };
  });
}

export function getNextRef(kind: ComponentKind, existing: SchematicComponent[]): string {
  const meta = COMPONENT_LIBRARY[kind];
  if (kind === 'gnd') return `GND${existing.filter((c) => c.kind === 'gnd').length + 1}`;
  if (kind === 'netlabel') return `LBL${existing.filter((c) => c.kind === 'netlabel').length + 1}`;
  const prefix = meta.prefix;
  let maxNum = 0;
  for (const c of existing) {
    if (c.ref.toUpperCase().startsWith(prefix)) {
      const num = parseInt(c.ref.slice(prefix.length), 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  }
  return `${prefix}${maxNum + 1}`;
}
