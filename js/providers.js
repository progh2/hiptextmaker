// LLM 제공자 어댑터 — 모두 브라우저에서 직접 호출 (GitHub Pages 정적 배포용, 서버 없음)
export const PROVIDERS = {
  openai: {
    label: 'OpenAI',
    kind: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    needsKey: true,
    keyHint: 'sk-...',
    help: 'platform.openai.com → API keys 에서 발급한 키를 넣으세요.',
  },
  anthropic: {
    label: 'Anthropic (Claude)',
    kind: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    needsKey: true,
    keyHint: 'sk-ant-...',
    help: 'console.anthropic.com → API Keys 에서 발급한 키를 넣으세요. 브라우저 직접 호출 헤더를 자동으로 붙입니다.',
  },
  gemini: {
    label: 'Google Gemini',
    kind: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    needsKey: true,
    keyHint: 'AIza...',
    help: 'aistudio.google.com → Get API key 에서 발급한 키를 넣으세요.',
  },
  openrouter: {
    label: 'OpenRouter',
    kind: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    needsKey: true,
    keyHint: 'sk-or-...',
    help: 'openrouter.ai/keys 에서 발급한 키 하나로 여러 회사 모델을 쓸 수 있어요.',
  },
  ollama: {
    label: 'Ollama (내 컴퓨터)',
    kind: 'ollama',
    baseUrl: 'http://localhost:11434',
    needsKey: false,
    keyHint: '',
    help:
      '내 컴퓨터에서 Ollama 를 실행하세요. GitHub Pages 주소에서 호출하려면 CORS 허용이 필요합니다:\n' +
      'OLLAMA_ORIGINS="*" ollama serve\n' +
      '(Chrome 권장 · "로컬 네트워크 접근" 권한을 물으면 허용)',
  },
  custom: {
    label: 'OpenAI 호환 (직접 입력)',
    kind: 'openai',
    baseUrl: '',
    needsKey: false,
    keyHint: '(필요한 경우만)',
    help: 'LM Studio, vLLM, Groq 등 OpenAI 호환 엔드포인트의 Base URL(…/v1)을 입력하세요.',
  },
};

export function resolveConfig(settings) {
  const id = settings.provider;
  const p = PROVIDERS[id] || PROVIDERS.openai;
  return {
    id,
    ...p,
    baseUrl: (settings.baseUrls[id] || p.baseUrl || '').replace(/\/+$/, ''),
    apiKey: (settings.keys[id] || '').trim(),
    model: settings.models[id] || '',
  };
}

export function isReady(cfg) {
  return Boolean(cfg.baseUrl && cfg.model && (!cfg.needsKey || cfg.apiKey));
}

async function request(url, init) {
  let res;
  try {
    res = await fetch(url, init);
  } catch (e) {
    throw new Error(
      `네트워크/CORS 오류로 호출하지 못했어요 (${url}). ` +
        'Ollama 라면 OLLAMA_ORIGINS 설정과 서버 실행 여부를 확인하세요.'
    );
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* not json */
  }
  if (!res.ok) {
    const msg =
      data?.error?.message || data?.error || data?.message || text.slice(0, 300) || res.statusText;
    const err = new Error(`[${res.status}] ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function openaiHeaders(cfg) {
  const h = { 'Content-Type': 'application/json' };
  if (cfg.apiKey) h.Authorization = `Bearer ${cfg.apiKey}`;
  if (cfg.id === 'openrouter') {
    h['HTTP-Referer'] = location.origin;
    h['X-Title'] = 'TEXT HiP';
  }
  return h;
}

function anthropicHeaders(cfg) {
  return {
    'Content-Type': 'application/json',
    'x-api-key': cfg.apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  };
}

// OpenAI /models 응답에는 임베딩·음성·이미지 모델도 섞여 있어 텍스트 생성용만 남김
const OPENAI_NON_CHAT = /(embed|whisper|tts|dall-e|davinci|babbage|moderation|transcribe|audio|realtime|image|search|computer-use|codex-mini|sora)/i;

/** 실시간 모델 목록: [{id, label}] */
export async function listModels(cfg) {
  if (!cfg.baseUrl) throw new Error('Base URL 을 입력하세요.');
  if (cfg.needsKey && !cfg.apiKey) throw new Error('API 키를 먼저 입력하세요.');

  switch (cfg.kind) {
    case 'anthropic': {
      const data = await request(`${cfg.baseUrl}/models?limit=1000`, { headers: anthropicHeaders(cfg) });
      return (data.data || []).map((m) => ({ id: m.id, label: m.display_name ? `${m.display_name} (${m.id})` : m.id }));
    }
    case 'gemini': {
      const out = [];
      let pageToken = '';
      do {
        const q = new URLSearchParams({ key: cfg.apiKey, pageSize: '1000' });
        if (pageToken) q.set('pageToken', pageToken);
        const data = await request(`${cfg.baseUrl}/models?${q}`, {});
        for (const m of data.models || []) {
          if (!(m.supportedGenerationMethods || []).includes('generateContent')) continue;
          const id = m.name.replace(/^models\//, '');
          out.push({ id, label: m.displayName ? `${m.displayName} (${id})` : id });
        }
        pageToken = data.nextPageToken || '';
      } while (pageToken);
      return out;
    }
    case 'ollama': {
      const data = await request(`${cfg.baseUrl}/api/tags`, {});
      return (data.models || []).map((m) => ({ id: m.name, label: m.name }));
    }
    default: {
      const data = await request(`${cfg.baseUrl}/models`, { headers: openaiHeaders(cfg) });
      let models = (data.data || data.models || []).map((m) => ({ id: m.id, label: m.name ? `${m.name}` : m.id }));
      if (cfg.id === 'openai') models = models.filter((m) => !OPENAI_NON_CHAT.test(m.id));
      return models.sort((a, b) => a.id.localeCompare(b.id));
    }
  }
}

// 400(지원하지 않는 파라미터)이면 다음 후보 body 로 재시도 — 속도용 옵션을 안전하게 붙이기 위함
async function postWithFallback(url, headers, bodies) {
  let lastErr;
  for (const body of bodies) {
    try {
      return await request(url, { method: 'POST', headers, body: JSON.stringify(body) });
    } catch (e) {
      lastErr = e;
      if (e.status !== 400) throw e;
    }
  }
  throw lastErr;
}

const OPENAI_REASONING = /^(o\d|gpt-5)/i;

/**
 * system + user 프롬프트로 텍스트 응답 하나를 받는다.
 * fast: 추론(thinking) 모델의 생각 시간을 최소화해서 응답을 빠르게 받는다.
 */
export async function chat(cfg, system, user, { json = true, fast = true } = {}) {
  if (!isReady(cfg)) throw new Error('설정에서 AI 모델을 먼저 연결해주세요.');

  switch (cfg.kind) {
    case 'anthropic': {
      const data = await postWithFallback(`${cfg.baseUrl}/messages`, anthropicHeaders(cfg), [
        { model: cfg.model, max_tokens: 4096, system, messages: [{ role: 'user', content: user }] },
      ]);
      return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    }
    case 'gemini': {
      const base = {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: json ? { responseMimeType: 'application/json' } : {},
      };
      const bodies = [];
      if (fast) {
        // flash 계열은 생각 끄기(0), pro 계열은 끌 수 없어서 최소값
        const budget = /pro/i.test(cfg.model) ? 128 : 0;
        bodies.push({ ...base, generationConfig: { ...base.generationConfig, thinkingConfig: { thinkingBudget: budget } } });
      }
      bodies.push(base);
      const url = `${cfg.baseUrl}/models/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
      const data = await postWithFallback(url, { 'Content-Type': 'application/json' }, bodies);
      const parts = data.candidates?.[0]?.content?.parts || [];
      return parts.filter((p) => !p.thought).map((p) => p.text || '').join('');
    }
    case 'ollama': {
      const base = {
        model: cfg.model,
        stream: false,
        ...(json ? { format: 'json' } : {}),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      };
      const bodies = fast ? [{ ...base, think: false }, base] : [base];
      const data = await postWithFallback(`${cfg.baseUrl}/api/chat`, { 'Content-Type': 'application/json' }, bodies);
      return data.message?.content || '';
    }
    default: {
      const base = {
        model: cfg.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      };
      const jsonMode = json ? { response_format: { type: 'json_object' } } : {};
      const bodies = [];
      if (fast && OPENAI_REASONING.test(cfg.model.replace(/^openai\//, ''))) {
        bodies.push({ ...base, ...jsonMode, reasoning_effort: 'minimal' });
        bodies.push({ ...base, ...jsonMode, reasoning_effort: 'low' });
      }
      bodies.push({ ...base, ...jsonMode });
      if (json) bodies.push(base); // JSON 모드를 지원하지 않는 엔드포인트
      const data = await postWithFallback(`${cfg.baseUrl}/chat/completions`, openaiHeaders(cfg), bodies);
      return data.choices?.[0]?.message?.content || '';
    }
  }
}

/** 모델 응답에서 JSON 객체를 최대한 관대하게 꺼낸다 */
export function extractJSON(text) {
  const cleaned = String(text)
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:json)?/gi, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.search(/[[{]/);
    const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error('모델 응답을 JSON 으로 해석하지 못했어요. 다른 모델로 시도해보세요.');
  }
}
