import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePurchaseApiResponse } from '../src/core/purchase-result.ts';

test('parses successful purchase API game choices', () => {
  assert.deepEqual(
    parsePurchaseApiResponse({
      result: {
        resultCode: '100',
        resultMsg: 'SUCCESS',
        arrGameChoiceNum: ['A|2|9|19|29|34|45|1', 'B|6|10|23|24|39|43|3']
      }
    }),
    [
      [2, 9, 19, 29, 34, 45],
      [6, 10, 23, 24, 39, 43]
    ]
  );
});

test('rejects a failed purchase API response', () => {
  assert.throws(
    () =>
      parsePurchaseApiResponse({
        result: {
          resultCode: '500',
          resultMsg: '예치금 부족'
        }
      }),
    /예치금 부족/
  );
});

test('rejects malformed purchased game choices', () => {
  assert.throws(
    () =>
      parsePurchaseApiResponse({
        result: {
          resultCode: '100',
          resultMsg: 'SUCCESS',
          arrGameChoiceNum: ['A|2|9|19|29|34|1']
        }
      }),
    /Failed to parse purchased game/
  );
});
