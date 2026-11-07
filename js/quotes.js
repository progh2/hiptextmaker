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

const SYSTEM = `너는 문학 큐레이터이자 스트리트 카피라이터다.
사용자가 자기 상황을 말하면, 지정된 범위의 "실제로 존재하는 책"에서 그 상황에 어울리는 유명하고 그럴싸한 구절을 골라 제안한다.

규칙:
1. 실존하는 책, 널리 알려진 구절만 고른다. 책·작가·구절을 지어내지 마라.
2. quote 는 한국어 번역서에서 통용되는 표현으로 원문 그대로 적는다. 정확한 문장이 기억나지 않으면 의미를 살려 적고 "paraphrase": true, "confidence": "medium" 으로 표시한다.
3. card_text 는 그래피티 카드에 크게 쓸 짧고 힙한 문구다. 원문의 핵심을 살려 6~24자, 1~3줄, 줄바꿈은 \\n 으로 표시. 원문 그대로가 짧고 강렬하면 그대로 써도 좋다. 이모지·따옴표 금지.
4. scene 은 그 구절이 나오는 책 속 장면을 한 줄로, why 는 사용자 상황과 이 구절이 왜 통하는지 1~2문장으로 쓴다.
5. mood 는 fire, calm, sad, joy, love, resolve, chill, rebel 중 하나.
6. palette 는 이 구절의 감정을 표현하는 그래피티용 형광/비비드 색 3개(#RRGGBB).
7. 서로 다른 책에서 고르는 것을 우선한다.

반드시 아래 형식의 JSON 만 출력한다. 다른 말은 쓰지 않는다.
{"quotes":[{"quote":"","card_text":"","book":"","author":"","scene":"","why":"","mood":"","palette":["#","#","#"],"confidence":"high","paraphrase":false}]}`;

export async function suggestQuotes(cfg, { situation, scopes, tone, book, count = 4, exclude = [] }) {
  const scopeText = scopes.length
    ? scopes
        .map((id) => SCOPES.find((s) => s.id === id))
        .filter(Boolean)
        .map((s) => `- ${s.label} (예: ${s.hint})`)
        .join('\n')
    : '- 장르 제한 없음 (고전 위주)';

  const user = [
    `[내 상황]\n${situation}`,
    `[찾을 범위]\n${scopeText}`,
    book ? `[꼭 이 책/작가 안에서 찾기]\n${book}` : '',
    tone ? `[원하는 분위기] ${tone}` : '',
    exclude.length ? `[이미 제안한 구절 — 겹치지 않게]\n${exclude.map((q) => `- ${q}`).join('\n')}` : '',
    `구절 ${count}개를 제안해줘.`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const raw = await chat(cfg, SYSTEM, user, { json: true });
  const data = extractJSON(raw);
  const list = Array.isArray(data) ? data : data.quotes || data.items || [];
  const out = list.map(normalize).filter(Boolean);
  if (!out.length) throw new Error('추천 구절을 받지 못했어요. 상황을 조금 더 구체적으로 적거나 다른 모델을 써보세요.');
  return out;
}

const HEX = /^#[0-9a-f]{6}$/i;

function normalize(q) {
  if (!q || typeof q !== 'object') return null;
  const quote = String(q.quote || q.text || '').trim();
  let card = String(q.card_text || q.cardText || '').replace(/\\n/g, '\n').trim();
  if (!quote && !card) return null;
  if (!card) card = quote;
  card = card.replace(/^["'“‘「『]+|["'”’」』]+$/g, '');
  const palette = Array.isArray(q.palette) ? q.palette.filter((c) => HEX.test(String(c).trim())) : [];
  return {
    quote: quote || card,
    card_text: card,
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
    card_text: d.card_text,
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
