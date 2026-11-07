import { PROVIDERS, resolveConfig, isReady, listModels, chat } from './providers.js';
import { SCOPES, TONES, SPICE, VARIANT_LABEL, suggestQuotes, demoSuggest, demoQuote, demoRemix, remixCardText, moodPalette } from './quotes.js';
import { FONTS, SIZES, TEMPLATES, MOOD_TEMPLATE, renderCard, canvasToBlob } from './renderer.js';
import { EXAMPLES, randomExampleIndex } from './examples.js';
import { loadSettings, saveSettings, clearKeys, loadGallery, addToGallery, removeFromGallery } from './storage.js';

const $ = (sel) => document.querySelector(sel);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style') node.style.cssText = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) node.append(c);
  return node;
}

let toastTimer;
function toast(msg, isErr = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('err', isErr);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), isErr ? 5000 : 2400);
}

const newSeed = () => Math.floor(Math.random() * 2 ** 31);
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------- state ----------
let settings = loadSettings();
const state = {
  scopes: new Set(['world-classic', 'kr-modern']),
  tone: '',
  suggestions: [],
  lastQuery: null,
  spec: null,
  variants: [],
  spice: 2,
  exampleIdx: -1, // 예시 화면을 보여주는 중이면 EXAMPLES 인덱스, 아니면 -1
};

// ---------- status ----------
function refreshStatus() {
  const cfg = resolveConfig(settings);
  const pill = $('#status-pill');
  if (isReady(cfg)) {
    pill.className = 'status-pill ok';
    pill.textContent = `${PROVIDERS[cfg.id].label} · ${cfg.model}`;
  } else {
    pill.className = 'status-pill demo';
    pill.textContent = '데모 모드 — AI 연결하기';
  }
}

// ---------- step 1 ----------
function renderChips() {
  const scopes = $('#scopes');
  scopes.replaceChildren(
    ...SCOPES.map((s) =>
      el('button', {
        type: 'button', class: 'chip', title: s.hint, 'aria-pressed': String(state.scopes.has(s.id)),
        onclick: (e) => {
          state.scopes.has(s.id) ? state.scopes.delete(s.id) : state.scopes.add(s.id);
          e.currentTarget.setAttribute('aria-pressed', String(state.scopes.has(s.id)));
        },
      }, s.label)
    )
  );
  const tones = $('#tones');
  tones.classList.add('tones');
  tones.replaceChildren(
    ...TONES.map((t) =>
      el('button', {
        type: 'button', class: 'chip', 'aria-pressed': String(state.tone === t),
        onclick: () => {
          state.tone = state.tone === t ? '' : t;
          tones.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c.textContent === state.tone)));
        },
      }, t)
    )
  );
}

async function findQuotes({ more = false } = {}) {
  const situation = $('#situation').value.trim();
  if (!situation) {
    toast('지금 상황을 한 줄이라도 적어주세요!', true);
    $('#situation').focus();
    return;
  }
  const query = {
    situation,
    scopes: [...state.scopes],
    tone: state.tone,
    book: $('#custom-book').value.trim(),
    count: 4,
    exclude: more ? state.suggestions.map((s) => s.quote) : [],
  };
  state.lastQuery = query;

  setExampleMode(false);
  const cfg = resolveConfig(settings);
  const btns = [$('#btn-find'), $('#btn-more')];
  btns.forEach((b) => (b.disabled = true));
  const findBtn = $('#btn-find');
  const findLabel = findBtn.innerHTML;
  const t0 = performance.now();
  const tick = () => (findBtn.textContent = `문장 찾는 중… ${Math.floor((performance.now() - t0) / 1000)}초`);
  tick();
  const timer = setInterval(tick, 250);

  $('#step-pick').hidden = false;
  const grid = $('#suggestions');
  if (!more) {
    grid.replaceChildren();
    state.suggestions = [];
  }
  const skeletons = Array.from({ length: query.count }, () => el('div', { class: 'sg skeleton' }));
  grid.append(...skeletons);
  $('#step-pick').scrollIntoView({ behavior: 'smooth', block: 'start' });

  // 도착하는 대로 스켈레톤 하나를 실제 카드로 교체
  const show = (q) => {
    state.suggestions.push(q);
    const card = suggestionCard(q, state.suggestions.length - 1);
    const sk = skeletons.shift();
    sk ? sk.replaceWith(card) : grid.append(card);
  };

  try {
    if (isReady(cfg)) {
      await suggestQuotes(cfg, query, { onItem: show });
    } else {
      const list = demoSuggest(query);
      if (!list.length) throw new Error('데모 문장을 모두 보여드렸어요. 설정에서 AI 를 연결하면 무제한으로 찾을 수 있어요.');
      list.forEach(show);
      toast('데모 모드예요. ⚙ 설정에서 AI 를 연결하면 내 상황 맞춤 문장을 찾아줘요.');
    }
  } catch (e) {
    grid.append(el('div', { class: 'error-box' }, `문장을 찾지 못했어요.\n${e.message}`));
  } finally {
    skeletons.forEach((sk) => sk.remove());
    clearInterval(timer);
    findBtn.innerHTML = findLabel;
    btns.forEach((b) => (b.disabled = false));
  }
}

function suggestionCard(q, i) {
  const pal = q.palette || moodPalette(q.mood);
  const source = [q.book && `『${q.book}』`, q.author].filter(Boolean).join(' ');
  return el('article', { class: 'sg', style: `--tilt:${(i % 2 ? 1 : -1) * (0.6 + (i % 3) * 0.4)}deg; --accent:${pal[0]}` },
    el('p', { class: 'sg-card' }, q.card_text),
    el('p', { class: 'sg-quote' }, q.quote),
    el('p', { class: 'sg-src' }, source || '출처 미상'),
    q.scene ? el('p', { class: 'sg-scene' }, `📖 ${q.scene}`) : null,
    q.why ? el('p', { class: 'sg-why' }, q.why) : null,
    el('div', { class: 'badges' },
      el('span', { class: 'badge mood' }, `#${q.mood}`),
      q.paraphrase || q.confidence !== 'high' ? el('span', { class: 'badge para', title: '원문과 표현이 다를 수 있어요' }, '의역·확인 권장') : null
    ),
    el('button', { type: 'button', class: 'btn btn-primary', onclick: () => pickQuote(q) }, '이 문장 선택하기 ›')
  );
}

// ---------- step 3: editor ----------
function pickQuote(q, { text, template: forcedTemplate, scroll = true } = {}) {
  const template = forcedTemplate || MOOD_TEMPLATE[q.mood] || 'spray';
  const tpl = TEMPLATES.find((t) => t.id === template);
  state.spec = {
    id: newId(),
    text: text || q.card_text,
    quote: q.quote,
    situation: state.lastQuery?.situation || '',
    source: [q.book && `『${q.book}』`, q.author].filter(Boolean).join(' '),
    template,
    font: tpl.font,
    size: 'square',
    palette: [...(q.palette || moodPalette(q.mood))],
    seed: newSeed(),
    showSource: true,
    transparent: false,
  };
  openEditor({ variants: q.variants || [], scroll });
}

function openEditor({ variants = [], scroll = true } = {}) {
  state.variants = variants;
  $('#step-make').hidden = false;
  syncControls();
  renderTemplateThumbs();
  renderPreview();
  if (scroll) $('#step-make').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- 예시 화면 (첫 방문자가 흐름을 바로 이해하도록) ----------
function exampleSuggestions(ex) {
  return ex.picks.map(([book, why]) => demoQuote(book, why)).filter(Boolean);
}

function exampleText(ex, q) {
  return q.variants.find((v) => v.style === ex.variant)?.text || q.card_text;
}

function setExampleMode(on) {
  if (!on) {
    state.exampleIdx = -1;
    state.exampleFresh = false;
  }
  document.body.classList.toggle('is-example', on);
}

function applyExample(idx) {
  const ex = EXAMPLES[idx];
  state.exampleIdx = idx;
  state.exampleFresh = true;
  setExampleMode(true);

  $('#situation').value = ex.situation;
  $('#sit-count').textContent = ex.situation.length;
  $('#custom-book').value = '';
  state.scopes = new Set(ex.scopes);
  state.tone = ex.tone;
  renderChips();
  state.lastQuery = { situation: ex.situation, scopes: ex.scopes, tone: ex.tone, book: '', count: 4, exclude: [] };

  state.suggestions = exampleSuggestions(ex);
  $('#step-pick').hidden = false;
  $('#suggestions').replaceChildren(...state.suggestions.map((q, i) => suggestionCard(q, i)));

  const first = state.suggestions[0];
  pickQuote(first, { text: exampleText(ex, first), template: ex.template, scroll: false });
}


function syncControls() {
  const s = state.spec;
  $('#card-text').value = s.text;
  renderVariants();
  $('#font').value = s.font;
  $('#size').value = s.size;
  ['#c0', '#c1', '#c2'].forEach((id, i) => ($(id).value = s.palette[i]));
  $('#show-source').checked = s.showSource;
  $('#transparent').checked = s.transparent;
  $('#transparent').disabled = s.template !== 'emoji';
  $('#transparent').closest('label').style.opacity = s.template === 'emoji' ? 1 : 0.45;
  $('#card-quote').textContent = s.quote ? `“${s.quote}” ${s.source ? '— ' + s.source : ''}` : '';
  document.querySelectorAll('.tpl').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === s.template)));
}

// ---------- 카드 문구 버전 / 리믹스 ----------
function renderVariants() {
  $('#variants').replaceChildren(
    ...state.variants.map((v) =>
      el('button', {
        type: 'button', class: 'variant', 'aria-pressed': String(v.text === state.spec.text),
        onclick: () => update({ text: v.text }, { thumbs: true }),
      }, el('small', {}, VARIANT_LABEL[v.style] || '리믹스'), v.text)
    )
  );
}

function buildRemixControls() {
  const spice = $('#spice');
  const paint = () => spice.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(+b.dataset.id === state.spice)));
  spice.replaceChildren(
    ...SPICE.map((x) =>
      el('button', { type: 'button', role: 'radio', 'data-id': x.id, title: x.guide, onclick: () => { state.spice = x.id; paint(); } }, x.label)
    )
  );
  paint();

  $('#btn-remix').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const cfg = resolveConfig(settings);
    const s = state.spec;
    if (!isReady(cfg)) {
      const demo = demoRemix(s.quote).filter((v) => !state.variants.some((x) => x.text === v.text));
      if (demo.length) state.variants = [...state.variants, ...demo];
      renderVariants();
      toast('데모 모드예요. ⚙ 설정에서 AI 를 연결하면 매번 새로운 리믹스를 뽑아줘요.');
      return;
    }
    btn.disabled = true;
    const loading = el('span', { class: 'variant loading' }, '🔥 리믹스 중…');
    $('#variants').append(loading);
    try {
      const list = await remixCardText(cfg, {
        quote: s.quote, source: s.source, situation: s.situation || state.lastQuery?.situation, current: s.text, spice: state.spice,
      });
      const fresh = list.filter((v) => !state.variants.some((x) => x.text === v.text));
      state.variants = [...fresh, ...state.variants].slice(0, 12);
      if (fresh[0]) update({ text: fresh[0].text }, { thumbs: true });
      else renderVariants();
    } catch (err) {
      loading.remove();
      toast(`리믹스 실패: ${err.message}`, true);
    } finally {
      btn.disabled = false;
    }
  });
}

let renderToken = 0;
async function renderPreview() {
  const token = ++renderToken;
  const off = document.createElement('canvas');
  await renderCard(off, state.spec);
  if (token !== renderToken) return; // 더 최신 렌더가 있음
  const c = $('#card');
  c.width = off.width;
  c.height = off.height;
  c.getContext('2d').drawImage(off, 0, 0);
  $('#preview').classList.toggle('checker', state.spec.transparent && state.spec.template === 'emoji');
}

let debounceTimer;
function update(patch, { thumbs = false } = {}) {
  Object.assign(state.spec, patch);
  syncControls();
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    renderPreview();
    if (thumbs) renderTemplateThumbs();
  }, 120);
}

function buildTemplateButtons() {
  $('#templates').replaceChildren(
    ...TEMPLATES.map((t) =>
      el('button', {
        type: 'button', class: 'tpl', 'data-id': t.id, 'aria-pressed': 'false',
        onclick: () => update({ template: t.id, font: t.font, transparent: t.id === 'emoji' && state.spec.size === 'emoticon' }),
      }, el('canvas'), t.label)
    )
  );
}

let thumbToken = 0;
async function renderTemplateThumbs() {
  const token = ++thumbToken;
  for (const btn of document.querySelectorAll('.tpl')) {
    if (token !== thumbToken) return;
    const t = TEMPLATES.find((x) => x.id === btn.dataset.id);
    const spec = { ...state.spec, template: t.id, font: t.font, size: 'square', showSource: false, transparent: false };
    await renderCard(btn.querySelector('canvas'), spec, { maxDim: 180 });
  }
}

const PRESETS = [
  ['#ff2bd6', '#c6ff00', '#00d1ff'],
  ['#ffe600', '#ff4fa3', '#33e1ff'],
  ['#ff5a1f', '#ffe600', '#00e5a0'],
  ['#5ee7ff', '#b8ff6b', '#a78bfa'],
  ['#ff3d8b', '#ffd23f', '#ff9ff3'],
  ['#ffffff', '#ff2d2d', '#111111'],
];

function buildEditorControls() {
  $('#font').replaceChildren(...FONTS.map((f) => el('option', { value: f.id, style: `font-family:"${f.id}"` }, f.label)));
  $('#size').replaceChildren(...Object.entries(SIZES).map(([k, v]) => el('option', { value: k }, v.label)));
  $('#palette-presets').replaceChildren(
    ...PRESETS.map((p) =>
      el('button', {
        type: 'button', class: 'pp', title: p.join(' '),
        style: `background: conic-gradient(${p[0]} 0 33%, ${p[1]} 0 66%, ${p[2]} 0)`,
        onclick: () => update({ palette: [...p] }, { thumbs: true }),
      })
    )
  );
  buildTemplateButtons();
  buildRemixControls();

  $('#card-text').addEventListener('input', (e) => update({ text: e.target.value }));
  $('#card-text').addEventListener('change', () => renderTemplateThumbs());
  $('#font').addEventListener('change', (e) => update({ font: e.target.value }));
  $('#size').addEventListener('change', (e) =>
    update({ size: e.target.value, transparent: state.spec.template === 'emoji' && e.target.value === 'emoticon' ? true : state.spec.transparent })
  );
  ['#c0', '#c1', '#c2'].forEach((id, i) =>
    $(id).addEventListener('input', (e) => {
      const palette = [...state.spec.palette];
      palette[i] = e.target.value;
      update({ palette }, { thumbs: true });
    })
  );
  $('#show-source').addEventListener('change', (e) => update({ showSource: e.target.checked }));
  $('#transparent').addEventListener('change', (e) => update({ transparent: e.target.checked }));
  $('#btn-reroll').addEventListener('click', () => update({ seed: newSeed() }, { thumbs: true }));

  $('#btn-download').addEventListener('click', downloadPng);
  $('#btn-share').addEventListener('click', shareCard);
  $('#btn-copy-img').addEventListener('click', copyImage);
  $('#btn-copy-link').addEventListener('click', copyLink);
  $('#btn-save').addEventListener('click', () => {
    addToGallery(state.spec);
    renderGallery();
    toast('갤러리에 저장했어요 ★');
  });
}

// ---------- share ----------
function fileName() {
  const slug = state.spec.text.replace(/\s+/g, '_').replace(/[^\p{L}\p{N}_]/gu, '').slice(0, 20) || 'card';
  return `texthip_${slug}.png`;
}

async function currentBlob() {
  const c = document.createElement('canvas');
  await renderCard(c, state.spec);
  return canvasToBlob(c);
}

async function downloadPng() {
  const blob = await currentBlob();
  const a = el('a', { href: URL.createObjectURL(blob), download: fileName() });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function shareCard() {
  try {
    const blob = await currentBlob();
    const file = new File([blob], fileName(), { type: 'image/png' });
    const data = { title: 'TEXT HiP', text: `${state.spec.text.replace(/\n/g, ' ')} ${state.spec.source ? '— ' + state.spec.source : ''}`.trim() };
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ ...data, files: [file] });
    } else if (navigator.share) {
      await navigator.share({ ...data, url: shareUrl() });
    } else {
      await copyLink();
    }
  } catch (e) {
    if (e.name !== 'AbortError') toast(`공유 실패: ${e.message}`, true);
  }
}

async function copyImage() {
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': currentBlob() })]);
    toast('이미지를 클립보드에 복사했어요');
  } catch {
    toast('이 브라우저는 이미지 복사를 지원하지 않아요. PNG 저장을 이용해주세요.', true);
  }
}

// 링크 하나로 카드를 그대로 다시 그릴 수 있게 spec 을 URL 해시에 담는다 (서버 불필요)
function encodeSpec(s) {
  const compact = { t: s.text, q: s.quote, s: s.source, p: s.template, f: s.font, z: s.size, c: s.palette, d: s.seed, o: s.showSource ? 1 : 0, x: s.transparent ? 1 : 0 };
  const bytes = new TextEncoder().encode(JSON.stringify(compact));
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeSpec(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
  const c = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0))));
  const valid = (v, list) => (list.includes(v) ? v : list[0]);
  return {
    id: newId(),
    text: String(c.t || '').slice(0, 120),
    quote: String(c.q || '').slice(0, 400),
    source: String(c.s || '').slice(0, 120),
    template: valid(c.p, TEMPLATES.map((t) => t.id)),
    font: valid(c.f, FONTS.map((f) => f.id)),
    size: valid(c.z, Object.keys(SIZES)),
    palette: (Array.isArray(c.c) ? c.c : []).filter((h) => /^#[0-9a-f]{6}$/i.test(h)).slice(0, 3),
    seed: Number(c.d) || newSeed(),
    showSource: Boolean(c.o),
    transparent: Boolean(c.x),
  };
}

function shareUrl() {
  return `${location.origin}${location.pathname}#c=${encodeSpec(state.spec)}`;
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(shareUrl());
    toast('링크를 복사했어요. 링크를 열면 이 카드가 그대로 보여요 🔗');
  } catch {
    prompt('아래 링크를 복사하세요', shareUrl());
  }
}

function loadFromHash() {
  const m = location.hash.match(/#c=([\w-]+)/);
  if (!m) return false;
  try {
    const spec = decodeSpec(m[1]);
    if (spec.palette.length < 3) spec.palette = moodPalette('fire');
    state.spec = spec;
    openEditor();
    return true;
  } catch {
    toast('공유 링크가 손상되어 열 수 없어요.', true);
    return false;
  }
}

// ---------- gallery ----------
async function renderGallery() {
  const list = loadGallery();
  $('#gallery-empty').hidden = list.length > 0;
  const g = $('#gallery');
  g.replaceChildren();
  if (!list.length) {
    renderExampleGallery(g);
    return;
  }
  for (const spec of list) {
    const canvas = el('canvas');
    const item = el('div', {
      class: 'g-item', tabindex: '0', title: spec.text,
      onclick: () => {
        state.spec = { ...spec, palette: [...spec.palette] };
        openEditor();
      },
    }, canvas,
      el('button', {
        type: 'button', class: 'g-del', 'aria-label': '삭제',
        onclick: (e) => {
          e.stopPropagation();
          removeFromGallery(spec.id);
          renderGallery();
        },
      }, '✕')
    );
    g.append(item);
    renderCard(canvas, spec, { maxDim: 300 });
  }
}

// 갤러리가 비어 있으면 예시 상황들로 만든 샘플 카드를 보여준다 (저장되지 않음)
function renderExampleGallery(g) {
  EXAMPLES.slice(0, 8).forEach((ex, i) => {
    const q = demoQuote(ex.picks[0][0]);
    if (!q) return;
    const tpl = TEMPLATES.find((t) => t.id === ex.template);
    const spec = {
      id: `example-${i}`, text: exampleText(ex, q), quote: q.quote, situation: ex.situation,
      source: `『${q.book}』 ${q.author}`, template: ex.template, font: tpl.font, size: 'square',
      palette: [...q.palette], seed: 1000 + i, showSource: true, transparent: false,
    };
    const canvas = el('canvas');
    g.append(
      el('div', {
        class: 'g-item example', tabindex: '0', title: ex.situation,
        onclick: () => {
          state.spec = { ...spec, id: newId(), palette: [...spec.palette] };
          openEditor({ variants: q.variants });
        },
      }, canvas, el('span', { class: 'g-tag' }, '예시'))
    );
    renderCard(canvas, spec, { maxDim: 300 });
  });
}

// ---------- settings dialog ----------
let draft = null;
let modelCache = [];

function stashFields() {
  if (!draft) return;
  const id = draft.provider;
  draft.keys[id] = $('#api-key').value.trim();
  const url = $('#base-url').value.trim();
  if (url && url !== PROVIDERS[id].baseUrl) draft.baseUrls[id] = url;
  else delete draft.baseUrls[id];
  draft.models[id] = $('#model-manual').value.trim() || $('#model').value;
  draft.rememberKey = $('#remember-key').checked;
}

function fillFields() {
  const id = draft.provider;
  const p = PROVIDERS[id];
  $('#provider').value = id;
  $('#provider-help').textContent = p.help;
  $('#key-field').hidden = !p.needsKey && id !== 'custom';
  $('#api-key').value = draft.keys[id] || '';
  $('#api-key').placeholder = p.keyHint;
  $('#remember-key').checked = draft.rememberKey;
  $('#base-url').value = draft.baseUrls[id] || p.baseUrl;
  $('#base-field').open = id === 'ollama' || id === 'custom';
  $('#model-filter').value = '';
  $('#model-manual').value = '';
  modelCache = [];
  setModelOptions([], draft.models[id]);
  $('#model-msg').textContent = '';
  $('#model-msg').className = 'help';
}

function setModelOptions(models, selected) {
  const filter = $('#model-filter').value.trim().toLowerCase();
  const shown = filter ? models.filter((m) => m.label.toLowerCase().includes(filter)) : models;
  const opts = shown.map((m) => el('option', { value: m.id }, m.label));
  if (selected && !shown.some((m) => m.id === selected)) opts.unshift(el('option', { value: selected }, `${selected} (저장된 모델)`));
  if (!opts.length) opts.push(el('option', { value: '' }, '— 모델 목록을 불러오세요 —'));
  $('#model').replaceChildren(...opts);
  if (selected) $('#model').value = selected;
}

let loadToken = 0;
async function loadModels({ silent = false } = {}) {
  stashFields();
  const cfg = resolveConfig(draft);
  const msg = $('#model-msg');
  if (cfg.needsKey && !cfg.apiKey) {
    if (!silent) { msg.textContent = 'API 키를 먼저 입력하세요.'; msg.className = 'help err'; }
    return;
  }
  const token = ++loadToken;
  msg.textContent = '모델 목록을 불러오는 중…';
  msg.className = 'help';
  $('#btn-load-models').disabled = true;
  try {
    const models = await listModels(cfg);
    if (token !== loadToken) return;
    modelCache = models;
    setModelOptions(models, draft.models[draft.provider] || models[0]?.id);
    msg.textContent = models.length ? `${models.length}개 모델을 찾았어요.` : '사용 가능한 모델이 없어요. (Ollama 라면 ollama pull 로 모델을 받아주세요)';
  } catch (e) {
    if (token !== loadToken) return;
    msg.textContent = `불러오기 실패: ${e.message}`;
    msg.className = 'help err';
  } finally {
    if (token === loadToken) $('#btn-load-models').disabled = false;
  }
}

function openSettings() {
  draft = structuredClone(settings);
  fillFields();
  $('#settings').showModal();
  loadModels({ silent: true });
}

function buildSettings() {
  // 입력창에서 Enter 를 눌러도 저장 없이 다이얼로그가 닫히지 않게
  $('#settings-form').addEventListener('submit', (e) => {
    if (e.submitter?.value !== 'cancel') e.preventDefault();
  });
  $('#provider').replaceChildren(...Object.entries(PROVIDERS).map(([id, p]) => el('option', { value: id }, p.label)));
  $('#provider').addEventListener('change', (e) => {
    stashFields();
    draft.provider = e.target.value;
    fillFields();
    loadModels({ silent: true });
  });
  $('#api-key').addEventListener('change', () => loadModels());
  $('#base-url').addEventListener('change', () => loadModels());
  $('#btn-load-models').addEventListener('click', () => loadModels());
  $('#model-filter').addEventListener('input', () => setModelOptions(modelCache, $('#model').value));
  $('#btn-toggle-key').addEventListener('click', (e) => {
    const input = $('#api-key');
    input.type = input.type === 'password' ? 'text' : 'password';
    e.currentTarget.textContent = input.type === 'password' ? '보기' : '숨기기';
  });
  $('#btn-save-settings').addEventListener('click', () => {
    stashFields();
    settings = draft;
    saveSettings(settings);
    refreshStatus();
    $('#settings').close();
    toast(isReady(resolveConfig(settings)) ? '저장했어요. 이제 AI 가 문장을 찾아요!' : '저장했어요. 모델까지 선택해야 AI 를 쓸 수 있어요.');
  });
  $('#btn-clear-keys').addEventListener('click', () => {
    if (!confirm('저장된 모든 API 키를 삭제할까요?')) return;
    clearKeys();
    settings = loadSettings();
    draft = structuredClone(settings);
    fillFields();
    refreshStatus();
    toast('키를 모두 삭제했어요');
  });
  $('#btn-test').addEventListener('click', async (e) => {
    stashFields();
    const cfg = resolveConfig(draft);
    const msg = $('#model-msg');
    if (!isReady(cfg)) { msg.textContent = '키와 모델을 먼저 설정하세요.'; msg.className = 'help err'; return; }
    e.currentTarget.disabled = true;
    msg.textContent = `${cfg.model} 에 인사하는 중…`;
    msg.className = 'help';
    try {
      const reply = await chat(cfg, '한 문장으로만 답하라.', '힙하게 인사해줘.', { json: false });
      msg.textContent = `✅ 연결 성공: ${reply.trim().slice(0, 120)}`;
    } catch (err) {
      msg.textContent = `❌ ${err.message}`;
      msg.className = 'help err';
    } finally {
      e.currentTarget.disabled = false;
    }
  });
}

// ---------- init ----------
function init() {
  renderChips();
  buildEditorControls();
  buildSettings();
  refreshStatus();
  renderGallery();

  $('#situation').addEventListener('input', (e) => ($('#sit-count').textContent = e.target.value.length));
  $('#situation').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) findQuotes();
  });
  $('#btn-find').addEventListener('click', () => findQuotes());
  $('#btn-more').addEventListener('click', () => findQuotes({ more: true }));
  $('#btn-settings').addEventListener('click', openSettings);
  $('#status-pill').addEventListener('click', openSettings);

  $('#btn-example').addEventListener('click', () => applyExample(randomExampleIndex(state.exampleIdx)));
  // 예시 문장이 들어 있을 때 입력창을 누르면 전체 선택 → 바로 내 상황으로 덮어쓰기 쉽게
  $('#situation').addEventListener('focus', (e) => {
    if (state.exampleFresh) e.target.select();
  });
  $('#situation').addEventListener('input', () => (state.exampleFresh = false));

  applyExample(randomExampleIndex());
  loadFromHash();
  window.addEventListener('hashchange', loadFromHash);
}

init();
