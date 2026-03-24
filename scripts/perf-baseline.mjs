import { performance } from 'node:perf_hooks';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SLA_MS = {
  listLoad: 1500,
  detailOpen: 500,
  saveAction: 700,
};

const DEFAULT_SCENARIOS = [100, 500, 1000];
const SCENARIOS = (process.env.PERF_SCENARIOS || '')
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isFinite(value) && value > 0);
const EFFECTIVE_SCENARIOS = SCENARIOS.length > 0 ? SCENARIOS : DEFAULT_SCENARIOS;
const RUNS_PER_SCENARIO = Math.max(1, Number(process.env.PERF_RUNS || 7));
const USER_ID = 'perf-user-1';

function buildLocalStorageMock() {
  let store = {};
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key, value) {
      store[key] = String(value);
    },
    removeItem(key) {
      delete store[key];
    },
    clear() {
      store = {};
    },
  };
}

if (!globalThis.localStorage) {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: buildLocalStorageMock(),
  });
}

if (!globalThis.crypto?.randomUUID) {
  let uuidCounter = 0;
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: {
      randomUUID() {
        uuidCounter += 1;
        return `perf-uuid-${uuidCounter}`;
      },
    },
  });
}

function buildDummyPatients(count) {
  const now = Date.now();
  const stasePool = ['stase-interna', 'stase-bedah', 'stase-anak', 'stase-obgyn'];
  const conditionPool = ['stable', 'urgent', 'critical', 'improving'];

  return Array.from({ length: count }, (_, i) => {
    const ts = new Date(now - i * 60_000).toISOString();
    return {
      id: `patient-${i + 1}`,
      name: `Patient ${i + 1}`,
      age: 20 + (i % 50),
      gender: i % 2 === 0 ? 'male' : 'female',
      mrn: `MRN-${String(i + 1).padStart(6, '0')}`,
      chiefComplaint: `Keluhan utama ${i + 1}`,
      diagnosis: `Diagnosis ${i % 30}`,
      condition: conditionPool[i % conditionPool.length],
      status: i % 9 === 0 ? 'discharged' : 'active',
      stase_id: stasePool[i % stasePool.length],
      room: `R-${(i % 40) + 1}`,
      admissionDate: ts,
      createdAt: ts,
      updatedAt: ts,
      symptoms: [
        {
          id: `sym-${i + 1}`,
          name: `Symptom ${i % 20}`,
          severity: i % 3 === 0 ? 'berat' : 'sedang',
          notes: `Catatan gejala ${i + 1}`,
          recordedAt: ts,
        },
      ],
      dailyReports: [
        {
          id: `rep-${i + 1}`,
          date: ts,
          condition: i % 2 === 0 ? 'Membaik' : 'Tetap',
          notes: `Laporan harian ${i + 1}`,
        },
      ],
      physicalExams: [
        {
          id: `pex-${i + 1}`,
          system: 'umum',
          findings: `Temuan fisik ${i + 1}`,
          date: ts,
        },
      ],
      supportingExams: [
        {
          id: `lab-${i + 1}`,
          type: 'lab',
          testName: 'Hb',
          value: String(11 + (i % 3)),
          unit: 'g/dL',
          result: i % 5 === 0 ? 'abnormal' : 'normal',
          date: ts,
        },
      ],
      prescriptions: [
        {
          id: `rx-${i + 1}`,
          name: `Obat ${i % 25}`,
          dosage: '1 tablet',
          frequency: '2x sehari',
          route: 'oral',
          date: ts,
        },
      ],
      vitalSigns: [
        {
          id: `vs-${i + 1}`,
          recordedAt: ts,
          heartRate: String(72 + (i % 15)),
          bloodPressure: `${110 + (i % 20)}/${70 + (i % 10)}`,
          temperature: String(36.5 + ((i % 5) * 0.1)),
          spO2: String(96 + (i % 3)),
        },
      ],
      aiInsights: {},
    };
  });
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function deriveFilteredPatients(patients) {
  const q = 'patient';
  let result = [...patients];
  result = result.filter((p) =>
    p.name?.toLowerCase().includes(q)
    || p.chiefComplaint?.toLowerCase().includes(q)
    || p.diagnosis?.toLowerCase().includes(q)
  );

  result.sort((a, b) => {
    const updatedA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const updatedB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return updatedB - updatedA;
  });
  return result;
}

function deriveDetailContext(patient) {
  if (!patient) return null;
  const symptomText = (patient.symptoms || []).map((s) => `${s.name}:${s.severity}`).join('|');
  const examText = (patient.physicalExams || []).map((e) => `${e.system}:${e.findings}`).join('|');
  const labText = (patient.supportingExams || []).map((l) => `${l.testName}:${l.value}`).join('|');
  const medText = (patient.prescriptions || []).map((m) => `${m.name}:${m.dosage}`).join('|');
  const reportText = (patient.dailyReports || []).map((r) => `${r.condition}:${r.notes}`).join('|');
  return `${patient.name}|${symptomText}|${examText}|${labText}|${medText}|${reportText}`;
}

function statusFromSla(metric, valueMs) {
  const sla = SLA_MS[metric];
  if (!sla) return 'INFO';
  return valueMs <= sla ? 'PASS' : 'FAIL';
}

function printScenarioResult(count, result) {
  const rows = [
    ['Metric', 'Median (ms)', 'P95 (ms)', 'SLA (ms)', 'Status'],
    ['Login->List', result.list.median.toFixed(2), result.list.p95.toFixed(2), String(SLA_MS.listLoad), statusFromSla('listLoad', result.list.p95)],
    ['Open Detail', result.detail.median.toFixed(2), result.detail.p95.toFixed(2), String(SLA_MS.detailOpen), statusFromSla('detailOpen', result.detail.p95)],
    ['Save Action', result.save.median.toFixed(2), result.save.p95.toFixed(2), String(SLA_MS.saveAction), statusFromSla('saveAction', result.save.p95)],
  ];

  console.log(`\n=== Scenario ${count} Patients/User ===`);
  const widths = rows[0].map((_, col) => Math.max(...rows.map((r) => r[col].length)) + 2);
  for (const row of rows) {
    console.log(row.map((cell, i) => cell.padEnd(widths[i])).join(''));
  }
}

async function main() {
  const dataService = await import('../src/services/dataService.js');
  const {
    setDataStorageScope,
    setScheduleStorageScope,
    bulkSavePatients,
    getAllPatients,
    updatePatient,
  } = dataService;

  const summary = {
    createdAt: new Date().toISOString(),
    runsPerScenario: RUNS_PER_SCENARIO,
    slaMs: SLA_MS,
    scenarios: {},
  };

  for (const count of EFFECTIVE_SCENARIOS) {
    localStorage.clear();
    setDataStorageScope(null);
    setScheduleStorageScope(null);
    setDataStorageScope(USER_ID);

    const dataset = buildDummyPatients(count);
    bulkSavePatients(dataset);

    const listRuns = [];
    const detailRuns = [];
    const saveRuns = [];

    for (let i = 0; i < RUNS_PER_SCENARIO; i += 1) {
      const t1 = performance.now();
      const loaded = getAllPatients();
      const filtered = deriveFilteredPatients(loaded);
      const t2 = performance.now();
      listRuns.push(t2 - t1);

      const targetId = filtered[Math.floor(filtered.length / 2)]?.id;
      const t3 = performance.now();
      const patient = loaded.find((p) => p.id === targetId);
      deriveDetailContext(patient);
      const t4 = performance.now();
      detailRuns.push(t4 - t3);

      const t5 = performance.now();
      updatePatient(targetId, {
        chiefComplaint: `Updated complaint ${i}`,
      });
      const refreshed = getAllPatients();
      refreshed.find((p) => p.id === targetId);
      const t6 = performance.now();
      saveRuns.push(t6 - t5);
    }

    const scenarioResult = {
      list: {
        median: median(listRuns),
        p95: percentile(listRuns, 95),
        runs: listRuns,
      },
      detail: {
        median: median(detailRuns),
        p95: percentile(detailRuns, 95),
        runs: detailRuns,
      },
      save: {
        median: median(saveRuns),
        p95: percentile(saveRuns, 95),
        runs: saveRuns,
      },
    };

    summary.scenarios[count] = scenarioResult;
    printScenarioResult(count, scenarioResult);
  }

  const reportDir = path.resolve('test-reports');
  await mkdir(reportDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportDir, `perf-baseline-${stamp}.json`);
  await writeFile(reportPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  console.log(`\nSaved report: ${reportPath}`);
}

main().catch((err) => {
  console.error('Performance baseline run failed:', err);
  process.exitCode = 1;
});
