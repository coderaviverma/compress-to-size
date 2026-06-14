// Unit tests for the environment-free search core. `compressToTargetBytes` only
// reads `.size` off whatever `renderAtQuality` returns, so we can test it in Node
// with plain `{ size }` stand-ins — no canvas, no DOM, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { compressToTargetBytes } from '../src/index.js';

// Fake encoder: output size grows linearly with quality (size === round(q * 1000)).
const linearEncoder = (q) => Promise.resolve({ size: Math.round(q * 1000) });

test('returns the best-quality blob untouched when it already fits', async () => {
  const out = await compressToTargetBytes(() => Promise.resolve({ size: 100 }), 500);
  assert.equal(out.size, 100);
});

test('binary-searches down to at-or-below the target', async () => {
  const out = await compressToTargetBytes(linearEncoder, 500, { iterations: 14 });
  assert.ok(out.size <= 500, `expected <= 500, got ${out.size}`);
  assert.ok(out.size > 460, `expected to converge near the target, got ${out.size}`);
});

test('never returns a blob above the target when one below exists', async () => {
  // All achievable: the linear encoder's floor is 200 (q=minQ=0.2), so every
  // target here is >= 200 and therefore actually reachable.
  for (const target of [250, 333, 700, 880]) {
    const out = await compressToTargetBytes(linearEncoder, target, { iterations: 16 });
    assert.ok(out.size <= target, `target ${target}: got ${out.size}`);
  }
});

test('with no target (0), returns max quality', async () => {
  const out = await compressToTargetBytes(linearEncoder, 0);
  assert.equal(out.size, Math.round(0.95 * 1000)); // maxQ default
});

test('respects a custom maxQ ceiling', async () => {
  const out = await compressToTargetBytes(linearEncoder, 0, { maxQ: 0.6 });
  assert.equal(out.size, 600);
});

test('falls back to minQ when even the lowest quality overshoots', async () => {
  // Every render is bigger than the target → no blob ever "fits"; expect minQ render.
  const out = await compressToTargetBytes(linearEncoder, 50, { minQ: 0.1, iterations: 6 });
  assert.equal(out.size, 100); // minQ 0.1 * 1000
});
