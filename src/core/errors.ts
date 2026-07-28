export interface InsufficientBalanceDetails {
  currentBalance: number;
  requiredAmount: number;
  shortage: number;
  requestedGames: number;
}

export interface AlreadyPurchasedDetails {
  round: number;
  numbers: number[][];
}

export class InsufficientBalanceError extends Error {
  readonly details: InsufficientBalanceDetails;

  constructor(details: Omit<InsufficientBalanceDetails, 'shortage'>) {
    const shortage = Math.max(0, details.requiredAmount - details.currentBalance);
    const fullDetails = { ...details, shortage };

    super(`예치금이 부족합니다. 현재 예치금: ${formatWon(fullDetails.currentBalance)}`);

    this.name = 'InsufficientBalanceError';
    this.details = fullDetails;
  }
}

export class AlreadyPurchasedError extends Error {
  readonly details: AlreadyPurchasedDetails;

  constructor(details: AlreadyPurchasedDetails) {
    super(`제${details.round}회 로또를 이미 구매했습니다.`);
    this.name = 'AlreadyPurchasedError';
    this.details = details;
  }
}

export function isInsufficientBalanceError(error: unknown): error is InsufficientBalanceError {
  return error instanceof InsufficientBalanceError;
}

export function isAlreadyPurchasedError(error: unknown): error is AlreadyPurchasedError {
  return error instanceof AlreadyPurchasedError;
}

export function formatWon(amount: number): string {
  return `${amount.toLocaleString('ko-KR')}원`;
}
