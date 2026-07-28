interface PurchaseResultPayload {
  result?: {
    resultCode?: string | number;
    resultMsg?: string;
    arrGameChoiceNum?: unknown;
  };
}

function parseGameChoice(line: string): number[] {
  const numbers = line.slice(2, -1).split('|').filter(Boolean).map(Number);

  if (
    numbers.length !== 6 ||
    numbers.some(number => !Number.isInteger(number) || number < 1 || number > 45) ||
    new Set(numbers).size !== 6
  ) {
    throw new Error(`Failed to parse purchased game: ${line}`);
  }

  return numbers;
}

export function parsePurchaseApiResponse(payload: unknown): number[][] {
  const response = payload as PurchaseResultPayload;
  const resultCode = String(response?.result?.resultCode ?? '');
  const resultMessage = response?.result?.resultMsg || 'unknown';

  if (resultCode !== '100') {
    throw new Error(`Purchase failed: ${resultMessage} (code: ${resultCode || 'missing'})`);
  }

  const gameChoices = response.result?.arrGameChoiceNum;
  if (!Array.isArray(gameChoices) || gameChoices.length === 0 || gameChoices.some(line => typeof line !== 'string')) {
    throw new Error('Purchase succeeded but returned no valid game choices');
  }

  return gameChoices.map(line => parseGameChoice(line as string));
}
