import { runDunesPlayground } from './dunes-playground.js';
import { runSerpentPlayground, runSwellPlayground, runWindPlayground } from './three-playgrounds.js';
import { setStageStatus } from './runtime.js';

const canvas = document.querySelector('#demo');
const readouts = document.querySelector('#readouts');
const controls = document.querySelector('#controls');
const demo = document.body.dataset.demo;

const runners = {
  dunes: runDunesPlayground,
  swell: runSwellPlayground,
  wind: runWindPlayground,
  serpent: runSerpentPlayground,
};

async function main() {
  try {
    const runner = runners[demo];
    if (!runner) throw new Error(`Unknown Matter Field demo: ${demo}`);
    await runner({ canvas, readouts, controls });
  } catch (error) {
    console.error(error);
    setStageStatus('simulation unavailable · see console', 'error');
    const message = document.createElement('p');
    message.className = 'demo-error';
    message.textContent = `The simulation could not start: ${error?.message ?? error}`;
    controls.replaceChildren(message);
  }
}

main();
