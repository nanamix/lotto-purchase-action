import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildHttpErrorMessage,
  extractGeminiText,
  extractGitHubModelsText,
  extractOpenAiText,
  getProviderSequence,
  normalizeProvider,
  parseGameCount,
  parseRecommendedGames,
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

test('parseRecommendedGames returns the requested number of games', () => {
  const result = parseRecommendedGames('1) 3, 7, 12, 23, 31, 42\n2) 4, 9, 16, 22, 33, 41\n3) 5, 10, 17, 24, 35, 44', 3);

  assert.deepEqual(result, [
    [3, 7, 12, 23, 31, 42],
    [4, 9, 16, 22, 33, 41],
    [5, 10, 17, 24, 35, 44]
  ]);
});

test('parseRecommendedGames rejects duplicate game recommendations', () => {
  const result = parseRecommendedGames('3, 7, 12, 23, 31, 42\n3, 7, 12, 23, 31, 42', 2);

  assert.equal(result, null);
});

test('parseGameCount defaults to one and clamps to five games', () => {
  assert.equal(parseGameCount(undefined), 1);
  assert.equal(parseGameCount('3'), 3);
  assert.equal(parseGameCount('0'), 1);
  assert.equal(parseGameCount('9'), 5);
});

test('normalizeProvider defaults to github and supports gemini alias', () => {
  assert.equal(normalizeProvider(undefined), 'github');
  assert.equal(normalizeProvider('GitHub'), 'github');
  assert.equal(normalizeProvider('github-models'), 'github');
  assert.equal(normalizeProvider('copilot'), 'github');
  assert.equal(normalizeProvider('OPENAI'), 'openai');
  assert.equal(normalizeProvider('GEMINI'), 'gemini');
});

test('normalizeProvider rejects unknown providers', () => {
  assert.throws(() => normalizeProvider('anthropic'), /AI_PROVIDER/);
});

test('getProviderSequence tries gemini after github when a Gemini key is available', () => {
  assert.deepEqual(getProviderSequence('github', { GEMINI_API_KEY: 'key' }), ['github', 'gemini']);
  assert.deepEqual(getProviderSequence('github', {}), ['github']);
  assert.deepEqual(getProviderSequence('gemini', { GEMINI_API_KEY: 'key' }), ['gemini']);
  assert.deepEqual(getProviderSequence('openai', { OPENAI_API_KEY: 'key', GEMINI_API_KEY: 'key' }), ['openai']);
});

test('buildHttpErrorMessage includes response body details', async () => {
  const message = await buildHttpErrorMessage('GitHub Models API', {
    status: 403,
    text: async () => '{"message":"models access is disabled"}'
  });

  assert.equal(message, 'GitHub Models API 요청 실패 (403): {"message":"models access is disabled"}');
});

test('extractGitHubModelsText reads the first chat completion message', () => {
  const text = extractGitHubModelsText({
    choices: [{ message: { content: '1, 2, 3, 4, 5, 6' } }]
  });

  assert.equal(text, '1, 2, 3, 4, 5, 6');
});

test('extractOpenAiText reads the first chat completion message', () => {
  const text = extractOpenAiText({
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
