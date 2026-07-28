import type { Page } from 'playwright';

const BASE_URL = 'https://www.dhlottery.co.kr';
const HISTORY_PAGE_URL = `${BASE_URL}/mypage/mylotteryledger`;
const HISTORY_API_URL = `${BASE_URL}/mypage/selectMyLotteryledger.do`;
const TICKET_DETAIL_API_URL = `${BASE_URL}/mypage/lotto645TicketDetail.do`;

interface PurchaseHistoryItem {
  ltGdsNm?: string;
  ltEpsdView?: string;
  gmInfo?: string;
  ntslOrdrNo?: string;
}

interface TicketGame {
  num?: unknown;
}

function formatKstDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));

  return `${values.year}${values.month}${values.day}`;
}

function parseRound(value: string): number | null {
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function validateGame(numbers: unknown): number[] {
  if (
    !Array.isArray(numbers) ||
    numbers.length !== 6 ||
    numbers.some(number => !Number.isInteger(number) || number < 1 || number > 45) ||
    new Set(numbers).size !== 6
  ) {
    throw new Error('구매내역에서 유효한 로또 번호 6개를 찾지 못했습니다');
  }

  return numbers as number[];
}

export function selectRoundPurchaseItems(payload: unknown, round: number): PurchaseHistoryItem[] {
  const response = payload as { data?: { list?: unknown } };
  const items = response?.data?.list;
  if (!Array.isArray(items)) {
    return [];
  }

  return items.filter(item => {
    if (!item || typeof item !== 'object') {
      return false;
    }

    const purchase = item as PurchaseHistoryItem;
    return purchase.ltGdsNm === '로또6/45' && parseRound(purchase.ltEpsdView || '') === round;
  });
}

export function parseTicketDetail(payload: unknown): number[][] {
  const response = payload as {
    data?: {
      success?: boolean;
      ticket?: {
        game_dtl?: unknown;
      };
    };
  };
  const games = response?.data?.ticket?.game_dtl;

  if (response?.data?.success !== true || !Array.isArray(games)) {
    throw new Error('로또 구매 상세내역 응답이 올바르지 않습니다');
  }

  return games.map(game => validateGame((game as TicketGame)?.num));
}

export async function getPurchasedGamesForRound(page: Page, round: number): Promise<number[][]> {
  const today = new Date();
  const startDate = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000);
  const commonHeaders = {
    Accept: 'application/json, text/javascript, */*; q=0.01',
    'X-Requested-With': 'XMLHttpRequest',
    Referer: HISTORY_PAGE_URL
  };

  await page.goto(HISTORY_PAGE_URL, { waitUntil: 'domcontentloaded' });

  const historyUrl = new URL(HISTORY_API_URL);
  historyUrl.search = new URLSearchParams({
    srchStrDt: formatKstDate(startDate),
    srchEndDt: formatKstDate(today),
    pageNum: '1',
    recordCountPerPage: '100',
    _: String(Date.now())
  }).toString();

  const historyResponse = await page.request.get(historyUrl.toString(), { headers: commonHeaders });
  if (!historyResponse.ok()) {
    throw new Error(`구매내역 조회 API가 HTTP ${historyResponse.status()}를 반환했습니다`);
  }

  const purchases = selectRoundPurchaseItems(await historyResponse.json(), round);
  const purchasedGames: number[][] = [];

  for (const purchase of purchases) {
    if (!purchase.ntslOrdrNo || !purchase.gmInfo) {
      throw new Error(`제${round}회 구매내역의 상세 조회 정보가 없습니다`);
    }

    const detailUrl = new URL(TICKET_DETAIL_API_URL);
    detailUrl.search = new URLSearchParams({
      ntslOrdrNo: purchase.ntslOrdrNo,
      srchStrDt: formatKstDate(startDate),
      srchEndDt: formatKstDate(today),
      barcd: purchase.gmInfo
    }).toString();

    const detailResponse = await page.request.get(detailUrl.toString(), {
      headers: {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: HISTORY_PAGE_URL
      }
    });
    if (!detailResponse.ok()) {
      throw new Error(`구매 상세내역 API가 HTTP ${detailResponse.status()}를 반환했습니다`);
    }

    purchasedGames.push(...parseTicketDetail(await detailResponse.json()));
  }

  return purchasedGames;
}
