import assert from 'node:assert/strict';
import test from 'node:test';

import { sourceContentSha256 } from '../scripts/build-gpu-probe.mjs';

test('receipt source hashes are independent of checkout line endings', () => {
  const lf = 'export const field = (x) => x + 1;\n// identity\n';
  const crlf = lf.replaceAll('\n', '\r\n');
  const cr = lf.replaceAll('\n', '\r');

  assert.equal(sourceContentSha256(crlf), sourceContentSha256(lf));
  assert.equal(sourceContentSha256(cr), sourceContentSha256(lf));
});
