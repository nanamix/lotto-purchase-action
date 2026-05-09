import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const workflow = readFileSync(new URL('../.github/workflows/lotto-purchase.yml', import.meta.url), 'utf8');
const action = readFileSync(new URL('../action.yml', import.meta.url), 'utf8');
const index = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

test('manual workflow exposes check-winning-only purchase profile', () => {
  assert.match(workflow, /purchase-profile:[\s\S]*options:[\s\S]*- check-winning-only/);
});

test('workflow passes check-winning-only flag into the action', () => {
  assert.match(
    workflow,
    /check-winning-only:\s*\$\{\{\s*steps\.purchase-workflow\.outputs\.check-winning-only\s*\|\|\s*'false'\s*\}\}/
  );
});

test('action supports check-winning-only input', () => {
  assert.match(action, /check-winning-only:[\s\S]*description:/);
});

test('check-winning-only mode exits before browser purchase flow', () => {
  assert.match(index, /core\.getBooleanInput\('check-winning-only'\)/);
  assert.match(index, /\[Main\] Check-winning-only mode enabled/);
});
