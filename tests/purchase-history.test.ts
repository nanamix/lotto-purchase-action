import assert from 'node:assert/strict';
import test from 'node:test';
import type { Page } from 'playwright';
import {
  getPurchasedGamesForRound,
  parseTicketDetail,
  selectRoundPurchaseItems
} from '../src/core/purchase-history.ts';

test('selects only lotto purchases for the requested round', () => {
  assert.deepEqual(
    selectRoundPurchaseItems(
      {
        data: {
          list: [
            { ltGdsNm: '로또6/45', ltEpsdView: '제1235회', ntslOrdrNo: 'order-1', gmInfo: 'barcode-1' },
            { ltGdsNm: '로또6/45', ltEpsdView: '제1234회', ntslOrdrNo: 'order-2', gmInfo: 'barcode-2' },
            { ltGdsNm: '연금복권720+', ltEpsdView: '제1235회', ntslOrdrNo: 'order-3', gmInfo: 'barcode-3' }
          ]
        }
      },
      1235
    ),
    [{ ltGdsNm: '로또6/45', ltEpsdView: '제1235회', ntslOrdrNo: 'order-1', gmInfo: 'barcode-1' }]
  );
});

test('parses purchased numbers from ticket detail', () => {
  assert.deepEqual(
    parseTicketDetail({
      data: {
        success: true,
        ticket: {
          game_dtl: [
            { idx: 'A', type: 1, num: [2, 9, 19, 29, 34, 45] },
            { idx: 'B', type: 1, num: [6, 10, 23, 24, 39, 43] }
          ]
        }
      }
    }),
    [
      [2, 9, 19, 29, 34, 45],
      [6, 10, 23, 24, 39, 43]
    ]
  );
});

test('rejects malformed ticket detail numbers', () => {
  assert.throws(
    () =>
      parseTicketDetail({
        data: {
          success: true,
          ticket: {
            game_dtl: [{ idx: 'A', type: 1, num: [2, 9, 19, 29, 34, 34] }]
          }
        }
      }),
    /유효한 로또 번호/
  );
});

test('loads current-round purchased numbers from history and detail APIs', async () => {
  const requestedUrls: string[] = [];
  const page = {
    goto: async (url: string) => {
      requestedUrls.push(url);
    },
    request: {
      get: async (url: string) => {
        requestedUrls.push(url);
        const payload = url.includes('selectMyLotteryledger.do')
          ? {
              data: {
                list: [
                  {
                    ltGdsNm: '로또6/45',
                    ltEpsdView: '제1235회',
                    ntslOrdrNo: 'order-1',
                    gmInfo: 'barcode-1'
                  }
                ]
              }
            }
          : {
              data: {
                success: true,
                ticket: {
                  game_dtl: [{ idx: 'A', type: 1, num: [2, 9, 19, 29, 34, 45] }]
                }
              }
            };

        return {
          ok: () => true,
          status: () => 200,
          json: async () => payload
        };
      }
    }
  } as unknown as Page;

  assert.deepEqual(await getPurchasedGamesForRound(page, 1235), [[2, 9, 19, 29, 34, 45]]);
  assert.equal(
    requestedUrls.some(url => url.includes('/mypage/mylotteryledger')),
    true
  );
  assert.equal(
    requestedUrls.some(url => url.includes('/mypage/selectMyLotteryledger.do')),
    true
  );
  assert.equal(
    requestedUrls.some(url => url.includes('/mypage/lotto645TicketDetail.do')),
    true
  );
});
