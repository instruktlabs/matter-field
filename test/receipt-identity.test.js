import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

import { makeProbeGoldenSet, sourceContentSha256 } from '../scripts/build-gpu-probe.mjs';

test('receipt source hashes are independent of checkout line endings', () => {
  const lf = 'export const field = (x) => x + 1;\n// identity\n';
  const crlf = lf.replaceAll('\n', '\r\n');
  const cr = lf.replaceAll('\n', '\r');

  assert.equal(sourceContentSha256(crlf), sourceContentSha256(lf));
  assert.equal(sourceContentSha256(cr), sourceContentSha256(lf));
});

test('committed hardware receipts use the current canonical assay identity', async () => {
  const reportDirectory = new URL('../parity/reports/', import.meta.url);
  const files = (await readdir(reportDirectory)).filter((name) => name.endsWith('.json'));
  const current = (await makeProbeGoldenSet(300)).identity;

  assert.ok(files.length > 0, 'expected at least one committed hardware receipt');
  for (const file of files) {
    const report = JSON.parse(await readFile(new URL(file, reportDirectory), 'utf8'));
    assert.equal(report.goldenSet.sha256, current.sha256, `${file} assay identity`);
    assert.equal(report.goldenSet.sourceSha256, current.sourceSha256, `${file} source identity`);
    assert.equal(report.run?.dirty, false, `${file} clean worktree`);
  }
});
