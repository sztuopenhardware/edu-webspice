import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  ComponentKind,
  ProbeSignal,
  Rotation,
  SchematicComponent,
  SchematicWire,
  SimulationConfig,
  SimulationOutput,
} from './types/circuit';
import { COMPONENT_LIBRARY } from './utils/componentLibrary';
import { compileCircuitToSpice } from './utils/netlistGenerator';
import { CIRCUIT_TEMPLATES } from './utils/circuitTemplates';
import { SchematicCanvas, EditorTool } from './components/SchematicCanvas';
import { WaveformViewer } from './components/WaveformViewer';
import { spiceRunner } from './engine/spiceRunner';
import {
  Play,
  MousePointer,
  GitCommit,
  Activity,
  Trash2,
  RotateCw,
  FileCode,
  Terminal,
  Sliders,
  Cpu,
  BookOpen,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Download,
  Upload,
} from 'lucide-react';
import './App.css';

const PROBE_PALETTE = [
  '#38bdf8',
  '#4ade80',
  '#f59e0b',
  '#f43f5e',
  '#a855f7',
  '#2dd4bf',
  '#fb7185',
  '#facc15',
];

export function App() {
  const defaultTemplate = CIRCUIT_TEMPLATES[0];

  const [activeTemplateId, setActiveTemplateId] = useState<string>(defaultTemplate.id);
  const [components, setComponents] = useState<SchematicComponent[]>(defaultTemplate.components);
  const [wires, setWires] = useState<SchematicWire[]>(defaultTemplate.wires);
  const [simConfig, setSimConfig] = useState<SimulationConfig>(defaultTemplate.simConfig);
  const [probes, setProbes] = useState<ProbeSignal[]>(defaultTemplate.defaultProbes);

  const [activeTool, setActiveTool] = useState<EditorTool>('select');
  const [placingKind, setPlacingKind] = useState<ComponentKind | null>(null);
  const [placingRotation, setPlacingRotation] = useState<Rotation>(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [rightTab, setRightTab] = useState<'inspector' | 'netlist' | 'log'>('inspector');
  const [customNetlistMode, setCustomNetlistMode] = useState<boolean>(false);
  const [customNetlistText, setCustomNetlistText] = useState<string>('');

  const [simOutput, setSimOutput] = useState<SimulationOutput | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [engineReady, setEngineReady] = useState<boolean>(false);
  const [simError, setSimError] = useState<string | null>(null);

  // Compile schematic to SPICE netlist in real time
  const compiled = useMemo(
    () => compileCircuitToSpice(components, wires, simConfig),
    [components, wires, simConfig]
  );

  useEffect(() => {
    if (!customNetlistMode) {
      setCustomNetlistText(compiled.netlist);
    }
  }, [compiled.netlist, customNetlistMode]);

  // Execute SPICE simulation in ngspice WASM
  const runSimulation = useCallback(
    async (netlistOverride?: string) => {
      const targetNetlist = netlistOverride ?? (customNetlistMode ? customNetlistText : compiled.netlist);
      setIsRunning(true);
      setSimError(null);
      try {
        const result = await spiceRunner.runNetlist(targetNetlist);
        setSimOutput(result);
        setEngineReady(true);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setSimError(msg);
      } finally {
        setIsRunning(false);
      }
    },
    [compiled.netlist, customNetlistMode, customNetlistText]
  );

  // Auto-run initial template on mount
  useEffect(() => {
    runSimulation(compiled.netlist);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard shortcuts (LTspice style: R, C, L, D, V, G, W, P, Delete, Esc)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'Escape') {
        setActiveTool('select');
        setPlacingKind(null);
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId) {
          setComponents((prev) => prev.filter((c) => c.id !== selectedId));
          setWires((prev) => prev.filter((w) => w.id !== selectedId));
          setSelectedId(null);
        }
        return;
      }
      if ((e.key === 'r' || e.key === 'R') && (e.ctrlKey || activeTool === 'place')) {
        e.preventDefault();
        if (activeTool === 'place') {
          setPlacingRotation((r) => ((r + 90) % 360) as Rotation);
        } else if (selectedId) {
          setComponents((prev) =>
            prev.map((c) =>
              c.id === selectedId ? { ...c, rotation: ((c.rotation + 90) % 360) as Rotation } : c
            )
          );
        }
        return;
      }

      const upper = e.key.toUpperCase();
      if (upper === 'W' || e.key === 'F3') {
        setActiveTool('wire');
        setPlacingKind(null);
      } else if (upper === 'P') {
        setActiveTool('probe');
        setPlacingKind(null);
      } else if (upper === 'R') {
        setPlacingKind('resistor');
        setActiveTool('place');
      } else if (upper === 'C') {
        setPlacingKind('capacitor');
        setActiveTool('place');
      } else if (upper === 'L') {
        setPlacingKind('inductor');
        setActiveTool('place');
      } else if (upper === 'D') {
        setPlacingKind('diode');
        setActiveTool('place');
      } else if (upper === 'G') {
        setPlacingKind('gnd');
        setActiveTool('place');
      } else if (upper === 'V') {
        setPlacingKind('vsource');
        setActiveTool('place');
      } else if (upper === 'N') {
        setPlacingKind('netlabel');
        setActiveTool('place');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTool, selectedId]);

  const handleLoadTemplate = (templateId: string) => {
    const found = CIRCUIT_TEMPLATES.find((t) => t.id === templateId);
    if (!found) return;
    setActiveTemplateId(found.id);
    setComponents(found.components.map((c) => ({ ...c })));
    setWires(found.wires.map((w) => ({ ...w })));
    setSimConfig({ ...found.simConfig });
    setProbes(found.defaultProbes.map((p) => ({ ...p })));
    setSelectedId(null);
    setCustomNetlistMode(false);

    const nextCompiled = compileCircuitToSpice(found.components, found.wires, found.simConfig);
    runSimulation(nextCompiled.netlist);
  };

  const handleToggleProbe = (kind: 'voltage' | 'current', target: string) => {
    const normTarget = target.trim().toLowerCase();
    const existing = probes.find(
      (p) => p.kind === kind && p.target.toLowerCase() === normTarget
    );
    if (existing) {
      setProbes(probes.filter((p) => p.id !== existing.id));
    } else {
      const color = PROBE_PALETTE[probes.length % PROBE_PALETTE.length];
      const label = kind === 'voltage' ? `V(${target})` : `I(${target.toUpperCase()})`;
      setProbes([
        ...probes,
        {
          id: `probe_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          label,
          kind,
          target,
          color,
        },
      ]);
    }
  };

  const handleAddRawSignalProbe = (rawKey: string) => {
    const lower = rawKey.toLowerCase();
    if (lower.startsWith('v(') && lower.endsWith(')')) {
      const node = lower.slice(2, -1);
      handleToggleProbe('voltage', node);
    } else if (lower.startsWith('i(') && lower.endsWith(')')) {
      const ref = lower.slice(2, -1);
      handleToggleProbe('current', ref);
    }
  };

  const selectedComp = useMemo(
    () => components.find((c) => c.id === selectedId) || null,
    [components, selectedId]
  );

  const updateSelectedComp = (patch: Partial<SchematicComponent>) => {
    if (!selectedComp) return;
    setComponents((prev) =>
      prev.map((c) => (c.id === selectedComp.id ? { ...c, ...patch } : c))
    );
  };

  const handleExportProject = () => {
    const data = JSON.stringify({ components, wires, simConfig, probes }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeTemplateId || 'circuit'}.webltspice.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (Array.isArray(parsed.components) && Array.isArray(parsed.wires)) {
          setComponents(parsed.components);
          setWires(parsed.wires);
          if (parsed.simConfig) setSimConfig(parsed.simConfig);
          if (Array.isArray(parsed.probes)) setProbes(parsed.probes);
        }
      } catch {
        alert('导入失败：JSON 电路文件格式无效');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="app-shell">
      {/* Top LTspice Main Ribbon / Toolbar */}
      <header className="top-toolbar">
        <div className="brand-block">
          <div className="brand-logo">
            <Cpu size={18} />
          </div>
          <div>
            <div className="brand-title">
              WebLTspice <span className="wasm-badge">ngspice WASM</span>
            </div>
            <div className="brand-subtitle">浏览器纯本地算力 SPICE 电路仿真工作台</div>
          </div>
        </div>

        {/* Classic Circuit Templates Selector */}
        <div className="template-selector">
          <BookOpen size={14} className="template-icon" />
          <select
            value={activeTemplateId}
            onChange={(e) => handleLoadTemplate(e.target.value)}
            title="选择「35讲：二极管的十种应用电路」或经典模电仿真模板"
          >
            {Array.from(new Set(CIRCUIT_TEMPLATES.map((t) => t.category))).map((cat) => (
              <optgroup key={cat} label={cat}>
                {CIRCUIT_TEMPLATES.filter((t) => t.category === cat).map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Editor Mode Tools */}
        <div className="tool-group">
          <button
            className={`tool-btn ${activeTool === 'select' ? 'active' : ''}`}
            onClick={() => {
              setActiveTool('select');
              setPlacingKind(null);
            }}
            title="选择/移动元件 (Esc)"
          >
            <MousePointer size={15} />
            <span>选择</span>
          </button>
          <button
            className={`tool-btn ${activeTool === 'wire' ? 'active' : ''}`}
            onClick={() => {
              setActiveTool('wire');
              setPlacingKind(null);
            }}
            title="正交连线 (快捷键 W / F3)"
          >
            <GitCommit size={15} />
            <span>连线 (W)</span>
          </button>
          <button
            className={`tool-btn ${activeTool === 'probe' ? 'active' : ''}`}
            onClick={() => {
              setActiveTool('probe');
              setPlacingKind(null);
            }}
            title="LTspice 电压/电流探针 (快捷键 P)"
          >
            <Activity size={15} />
            <span>探针 (P)</span>
          </button>
          <button
            className={`tool-btn ${activeTool === 'delete' ? 'active' : ''}`}
            onClick={() => {
              setActiveTool('delete');
              setPlacingKind(null);
            }}
            title="删除导线或元件 (Delete)"
          >
            <Trash2 size={15} />
            <span>删除</span>
          </button>
        </div>

        {/* Quick Component Placement Bar (LTspice style) */}
        <div className="component-quickbar">
          {(
            [
              'resistor',
              'capacitor',
              'inductor',
              'diode',
              'npn',
              'nmos',
              'opamp',
              'vsource',
              'isource',
              'gnd',
              'netlabel',
            ] as ComponentKind[]
          ).map((kind) => {
            const meta = COMPONENT_LIBRARY[kind];
            const isPlacing = activeTool === 'place' && placingKind === kind;
            return (
              <button
                key={kind}
                className={`comp-pill ${isPlacing ? 'active' : ''}`}
                onClick={() => {
                  setPlacingKind(kind);
                  setActiveTool('place');
                }}
                title={`${meta.label} — ${meta.description}${meta.shortcut ? ` (快捷键 ${meta.shortcut})` : ''}`}
              >
                <span className="comp-short">{meta.shortLabel}</span>
                <span className="comp-name">{meta.label.split(' ')[0]}</span>
              </button>
            );
          })}
        </div>

        {/* Run Simulation & File I/O */}
        <div className="run-actions">
          <button
            className="icon-action-btn"
            onClick={handleExportProject}
            title="保存并导出当前原理图 JSON"
          >
            <Download size={15} />
          </button>
          <label className="icon-action-btn" title="导入原理图 JSON">
            <Upload size={15} />
            <input type="file" accept=".json" onChange={handleImportProject} hidden />
          </label>

          <button
            className="run-sim-btn"
            onClick={() => runSimulation()}
            disabled={isRunning}
            title="调用浏览器本地 ngspice WebAssembly 引擎执行仿真"
          >
            <Play size={15} fill="currentColor" />
            <span>{isRunning ? '仿真计算中...' : '运行仿真 (Run)'}</span>
          </button>
        </div>
      </header>

      {/* Main Split Workspace */}
      <div className="workspace-main">
        {/* Left / Center Split: Schematic Top + Waveform Bottom */}
        <div className="center-split">
          <div className="schematic-pane">
            <SchematicCanvas
              components={components}
              wires={wires}
              compiled={compiled}
              activeTool={activeTool}
              placingKind={placingKind}
              placingRotation={placingRotation}
              selectedId={selectedId}
              probes={probes}
              operatingPoint={simOutput?.operatingPoint}
              onSelect={setSelectedId}
              onUpdateComponents={setComponents}
              onUpdateWires={setWires}
              onRotatePlacement={() =>
                setPlacingRotation((r) => ((r + 90) % 360) as Rotation)
              }
              onToggleProbe={handleToggleProbe}
              onQuickEditComponent={(comp) => {
                setSelectedId(comp.id);
                setRightTab('inspector');
              }}
              onSwitchTool={setActiveTool}
            />
          </div>

          <div className="waveform-pane">
            <WaveformViewer
              simOutput={simOutput}
              probes={probes}
              onRemoveProbe={(id) => setProbes((prev) => prev.filter((p) => p.id !== id))}
              onAddRawSignalProbe={handleAddRawSignalProbe}
            />
          </div>
        </div>

        {/* Right Dock: Inspector / Sim Config / SPICE Netlist / ngspice Log */}
        <aside className="right-sidebar">
          <div className="sidebar-tabs">
            <button
              className={`sidebar-tab ${rightTab === 'inspector' ? 'active' : ''}`}
              onClick={() => setRightTab('inspector')}
            >
              <Sliders size={14} />
              <span>参数与仿真</span>
            </button>
            <button
              className={`sidebar-tab ${rightTab === 'netlist' ? 'active' : ''}`}
              onClick={() => setRightTab('netlist')}
            >
              <FileCode size={14} />
              <span>SPICE 网表</span>
            </button>
            <button
              className={`sidebar-tab ${rightTab === 'log' ? 'active' : ''}`}
              onClick={() => setRightTab('log')}
            >
              <Terminal size={14} />
              <span>内核日志</span>
            </button>
          </div>

          <div className="sidebar-content">
            {rightTab === 'inspector' && (
              <div className="inspector-sections">
                {/* Active Template Description Card */}
                {(() => {
                  const curTpl = CIRCUIT_TEMPLATES.find((t) => t.id === activeTemplateId);
                  if (!curTpl) return null;
                  return (
                    <section className="panel-card" style={{ borderColor: 'rgba(56, 189, 248, 0.35)' }}>
                      <div className="card-header" style={{ color: '#38bdf8' }}>
                        <span>{curTpl.name}</span>
                      </div>
                      <div style={{ fontSize: 11.5, color: '#cbd5e1', lineHeight: 1.55 }}>
                        {curTpl.description}
                      </div>
                    </section>
                  );
                })()}

                {/* Selected Component Properties */}
                <section className="panel-card">
                  <div className="card-header">
                    <span>元器件属性 (Component Inspector)</span>
                    {selectedComp && (
                      <button
                        className="mini-btn"
                        onClick={() =>
                          updateSelectedComp({
                            rotation: ((selectedComp.rotation + 90) % 360) as Rotation,
                          })
                        }
                      >
                        <RotateCw size={12} /> 旋转 90°
                      </button>
                    )}
                  </div>

                  {selectedComp ? (
                    <div className="form-stack">
                      <div className="form-row">
                        <label>位号 / 标识 (Ref)</label>
                        <input
                          type="text"
                          value={selectedComp.ref}
                          onChange={(e) => updateSelectedComp({ ref: e.target.value })}
                        />
                      </div>
                      <div className="form-row">
                        <label>
                          {selectedComp.kind === 'netlabel'
                            ? '网络标号名称 (Net Name)'
                            : '参数值 / 模型 (Value / Model)'}
                        </label>
                        <input
                          type="text"
                          value={selectedComp.value}
                          onChange={(e) => updateSelectedComp({ value: e.target.value })}
                        />
                      </div>

                      {/* Quick Presets for Sources */}
                      {selectedComp.kind === 'vsource' && (
                        <div className="preset-group">
                          <span className="preset-label">常用激励源快捷预设：</span>
                          <div className="preset-chips">
                            <button
                              onClick={() =>
                                updateSelectedComp({ value: 'SINE(0 5 1k)' })
                              }
                            >
                              正弦 5V 1kHz
                            </button>
                            <button
                              onClick={() =>
                                updateSelectedComp({
                                  value: 'PULSE(0 5 0.1m 1u 1u 0.5m 1m)',
                                })
                              }
                            >
                              方波脉冲 5V
                            </button>
                            <button
                              onClick={() => updateSelectedComp({ value: '5' })}
                            >
                              直流 DC 5V
                            </button>
                            <button
                              onClick={() =>
                                updateSelectedComp({ value: 'AM(2 1.2 1k 40k 0)' })
                              }
                            >
                              AM 调幅波 40kHz
                            </button>
                          </div>
                          <div className="form-row" style={{ marginTop: 8 }}>
                            <label>小信号 AC 幅值 (AC Magnitude)</label>
                            <input
                              type="text"
                              value={selectedComp.params?.ac ?? '1'}
                              onChange={(e) =>
                                updateSelectedComp({
                                  params: { ...selectedComp.params, ac: e.target.value },
                                })
                              }
                            />
                          </div>
                        </div>
                      )}

                      {selectedComp.kind === 'diode' && (
                        <div className="preset-group">
                          <span className="preset-label">内置二极管模型：</span>
                          <div className="preset-chips">
                            <button
                              onClick={() => updateSelectedComp({ value: 'D1N4148' })}
                            >
                              D1N4148 (开关硅管)
                            </button>
                            <button
                              onClick={() => updateSelectedComp({ value: 'DZ5V1' })}
                            >
                              DZ5V1 (5.1V 稳压管)
                            </button>
                            <button
                              onClick={() => updateSelectedComp({ value: 'D1N5819' })}
                            >
                              D1N5819 (肖特基管)
                            </button>
                            <button
                              onClick={() => updateSelectedComp({ value: 'DLED' })}
                            >
                              DLED (发光二极管)
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="inspector-actions">
                        {selectedComp.kind !== 'gnd' && selectedComp.kind !== 'netlabel' && (
                          <button
                            className="probe-action-btn"
                            onClick={() => handleToggleProbe('current', selectedComp.ref)}
                          >
                            <Activity size={13} />
                            观测电流 I({selectedComp.ref})
                          </button>
                        )}
                        <button
                          className="delete-action-btn"
                          onClick={() => {
                            setComponents((prev) =>
                              prev.filter((c) => c.id !== selectedComp.id)
                            );
                            setSelectedId(null);
                          }}
                        >
                          <Trash2 size={13} />
                          删除此元件
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="empty-hint">
                      在左侧原理图中点击任意元器件即可编辑其阻容感数值、激励波形或半导体模型。
                    </div>
                  )}
                </section>

                {/* Simulation Command Configuration (.tran / .ac / .dc / .op) */}
                <section className="panel-card">
                  <div className="card-header">
                    <span>SPICE 仿真分析模式 (Simulation Command)</span>
                  </div>

                  <div className="analysis-mode-tabs">
                    {(
                      [
                        { id: 'tran', label: '.TRAN 瞬态' },
                        { id: 'ac', label: '.AC 频响' },
                        { id: 'dc', label: '.DC 扫描' },
                        { id: 'op', label: '.OP 工作点' },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        className={`mode-tab ${simConfig.type === m.id ? 'active' : ''}`}
                        onClick={() => {
                          const next = { ...simConfig, type: m.id };
                          setSimConfig(next);
                          const nextCompiled = compileCircuitToSpice(components, wires, next);
                          runSimulation(nextCompiled.netlist);
                        }}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>

                  {simConfig.type === 'tran' && (
                    <div className="form-stack">
                      <div className="form-grid-2">
                        <div className="form-row">
                          <label>仿真步长 (Time Step)</label>
                          <input
                            type="text"
                            value={simConfig.tranStep}
                            onChange={(e) =>
                              setSimConfig({ ...simConfig, tranStep: e.target.value })
                            }
                            placeholder="如 5u"
                          />
                        </div>
                        <div className="form-row">
                          <label>终止时间 (Stop Time)</label>
                          <input
                            type="text"
                            value={simConfig.tranStop}
                            onChange={(e) =>
                              setSimConfig({ ...simConfig, tranStop: e.target.value })
                            }
                            placeholder="如 3m"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {simConfig.type === 'ac' && (
                    <div className="form-stack">
                      <div className="form-grid-2">
                        <div className="form-row">
                          <label>扫描方式</label>
                          <select
                            value={simConfig.acSweepType}
                            onChange={(e) =>
                              setSimConfig({
                                ...simConfig,
                                acSweepType: e.target.value as 'dec' | 'oct' | 'lin',
                              })
                            }
                          >
                            <option value="dec">十倍频程 (dec)</option>
                            <option value="oct">八度音程 (oct)</option>
                            <option value="lin">线性 (lin)</option>
                          </select>
                        </div>
                        <div className="form-row">
                          <label>每十倍频点数</label>
                          <input
                            type="number"
                            value={simConfig.acPoints}
                            onChange={(e) =>
                              setSimConfig({
                                ...simConfig,
                                acPoints: Number(e.target.value) || 50,
                              })
                            }
                          />
                        </div>
                      </div>
                      <div className="form-grid-2">
                        <div className="form-row">
                          <label>起始频率 (Hz)</label>
                          <input
                            type="text"
                            value={simConfig.acStart}
                            onChange={(e) =>
                              setSimConfig({ ...simConfig, acStart: e.target.value })
                            }
                          />
                        </div>
                        <div className="form-row">
                          <label>终止频率 (Hz)</label>
                          <input
                            type="text"
                            value={simConfig.acStop}
                            onChange={(e) =>
                              setSimConfig({ ...simConfig, acStop: e.target.value })
                            }
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {simConfig.type === 'dc' && (
                    <div className="form-stack">
                      <div className="form-grid-2">
                        <div className="form-row">
                          <label>扫描电源名称</label>
                          <input
                            type="text"
                            value={simConfig.dcSource}
                            onChange={(e) =>
                              setSimConfig({ ...simConfig, dcSource: e.target.value })
                            }
                          />
                        </div>
                        <div className="form-row">
                          <label>步进增量 (Step)</label>
                          <input
                            type="text"
                            value={simConfig.dcStep}
                            onChange={(e) =>
                              setSimConfig({ ...simConfig, dcStep: e.target.value })
                            }
                          />
                        </div>
                      </div>
                      <div className="form-grid-2">
                        <div className="form-row">
                          <label>起始值 (Start)</label>
                          <input
                            type="text"
                            value={simConfig.dcStart}
                            onChange={(e) =>
                              setSimConfig({ ...simConfig, dcStart: e.target.value })
                            }
                          />
                        </div>
                        <div className="form-row">
                          <label>终止值 (Stop)</label>
                          <input
                            type="text"
                            value={simConfig.dcStop}
                            onChange={(e) =>
                              setSimConfig({ ...simConfig, dcStop: e.target.value })
                            }
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="form-row" style={{ marginTop: 8 }}>
                    <label>附加 SPICE 指令 (.model / .options 等)</label>
                    <input
                      type="text"
                      value={simConfig.extraDirectives}
                      onChange={(e) =>
                        setSimConfig({ ...simConfig, extraDirectives: e.target.value })
                      }
                      placeholder="例如: .options reltol=1e-4"
                    />
                  </div>

                  <button
                    className="full-run-btn"
                    onClick={() => runSimulation()}
                    disabled={isRunning}
                  >
                    <Sparkles size={14} />
                    <span>立即更新并运行 SPICE 仿真</span>
                  </button>
                </section>

                {/* Warnings & Engine Status */}
                {compiled.warnings.length > 0 && (
                  <div className="warning-banner">
                    <AlertTriangle size={15} />
                    <div>
                      {compiled.warnings.map((w, i) => (
                        <div key={i}>{w}</div>
                      ))}
                    </div>
                  </div>
                )}

                {simError && (
                  <div className="warning-banner error">
                    <AlertTriangle size={15} />
                    <div>仿真错误：{simError}</div>
                  </div>
                )}

                {simOutput && (
                  <div className="engine-status-card">
                    <div className="status-row">
                      <CheckCircle2 size={14} className="ok-icon" />
                      <span>
                        内核：<strong>ngspice WebAssembly (SPARSE 1.3)</strong>
                      </span>
                    </div>
                    <div className="status-metrics">
                      <span>耗时：{simOutput.elapsedMs} ms</span>
                      <span>采样点：{simOutput.xAxis.values.length} pts</span>
                      <span>向量数：{Object.keys(simOutput.series).length}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {rightTab === 'netlist' && (
              <div className="netlist-panel">
                <div className="netlist-toolbar">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={customNetlistMode}
                      onChange={(e) => setCustomNetlistMode(e.target.checked)}
                    />
                    <span>启用手写/自定义 SPICE 网表模式</span>
                  </label>
                </div>

                <textarea
                  className="netlist-editor"
                  value={customNetlistMode ? customNetlistText : compiled.netlist}
                  readOnly={!customNetlistMode}
                  onChange={(e) => setCustomNetlistText(e.target.value)}
                  spellCheck={false}
                />

                <button
                  className="full-run-btn"
                  onClick={() =>
                    runSimulation(customNetlistMode ? customNetlistText : compiled.netlist)
                  }
                >
                  <Play size={14} />
                  <span>直接运行此 SPICE 网表</span>
                </button>
              </div>
            )}

            {rightTab === 'log' && (
              <div className="log-panel">
                <div className="log-header">
                  ngspice WebAssembly 原始标准输出日志 ({engineReady ? '已就绪' : '初始化中'})
                </div>
                <pre className="log-pre">
                  {simOutput?.rawLogs && simOutput.rawLogs.length > 0
                    ? simOutput.rawLogs.join('\n')
                    : '暂无日志输出，请点击「运行仿真」。'}
                </pre>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default App;
