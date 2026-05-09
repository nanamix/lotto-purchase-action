/**
 * 05. AI 추천 번호 예제
 *
 * GitHub Models, OpenAI API, Gemini API로 추천 번호 1~5게임을 받아 수동 구매합니다.
 * 응답이 비어 있거나 형식이 맞지 않으면 FALLBACK_GAMES를 사용합니다.
 *
 * GitHub Models 설정:
 * - workflow permissions에 `models: read` 추가
 * - 기본 GITHUB_TOKEN을 사용하므로 별도 API key는 필요 없습니다.
 *
 * Gemini 설정:
 * - GitHub Secrets에 GEMINI_API_KEY 추가
 * - workflow yml에서 env: GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }} 설정
 *
 * OpenAI 설정:
 * - GitHub Secrets에 OPENAI_API_KEY 추가
 * - workflow yml에서 env: OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }} 설정
 *
 * 환경변수:
 * - AI_PROVIDER: github, openai, gemini (기본값: github)
 * - AI_GAME_COUNT: 구매 게임 수, 1~5 (기본값: 1)
 * - GITHUB_MODELS_MODEL: GitHub Models model id (기본값: openai/gpt-5)
 * - OPENAI_MODEL: OpenAI model id (기본값: gpt-5)
 * - GEMINI_MODEL: Gemini model id (기본값: gemini-2.5-flash)
 *
 * 이 실행이 끝나면 구매 결과는 GitHub Issue 1개로 정리됩니다.
 */
const PROVIDERS = new Set(['github', 'openai', 'gemini']);
const GITHUB_MODELS_ENDPOINT = 'https://models.github.ai/inference/chat/completions';
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_GITHUB_MODEL = 'openai/gpt-5';
const DEFAULT_OPENAI_MODEL = 'gpt-5';
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const FALLBACK_GAMES = [
  [3, 7, 12, 23, 31, 42],
  [4, 9, 16, 22, 33, 41],
  [5, 10, 17, 24, 35, 44],
  [6, 11, 18, 25, 32, 43],
  [8, 13, 20, 27, 34, 45]
];

export default async ({ purchaseManual }) => {
  console.log('=== 05-ai-recommendation 시작 ===');

  const provider = normalizeProvider(process.env.AI_PROVIDER);
  const gameCount = parseGameCount(process.env.AI_GAME_COUNT);
  console.log(`AI_PROVIDER=${provider}`);
  console.log(`AI_GAME_COUNT=${gameCount}`);

  let games = getFallbackGames(gameCount);

  try {
    const recommended = await requestAiGames(provider, gameCount);
    if (recommended) {
      games = recommended;
      console.log('AI 추천 번호를 사용합니다:', games);
    } else {
      console.log('AI 응답을 해석하지 못해 기본 번호를 사용합니다:', games);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`AI 추천 호출에 실패해 기본 번호를 사용합니다: ${message}`);
  }

  const purchased = await purchaseManual(games);
  console.log('구매 완료:', purchased);
};

export function normalizeProvider(value) {
  const provider = (value || 'github').trim().toLowerCase();
  const normalized = provider === 'github-models' || provider === 'copilot' ? 'github' : provider;

  if (!PROVIDERS.has(normalized)) {
    throw new Error('AI_PROVIDER는 github, openai, gemini만 사용할 수 있습니다.');
  }

  return normalized;
}

export function parseGameCount(value) {
  const parsed = Number.parseInt(value || '1', 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
    return 1;
  }

  return Math.max(1, Math.min(5, parsed));
}

function getPrompt(gameCount) {
  return (
    `로또 6/45 번호 ${gameCount}게임을 추천해 주세요. ` +
    '각 게임은 1부터 45 사이 숫자 6개를 중복 없이 골라 주세요. ' +
    '다른 설명 없이 한 줄에 한 게임씩 쉼표로만 답변해 주세요. 예:\n' +
    '3, 7, 12, 23, 31, 42\n' +
    '4, 9, 16, 22, 33, 41'
  );
}

async function requestAiGames(provider, gameCount) {
  const providers = getProviderSequence(provider);
  let lastError = null;

  for (const currentProvider of providers) {
    try {
      const text = await requestProviderText(currentProvider, gameCount);
      console.log('AI 응답:', text);
      return parseRecommendedGames(text, gameCount);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      console.log(`${currentProvider} 추천 호출 실패: ${message}`);
    }
  }

  throw lastError ?? new Error('AI 추천 호출에 실패했습니다.');
}

async function requestProviderText(provider, gameCount) {
  if (provider === 'gemini') {
    return requestGeminiText(gameCount);
  }

  if (provider === 'openai') {
    return requestOpenAiText(gameCount);
  }

  return requestGitHubModelsText(gameCount);
}

async function requestGitHubModelsText(gameCount) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN이 없습니다. workflow에서 github-token 또는 env.GITHUB_TOKEN을 연결해 주세요.');
  }

  const response = await fetch(GITHUB_MODELS_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.GITHUB_MODELS_MODEL || DEFAULT_GITHUB_MODEL,
      messages: [
        {
          role: 'user',
          content: getPrompt(gameCount)
        }
      ],
      temperature: 1,
      max_tokens: 160
    })
  });

  if (!response.ok) {
    throw new Error(await buildHttpErrorMessage('GitHub Models API', response));
  }

  return extractGitHubModelsText(await response.json());
}

async function requestOpenAiText(gameCount) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY가 없습니다. workflow env에 secrets.OPENAI_API_KEY를 연결해 주세요.');
  }

  const response = await fetch(OPENAI_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
      messages: [
        {
          role: 'user',
          content: getPrompt(gameCount)
        }
      ],
      temperature: 1,
      max_tokens: 160
    })
  });

  if (!response.ok) {
    throw new Error(await buildHttpErrorMessage('OpenAI API', response));
  }

  return extractOpenAiText(await response.json());
}

async function requestGeminiText(gameCount) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY가 없습니다. workflow env에 secrets.GEMINI_API_KEY를 연결해 주세요.');
  }

  const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: getPrompt(gameCount) }]
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(await buildHttpErrorMessage('Gemini API', response));
  }

  return extractGeminiText(await response.json());
}

export function getProviderSequence(provider, env = process.env) {
  if (provider === 'github' && env.GEMINI_API_KEY) {
    return ['github', 'gemini'];
  }

  return [provider];
}

export async function buildHttpErrorMessage(apiName, response) {
  const body = await response
    .text()
    .then(text => text.replace(/\s+/g, ' ').trim())
    .catch(() => '');
  const detail = body ? `: ${body.slice(0, 500)}` : '';

  return `${apiName} 요청 실패 (${response.status})${detail}`;
}

export function extractGitHubModelsText(data) {
  return data?.choices?.[0]?.message?.content ?? '';
}

export function extractOpenAiText(data) {
  return data?.choices?.[0]?.message?.content ?? '';
}

export function extractGeminiText(data) {
  return (
    data?.candidates
      ?.flatMap(candidate => candidate.content?.parts ?? [])
      .map(part => part.text ?? '')
      .filter(Boolean)
      .join('\n') ?? ''
  );
}

export function parseRecommendedGames(text, gameCount) {
  const games = text
    .split(/\r?\n/)
    .map(line => parseRecommendedNumbers(line))
    .filter(Boolean);

  if (games.length < gameCount) {
    return null;
  }

  const selectedGames = games.slice(0, gameCount);
  const uniqueGameKeys = new Set(selectedGames.map(nums => nums.join(',')));
  if (uniqueGameKeys.size !== selectedGames.length) {
    return null;
  }

  return selectedGames;
}

export function parseRecommendedNumbers(text) {
  const normalizedText = text.replace(/^\s*\d+[\).:-]\s*/, '');
  const numbers = normalizedText
    .match(/\d+/g)
    ?.map(Number)
    .filter(num => Number.isInteger(num) && num >= 1 && num <= 45);

  if (!numbers) {
    return null;
  }

  const uniqueNumbers = [...new Set(numbers)].slice(0, 6).sort((a, b) => a - b);

  if (uniqueNumbers.length !== 6) {
    return null;
  }

  return uniqueNumbers;
}

function getFallbackGames(gameCount) {
  return FALLBACK_GAMES.slice(0, gameCount);
}
