/**
 * 05. AI 추천 번호 예제
 *
 * GitHub Models 또는 Gemini API로 추천 번호 1게임을 받아 수동 구매합니다.
 * 응답이 비어 있거나 형식이 맞지 않으면 FALLBACK_NUMBERS를 사용합니다.
 *
 * GitHub Models 설정:
 * - workflow permissions에 `models: read` 추가
 * - 기본 GITHUB_TOKEN을 사용하므로 별도 API key는 필요 없습니다.
 *
 * Gemini 설정:
 * - GitHub Secrets에 GEMINI_API_KEY 추가
 * - workflow yml에서 env: GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }} 설정
 *
 * 환경변수:
 * - AI_PROVIDER: github 또는 gemini (기본값: github)
 * - GITHUB_MODELS_MODEL: GitHub Models model id (기본값: openai/gpt-4o-mini)
 * - GEMINI_MODEL: Gemini model id (기본값: gemini-2.5-flash)
 *
 * 이 실행이 끝나면 구매 결과는 GitHub Issue 1개로 정리됩니다.
 */
const PROVIDERS = new Set(['github', 'gemini']);
const GITHUB_MODELS_ENDPOINT = 'https://models.github.ai/inference/chat/completions';
const DEFAULT_GITHUB_MODEL = 'openai/gpt-4o-mini';
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const FALLBACK_NUMBERS = [3, 7, 12, 23, 31, 42];
const PROMPT =
  '로또 6/45 번호 1게임을 추천해 주세요. 1부터 45 사이 숫자 6개를 중복 없이 골라서 쉼표로만 답변해 주세요. 예: 3, 7, 12, 23, 31, 42';

export default async ({ purchaseManual }) => {
  console.log('=== 05-ai-recommendation 시작 ===');

  const provider = normalizeProvider(process.env.AI_PROVIDER);
  console.log(`AI_PROVIDER=${provider}`);

  let numbers = FALLBACK_NUMBERS;

  try {
    const recommended = await requestAiNumbers(provider);
    if (recommended) {
      numbers = recommended;
      console.log('AI 추천 번호를 사용합니다:', numbers);
    } else {
      console.log('AI 응답을 해석하지 못해 기본 번호를 사용합니다:', numbers);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`AI 추천 호출에 실패해 기본 번호를 사용합니다: ${message}`);
  }

  const purchased = await purchaseManual([numbers]);
  console.log('구매 완료:', purchased);
};

export function normalizeProvider(value) {
  const provider = (value || 'github').trim().toLowerCase();
  const normalized = provider === 'github-models' || provider === 'copilot' ? 'github' : provider;

  if (!PROVIDERS.has(normalized)) {
    throw new Error('AI_PROVIDER는 github 또는 gemini만 사용할 수 있습니다.');
  }

  return normalized;
}

async function requestAiNumbers(provider) {
  const text = provider === 'gemini' ? await requestGeminiText() : await requestGitHubModelsText();
  console.log('AI 응답:', text);
  return parseRecommendedNumbers(text);
}

async function requestGitHubModelsText() {
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
          content: PROMPT
        }
      ],
      temperature: 1,
      max_tokens: 80
    })
  });

  if (!response.ok) {
    throw new Error(`GitHub Models API 요청 실패 (${response.status})`);
  }

  return extractGitHubModelsText(await response.json());
}

async function requestGeminiText() {
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
          parts: [{ text: PROMPT }]
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini API 요청 실패 (${response.status})`);
  }

  return extractGeminiText(await response.json());
}

export function extractGitHubModelsText(data) {
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

export function parseRecommendedNumbers(text) {
  const numbers = text
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
