import React, { useState, useRef, useMemo } from 'react';
import {
  ComponentKind,
  ProbeSignal,
  Rotation,
  SchematicComponent,
  SchematicWire,
} from '../types/circuit';
import {
  COMPONENT_LIBRARY,
  getComponentPinWorldCoords,
  getNextRef,
} from '../utils/componentLibrary';
import { CompiledCircuit } from '../utils/netlistGenerator';
import { ZoomIn, ZoomOut, Maximize2, RotateCw, Trash2, Activity } from 'lucide-react';

export type EditorTool = 'select' | 'wire' | 'probe' | 'place' | 'delete';

interface SchematicCanvasProps {
  components: SchematicComponent[];
  wires: SchematicWire[];
  compiled: CompiledCircuit;
  activeTool: EditorTool;
  placingKind: ComponentKind | null;
  placingRotation: Rotation;
  selectedId: string | null;
  probes: ProbeSignal[];
  operatingPoint?: Record<string, number>;
  onSelect: (id: string | null) => void;
  onUpdateComponents: (next: SchematicComponent[]) => void;
  onUpdateWires: (next: SchematicWire[]) => void;
  onRotatePlacement: () => void;
  onToggleProbe: (kind: 'voltage' | 'current', target: string) => void;
  onQuickEditComponent: (comp: SchematicComponent) => void;
  onSwitchTool: (tool: EditorTool) => void;
}

const GRID = 20;

function renderSymbolGraphic(comp: SchematicComponent, isSelected: boolean, probeColor?: string) {
  const stroke = probeColor || (isSelected ? '#38bdf8' : '#e2e8f0');
  const accent = isSelected ? '#38bdf8' : '#94a3b8';

  switch (comp.kind) {
    case 'resistor':
      return (
        <g>
          <path
            d="M -60 0 L -36 0 L -30 -10 L -18 10 L -6 -10 L 6 10 L 18 -10 L 30 10 L 36 0 L 60 0"
            fill="none"
            stroke={stroke}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      );
    case 'capacitor':
      return (
        <g>
          <line x1={-60} y1={0} x2={-7} y2={0} stroke={stroke} strokeWidth={2.2} />
          <line x1={-7} y1={-16} x2={-7} y2={16} stroke={stroke} strokeWidth={2.8} />
          <line x1={7} y1={-16} x2={7} y2={16} stroke={stroke} strokeWidth={2.8} />
          <line x1={7} y1={0} x2={60} y2={0} stroke={stroke} strokeWidth={2.2} />
        </g>
      );
    case 'inductor':
      return (
        <g>
          <path
            d="M -60 0 L -36 0 A 9 9 0 0 1 -18 0 A 9 9 0 0 1 0 0 A 9 9 0 0 1 18 0 A 9 9 0 0 1 36 0 L 60 0"
            fill="none"
            stroke={stroke}
            strokeWidth={2.2}
            strokeLinecap="round"
          />
        </g>
      );
    case 'diode': {
      const valUpper = comp.value.toUpperCase();
      const isZener = valUpper.includes('Z');
      const isLed = valUpper.includes('LED');
      const diodeFill = isLed
        ? 'rgba(244, 63, 94, 0.25)'
        : isZener
          ? 'rgba(52, 211, 153, 0.2)'
          : 'rgba(56, 189, 248, 0.14)';
      return (
        <g>
          <line x1={-60} y1={0} x2={-14} y2={0} stroke={stroke} strokeWidth={2.2} />
          <polygon
            points="-14,-13 -14,13 14,0"
            fill={diodeFill}
            stroke={stroke}
            strokeWidth={2.2}
            strokeLinejoin="round"
          />
          {isZener ? (
            <path
              d="M 8 -14 L 14 -14 L 14 14 L 20 14"
              fill="none"
              stroke={stroke}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            <line x1={14} y1={-14} x2={14} y2={14} stroke={stroke} strokeWidth={2.6} />
          )}
          {isLed && (
            <g stroke="#f43f5e" strokeWidth={1.6} fill="#f43f5e">
              <line x1={-4} y1={-15} x2={6} y2={-25} />
              <polygon points="6,-25 1,-23 4,-20" />
              <line x1={4} y1={-13} x2={14} y2={-23} />
              <polygon points="14,-23 9,-21 12,-18" />
            </g>
          )}
          <line x1={14} y1={0} x2={60} y2={0} stroke={stroke} strokeWidth={2.2} />
        </g>
      );
    }
    case 'npn':
      // pins: C=(40,-60), B=(-60,0), E=(40,60)
      return (
        <g>
          <circle
            cx={8}
            cy={0}
            r={28}
            fill="rgba(15, 23, 42, 0.55)"
            stroke={accent}
            strokeWidth={1.6}
          />
          <line x1={-60} y1={0} x2={-8} y2={0} stroke={stroke} strokeWidth={2.2} />
          <line x1={-8} y1={-18} x2={-8} y2={18} stroke={stroke} strokeWidth={3.2} />
          <path
            d="M -8 -8 L 40 -36 L 40 -60"
            fill="none"
            stroke={stroke}
            strokeWidth={2.2}
          />
          <path
            d="M -8 8 L 40 36 L 40 60"
            fill="none"
            stroke={stroke}
            strokeWidth={2.2}
          />
          {/* NPN emitter arrow */}
          <polygon points="32,31 20,30 26,21" fill={stroke} />
        </g>
      );
    case 'nmos':
      // pins: D=(40,-60), G=(-60,0), S=(40,60)
      return (
        <g>
          <circle
            cx={10}
            cy={0}
            r={28}
            fill="rgba(15, 23, 42, 0.55)"
            stroke={accent}
            strokeWidth={1.6}
          />
          <line x1={-60} y1={0} x2={-10} y2={0} stroke={stroke} strokeWidth={2.2} />
          <line x1={-10} y1={-16} x2={-10} y2={16} stroke={stroke} strokeWidth={2.5} />
          <line x1={-2} y1={-20} x2={-2} y2={20} stroke={stroke} strokeWidth={2.5} />
          <path
            d="M -2 -14 L 40 -14 L 40 -60"
            fill="none"
            stroke={stroke}
            strokeWidth={2.2}
          />
          <path
            d="M -2 14 L 40 14 L 40 60"
            fill="none"
            stroke={stroke}
            strokeWidth={2.2}
          />
        </g>
      );
    case 'opamp':
      // pins: inp=(-60,-20), inn=(-60,20), out=(60,0)
      return (
        <g>
          <line x1={-60} y1={-20} x2={-32} y2={-20} stroke={stroke} strokeWidth={2.2} />
          <line x1={-60} y1={20} x2={-32} y2={20} stroke={stroke} strokeWidth={2.2} />
          <line x1={32} y1={0} x2={60} y2={0} stroke={stroke} strokeWidth={2.2} />
          <polygon
            points="-32,-38 -32,38 32,0"
            fill="rgba(30, 41, 59, 0.85)"
            stroke={stroke}
            strokeWidth={2.2}
            strokeLinejoin="round"
          />
          <text x={-24} y={-15} fill="#38bdf8" fontSize={13} fontWeight="bold">
            +
          </text>
          <text x={-24} y={25} fill="#f43f5e" fontSize={14} fontWeight="bold">
            −
          </text>
        </g>
      );
    case 'vsource':
      // pins: p=(0,-60), n=(0,60)
      return (
        <g>
          <line x1={0} y1={-60} x2={0} y2={-24} stroke={stroke} strokeWidth={2.2} />
          <line x1={0} y1={24} x2={0} y2={60} stroke={stroke} strokeWidth={2.2} />
          <circle
            cx={0}
            cy={0}
            r={24}
            fill="rgba(15, 23, 42, 0.8)"
            stroke={stroke}
            strokeWidth={2.2}
          />
          <text x={-4.5} y={-7} fill="#4ade80" fontSize={14} fontWeight="bold">
            +
          </text>
          <text x={-4.5} y={17} fill="#94a3b8" fontSize={14} fontWeight="bold">
            −
          </text>
        </g>
      );
    case 'isource':
      return (
        <g>
          <line x1={0} y1={-60} x2={0} y2={-24} stroke={stroke} strokeWidth={2.2} />
          <line x1={0} y1={24} x2={0} y2={60} stroke={stroke} strokeWidth={2.2} />
          <circle
            cx={0}
            cy={0}
            r={24}
            fill="rgba(15, 23, 42, 0.8)"
            stroke={stroke}
            strokeWidth={2.2}
          />
          <line x1={0} y1={12} x2={0} y2={-12} stroke="#38bdf8" strokeWidth={2} />
          <polygon points="0,-15 -5,-6 5,-6" fill="#38bdf8" />
        </g>
      );
    case 'gnd':
      // pin is at (0, -20)
      return (
        <g>
          <line x1={0} y1={-20} x2={0} y2={0} stroke={stroke} strokeWidth={2.2} />
          <line x1={-16} y1={0} x2={16} y2={0} stroke={stroke} strokeWidth={2.4} />
          <line x1={-10} y1={6} x2={10} y2={6} stroke={stroke} strokeWidth={2.2} />
          <line x1={-4} y1={12} x2={4} y2={12} stroke={stroke} strokeWidth={2} />
        </g>
      );
    case 'netlabel':
      // pin is at (0, 0)
      return (
        <g>
          <circle cx={0} cy={0} r={3.5} fill="#fbbf24" />
          <path
            d="M 0 0 L 8 -10 L 46 -10 L 46 6 L 8 6 Z"
            fill="rgba(251, 191, 36, 0.16)"
            stroke="#fbbf24"
            strokeWidth={1.5}
          />
          <text
            x={12}
            y={1}
            fill="#fde68a"
            fontSize={11}
            fontWeight={700}
            fontFamily="JetBrains Mono, monospace"
          >
            {comp.value}
          </text>
        </g>
      );
  }
}

export const SchematicCanvas: React.FC<SchematicCanvasProps> = ({
  components,
  wires,
  compiled,
  activeTool,
  placingKind,
  placingRotation,
  selectedId,
  probes,
  operatingPoint,
  onSelect,
  onUpdateComponents,
  onUpdateWires,
  onRotatePlacement,
  onToggleProbe,
  onQuickEditComponent,
  onSwitchTool,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [zoom, setZoom] = useState<number>(1.05);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 40, y: 20 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const [mouseGrid, setMouseGrid] = useState<{ x: number; y: number }>({ x: 15, y: 12 });
  const [wireStart, setWireStart] = useState<{ x: number; y: number } | null>(null);
  const [draggingCompId, setDraggingCompId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredCompId, setHoveredCompId] = useState<string | null>(null);

  // Convert client mouse coords to snapped grid coordinates
  const clientToGrid = (clientX: number, clientY: number): { x: number; y: number } => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    const worldX = (clientX - rect.left - pan.x) / zoom;
    const worldY = (clientY - rect.top - pan.y) / zoom;
    return {
      x: Math.round(worldX / GRID),
      y: Math.round(worldY / GRID),
    };
  };

  // Compute solder junction dots (points where >= 3 wire/pin connections meet)
  const junctionPoints = useMemo(() => {
    const counts = new Map<string, number>();
    const inc = (x: number, y: number) => {
      const k = `${Math.round(x)},${Math.round(y)}`;
      counts.set(k, (counts.get(k) || 0) + 1);
    };
    for (const w of wires) {
      inc(w.x1, w.y1);
      inc(w.x2, w.y2);
    }
    for (const c of components) {
      for (const p of getComponentPinWorldCoords(c)) {
        inc(p.x, p.y);
      }
    }
    // Also check T-junctions where an endpoint lies strictly inside another wire segment
    for (const [k] of counts) {
      const [px, py] = k.split(',').map(Number);
      for (const w of wires) {
        if (w.x1 === w.x2 && px === w.x1 && py > Math.min(w.y1, w.y2) && py < Math.max(w.y1, w.y2)) {
          counts.set(k, (counts.get(k) || 0) + 2);
        } else if (
          w.y1 === w.y2 &&
          py === w.y1 &&
          px > Math.min(w.x1, w.x2) &&
          px < Math.max(w.x1, w.x2)
        ) {
          counts.set(k, (counts.get(k) || 0) + 2);
        }
      }
    }

    const result: Array<{ x: number; y: number }> = [];
    for (const [k, cnt] of counts.entries()) {
      if (cnt >= 3) {
        const [x, y] = k.split(',').map(Number);
        result.push({ x, y });
      }
    }
    return result;
  }, [wires, components]);

  // Map probed targets to their colors
  const probeColorMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of probes) {
      map.set(`${p.kind}:${p.target.toLowerCase()}`, p.color);
    }
    return map;
  }, [probes]);

  const commitOrthogonalWire = (x1: number, y1: number, x2: number, y2: number) => {
    if (x1 === x2 && y1 === y2) return;
    const nextWires = [...wires];
    if (x1 !== x2 && y1 !== y2) {
      nextWires.push({
        id: `w_${Date.now()}_1`,
        x1,
        y1,
        x2,
        y2: y1,
      });
      nextWires.push({
        id: `w_${Date.now()}_2`,
        x1: x2,
        y1,
        x2,
        y2,
      });
    } else {
      nextWires.push({
        id: `w_${Date.now()}`,
        x1,
        y1,
        x2,
        y2,
      });
    }
    onUpdateWires(nextWires);
  };

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button === 2) {
      // Right-click cancels wire drawing or placement
      setWireStart(null);
      if (activeTool === 'place' || activeTool === 'wire') {
        onSwitchTool('select');
      }
      return;
    }

    const pt = clientToGrid(e.clientX, e.clientY);

    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    if (activeTool === 'place' && placingKind) {
      const meta = COMPONENT_LIBRARY[placingKind];
      const newComp: SchematicComponent = {
        id: `comp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        kind: placingKind,
        ref: getNextRef(placingKind, components),
        value: meta.defaultValue,
        params: meta.defaultParams ? { ...meta.defaultParams } : undefined,
        x: pt.x,
        y: pt.y,
        rotation: placingRotation,
      };
      onUpdateComponents([...components, newComp]);
      onSelect(newComp.id);
      return;
    }

    if (activeTool === 'wire') {
      if (!wireStart) {
        setWireStart(pt);
      } else {
        commitOrthogonalWire(wireStart.x, wireStart.y, pt.x, pt.y);
        setWireStart(pt);
      }
      return;
    }

    if (e.target === svgRef.current || (e.target as SVGElement).dataset.bg === 'true') {
      onSelect(null);
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const pt = clientToGrid(e.clientX, e.clientY);
    setMouseGrid(pt);

    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
      return;
    }

    if (draggingCompId) {
      const next = components.map((c) =>
        c.id === draggingCompId ? { ...c, x: pt.x - dragOffset.dx, y: pt.y - dragOffset.dy } : c
      );
      onUpdateComponents(next);
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggingCompId(null);
  };

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const nextZoom = Math.min(2.4, Math.max(0.45, zoom * factor));
    setZoom(nextZoom);
  };

  const handleComponentMouseDown = (e: React.MouseEvent, comp: SchematicComponent) => {
    e.stopPropagation();
    if (e.button !== 0) return;

    if (activeTool === 'delete') {
      onUpdateComponents(components.filter((c) => c.id !== comp.id));
      if (selectedId === comp.id) onSelect(null);
      return;
    }

    if (activeTool === 'probe') {
      if (comp.kind === 'netlabel') {
        onToggleProbe('voltage', comp.value);
      } else if (comp.kind !== 'gnd') {
        onToggleProbe('current', comp.ref);
      }
      return;
    }

    if (activeTool === 'select') {
      onSelect(comp.id);
      const pt = clientToGrid(e.clientX, e.clientY);
      setDraggingCompId(comp.id);
      setDragOffset({ dx: pt.x - comp.x, dy: pt.y - comp.y });
    }
  };

  const handlePinMouseDown = (
    e: React.MouseEvent,
    pinWorld: { x: number; y: number },
    comp: SchematicComponent,
    pinId: string
  ) => {
    e.stopPropagation();
    if (e.button !== 0) return;

    if (activeTool === 'probe') {
      const node = compiled.pinToNode[`${comp.id}:${pinId}`];
      if (node && node !== '0') {
        onToggleProbe('voltage', node);
      }
      return;
    }

    // In select or wire mode, clicking a pin starts or completes a wire
    if (!wireStart) {
      setWireStart({ x: pinWorld.x, y: pinWorld.y });
      if (activeTool !== 'wire') onSwitchTool('wire');
    } else {
      commitOrthogonalWire(wireStart.x, wireStart.y, pinWorld.x, pinWorld.y);
      setWireStart(null);
    }
  };

  const handleWireClick = (e: React.MouseEvent, w: SchematicWire) => {
    e.stopPropagation();
    if (activeTool === 'delete') {
      onUpdateWires(wires.filter((item) => item.id !== w.id));
      return;
    }
    const node = compiled.wireToNode[w.id];
    if (activeTool === 'probe') {
      if (node && node !== '0') {
        onToggleProbe('voltage', node);
      }
      return;
    }
    if (activeTool === 'wire') {
      const pt = clientToGrid(e.clientX, e.clientY);
      if (!wireStart) {
        setWireStart(pt);
      } else {
        commitOrthogonalWire(wireStart.x, wireStart.y, pt.x, pt.y);
        setWireStart(null);
      }
      return;
    }
    onSelect(w.id);
  };

  const hoveredOpVoltage =
    hoveredNode && operatingPoint ? operatingPoint[`v(${hoveredNode.toLowerCase()})`] : undefined;

  return (
    <div
      className="schematic-container"
      onContextMenu={(e) => e.preventDefault()}
      style={{
         cursor:
          activeTool === 'wire'
            ? 'crosshair'
            : activeTool === 'probe'
              ? 'pointer'
              : isPanning
                ? 'grabbing'
                : 'default',
      }}
    >
      {/* Top Floating Banner inside Canvas */}
      <div className="canvas-overlay-top">
        <div className="canvas-mode-pill">
          <span className="mode-dot" data-mode={activeTool} />
          {activeTool === 'select' && '选择/编辑模式 (双击元件改值，点击引脚可直接连线)'}
          {activeTool === 'wire' && '正交连线模式 (左键点击拐点/引脚，右键结束连线)'}
          {activeTool === 'probe' && 'LTspice 探针模式 (点击导线测节点电压 V(n)，点击器件测支路电流 I(Rx))'}
          {activeTool === 'place' &&
            placingKind &&
            `放置 ${COMPONENT_LIBRARY[placingKind].label} (按 R 旋转，右键退出)`}
          {activeTool === 'delete' && '删除模式 (点击任意元件或导线即可移除)'}
        </div>

        {hoveredNode && (
          <div className="canvas-node-badge">
            <Activity size={13} />
            <span>
              Node: <strong>{hoveredNode.toUpperCase()}</strong>
            </span>
            {hoveredOpVoltage !== undefined && (
              <span className="op-readout">
                DC: {hoveredOpVoltage.toFixed(3)} V
              </span>
            )}
          </div>
        )}
      </div>

      <svg
        ref={svgRef}
        className="schematic-svg"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
      >
        <defs>
          <pattern
            id="ltspice-grid"
            width={GRID * zoom}
            height={GRID * zoom}
            patternUnits="userSpaceOnUse"
            x={pan.x % (GRID * zoom)}
            y={pan.y % (GRID * zoom)}
          >
            <circle cx={0} cy={0} r={1} fill="rgba(148, 163, 184, 0.22)" />
          </pattern>
        </defs>

        {/* Background Grid */}
        <rect
          width="100%"
          height="100%"
          fill="url(#ltspice-grid)"
          data-bg="true"
        />

        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Render Wires */}
          {wires.map((w) => {
            const node = compiled.wireToNode[w.id] || '0';
            const probeColor = probeColorMap.get(`voltage:${node.toLowerCase()}`);
            const isHovered = hoveredNode !== null && hoveredNode === node && node !== '0';
            const isSelected = selectedId === w.id;

            return (
              <g
                key={w.id}
                onClick={(e) => handleWireClick(e, w)}
                onDoubleClick={() => {
                  if (node && node !== '0') onToggleProbe('voltage', node);
                }}
                onMouseEnter={() => setHoveredNode(node)}
                onMouseLeave={() => setHoveredNode(null)}
                style={{ cursor: activeTool === 'probe' ? 'pointer' : 'inherit' }}
              >
                {/* Invisible wider hit-area */}
                <line
                  x1={w.x1 * GRID}
                  y1={w.y1 * GRID}
                  x2={w.x2 * GRID}
                  y2={w.y2 * GRID}
                  stroke="transparent"
                  strokeWidth={12}
                />
                <line
                  x1={w.x1 * GRID}
                  y1={w.y1 * GRID}
                  x2={w.x2 * GRID}
                  y2={w.y2 * GRID}
                  stroke={
                    probeColor
                      ? probeColor
                      : isSelected
                        ? '#38bdf8'
                        : isHovered
                          ? '#f43f5e'
                          : '#34d399'
                  }
                  strokeWidth={isHovered || isSelected || probeColor ? 3.2 : 2.2}
                  strokeLinecap="round"
                />
              </g>
            );
          })}

          {/* Solder Junction Dots */}
          {junctionPoints.map((pt, idx) => (
            <circle
              key={`j_${idx}`}
              cx={pt.x * GRID}
              cy={pt.y * GRID}
              r={4}
              fill="#34d399"
              stroke="#0f172a"
              strokeWidth={1}
            />
          ))}

          {/* Active Orthogonal Wire Drawing Preview */}
          {wireStart && (
            <g pointerEvents="none">
              <polyline
                points={`${wireStart.x * GRID},${wireStart.y * GRID} ${mouseGrid.x * GRID},${wireStart.y * GRID} ${mouseGrid.x * GRID},${mouseGrid.y * GRID}`}
                fill="none"
                stroke="#38bdf8"
                strokeWidth={2.2}
                strokeDasharray="5,4"
              />
              <circle
                cx={wireStart.x * GRID}
                cy={wireStart.y * GRID}
                r={4.5}
                fill="#38bdf8"
              />
              <circle
                cx={mouseGrid.x * GRID}
                cy={mouseGrid.y * GRID}
                r={4.5}
                fill="#38bdf8"
              />
            </g>
          )}

          {/* Render Schematic Components */}
          {components.map((comp) => {
            const isSelected = selectedId === comp.id;
            const currentProbeColor = probeColorMap.get(`current:${comp.ref.toLowerCase()}`);
            const pins = getComponentPinWorldCoords(comp);
            const isHovered = hoveredCompId === comp.id;

            return (
              <g
                key={comp.id}
                transform={`translate(${comp.x * GRID}, ${comp.y * GRID})`}
                onMouseDown={(e) => handleComponentMouseDown(e, comp)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (activeTool === 'probe' && comp.kind !== 'gnd') {
                    onToggleProbe('current', comp.ref);
                  } else {
                    onQuickEditComponent(comp);
                  }
                }}
                onMouseEnter={() => setHoveredCompId(comp.id)}
                onMouseLeave={() => setHoveredCompId(null)}
                style={{ cursor: activeTool === 'probe' ? 'pointer' : 'move' }}
              >
                {/* Transparent bounding hit box */}
                {comp.kind !== 'gnd' && comp.kind !== 'netlabel' && (
                  <rect
                    x={-44}
                    y={-28}
                    width={88}
                    height={56}
                    rx={6}
                    fill={
                      isSelected
                        ? 'rgba(56, 189, 248, 0.09)'
                        : isHovered && activeTool === 'probe'
                          ? 'rgba(59, 130, 246, 0.14)'
                          : 'transparent'
                    }
                    stroke={isSelected ? 'rgba(56, 189, 248, 0.45)' : 'none'}
                    strokeDasharray="3,3"
                    transform={`rotate(${comp.rotation})`}
                  />
                )}

                {/* Rotated Symbol Graphic */}
                <g transform={`rotate(${comp.rotation})`}>
                  {renderSymbolGraphic(comp, isSelected, currentProbeColor)}
                </g>

                {/* Ref & Value Labels (kept upright for readability!) */}
                {comp.kind !== 'gnd' && comp.kind !== 'netlabel' && (
                  <g pointerEvents="none">
                    <text
                      x={comp.rotation === 90 || comp.rotation === 270 ? 18 : -22}
                      y={comp.rotation === 90 || comp.rotation === 270 ? -6 : -18}
                      fill={currentProbeColor || '#cbd5e1'}
                      fontSize={11.5}
                      fontWeight={700}
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {comp.ref}
                    </text>
                    <text
                      x={comp.rotation === 90 || comp.rotation === 270 ? 18 : -22}
                      y={comp.rotation === 90 || comp.rotation === 270 ? 10 : 28}
                      fill="#94a3b8"
                      fontSize={10.5}
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {comp.value}
                    </text>
                  </g>
                )}

                {/* Interactive Pin Terminals */}
                {pins.map((p) => {
                  const relX = (p.x - comp.x) * GRID;
                  const relY = (p.y - comp.y) * GRID;
                  const pinNode = compiled.pinToNode[`${comp.id}:${p.pinId}`] || '0';
                  const vProbeColor = probeColorMap.get(`voltage:${pinNode.toLowerCase()}`);

                  return (
                    <g
                      key={p.pinId}
                      transform={`translate(${relX}, ${relY})`}
                      onMouseDown={(e) => handlePinMouseDown(e, { x: p.x, y: p.y }, comp, p.pinId)}
                      onMouseEnter={() => setHoveredNode(pinNode)}
                      onMouseLeave={() => setHoveredNode(null)}
                      style={{ cursor: 'crosshair' }}
                    >
                      <circle r={8} fill="transparent" />
                      <circle
                        r={3.5}
                        fill={vProbeColor || '#0f172a'}
                        stroke={vProbeColor || '#38bdf8'}
                        strokeWidth={1.8}
                      />
                    </g>
                  );
                })}
              </g>
            );
          })}

          {/* Ghost Preview when placing a new component */}
          {activeTool === 'place' && placingKind && (
            <g
              transform={`translate(${mouseGrid.x * GRID}, ${mouseGrid.y * GRID}) rotate(${placingRotation})`}
              opacity={0.55}
              pointerEvents="none"
            >
              {renderSymbolGraphic(
                {
                  id: 'ghost',
                  kind: placingKind,
                  ref: COMPONENT_LIBRARY[placingKind].prefix + '?',
                  value: COMPONENT_LIBRARY[placingKind].defaultValue,
                  x: mouseGrid.x,
                  y: mouseGrid.y,
                  rotation: placingRotation,
                },
                true
              )}
            </g>
          )}
        </g>
      </svg>

      {/* Bottom-Left Canvas Controls */}
      <div className="canvas-hud-bottom">
        <button
          className="hud-btn"
          onClick={() => setZoom((z) => Math.min(2.4, z + 0.15))}
          title="放大画布"
        >
          <ZoomIn size={15} />
        </button>
        <span className="hud-zoom-text">{Math.round(zoom * 100)}%</span>
        <button
          className="hud-btn"
          onClick={() => setZoom((z) => Math.max(0.45, z - 0.15))}
          title="缩小画布"
        >
          <ZoomOut size={15} />
        </button>
        <button
          className="hud-btn"
          onClick={() => {
            setZoom(1.05);
            setPan({ x: 40, y: 20 });
          }}
          title="重置视图居中"
        >
          <Maximize2 size={15} />
        </button>
        {activeTool === 'place' && (
          <button
            className="hud-btn highlight"
            onClick={onRotatePlacement}
            title="旋转待放置元件 (快捷键 R)"
          >
            <RotateCw size={15} />
            <span>{placingRotation}°</span>
          </button>
        )}
        {selectedId && (
          <button
            className="hud-btn danger"
            onClick={() => {
              onUpdateComponents(components.filter((c) => c.id !== selectedId));
              onUpdateWires(wires.filter((w) => w.id !== selectedId));
              onSelect(null);
            }}
            title="删除选中项 (Delete)"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </div>
  );
};
