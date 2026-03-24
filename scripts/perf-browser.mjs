import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import process from 'node:process';

const DEFAULT_SCENARIOS = [1000, 2000, 5000];
const SCENARIOS = (process.env.PERF_SCENARIOS || '')
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isFinite(value) && value > 0);
const EFFECTIVE_SCENARIOS = SCENARIOS.length > 0 ? SCENARIOS : DEFAULT_SCENARIOS;
const RUNS_PER_SCENARIO = Math.max(1, Number(process.env.PERF_RUNS || 9));
const DEFAULT_PROFILES = ['desktop', 'mobile-mid'];
const PROFILES = (process.env.PERF_PROFILES || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const EFFECTIVE_PROFILES = PROFILES.length > 0 ? PROFILES : DEFAULT_PROFILES;
const SERVER_MODE = (process.env.PERF_SERVER_MODE || 'preview').trim().toLowerCase();
const HOST = '127.0.0.1';
const PORT = Number(process.env.PERF_PORT || 4174);
const BASE_URL = `http://${HOST}:${PORT}`;

const SLA_MS = {
  listLoad: 1500,
  detailOpen: 500,
  saveAction: 700,
};

const PROFILE_CONFIGS = {
  desktop: {
    cpuThrottleRate: 1,
    latencyMs: 20,
    downloadBps: 30 * 1024 * 1024,
    uploadBps: 10 * 1024 * 1024,
  },
  'mobile-mid': {
    cpuThrottleRate: 4,
    latencyMs: 150,
    downloadBps: 5 * 1024 * 1024,
    uploadBps: 1.5 * 1024 * 1024,
  },
};

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function statusFromSla(metric, valueMs) {
  const sla = SLA_MS[metric];
  return valueMs <= sla ? 'PASS' : 'FAIL';
}

function printScenarioResult(count, result) {
  const rows = [
    ['Metric', 'Median (ms)', 'P95 (ms)', 'SLA (ms)', 'Status'],
    ['List + render', result.list.median.toFixed(2), result.list.p95.toFixed(2), String(SLA_MS.listLoad), statusFromSla('listLoad', result.list.p95)],
    ['Open Detail', result.detail.median.toFixed(2), result.detail.p95.toFixed(2), String(SLA_MS.detailOpen), statusFromSla('detailOpen', result.detail.p95)],
    ['Save + rerender', result.save.median.toFixed(2), result.save.p95.toFixed(2), String(SLA_MS.saveAction), statusFromSla('saveAction', result.save.p95)],
  ];

  console.log(`\n=== Browser Scenario ${count} Patients/User ===`);
  const widths = rows[0].map((_, col) => Math.max(...rows.map((r) => r[col].length)) + 2);
  for (const row of rows) {
    console.log(row.map((cell, i) => cell.padEnd(widths[i])).join(''));
  }
}

function resolveProfile(profileName) {
  return PROFILE_CONFIGS[profileName] || PROFILE_CONFIGS.desktop;
}

async function applyProfile(page, profileName) {
  const cfg = resolveProfile(profileName);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', {
    rate: cfg.cpuThrottleRate,
  });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: cfg.latencyMs,
    downloadThroughput: cfg.downloadBps,
    uploadThroughput: cfg.uploadBps,
    connectionType: profileName === 'mobile-mid' ? 'cellular4g' : 'wifi',
  });
}

async function waitForServer(url, timeoutMs = 30_000) {
  const started = Date.now();
  while ((Date.now() - started) < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Retry until timeout.
    }
    await delay(500);
  }
  throw new Error(`Dev server did not become ready in ${timeoutMs}ms at ${url}`);
}

function startDevServer() {
  const serverScript = SERVER_MODE === 'dev' ? 'dev' : 'preview';
  const child = spawn('npm', ['run', serverScript, '--', '--host', HOST, '--port', String(PORT), '--strictPort'], {
    cwd: process.cwd(),
    env: process.env,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => {
    const text = String(chunk);
    process.stdout.write(text);
  });
  child.stderr.on('data', (chunk) => {
    const text = String(chunk);
    process.stderr.write(text);
  });

  return child;
}

async function runScenarioInBrowser(page, scenarioCount, runs) {
  const result = await page.evaluate(async ({ count, runCount }) => {
    function buildDummyPatients(total) {
      const now = Date.now();
      const stasePool = ['stase-interna', 'stase-bedah', 'stase-anak', 'stase-obgyn'];
      const conditionPool = ['stable', 'urgent', 'critical', 'improving'];

      return Array.from({ length: total }, (_, i) => {
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
          updatedAt: ts,
          symptoms: [{ id: `sym-${i + 1}`, name: `Symptom ${i % 20}`, severity: 'sedang', notes: 'ok', recordedAt: ts }],
          dailyReports: [{ id: `rep-${i + 1}`, date: ts, condition: 'tetap', notes: 'monitoring' }],
          supportingExams: [{ id: `lab-${i + 1}`, testName: 'Hb', value: '12', unit: 'g/dL', result: 'normal', date: ts }],
          prescriptions: [{ id: `rx-${i + 1}`, name: 'Paracetamol', dosage: '500mg', frequency: '3x', route: 'oral', date: ts }],
          physicalExams: [{ id: `pex-${i + 1}`, system: 'umum', findings: 'normal', date: ts }],
        };
      });
    }

    function deriveFilteredPatients(patients) {
      const q = 'patient';
      const result = patients.filter((p) =>
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

    function renderList(target, rows) {
      const html = rows
        .slice(0, 60)
        .map((p) => `<div class=\"row\"><b>${p.name}</b><span>${p.condition}</span><span>${p.diagnosis}</span></div>`)
        .join('');
      target.innerHTML = html;
    }

    function renderDetail(target, patient) {
      const text = [
        patient.name,
        patient.chiefComplaint,
        patient.diagnosis,
        ...(patient.symptoms || []).map((s) => `${s.name}:${s.severity}`),
        ...(patient.supportingExams || []).map((l) => `${l.testName}:${l.value}`),
      ].join('|');
      target.textContent = text;
    }

    const mount = document.createElement('div');
    mount.id = 'perf-mount';
    document.body.appendChild(mount);

    const listEl = document.createElement('div');
    const detailEl = document.createElement('div');
    mount.appendChild(listEl);
    mount.appendChild(detailEl);

    const patients = buildDummyPatients(count);
    const listRuns = [];
    const detailRuns = [];
    const saveRuns = [];

    for (let i = 0; i < runCount; i += 1) {
      const t1 = performance.now();
      const filtered = deriveFilteredPatients(patients);
      renderList(listEl, filtered);
      const t2 = performance.now();
      listRuns.push(t2 - t1);

      const picked = filtered[Math.floor(filtered.length / 2)];
      const t3 = performance.now();
      renderDetail(detailEl, picked);
      const t4 = performance.now();
      detailRuns.push(t4 - t3);

      const t5 = performance.now();
      picked.chiefComplaint = `Updated complaint ${i}`;
      picked.updatedAt = new Date().toISOString();
      const afterSave = deriveFilteredPatients(patients);
      renderList(listEl, afterSave);
      renderDetail(detailEl, picked);
      const t6 = performance.now();
      saveRuns.push(t6 - t5);
    }

    return { listRuns, detailRuns, saveRuns };
  }, { count: scenarioCount, runCount: runs });

  return {
    list: {
      median: median(result.listRuns),
      p95: percentile(result.listRuns, 95),
      runs: result.listRuns,
    },
    detail: {
      median: median(result.detailRuns),
      p95: percentile(result.detailRuns, 95),
      runs: result.detailRuns,
    },
    save: {
      median: median(result.saveRuns),
      p95: percentile(result.saveRuns, 95),
      runs: result.saveRuns,
    },
  };
}

async function main() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    throw new Error('Missing dependency: playwright. Install with npm i -D playwright and run npx playwright install chromium');
  }

  const server = startDevServer();
  try {
    await waitForServer(BASE_URL, 45_000);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    await page.goto(BASE_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    });

    const summary = {
      createdAt: new Date().toISOString(),
      mode: 'browser-headless-chromium',
      serverMode: SERVER_MODE,
      baseUrl: BASE_URL,
      runsPerScenario: RUNS_PER_SCENARIO,
      profiles: EFFECTIVE_PROFILES,
      slaMs: SLA_MS,
      results: {},
    };

    for (const profileName of EFFECTIVE_PROFILES) {
      await applyProfile(page, profileName);
      summary.results[profileName] = {};
      console.log(`\n--- Profile: ${profileName} ---`);
      for (const scenario of EFFECTIVE_SCENARIOS) {
        const metrics = await runScenarioInBrowser(page, scenario, RUNS_PER_SCENARIO);
        summary.results[profileName][scenario] = metrics;
        printScenarioResult(scenario, metrics);
      }
    }

    await browser.close();

    const reportDir = path.resolve('test-reports');
    await mkdir(reportDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join(reportDir, `perf-browser-${stamp}.json`);
    await writeFile(reportPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    console.log(`\nSaved report: ${reportPath}`);
  } finally {
    if (server && !server.killed) {
      server.kill();
    }
  }
}

main().catch((err) => {
  console.error('Browser performance run failed:', err.message || err);
  process.exitCode = 1;
});
