import type { ResultType, ComplexNumber } from 'eecircuit-engine';
import { AnalysisType, DataSeries, SimulationOutput } from '../types/circuit';

export function normalizeVarName(rawName: string): string {
  const lower = rawName.trim().toLowerCase();
  // Match ngspice saved device currents like i(@r1[i]), i(@c1[i]), i(@d1[id]), i(@q1[ic])
  const devMatch = lower.match(/^i\(@([a-z0-9_]+)\[[a-z0-9_]+\]\)$/);
  if (devMatch) {
    return `i(${devMatch[1]})`;
  }
  const bareDevMatch = lower.match(/^@([a-z0-9_]+)\[[a-z0-9_]+\]$/);
  if (bareDevMatch) {
    return `i(${bareDevMatch[1]})`;
  }
  return lower;
}

export function detectAnalysisTypeFromNetlist(netlist: string, raw: ResultType): AnalysisType {
  if (raw.dataType === 'complex') return 'ac';
  const firstVar = raw.variableNames?.[0]?.toLowerCase() || '';
  if (firstVar === 'time') return 'tran';
  if (firstVar.includes('sweep')) return 'dc';
  if (/^\s*\.ac\b/im.test(netlist)) return 'ac';
  if (/^\s*\.dc\b/im.test(netlist)) return 'dc';
  if (/^\s*\.op\b/im.test(netlist)) return 'op';
  if (raw.numPoints === 1 && firstVar !== 'time') return 'op';
  return 'tran';
}

export function parseNgspiceResult(
  raw: ResultType,
  netlistUsed: string,
  rawLogs: string[],
  elapsedMs: number
): SimulationOutput {
  const analysisType = detectAnalysisTypeFromNetlist(netlistUsed, raw);
  const series: Record<string, DataSeries> = {};
  const operatingPoint: Record<string, number> = {};

  if (!raw || !raw.data || raw.data.length === 0) {
    return {
      engineName: 'ngspice-wasm',
      analysisType,
      xAxis: { name: 'time', unit: 's', values: [] },
      series: {},
      operatingPoint: {},
      rawLogs,
      netlistUsed,
      elapsedMs,
    };
  }

  if (raw.dataType === 'complex') {
    const freqVar = raw.data[0];
    const freqValues = (freqVar.values as ComplexNumber[]).map((c) => c.real);

    const xAxis: DataSeries = {
      name: 'frequency',
      unit: 'Hz',
      values: freqValues,
    };

    for (let i = 1; i < raw.data.length; i++) {
      const item = raw.data[i];
      const normName = normalizeVarName(item.name);
      const cVals = item.values as ComplexNumber[];
      const magDb: number[] = new Array(cVals.length);
      const phaseDeg: number[] = new Array(cVals.length);

      for (let j = 0; j < cVals.length; j++) {
        const re = cVals[j].real;
        const im = cVals[j].img;
        const mag = Math.hypot(re, im);
        magDb[j] = 20 * Math.log10(Math.max(mag, 1e-18));
        phaseDeg[j] = (Math.atan2(im, re) * 180) / Math.PI;
      }

      const ds: DataSeries = {
        name: normName,
        unit: 'dB',
        values: magDb,
        phaseValues: phaseDeg,
      };
      series[normName] = ds;
      series[item.name.toLowerCase()] = ds;
    }

    return {
      engineName: 'ngspice-wasm',
      analysisType: 'ac',
      xAxis,
      series,
      rawLogs,
      netlistUsed,
      elapsedMs,
    };
  }

  // Real data (.tran, .dc, .op)
  if (analysisType === 'op') {
    for (const item of raw.data) {
      const normName = normalizeVarName(item.name);
      const val = (item.values as number[])[0] ?? 0;
      operatingPoint[normName] = val;
      series[normName] = {
        name: normName,
        unit: normName.startsWith('i(') ? 'A' : 'V',
        values: [val],
      };
    }
    return {
      engineName: 'ngspice-wasm',
      analysisType: 'op',
      xAxis: { name: 'op', unit: '', values: [0] },
      series,
      operatingPoint,
      rawLogs,
      netlistUsed,
      elapsedMs,
    };
  }

  const xVar = raw.data[0];
  const xAxis: DataSeries = {
    name: xVar.name.toLowerCase(),
    unit: analysisType === 'tran' ? 's' : 'V',
    values: xVar.values as number[],
  };

  for (let i = 1; i < raw.data.length; i++) {
    const item = raw.data[i];
    const normName = normalizeVarName(item.name);
    const unit = normName.startsWith('i(') || item.type === 'current' ? 'A' : 'V';
    const ds: DataSeries = {
      name: normName,
      unit,
      values: item.values as number[],
    };
    series[normName] = ds;
    series[item.name.toLowerCase()] = ds;
    if (ds.values.length > 0) {
      operatingPoint[normName] = ds.values[0];
    }
  }

  return {
    engineName: 'ngspice-wasm',
    analysisType,
    xAxis,
    series,
    operatingPoint,
    rawLogs,
    netlistUsed,
    elapsedMs,
  };
}
