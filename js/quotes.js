// 상황 → 책 속 구절 추천 (LLM 프롬프트 + 응답 정규화 + 키 없을 때 쓰는 데모 데이터)
import { chat, extractJSON } from './providers.js';

export const SCOPES = [
  { id: 'kr-classic', label: '한국 고전', hint: '춘향전, 구운몽, 홍길동전, 시조, 고려가요, 열하일기' },
  { id: 'kr-modern', label: '한국 근현대 문학', hint: '윤동주, 김소월, 이상, 백석, 한용운, 박경리, 현진건' },
  { id: 'world-classic', label: '세계 고전 소설', hint: '셰익스피어, 톨스토이, 도스토옙스키, 헤세, 헤밍웨이, 피츠제럴드, 카뮈' },
  { id: 'east-philo', label: '동양 고전', hint: '논어, 맹자, 장자, 도덕경, 채근담, 손자병법' },
  { id: 'west-philo', label: '서양 철학·에세이', hint: '니체, 몽테뉴, 마르쿠스 아우렐리우스 명상록, 세네카, 파스칼' },
  { id: 'poetry', label: '명시', hint: '국내외 널리 알려진 시' },
  { id: 'youth', label: '동화·청소년', hint: '어린 왕자, 빨강 머리 앤, 이상한 나라의 앨리스, 갈매기의 꿈, 연금술사' },
];

export const TONES = ['위로', '응원', '결의', '쿨함', '유머', '설렘', '반항'];

export const MOODS = ['fire', 'calm', 'sad', 'joy', 'love', 'resolve', 'chill', 'rebel'];

// 카드 문구 작법 — 요약이 아니라 "랩 가사 한 마디"가 나오도록 힙합 작법과 좋은/나쁜 예를 같이 준다
const CARD_COPY_GUIDE = `[카드 문구 = 랩 가사 한 마디 — 제일 중요]
카드 문구는 구절의 요약이 아니다. 원문을 "샘플링"해서 한국 힙합 가사처럼 다시 쓴 한 마디다.
먼저 hook_word(원문에서 샘플링할 가장 센 단어)와 rhyme(이번에 맞출 각운 소리, 예: "-해", "-ㅏ", "-ing")를 정하고 그걸로 쓴다.

힙합 작법 — 매 문구마다 최소 2개를 섞는다:
- 라임(각운): 줄 끝 소리를 맞춘다. 예) 오답/새 답, 엔딩/오프닝, 하늘/오늘, 거세/절대
- 펀치라인: 이중 의미·말장난·반전으로 한 방. 예) "상어가 뜯어간 건\n고기지 내가 아냐"
- 훅: 짧은 말 반복으로 떼창 되게. 예) "날자 날자\n한 번만 더 날자"
- 대구: 같은 틀에 단어만 바꿔 대비. 예) "오늘은 엔딩\n내일은 오프닝"
- 언더독 서사: 바닥 → 정상, 결핍 → 플렉스. 예) "바닥은\n이륙장"
- 스웩: 근거 있는 자신감, 단언. 예) "깨져도 돼\n내가 판을 깨"
- 네임드롭: 책 속 인물·장소를 랩처럼 소환. 예) "산티아고처럼\n끝까지 노 저어"
- 콜앤리스폰스: 질문 → 대답. 예) "졌냐고?\n아직 경기 중"
- 영어 한두 단어(OK, NO, still, yeah, level up 등)는 양념으로만. 주인공은 한국어.

금지:
- 요약·설명·교훈·훈계, 공익광고 말투 ("~하자", "~해야 해", "힘내세요", "포기하지 마").
- 비속어·욕설·초성 욕(ㅅㅂ 등)·혐오·비하 표현, "존나/졸라/개-" 같은 강조어, 폭력·약물·성적 표현. 힙합 느낌은 욕이 아니라 리듬과 태도로 낸다.
- 이모지·따옴표·마침표.
형식: 2~3줄(줄바꿈 \\n), 줄당 2~9자, 전체 4~20자. 마지막 줄이 펀치.

예시)
원문: 인간은 파멸당할 수는 있어도 패배하지는 않아. (노인과 바다) / 상황: 시험 망함
  hook_word: 패배 / rhyme: -ㅐ
  ✗ 요약: "포기하지 말고\n끝까지 버티자"
  ✓ cut: "파멸은 OK\n패배는 NO"
  ✓ punch: "상어가 뜯어간 건\n고기지 내가 아냐"
  ✓ rhyme: "바다는 거세\n난 안 꺾여 절대"
  ✓ hook: "아직 안 졌어\nyeah 아직 안 졌어"
원문: 새는 알에서 나오려고 투쟁한다. 알은 세계이다. (데미안) / 상황: 퇴사하고 도전
  hook_word: 알 / rhyme: -해
  ✗ 요약: "변화를\n두려워하지 마"
  ✓ cut: "알은 세계다\n깨라"
  ✓ punch: "껍질 깨는 소리\n그게 내 비트"
  ✓ rhyme: "알 속은 안전해\n근데 난 답답해"
  ✓ hook: "깨 깨 깨\n내 세계 깨"
원문: 내일은 아직 아무 실수도 하지 않은 새로운 날이에요. (빨강 머리 앤) / 상황: 발표 망침
  hook_word: 내일 / rhyme: -답
  ✗ 요약: "내일은\n새로운 날이야"
  ✓ cut: "실수 0개\n내일 입고"
  ✓ punch: "오늘은 망함\n내일은 새거"
  ✓ rhyme: "오늘은 오답\n내일은 새 답"
  ✓ hook: "리셋 리셋\n내일은 클린 시트"`;

const SYSTEM = `너는 문학 큐레이터이자 한국 힙합 작사가다.
사용자가 자기 상황을 말하면, 지정된 범위의 "실제로 존재하는 책"에서 그 상황에 어울리는 유명하고 그럴싸한 구절을 골라 제안하고,
그 구절을 샘플링해서 그래피티 카드에 쓸 랩 가사 한 마디로 다시 쓴다.

규칙:
1. 실존하는 책, 널리 알려진 구절만 고른다. 책·작가·구절을 지어내지 마라.
2. quote 는 한국어 번역서에서 통용되는 표현으로 원문 그대로 적는다. 정확한 문장이 기억나지 않으면 의미를 살려 적고 "paraphrase": true, "confidence": "medium" 으로 표시한다.
3. hook_word, rhyme 을 먼저 정한 뒤 variants 4개를 쓴다: cut(원문을 잘라 리듬만 살린 샘플), punch(펀치라인), rhyme(각운 맞춘 두 마디), hook(반복 후렴). card_text 는 넷 중 가장 힙한 것 (보통 punch 나 rhyme).
4. scene 은 그 구절이 나오는 책 속 장면을 한 줄로, why 는 사용자 상황과 이 구절이 왜 통하는지 1~2문장으로 쓴다 (설명은 여기서만).
5. mood 는 fire, calm, sad, joy, love, resolve, chill, rebel 중 하나.
6. palette 는 이 구절의 감정을 표현하는 그래피티용 형광/비비드 색 3개(#RRGGBB).
7. 서로 다른 책에서 고르는 것을 우선한다.

${CARD_COPY_GUIDE}

반드시 아래 형식의 JSON 만 출력한다. 다른 말은 쓰지 않는다.
{"quotes":[{"quote":"","book":"","author":"","scene":"","why":"","hook_word":"","rhyme":"","variants":{"cut":"","punch":"","rhyme":"","hook":""},"card_text":"","mood":"","palette":["#","#","#"],"confidence":"high","paraphrase":false}]}`;

// 병렬 요청마다 다른 "각도"를 줘서 같은 구절이 겹치지 않게 한다
const ANGLES = [
  '이 상황에 가장 정석적으로 떠오르는 대표 구절',
  '의외지만 읽고 나면 무릎을 치는 반전 구절',
  '짧고 강렬해서 그대로 벽에 써도 되는 한 줄',
  '감정을 건드리는 서정적인 구절',
  '철학적으로 한 발 물러서서 보게 하는 구절',
  '유머와 위트가 있는 구절',
];

function scopeLines(ids) {
  return ids.length
    ? ids
        .map((id) => SCOPES.find((s) => s.id === id))
        .filter(Boolean)
        .map((s) => `- ${s.label} (예: ${s.hint})`)
        .join('\n')
    : '- 장르 제한 없음 (고전 위주)';
}

async function requestQuotes(cfg, { situation, scopes, tone, book, count, exclude, angle }) {
  const user = [
    `[내 상황]\n${situation}`,
    `[찾을 범위]\n${scopeLines(scopes)}`,
    book ? `[꼭 이 책/작가 안에서 찾기]\n${book}` : '',
    tone ? `[원하는 분위기] ${tone}` : '',
    angle ? `[이번에 찾을 구절의 결] ${angle}` : '',
    exclude.length ? `[이미 제안한 구절 — 겹치지 않게]\n${exclude.map((q) => `- ${q}`).join('\n')}` : '',
    `구절 ${count}개를 제안해줘. why 는 한 문장으로 짧게.`,
  ]
    .filter(Boolean)
    .join('\n\n');
  const data = extractJSON(await chat(cfg, SYSTEM, user, { json: true }));
  const list = Array.isArray(data) ? data : data.quotes || data.items || [data];
  return list.map(normalize).filter(Boolean);
}

/**
 * 구절 추천. 클라우드 모델은 1개씩 병렬로 요청해서 먼저 도착한 것부터 onItem 으로 바로 보여준다
 * (4개를 한 번에 생성하는 것보다 첫 카드가 훨씬 빨리 뜬다). 로컬 Ollama 는 동시 처리가 느려서 한 번에 요청.
 */
export async function suggestQuotes(cfg, { situation, scopes, tone, book, count = 4, exclude = [] }, { onItem } = {}) {
  const seen = new Set(exclude);
  const out = [];
  const accept = (items) => {
    for (const q of items) {
      const key = `${q.book}|${q.quote}`;
      if (seen.has(q.quote) || seen.has(key)) continue;
      seen.add(q.quote);
      seen.add(key);
      out.push(q);
      onItem?.(q);
    }
  };

  if (cfg.kind === 'ollama') {
    accept(await requestQuotes(cfg, { situation, scopes, tone, book, count, exclude }));
  } else {
    const offset = Math.floor(Math.random() * ANGLES.length);
    const jobs = Array.from({ length: count }, (_, i) => {
      // 범위를 여러 개 골랐으면 요청마다 하나씩 나눠 맡겨서 다양성 확보
      const myScopes = scopes.length > 1 ? [scopes[i % scopes.length]] : scopes;
      return requestQuotes(cfg, {
        situation, scopes: myScopes, tone, book, count: 1, exclude,
        angle: ANGLES[(offset + i) % ANGLES.length],
      }).then((items) => accept(items.slice(0, 1)));
    });
    const results = await Promise.allSettled(jobs);
    if (!out.length) {
      const err = results.find((r) => r.status === 'rejected');
      if (err) throw err.reason;
    }
  }
  if (!out.length) throw new Error('추천 구절을 받지 못했어요. 상황을 조금 더 구체적으로 적거나 다른 모델을 써보세요.');
  return out;
}

const HEX = /^#[0-9a-f]{6}$/i;

export const VARIANT_LABEL = {
  pick: '추천', cut: '원문컷', punch: '펀치라인', rhyme: '라임', hook: '훅',
  street: '스트릿', meme: '밈', remix: '리믹스',
};

// 프롬프트로 막아도 모델이 가끔 흘리는 비속어를 한 번 더 거른다
const PROFANITY = /(씨발|시발|씨바|씨빨|ㅅㅂ|ㅆㅂ|병신|ㅂㅅ|좆|존나|졸라|ㅈㄴ|개새|새끼|ㅅㄲ|썅|지랄|ㅈㄹ|닥쳐|꺼져|엿\s*먹|염병|느금|미친\s*(놈|년|새)|개(?:쩔|좋|빡|웃|멋|꿀|노답|잘|짱|못|지랄)|fuck|shit|bitch|asshole|damn)/i;
export const isClean = (text) => !PROFANITY.test(String(text || '').replace(/\s+/g, ''));

function cleanCard(t) {
  return String(t || '')
    .replace(/\\n/g, '\n')
    .replace(/^["'“‘「『]+|["'”’」』]+$/g, '')
    .replace(/[.。]+$/gm, '')
    .trim();
}

function normalizeVariants(v) {
  const entries = Array.isArray(v)
    ? v.map((x) => (typeof x === 'string' ? ['remix', x] : [x?.style || 'remix', x?.text]))
    : Object.entries(v || {});
  const seen = new Set();
  return entries
    .map(([style, text]) => ({ style: VARIANT_LABEL[style] ? style : 'remix', text: cleanCard(text) }))
    .filter((x) => x.text && isClean(x.text) && !seen.has(x.text) && seen.add(x.text));
}

function normalize(q) {
  if (!q || typeof q !== 'object') return null;
  const quote = String(q.quote || q.text || '').trim();
  const variants = normalizeVariants(q.variants);
  let card = cleanCard(q.card_text || q.cardText);
  if (!isClean(card)) card = '';
  if (!quote && !card && !variants.length) return null;
  if (!card) card = variants.find((v) => v.style === 'punch')?.text || variants[0]?.text || cleanCard(quote);
  const palette = Array.isArray(q.palette) ? q.palette.filter((c) => HEX.test(String(c).trim())) : [];
  if (!variants.some((v) => v.text === card)) variants.unshift({ style: 'pick', text: card });
  return {
    quote: quote || card,
    card_text: card,
    variants,
    book: String(q.book || '').replace(/[『』《》]/g, '').trim(),
    author: String(q.author || '').trim(),
    scene: String(q.scene || '').trim(),
    why: String(q.why || '').trim(),
    mood: MOODS.includes(q.mood) ? q.mood : 'fire',
    palette: palette.length >= 3 ? palette.slice(0, 3) : null,
    confidence: q.confidence === 'high' ? 'high' : 'medium',
    paraphrase: Boolean(q.paraphrase),
  };
}

// ---------- 카드 문구 리믹스 (에디터의 '더 힙하게' 버튼) ----------
export const GENRES = [
  { id: 'mix', label: '믹스', guide: '아래 장르를 골고루 섞어서 서로 다른 스타일로.' },
  { id: 'boombap', label: '붐뱁', guide: '직설적인 가사, 두 줄 각운을 촘촘하게. 정공법 펀치라인.' },
  { id: 'trap', label: '트랩', guide: '짧은 단어 반복과 끊어치기. 애드립(yeah, uh)은 한 번 정도.' },
  { id: 'emo', label: '감성랩', guide: '고백하듯 서정적으로, 여운 남는 마지막 줄. 라임은 부드럽게.' },
  { id: 'swag', label: '스웩', guide: '근거 있는 자신감과 플렉스. 언더독이 정상 찍는 서사.' },
  { id: 'oldschool', label: '올드스쿨', guide: '구호 같은 훅, 콜앤리스폰스. 떼창 되는 반복.' },
];

const REMIX_SYSTEM = `너는 한국 힙합 작사가다. 책 속 구절을 샘플링해서 그래피티 카드용 랩 가사 한 마디로 다시 쓴다.

${CARD_COPY_GUIDE}

반드시 JSON 만 출력: {"hook_word":"","rhyme":"","variants":[{"style":"punch|rhyme|hook|cut","text":""}]}`;

export async function remixCardText(cfg, { quote, source, situation, current, genre = 'mix', count = 6 }) {
  const g = GENRES.find((x) => x.id === genre) || GENRES[0];
  const user = [
    `[원문] ${quote}${source ? ` — ${source}` : ''}`,
    situation ? `[사용자 상황] ${situation}` : '',
    current ? `[지금 카드 문구 — 이건 아쉬우니 다른 각도·다른 라임으로]\n${current}` : '',
    `[장르] ${g.label}: ${g.guide}`,
    `서로 다른 작법을 쓴 카드 문구 ${count}개. 요약 금지, 전부 랩 가사처럼. 비속어 금지.`,
  ]
    .filter(Boolean)
    .join('\n\n');
  const data = extractJSON(await chat(cfg, REMIX_SYSTEM, user, { json: true }));
  const out = normalizeVariants(data.variants || data).filter((v) => v.text !== current);
  if (!out.length) throw new Error('새 문구를 받지 못했어요. 다시 시도해보세요.');
  return out;
}

// ---------- 데모 모드 (API 연결 전 체험용) ----------
const DEMO = [
  {
    quote: '새는 알에서 나오려고 투쟁한다. 알은 세계이다. 태어나려는 자는 하나의 세계를 깨뜨려야 한다.',
    card_text: '알을 깨야\n태어난다',
    book: '데미안', author: '헤르만 헤세', mood: 'rebel', scope: 'world-classic',
    scene: '싱클레어가 데미안에게서 받은 쪽지에 적힌 문장.',
    keys: ['변화', '도전', '새로', '시작', '두려', '틀', '졸업', '이직', '진로', '바꾸'],
  },
  {
    quote: '인간은 파멸당할 수는 있어도 패배하지는 않아.',
    card_text: '부서져도\n지진 않아',
    book: '노인과 바다', author: '어니스트 헤밍웨이', mood: 'resolve', scope: 'world-classic',
    scene: '상어 떼에게 청새치를 뜯기면서도 싸우는 노인 산티아고의 독백.',
    keys: ['실패', '망', '떨어', '힘들', '포기', '시험', '패배', '지쳐', '버티'],
  },
  {
    quote: '죽는 날까지 하늘을 우러러 한 점 부끄럼이 없기를',
    card_text: '한 점\n부끄럼 없이',
    book: '하늘과 바람과 별과 시 (서시)', author: '윤동주', mood: 'calm', scope: 'kr-modern',
    scene: '시집의 첫머리에 놓인 서시의 첫 구절.',
    keys: ['양심', '정직', '거짓', '부끄', '다짐', '떳떳', '선택'],
  },
  {
    quote: '가장 중요한 것은 눈에 보이지 않아.',
    card_text: '중요한 건\n안 보여',
    book: '어린 왕자', author: '앙투안 드 생텍쥐페리', mood: 'love', scope: 'youth',
    scene: '여우가 어린 왕자와 헤어지며 알려주는 비밀.',
    keys: ['친구', '사랑', '관계', '외모', '마음', '이별', '소중'],
  },
  {
    quote: '내일은 아직 아무 실수도 하지 않은 새로운 날이에요.',
    card_text: '내일은\n아직 새거야',
    book: '빨강 머리 앤', author: '루시 모드 몽고메리', mood: 'joy', scope: 'youth',
    scene: '실수투성이 하루를 보낸 앤이 마릴라에게 하는 말.',
    keys: ['실수', '후회', '망쳤', '내일', '오늘', '창피', '사고'],
  },
  {
    quote: '사느냐 죽느냐, 그것이 문제로다.',
    card_text: '사느냐\n죽느냐',
    book: '햄릿', author: '윌리엄 셰익스피어', mood: 'rebel', scope: 'world-classic',
    scene: '복수와 망설임 사이에서 흔들리는 햄릿의 독백.',
    keys: ['고민', '결정', '선택', '갈등', '망설', '중요'],
  },
  {
    quote: '배우고 때때로 익히면 또한 기쁘지 아니한가.',
    card_text: '배우고 익히면\n그게 기쁨',
    book: '논어', author: '공자', mood: 'calm', scope: 'east-philo',
    scene: '논어 학이편의 첫 문장.',
    keys: ['공부', '배우', '시험', '학교', '숙제', '연습', '성장'],
  },
  {
    quote: '자세히 보아야 예쁘다. 오래 보아야 사랑스럽다. 너도 그렇다.',
    card_text: '오래 보아야\n사랑스럽다\n너도 그렇다',
    book: '풀꽃', author: '나태주', mood: 'love', scope: 'poetry',
    scene: '짧은 세 줄로 된 시 「풀꽃」 전문.',
    keys: ['자존감', '외모', '비교', '나', '사랑', '인정', '못나'],
  },
  {
    quote: '무언가를 간절히 원할 때 온 우주는 그 소망이 실현되도록 도와준다네.',
    card_text: '간절하면\n우주가 돕는다',
    book: '연금술사', author: '파울로 코엘료', mood: 'fire', scope: 'youth',
    scene: '살렘의 왕이 양치기 산티아고에게 자아의 신화를 이야기하는 장면.',
    keys: ['꿈', '소원', '목표', '간절', '원하', '도전', '합격'],
  },
  {
    quote: '날개야 다시 돋아라. 날자. 날자. 날자. 한 번만 더 날자꾸나.',
    card_text: '날자 날자\n한 번만 더',
    book: '날개', author: '이상', mood: 'fire', scope: 'kr-modern',
    scene: '미쓰코시 옥상에서 주인공이 겨드랑이의 가려움을 느끼며 외치는 마지막 장면.',
    keys: ['다시', '재도전', '무기력', '답답', '탈출', '지겨', '한번'],
  },
  {
    quote: '그래도 내일은 내일의 태양이 뜰 거야.',
    card_text: '내일은\n내일의 태양',
    book: '바람과 함께 사라지다', author: '마거릿 미첼', mood: 'resolve', scope: 'world-classic',
    scene: '모든 것을 잃은 스칼렛이 타라로 돌아가기로 마음먹는 마지막 장면.',
    keys: ['이별', '헤어', '끝', '잃', '슬퍼', '우울', '내일'],
  },
  {
    quote: '나 보기가 역겨워 가실 때에는 말없이 고이 보내 드리우리다.',
    card_text: '말없이\n고이 보내\n드리우리다',
    book: '진달래꽃', author: '김소월', mood: 'sad', scope: 'kr-modern',
    scene: '떠나는 임을 보내는 화자의 체념과 역설이 담긴 첫 연.',
    keys: ['이별', '헤어', '짝사랑', '차였', '연애', '떠나', '보내'],
  },
  {
    quote: '나는 생각한다, 고로 존재한다.',
    card_text: '생각한다\n고로 존재한다',
    book: '방법서설', author: '르네 데카르트', mood: 'chill', scope: 'west-philo',
    scene: '모든 것을 의심한 끝에 남는 단 하나의 확실성.',
    keys: ['의심', '정체성', '나', '존재', '생각', '혼란'],
  },
];

const DEMO_VARIANTS = {
  '데미안': { cut: '알은 세계다\n깨라', punch: '껍질 깨는 소리\n그게 내 비트', rhyme: '알 속은 안전해\n근데 난 답답해', hook: '깨 깨 깨\n내 세계 깨' },
  '노인과 바다': { cut: '파멸은 OK\n패배는 NO', punch: '상어가 뜯어간 건\n고기지 내가 아냐', rhyme: '바다는 거세\n난 안 꺾여 절대', hook: '아직 안 졌어\nyeah 아직 안 졌어' },
  '하늘과 바람과 별과 시 (서시)': { cut: '한 점\n부끄럼 없이', punch: '하늘이 지켜봐도\n난 당당히 live', rhyme: '고개 들어 하늘\n부끄럼 0 오늘', hook: '떳떳 떳떳\n하늘 앞에 당당' },
  '어린 왕자': { cut: '진짜는\n안 보여', punch: '눈에 보이는 건\n다 필터', rhyme: '눈으로는 못 봐\n마음으로 찍어 봐', hook: '안 보여 안 보여\n그래서 소중해' },
  '빨강 머리 앤': { cut: '실수 0개\n내일 입고', punch: '오늘은 망함\n내일은 새거', rhyme: '오늘은 오답\n내일은 새 답', hook: '리셋 리셋\n내일은 클린 시트' },
  '햄릿': { cut: '사느냐\n죽느냐\n그게 문제', punch: '고민은 햄릿처럼\n결정은 나답게', rhyme: '망설임은 비극\n결정은 내 픽', hook: 'to be\nor not to be\n난 그냥 be' },
  '논어': { cut: '배우고 익히면\n기쁘지 아니한가', punch: '복습이\n내 플렉스', rhyme: '배운 건 쌓이고\n익힌 건 빛나고', hook: '익혀 익혀\n레벨업 레벨업' },
  '풀꽃': { cut: '오래 보아야\n사랑스럽다\n너도', punch: '스쳐 보면 엑스트라\n오래 보면 주인공', rhyme: '자세히 보면 반짝\n오래 보면 활짝', hook: '너도 그렇다\n너도 그렇다' },
  '연금술사': { cut: '간절하면\n우주가 돕는다', punch: '내 꿈의 백업은\n온 우주', rhyme: '원하는 건 하나\n우주는 내 편이야', hook: '진심 진심\n우주가 듣는 중' },
  '날개': { cut: '날자 날자\n한 번만 더', punch: '바닥은\n이륙장', rhyme: '구겨진 날개\n다시 펴 날래', hook: '날자 날자\n한 번만 더 날자' },
  '바람과 함께 사라지다': { cut: '내일은\n내일의 태양', punch: '오늘 해는 졌어\n내 해는 안 졌어', rhyme: '오늘은 엔딩\n내일은 오프닝', hook: '해는 또 떠\n내일 또 떠' },
  '진달래꽃': { cut: '말없이\n고이 보내\n드리우리다', punch: '쿨하게 보냄\n꽃길은 깔아둠', rhyme: '떠나는 너의 길\n뿌려둔 꽃잎', hook: '안 울어\n죽어도 안 울어' },
  '방법서설': { cut: '생각한다\n고로 존재한다', punch: '고민 중이면\n살아있다는 증거', rhyme: '난 생각해\n그래서 난 존재해', hook: '생각한다 고로\n나는 나다' },
};

const DEMO_PALETTES = {
  fire: ['#ff2bd6', '#c6ff00', '#00d1ff'],
  calm: ['#5ee7ff', '#b8ff6b', '#a78bfa'],
  sad: ['#7aa2ff', '#ff6ec7', '#e0e7ff'],
  joy: ['#ffe600', '#ff4fa3', '#33e1ff'],
  love: ['#ff3d8b', '#ffd23f', '#ff9ff3'],
  resolve: ['#ff5a1f', '#ffe600', '#00e5a0'],
  chill: ['#00f0ff', '#c084fc', '#d9ff3f'],
  rebel: ['#c6ff00', '#ff2bd6', '#ff7a00'],
};

export function moodPalette(mood) {
  return [...(DEMO_PALETTES[mood] || DEMO_PALETTES.fire)];
}

/** 데모 구절을 책 제목으로 꺼내서 추천 카드 형태로 만든다 (예시 화면용) */
export function demoQuote(book, why) {
  const d = DEMO.find((x) => x.book === book);
  if (!d) return null;
  return {
    quote: d.quote,
    card_text: DEMO_VARIANTS[d.book]?.punch || d.card_text,
    variants: normalizeVariants(DEMO_VARIANTS[d.book] || { cut: d.card_text }),
    book: d.book,
    author: d.author,
    scene: d.scene,
    why: why || '',
    mood: d.mood,
    palette: moodPalette(d.mood),
    confidence: 'high',
    paraphrase: false,
  };
}

export function demoRemix(quote) {
  const d = DEMO.find((x) => x.quote === quote);
  return normalizeVariants(DEMO_VARIANTS[d?.book] || {});
}

export function demoSuggest({ situation, scopes, count = 4, exclude = [] }) {
  const text = situation || '';
  const pool = DEMO.filter((d) => !exclude.includes(d.quote));
  const scored = pool
    .map((d) => {
      let score = d.keys.reduce((acc, k) => acc + (text.includes(k) ? 3 : 0), 0);
      if (scopes.includes(d.scope)) score += 2;
      return { d, score: score + Math.random() };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, count);
  return scored.map(({ d }) => ({
    quote: d.quote,
    card_text: DEMO_VARIANTS[d.book]?.punch || d.card_text,
    variants: normalizeVariants(DEMO_VARIANTS[d.book] || { cut: d.card_text }),
    book: d.book,
    author: d.author,
    scene: d.scene,
    why: '데모 모드 추천이에요. 설정에서 AI 를 연결하면 내 상황에 맞춘 해석과 더 다양한 구절을 받을 수 있어요.',
    mood: d.mood,
    palette: moodPalette(d.mood),
    confidence: 'high',
    paraphrase: false,
  }));
}
