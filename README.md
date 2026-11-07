# TEXT HiP — 읽는 게 힙해지는 서비스

지금 내 상황을 적으면 → 고전·문학 속에서 어울리는 **유명한 구절을 몇 개 제안**하고 → 하나를 고르면 **그래피티 스타일 텍스트 카드(이미지)** 를 만들어 공유할 수 있는 웹앱.

- 빌드 없는 순수 정적 사이트 (HTML + CSS + ES Modules) → GitHub Pages 에 그대로 배포
- 서버 없음: AI 호출은 브라우저에서 각 AI 회사 API 로 직접, 이미지는 Canvas 로 브라우저에서 렌더링
- API 키는 사용자 브라우저(localStorage / sessionStorage)에만 저장

## 사용 흐름

1. **상황 입력** — 무슨 일이 있었는지, 기분이 어떤지
2. **범위·분위기 선택** — 한국 고전 / 근현대 문학 / 세계 고전 / 동양 고전 / 철학 / 명시 / 동화·청소년, 특정 책·작가 지정 가능
3. **구절 제안** — 원문 구절, 카드용 짧은 문구, 출처, 책 속 장면, 내 상황과 연결되는 이유
4. **카드 생성** — 6가지 스타일(스프레이 월·네온·스티커·콘크리트 태그·찢긴 포스터·이모티콘), 8가지 한글 글꼴, 색 조합, 크기(정사각/스토리/가로/이모티콘 360 투명 배경)
5. **공유** — PNG 저장, 모바일 공유 시트, 이미지 복사, **공유 링크**(카드 정보를 URL 해시에 담아 서버 없이 같은 카드 재현), 내 갤러리 저장

## AI 연결 (⚙ 설정)

| 제공자 | 키 | 모델 목록 실시간 조회 |
|---|---|---|
| OpenAI | `sk-...` | `GET /v1/models` (텍스트 모델만 필터) |
| Anthropic (Claude) | `sk-ant-...` | `GET /v1/models` (`anthropic-dangerous-direct-browser-access` 헤더 사용) |
| Google Gemini | `AIza...` | `GET /v1beta/models` (`generateContent` 지원 모델만) |
| OpenRouter | `sk-or-...` | `GET /api/v1/models` |
| Ollama (로컬) | 불필요 | `GET /api/tags` |
| OpenAI 호환 | 선택 | `GET {baseUrl}/models` (LM Studio, vLLM, Groq 등) |

키를 넣지 않아도 **데모 모드**(내장된 명문장 13개)로 흐름을 체험할 수 있습니다.
처음 접속하면 예시 상황 10개(`js/examples.js`) 중 하나가 랜덤으로 채워지고, 그 예시로 만든 추천 구절·카드·갤러리가 미리 보입니다.

### 응답 속도
- 구절 4개를 한 번에 생성하지 않고 **1개씩 병렬 요청** → 먼저 도착한 카드부터 바로 표시 (Ollama 는 로컬 동시 처리가 느려서 한 번에 요청)
- 추론 모델은 생각 시간을 최소화: OpenAI `reasoning_effort: minimal→low`, Gemini `thinkingBudget: 0`(pro 는 128), Ollama `think: false`. 지원하지 않는 모델이면 자동으로 옵션을 빼고 재시도
- 그래도 느리면 `gpt-4o-mini`, `gemini-2.5-flash`, `claude-haiku` 같은 경량 모델을 추천

### Ollama 를 GitHub Pages 에서 쓰려면

브라우저가 `https://<id>.github.io` 에서 `http://localhost:11434` 로 요청하므로 CORS 허용이 필요합니다.

```bash
# macOS / Linux
OLLAMA_ORIGINS="https://<깃허브아이디>.github.io" ollama serve
# 또는 모두 허용
OLLAMA_ORIGINS="*" ollama serve
```

- Chrome / Edge 권장 (localhost 는 https 페이지에서 호출 허용). "로컬 네트워크 접근" 권한 요청이 뜨면 허용하세요.
- Safari 는 https → http 요청을 막을 수 있습니다.
- macOS 앱으로 실행 중이면 `launchctl setenv OLLAMA_ORIGINS "*"` 후 Ollama 재시작.

## 로컬 실행

ES Module 을 쓰므로 `file://` 로 열면 안 되고 간단한 서버가 필요합니다.

```bash
python3 -m http.server 8080
# http://localhost:8080
```

## GitHub Pages 배포

1. 이 폴더를 GitHub 저장소로 push (`main` 브랜치)
2. 저장소 **Settings → Pages → Build and deployment → Source: GitHub Actions**
3. push 할 때마다 `.github/workflows/deploy.yml` 이 자동 배포 → `https://<id>.github.io/<repo>/`

(Actions 를 쓰기 싫다면 Source 를 "Deploy from a branch → main / root" 로 해도 그대로 동작합니다.)

## 구조

```
index.html          화면 (입력 → 제안 → 카드 → 갤러리, 설정 다이얼로그)
css/style.css       그런지·네온 UI
js/app.js           화면 로직, 공유/링크/갤러리, 설정 다이얼로그
js/providers.js     AI 제공자 어댑터 (모델 목록 조회 + 채팅 호출)
js/quotes.js        구절 추천 프롬프트(병렬)·카드 문구 리믹스·데모 데이터
js/examples.js      첫 화면 예시 상황 10개
js/renderer.js      Canvas 그래피티 렌더러 (시드 기반 → 같은 링크는 같은 그림)
js/storage.js       설정·갤러리 저장
```

## 주의

- AI 가 제안하는 구절은 번역본마다 표현이 다르거나 틀릴 수 있습니다. 모델이 확신하지 못하면 "의역·확인 권장" 배지가 붙습니다.
- 정적 사이트 특성상 키가 브라우저에서 AI 로 직접 전송됩니다. 공용 PC 에서는 "키 기억하기"를 끄고, 사용 한도를 걸어둔 키를 쓰세요.
