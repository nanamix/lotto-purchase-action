# 동행복권 로또 자동구매

실제 동행복권 계정으로 로또 6/45를 구매하는 GitHub Action입니다.

기본 설정은 **매주 일요일 12:00 KST에 Copilot/GitHub Models 추천 번호 5게임을 구매**합니다. GitHub Actions 화면에서 즉시 수동 실행도 할 수 있고, 실행할 때 구매 방식과 게임 수를 고를 수 있습니다.

> 주의: 실행에 성공하면 실제 동행복권 예치금으로 구매가 진행됩니다. 예치금을 미리 충전해 두세요.

## 무엇을 할 수 있나

- 자동번호 1~5게임 구매
- 직접 지정한 번호로 수동 구매
- 자동 + 수동 조합 구매
- Copilot/GitHub Models 또는 Gemini 추천 번호 구매
- GitHub Actions 화면에서 즉시 수동 실행
- 구매 결과를 GitHub Issue에 기록
- Issues가 꺼진 저장소에서는 Actions job summary에 기록
- 텔레그램 구매/당첨 알림

## 빠른 시작

### 1. 저장소 준비

가장 간단한 방법은 이 저장소를 Fork하는 것입니다.

1. 이 저장소를 Fork합니다.
2. Fork한 저장소의 **Actions** 탭에서 workflow를 활성화합니다.
3. 아래 Secrets를 등록합니다.
4. **Actions -> 로또 구매 (수동 + 스케줄) -> Run workflow**로 테스트 실행합니다.

구매 이력을 비공개로 유지하려면 Private 저장소로 복사해서 사용하세요.

```bash
git clone https://github.com/kkd927/lotto-purchase-action.git
cd lotto-purchase-action
git remote set-url origin https://github.com/<내-계정>/<내-저장소>.git
git push -u origin main
```

### 2. Secrets 등록

GitHub 저장소에서 **Settings -> Secrets and variables -> Actions -> Repository secrets**로 이동해 등록합니다.

필수:

- `DHLOTTERY_ID`: 동행복권 로그인 아이디
- `DHLOTTERY_PASSWORD`: 동행복권 로그인 비밀번호

선택:

- `GEMINI_API_KEY`: Gemini 추천 번호 구매 또는 GitHub Models 실패 시 Gemini fallback
- `TELEGRAM_BOT_TOKEN`: 텔레그램 알림용 봇 토큰
- `TELEGRAM_CHAT_ID`: 텔레그램 알림용 채팅 ID

`GITHUB_TOKEN`은 GitHub Actions가 자동으로 제공합니다.

## 실행 방법

### 자동 실행

기본 cron은 매주 일요일 UTC 03:00입니다. 한국 시간으로는 **매주 일요일 12:00 KST**입니다.

```yaml
schedule:
  - cron: '0 3 * * 0'
```

자동 실행 기본값:

- 구매 방식: `ai-recommendation`
- AI provider: `copilot`
- GitHub Models 모델: `openai/gpt-5`
- 게임 수: `5`

### 수동 실행

GitHub에서 바로 실행할 수 있습니다.

1. **Actions** 탭으로 이동
2. **로또 구매 (수동 + 스케줄)** 선택
3. **Run workflow** 클릭
4. 아래 값을 선택하고 실행

선택값:

- `purchase-profile`
  - `ai-recommendation`: Copilot/GitHub Models 또는 Gemini 추천 번호 구매
  - `auto-basic`: 자동번호 구매
  - `manual-fixed`: 고정 번호 수동 구매
  - `auto-plus-manual`: 자동 + 수동 조합 구매
  - `gemini-recommendation`: Gemini 추천 번호 구매
- `ai-provider`
  - `copilot`: GitHub Models API 사용
  - `github`: GitHub Models API 사용
  - `gemini`: Gemini API 사용
- `game-count`
  - `1`~`5`

## AI 추천 설정

### Copilot / GitHub Models

기본 AI 추천은 GitHub Models API를 사용합니다. `copilot`, `github`, `github-models`는 모두 GitHub Models 호출로 처리됩니다.

현재 기본 모델:

```yaml
GITHUB_MODELS_MODEL: openai/gpt-5
```

GitHub Models가 저장소에서 사용 가능한지 확인하려면 별도 점검 workflow를 실행하세요.

1. **Actions -> GitHub Models Check -> Run workflow**
2. 각 모델의 `status` 확인
3. `status=200`이면 사용 가능
4. `status=403`이면 repository 또는 organization에서 GitHub Models나 해당 모델이 막힌 상태

다른 모델을 쓰고 싶으면 workflow env에 지정합니다.

```yaml
env:
  GITHUB_TOKEN: ${{ github.token }}
  AI_PROVIDER: copilot
  AI_GAME_COUNT: '5'
  GITHUB_MODELS_MODEL: openai/gpt-5
```

### Gemini

Gemini를 사용하려면 `GEMINI_API_KEY` secret을 등록하고 수동 실행에서 `ai-provider=gemini`를 선택하세요.

직접 env로 지정하는 경우:

```yaml
env:
  AI_PROVIDER: gemini
  AI_GAME_COUNT: '5'
  GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
  GEMINI_MODEL: gemini-2.5-flash
```

`05-ai-recommendation.js`는 `GEMINI_API_KEY`가 있으면 GitHub Models 실패 후 Gemini를 한 번 더 시도합니다. 그래도 실패하거나 응답 파싱이 안 되면 fallback 번호로 구매합니다.

## 구매 전략 예제

기본 workflow는 [lotto-purchase.yml](./.github/workflows/lotto-purchase.yml)에 포함되어 있습니다. 자세한 커스텀 워크플로우 설명은 [custom-workflows/README.md](./custom-workflows/README.md)를 보세요.

- `custom-workflows/01-auto-basic.js`: 자동 5게임 구매
- `custom-workflows/02-manual-fixed-numbers.js`: 고정 번호 수동 구매
- `custom-workflows/03-auto-plus-manual.js`: 자동 + 수동 조합 구매
- `custom-workflows/04-gemini-recommendation.js`: Gemini 추천 번호 구매
- `custom-workflows/05-ai-recommendation.js`: Copilot/GitHub Models 또는 Gemini 추천 번호 1~5게임 구매

커스텀 워크플로우는 체크아웃된 워크스페이스 내부의 `.js`, `.mjs`, `.cjs` 파일만 사용할 수 있습니다.

간단한 커스텀 예:

```javascript
export default async ({ purchaseAuto, purchaseManual }) => {
  await purchaseAuto(3);
  await purchaseManual([
    [3, 11, 19, 25, 33, 42],
    [7, 14, 21, 28, 35, 40]
  ]);
};
```

## 결과 기록

구매에 성공하면 구매 번호, 회차, QR 확인 링크가 기록됩니다.

- Issues가 켜져 있으면 GitHub Issue 생성
- Issues가 꺼져 있으면 GitHub Actions job summary에 기록
- 텔레그램 설정이 있으면 구매/당첨 알림 전송

추첨 후 기존 waiting Issue를 확인해 당첨 여부를 업데이트합니다. Issues가 꺼진 저장소에서는 이전 구매 Issue 조회를 건너뜁니다.

## 보안

동행복권 아이디와 비밀번호는 GitHub Actions Secrets에 저장하세요.

- Secrets는 암호화되어 저장됩니다.
- 등록된 값은 다시 볼 수 없습니다.
- workflow 로그에서는 자동 마스킹됩니다.
- 이 Action에서도 주요 token과 계정값을 명시적으로 마스킹합니다.

자세한 보안 정책은 [SECURITY.md](./SECURITY.md)를 참고하세요.

## 링크

- [커스텀 워크플로우 가이드](./custom-workflows/README.md)
- [기여 가이드](./CONTRIBUTING.md)
- [보안 정책](./SECURITY.md)
- [라이선스](./LICENSE)
