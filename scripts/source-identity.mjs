import { createHash } from 'node:crypto';

export const TYPE_ONLY_START = '// @matter-field-type-only-start';
export const TYPE_ONLY_END = '// @matter-field-type-only-end';

function assertCommentOnly(lines, startLine) {
  let inBlockComment = false;

  for (let index = 0; index < lines.length; index++) {
    const lineNumber = startLine + index + 1;
    const line = lines[index];
    const trimmed = line.trimStart();

    if (inBlockComment) {
      const close = trimmed.indexOf('*/');
      if (close === -1) continue;
      if (trimmed.slice(close + 2).trim() !== '') {
        throw new Error(`type-only block contains executable text after a comment on line ${lineNumber}`);
      }
      inBlockComment = false;
      continue;
    }

    if (trimmed === '' || trimmed.startsWith('//')) continue;
    if (!trimmed.startsWith('/*')) {
      throw new Error(`type-only block contains a non-comment line at ${lineNumber}`);
    }

    const close = trimmed.indexOf('*/', 2);
    if (close === -1) {
      inBlockComment = true;
    } else if (trimmed.slice(close + 2).trim() !== '') {
      throw new Error(`type-only block contains executable text after a comment on line ${lineNumber}`);
    }
  }

  if (inBlockComment) {
    throw new Error(`type-only block contains an unterminated comment after line ${startLine}`);
  }
}

/**
 * Canonicalize source for receipt identity while ignoring explicitly marked,
 * comment-only type metadata. The parser fails closed: nested/unbalanced
 * markers or executable text inside a marked region are errors.
 */
export function normalizeSourceForIdentity(source) {
  const canonical = String(source).replace(/\r\n?/g, '\n');
  const lines = canonical.split('\n');
  const output = [];
  let blockStart = -1;
  let typeOnlyLines = [];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const marker = line.trim();

    if (marker === TYPE_ONLY_START) {
      if (blockStart !== -1) {
        throw new Error(`nested type-only marker on line ${index + 1}`);
      }
      blockStart = index + 1;
      typeOnlyLines = [];
      continue;
    }

    if (marker === TYPE_ONLY_END) {
      if (blockStart === -1) {
        throw new Error(`orphan type-only end marker on line ${index + 1}`);
      }
      assertCommentOnly(typeOnlyLines, blockStart);
      blockStart = -1;
      typeOnlyLines = [];
      continue;
    }

    if (blockStart !== -1) {
      typeOnlyLines.push(line);
    } else {
      output.push(line);
    }
  }

  if (blockStart !== -1) {
    throw new Error(`unterminated type-only marker starting on line ${blockStart}`);
  }

  return output.join('\n');
}

export function sourceContentSha256(source) {
  return createHash('sha256').update(normalizeSourceForIdentity(source), 'utf8').digest('hex');
}
