import { runGpuProbe } from '../../parity/gpu-probe-template.js';

const status = document.querySelector('#status');
const output = document.querySelector('#report');
const download = document.querySelector('#download');
const buttons = [document.querySelector('#run-webgpu'), document.querySelector('#run-webgl2')];
const identity = document.querySelector('#identity');
let current = null;

function probeConfig() {
  const config = globalThis.__MATTER_FIELD_PROBE_CONFIG__;
  if (!config?.points?.length || config.goldenSet?.schema !== 'matter-field-assay-set/v2') {
    throw new Error('The live assay is missing its build-bound v2 golden set. Rebuild the site.');
  }
  return config;
}

async function browserIdentity() {
  const highEntropy = navigator.userAgentData?.getHighEntropyValues
    ? await navigator.userAgentData.getHighEntropyValues(['architecture', 'bitness', 'model', 'platformVersion', 'fullVersionList'])
    : null;
  return {
    userAgent: navigator.userAgent,
    platform: navigator.userAgentData?.platform ?? navigator.platform,
    highEntropy,
  };
}

async function run(backend) {
  buttons.forEach((button) => { button.disabled = true; });
  download.disabled = true;
  status.textContent = `running ${backend}…`;
  status.className = '';
  output.textContent = 'Compiling the TSL graph and waiting for GPU readback…';
  try {
    const golden = probeConfig();
    current = await runGpuProbe({ backend, points: golden.points, goldenSet: golden.goldenSet });
    current.browser = await browserIdentity();
    current.generatedAt = new Date().toISOString();
    status.textContent = current.pass ? 'PASS' : 'FAIL';
    status.className = current.pass ? 'pass' : 'fail';
    output.textContent = JSON.stringify(current, null, 2);
    download.disabled = false;
  } catch (error) {
    current = null;
    status.textContent = 'unavailable';
    status.className = 'fail';
    output.textContent = String(error?.stack ?? error);
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
}

try {
  const config = probeConfig();
  identity.textContent = `${config.goldenSet.pointCount} points · v2 set ${config.goldenSet.sha256.slice(0, 12)}… · package ${config.goldenSet.packageVersion} · Three ${config.goldenSet.threeVersion}`;
  window.render_game_to_text = () => JSON.stringify({
    demo: 'parity-lab', status: status.textContent, running: buttons.some((button) => button.disabled),
    goldenSet: config.goldenSet, report: current,
  });
} catch (error) {
  identity.textContent = error.message;
  identity.className = 'fail';
  buttons.forEach((button) => { button.disabled = true; });
}

buttons[0].addEventListener('click', () => run('webgpu'));
buttons[1].addEventListener('click', () => run('webgl2'));
download.addEventListener('click', () => {
  if (!current) return;
  const blob = new Blob([`${JSON.stringify(current, null, 2)}\n`], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `matter-field-${current.backend}-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
});
