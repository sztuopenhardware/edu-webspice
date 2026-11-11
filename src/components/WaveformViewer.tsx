import React, { useRef, useEffect, useState, useMemo } from 'react';
import { ProbeSignal, SimulationOutput } from '../types/circuit';
import { Download, Crosshair, Activity, Plus, X } from 'lucide-react';

interface WaveformViewerProps {
  simOutput: SimulationOutput | null;
  probes: ProbeSignal[];
  onRemoveProbe: (id: string) => void;
  onAddRawSignalProbe: (rawKey: string) => void;
}

export function formatEng(val: number, unit = ''): string {
  if (!Number.isFinite(val)) return `0${unit}`;
  const abs = Math.abs(val);
  if (abs === 0) return `0 ${unit}`.trim();
  if (unit === 'dB' || unit === 'deg') {
    return `${val.toFixed(2)} ${unit}`;
  }
  if (abs >= 1e6) return `${(val / 1e6).toFixed(2)} M${unit}`;
  if (abs >= 1e3) return `${(val / 1e3).toFixed(2)} k${unit}`;
  if (abs >= 1) return `${val.toFixed(3)} ${unit}`.trim();
  if (abs >= 1e-3) return `${(val * 1e3).toFixed(2)} m${unit}`;
  if (abs >= 1e-6) return `${(val * 1e6).toFixed(2)} µ${unit}`;
  if (abs >= 1e-9) return `${(val * 1e9).toFixed(2)} n${unit}`;
  return `${val.toExponential(2)} ${unit}`.trim();
}

export const WaveformViewer: React.FC<WaveformViewerProps> = ({
  simOutput,
  probes,
  onRemoveProbe,
  onAddRawSignalProbe,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [lockedIdxA, setLockedIdxA] = useState<number | null>(null);
  const [lockedIdxB, setLockedIdxB] = useState<number | null>(null);
  const [showPhase, setShowPhase] = useState<boolean>(true);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 800, h: 320 });

  // ResizeObserver for crisp high-DPI canvas rendering
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 20 && height > 20) {
          setSize({ w: Math.floor(width), h: Math.floor(height) });
        }
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Resolve active traces from probes
  const activeTraces = useMemo(() => {
    if (!simOutput) return [];
    const list: Array<{
      probe: ProbeSignal;
      seriesKey: string;
      values: number[];
      phaseValues?: number[];
      unit: string;
    }> = [];

    for (const p of probes) {
      const key =
        p.kind === 'voltage'
          ? `v(${p.target.toLowerCase()})`
          : `i(${p.target.toLowerCase()})`;
      const found = simOutput.series[key] || simOutput.series[p.target.toLowerCase()];
      if (found && found.values.length > 0) {
        list.push({
          probe: p,
          seriesKey: key,
          values: found.values,
          phaseValues: found.phaseValues,
          unit: found.unit,
        });
      }
    }
    return list;
  }, [simOutput, probes]);

  // Available signals in simOutput that aren't plotted yet
  const unplottedSignals = useMemo(() => {
    if (!simOutput) return [];
    const plottedKeys = new Set(activeTraces.map((t) => t.seriesKey.toLowerCase()));
    return Object.keys(simOutput.series).filter(
      (k) => !k.includes('@') && !plottedKeys.has(k.toLowerCase())
    );
  }, [simOutput, activeTraces]);

  // Draw oscilloscope canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !simOutput || simOutput.analysisType === 'op') return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.scale(dpr, dpr);

    const W = size.w;
    const H = size.h;
    const padL = 68;
    const padR = 68;
    const padT = 22;
    const padB = 34;
    const plotW = Math.max(10, W - padL - padR);
    const plotH = Math.max(10, H - padT - padB);

    // Background
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
    ctx.lineWidth = 1;
    const hSteps = 6;
    const vSteps = 8;

    for (let i = 0; i <= hSteps; i++) {
      const y = padT + (plotH * i) / hSteps;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
    }
    for (let i = 0; i <= vSteps; i++) {
      const x = padL + (plotW * i) / vSteps;
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
      ctx.stroke();
    }

    // Border box
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.32)';
    ctx.strokeRect(padL, padT, plotW, plotH);

    const xVals = simOutput.xAxis.values;
    if (!xVals || xVals.length === 0 || activeTraces.length === 0) {
      ctx.fillStyle = '#64748b';
      ctx.font = '13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        activeTraces.length === 0
          ? '请在上方原理图中使用探针点击节点/元件，或在上方添加观测信号'
          : '暂无波形数据',
        W / 2,
        H / 2
      );
      ctx.restore();
      return;
    }

    const isAc = simOutput.analysisType === 'ac';
    const xMinRaw = xVals[0];
    const xMaxRaw = xVals[xVals.length - 1];
    const xMin = isAc ? Math.log10(Math.max(1e-6, xMinRaw)) : xMinRaw;
    const xMax = isAc ? Math.log10(Math.max(1e-5, xMaxRaw)) : xMaxRaw;
    const xSpan = Math.max(1e-12, xMax - xMin);

    const toScreenX = (xVal: number) => {
      const v = isAc ? Math.log10(Math.max(1e-6, xVal)) : xVal;
      return padL + ((v - xMin) / xSpan) * plotW;
    };

    // Separate left axis (Voltage / dB) and right axis (Current / Phase deg)
    const leftTraces = isAc
      ? activeTraces
      : activeTraces.filter((t) => t.probe.kind === 'voltage');
    const rightTraces = isAc
      ? showPhase
        ? activeTraces.filter((t) => t.phaseValues && t.phaseValues.length > 0)
        : []
      : activeTraces.filter((t) => t.probe.kind === 'current');

    let leftMin = Infinity;
    let leftMax = -Infinity;
    for (const t of leftTraces) {
      for (const v of t.values) {
        if (Number.isFinite(v)) {
          if (v < leftMin) leftMin = v;
          if (v > leftMax) leftMax = v;
        }
      }
    }
    if (!Number.isFinite(leftMin) || !Number.isFinite(leftMax)) {
      leftMin = -1;
      leftMax = 1;
    } else if (Math.abs(leftMax - leftMin) < 1e-9) {
      leftMin -= 1;
      leftMax += 1;
    } else {
      const margin = (leftMax - leftMin) * 0.08;
      leftMin -= margin;
      leftMax += margin;
    }

    let rightMin = Infinity;
    let rightMax = -Infinity;
    for (const t of rightTraces) {
      const arr = isAc ? t.phaseValues || [] : t.values;
      for (const v of arr) {
        if (Number.isFinite(v)) {
          if (v < rightMin) rightMin = v;
          if (v > rightMax) rightMax = v;
        }
      }
    }
    if (!Number.isFinite(rightMin) || !Number.isFinite(rightMax)) {
      rightMin = -1;
      rightMax = 1;
    } else if (Math.abs(rightMax - rightMin) < 1e-9) {
      rightMin -= 1;
      rightMax += 1;
    } else {
      const margin = (rightMax - rightMin) * 0.08;
      rightMin -= margin;
      rightMax += margin;
    }

    const toScreenYLeft = (yVal: number) =>
      padT + plotH - ((yVal - leftMin) / (leftMax - leftMin)) * plotH;
    const toScreenYRight = (yVal: number) =>
      padT + plotH - ((yVal - rightMin) / (rightMax - rightMin)) * plotH;

    // Draw Left Axis Labels
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'right';
    const leftUnit = isAc ? 'dB' : 'V';
    for (let i = 0; i <= hSteps; i++) {
      const val = leftMax - ((leftMax - leftMin) * i) / hSteps;
      const y = padT + (plotH * i) / hSteps;
      if (leftTraces.length > 0) {
        ctx.fillText(formatEng(val, leftUnit), padL - 6, y + 4);
      }
    }

    // Draw Right Axis Labels
    ctx.textAlign = 'left';
    ctx.fillStyle = '#64748b';
    const rightUnit = isAc ? '°' : 'A';
    for (let i = 0; i <= hSteps; i++) {
      const val = rightMax - ((rightMax - rightMin) * i) / hSteps;
      const y = padT + (plotH * i) / hSteps;
      if (rightTraces.length > 0) {
        ctx.fillText(formatEng(val, rightUnit), padL + plotW + 6, y + 4);
      }
    }

    // Draw X-Axis Labels
    ctx.textAlign = 'center';
    ctx.fillStyle = '#94a3b8';
    for (let i = 0; i <= vSteps; i++) {
      const ratio = i / vSteps;
      const x = padL + plotW * ratio;
      const rawX = isAc ? Math.pow(10, xMin + xSpan * ratio) : xMin + xSpan * ratio;
      ctx.fillText(formatEng(rawX, simOutput.xAxis.unit), x, padT + plotH + 18);
    }

    // Clip to plot area
    ctx.save();
    ctx.beginPath();
    ctx.rect(padL, padT, plotW, plotH);
    ctx.clip();

    // Zero reference line for Left Axis
    if (!isAc && leftMin < 0 && leftMax > 0) {
      const y0 = toScreenYLeft(0);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(padL, y0);
      ctx.lineTo(padL + plotW, y0);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Plot Left Axis Traces (Solid)
    for (const t of leftTraces) {
      ctx.strokeStyle = t.probe.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < xVals.length; i++) {
        const sx = toScreenX(xVals[i]);
        const sy = toScreenYLeft(t.values[i]);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.stroke();
    }

    // Plot Right Axis Traces (Dashed for AC phase or Current)
    for (const t of rightTraces) {
      const arr = isAc ? t.phaseValues! : t.values;
      ctx.strokeStyle = t.probe.color;
      ctx.lineWidth = isAc ? 1.4 : 2;
      if (isAc) ctx.setLineDash([5, 4]);
      ctx.beginPath();
      for (let i = 0; i < xVals.length; i++) {
        const sx = toScreenX(xVals[i]);
        const sy = toScreenYRight(arr[i]);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw Cursors (Hover, Cursor A, Cursor B)
    const drawCursorLine = (idx: number, color: string, label: string) => {
      if (idx < 0 || idx >= xVals.length) return;
      const sx = toScreenX(xVals[idx]);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(sx, padT);
      ctx.lineTo(sx, padT + plotH);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = color;
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.fillText(label, sx + 10, padT + 12);
    };

    if (hoverIdx !== null) drawCursorLine(hoverIdx, 'rgba(226, 232, 240, 0.5)', '');
    if (lockedIdxA !== null) drawCursorLine(lockedIdxA, '#fbbf24', 'C1');
    if (lockedIdxB !== null) drawCursorLine(lockedIdxB, '#c084fc', 'C2');

    ctx.restore();
    ctx.restore();
  }, [simOutput, activeTraces, size, hoverIdx, lockedIdxA, lockedIdxB, showPhase]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!simOutput || !canvasRef.current || simOutput.xAxis.values.length === 0) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const padL = 68;
    const padR = 68;
    const plotW = Math.max(10, size.w - padL - padR);
    const relX = Math.max(0, Math.min(1, (e.clientX - rect.left - padL) / plotW));

    const xVals = simOutput.xAxis.values;
    const isAc = simOutput.analysisType === 'ac';
    const xMin = isAc ? Math.log10(Math.max(1e-6, xVals[0])) : xVals[0];
    const xMax = isAc
      ? Math.log10(Math.max(1e-5, xVals[xVals.length - 1]))
      : xVals[xVals.length - 1];
    const targetVal = isAc
      ? Math.pow(10, xMin + (xMax - xMin) * relX)
      : xMin + (xMax - xMin) * relX;

    // Binary search / closest point
    let bestIdx = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < xVals.length; i++) {
      const d = Math.abs(xVals[i] - targetVal);
      if (d < bestDiff) {
        bestDiff = d;
        bestIdx = i;
      }
    }
    setHoverIdx(bestIdx);
  };

  const handleCanvasClick = () => {
    if (hoverIdx === null) return;
    if (lockedIdxA === null) {
      setLockedIdxA(hoverIdx);
    } else if (lockedIdxB === null) {
      setLockedIdxB(hoverIdx);
    } else {
      setLockedIdxA(hoverIdx);
      setLockedIdxB(null);
    }
  };

  const exportCsv = () => {
    if (!simOutput) return;
    const headers = [simOutput.xAxis.name, ...activeTraces.map((t) => t.probe.label)];
    const rows = [headers.join(',')];
    const n = simOutput.xAxis.values.length;
    for (let i = 0; i < n; i++) {
      const row = [
        simOutput.xAxis.values[i],
        ...activeTraces.map((t) => t.values[i] ?? ''),
      ];
      rows.push(row.join(','));
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `webltspice_${simOutput.analysisType}_waveforms.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const activeReadoutIdx = hoverIdx ?? lockedIdxA ?? null;

  return (
    <div className="waveform-panel">
      {/* Top Waveform Toolbar */}
      <div className="waveform-header">
        <div className="waveform-traces-bar">
          <span className="waveform-section-title">
            <Activity size={14} />
            示波器通道 ({simOutput ? `.${simOutput.analysisType.toUpperCase()}` : '待运行'})
          </span>

          {activeTraces.map((t) => {
            const valAtCursor =
              activeReadoutIdx !== null && t.values[activeReadoutIdx] !== undefined
                ? formatEng(t.values[activeReadoutIdx], t.unit)
                : null;
            return (
              <div
                key={t.probe.id}
                className="trace-chip"
                style={{ borderColor: t.probe.color }}
              >
                <span className="trace-color-dot" style={{ background: t.probe.color }} />
                <span className="trace-name">{t.probe.label}</span>
                {valAtCursor && <span className="trace-value">{valAtCursor}</span>}
                <button
                  className="trace-remove-btn"
                  onClick={() => onRemoveProbe(t.probe.id)}
                  title="移除此探针通道"
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}

          {unplottedSignals.length > 0 && (
            <div className="add-trace-dropdown">
              <Plus size={12} />
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) onAddRawSignalProbe(e.target.value);
                }}
              >
                <option value="">+ 添加节点/支路波形...</option>
                {unplottedSignals.map((sig) => (
                  <option key={sig} value={sig}>
                    {sig.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="waveform-actions">
          {simOutput && activeReadoutIdx !== null && simOutput.analysisType !== 'op' && (
            <span className="cursor-readout-pill">
              <Crosshair size={12} />
              {simOutput.xAxis.name}:{' '}
              <strong>
                {formatEng(simOutput.xAxis.values[activeReadoutIdx], simOutput.xAxis.unit)}
              </strong>
            </span>
          )}

          {lockedIdxA !== null && lockedIdxB !== null && simOutput && (
            <span className="cursor-delta-pill">
              ΔX:{' '}
              {formatEng(
                simOutput.xAxis.values[lockedIdxB] - simOutput.xAxis.values[lockedIdxA],
                simOutput.xAxis.unit
              )}
              {simOutput.analysisType === 'tran' &&
                Math.abs(simOutput.xAxis.values[lockedIdxB] - simOutput.xAxis.values[lockedIdxA]) >
                  1e-12 && (
                  <>
                    {' '}
                    (f ≈{' '}
                    {formatEng(
                      1 /
                        Math.abs(
                          simOutput.xAxis.values[lockedIdxB] - simOutput.xAxis.values[lockedIdxA]
                        ),
                      'Hz'
                    )}
                    )
                  </>
                )}
            </span>
          )}

          {simOutput?.analysisType === 'ac' && (
            <button
              className={`wf-btn ${showPhase ? 'active' : ''}`}
              onClick={() => setShowPhase((v) => !v)}
              title="切换显示相频特性虚线 (Phase)"
            >
              相位虚线: {showPhase ? '开' : '关'}
            </button>
          )}

          {(lockedIdxA !== null || lockedIdxB !== null) && (
            <button
              className="wf-btn"
              onClick={() => {
                setLockedIdxA(null);
                setLockedIdxB(null);
              }}
            >
              清除游标
            </button>
          )}

          {simOutput && simOutput.analysisType !== 'op' && (
            <button className="wf-btn" onClick={exportCsv} title="导出 CSV 仿真波形数据">
              <Download size={13} />
              <span>CSV</span>
            </button>
          )}
        </div>
      </div>

      {/* Canvas or Operating Point Table */}
      <div className="waveform-body" ref={containerRef}>
        {simOutput?.analysisType === 'op' && simOutput.operatingPoint ? (
          <div className="op-table-wrapper">
            <h4>直流工作点分析结果 (.OP Operating Point — ngspice WASM)</h4>
            <div className="op-grid">
              {Object.entries(simOutput.operatingPoint)
                .filter(([k]) => !k.includes('@'))
                .map(([k, val]) => (
                  <div key={k} className="op-card">
                    <span className="op-key">{k.toUpperCase()}</span>
                    <span className="op-val">
                      {formatEng(val, k.startsWith('i(') ? 'A' : 'V')}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className="waveform-canvas"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoverIdx(null)}
            onClick={handleCanvasClick}
          />
        )}
      </div>
    </div>
  );
};
