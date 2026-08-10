import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

import { makeProbeGoldenSet, sourceContentSha256 } from '../scripts/build-gpu-probe.mjs';
import { normalizeSourceForIdentity } from '../scripts/source-identity.mjs';

const NATIVE_SOURCE_SHA256 = '38874b81e47bee18c32c29db010648113598a6bcb61005b208b46d6166a08479';

test('receipt source hashes are independent of checkout line endings', () => {
  const lf = 'export const field = (x) => x + 1;\n// identity\n';
  const crlf = lf.replaceAll('\n', '\r\n');
  const cr = lf.replaceAll('\n', '\r');

  assert.equal(sourceContentSha256(crlf), sourceContentSha256(lf));
  assert.equal(sourceContentSha256(cr), sourceContentSha256(lf));
});

test('type-only comments are excluded without changing the historical native source identity', async () => {
  const base = 'export const field = (x) => x + 1;\n';
  const annotated = [
    '// @matter-field-type-only-start',
    '/** @param {number} x @returns {number} */',
    '// @matter-field-type-only-end',
    base,
  ].join('\n');

  assert.equal(sourceContentSha256(annotated), sourceContentSha256(base));
  assert.equal((await makeProbeGoldenSet(300)).identity.sourceSha256, NATIVE_SOURCE_SHA256);
});

test('source identity changes for code and unmarked comments', () => {
  const base = 'export const field = (x) => x + 1;\n';
  assert.notEqual(sourceContentSha256(`${base}// identity changed\n`), sourceContentSha256(base));
  assert.notEqual(sourceContentSha256(base.replace('+ 1', '+ 2')), sourceContentSha256(base));
});

test('type-only normalization rejects executable, nested, and unbalanced regions', () => {
  assert.throws(() => normalizeSourceForIdentity([
    '// @matter-field-type-only-start',
    'export const hidden = 42;',
    '// @matter-field-type-only-end',
  ].join('\n')), /non-comment line/u);
  assert.throws(() => normalizeSourceForIdentity([
    '// @matter-field-type-only-start',
    '// @matter-field-type-only-start',
    '// @matter-field-type-only-end',
  ].join('\n')), /nested/u);
  assert.throws(() => normalizeSourceForIdentity('// @matter-field-type-only-end\n'), /orphan/u);
  assert.throws(() => normalizeSourceForIdentity('// @matter-field-type-only-start\n/** type */\n'), /unterminated/u);
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
