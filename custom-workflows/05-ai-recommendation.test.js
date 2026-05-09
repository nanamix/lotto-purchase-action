import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractGeminiText,
  extractGitHubModelsText,
  normalizeProvider,
  parseRecommendedNumbers
} from './05-ai-recommendation.js';

test('parseRecommendedNumbers returns six sorted unique lotto numbers', () => {
  const result = parseRecommendedNumbers('추천: 42, 3, 7, 12, 23, 31');

  assert.deepEqual(result, [3, 7, 12, 23, 31, 42]);
});

test('parseRecommendedNumbers ignores duplicates and rejects incomplete recommendations', () => {
  const result = parseRecommendedNumbers('3, 3, 7, 12, 23, 31');

  assert.equal(result, null);
});

test('parseRecommendedNumbers ignores out-of-range numbers before selecting six values', () => {
  const result = parseRecommendedNumbers('0, 46, 11, 2, 33, 19, 27, 41');

  assert.deepEqual(result, [2, 11, 19, 27, 33, 41]);
});

test('normalizeProvider defaults to github and supports gemini alias', () => {
  assert.equal(normalizeProvider(undefined), 'github');
  assert.equal(normalizeProvider('GitHub'), 'github');
  assert.equal(normalizeProvider('github-models'), 'github');
  assert.equal(normalizeProvider('copilot'), 'github');
  assert.equal(normalizeProvider('GEMINI'), 'gemini');
});

test('normalizeProvider rejects unknown providers', () => {
  assert.throws(() => normalizeProvider('openai'), /AI_PROVIDER/);
});

test('extractGitHubModelsText reads the first chat completion message', () => {
  const text = extractGitHubModelsText({
    choices: [{ message: { content: '1, 2, 3, 4, 5, 6' } }]
  });

  assert.equal(text, '1, 2, 3, 4, 5, 6');
});

test('extractGeminiText joins candidate text parts', () => {
  const text = extractGeminiText({
    candidates: [
      {
        content: {
          parts: [{ text: '1, 2, 3' }, { text: '4, 5, 6' }]
        }
      }
    ]
  });

  assert.equal(text, '1, 2, 3\n4, 5, 6');
});
