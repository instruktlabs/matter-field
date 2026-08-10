import assert from 'node:assert/strict';
import test from 'node:test';

import { serpentSpine } from '../examples/serpent.js';
import { numberAdapter as N } from '../src/number.js';
import {
  breachLiftAtTime,
  fieldworkSteerIntent,
  sampleSerpentContact,
} from '../site/fieldwork/game.js';

test('FIELDWORK manual steering follows the player-facing camera convention', () => {
  assert.equal(fieldworkSteerIntent(1, 0), 1, 'left must increase the left-turn heading');
  assert.equal(fieldworkSteerIntent(0, 1), -1, 'right must decrease the right-turn heading');
  assert.equal(fieldworkSteerIntent(1, 1), 0, 'opposing controls cancel');
});

test('FIELDWORK breach lift is slow, periodic, and creates a real 3D underpass window', () => {
  assert.equal(breachLiftAtTime(0), 11);
  assert.equal(breachLiftAtTime(7), 27);
  assert.equal(breachLiftAtTime(14), 11);

  const craftY = 10.1;
  const lowTime = 0;
  const lowSpine = serpentSpine(N, 0.5, lowTime);
  const low = sampleSerpentContact({
    // SERPENT is (10, -425) with a -PI/2 Y rotation.
    x: 10 - lowSpine.z,
    y: craftY,
    z: -425 + lowSpine.x,
    time: lowTime,
    fault: false,
  });
  assert.ok(low.distance <= 0, `low body must hit the craft, got clearance ${low.distance}`);
  assert.ok(low.hit?.radius > 0, 'collision must use the authored body radius');

  const highTime = 7;
  const highSpine = serpentSpine(N, 0.5, highTime);
  const high = sampleSerpentContact({
    x: 10 - highSpine.z,
    y: craftY,
    z: -425 + highSpine.x,
    time: highTime,
    fault: false,
  });
  assert.ok(high.distance > 0, `raised body must leave a safe underpass, got clearance ${high.distance}`);
});
