// game.js — 「달빛 조제실」 1×3×1 로직
// 상태기계 IDLE→DRAGGING→GRINDING→POURING→SEALING · 단일 PointerEvent 라우터 · 단일 rAF
// §9 성능 가드: rect 캐시 1회 · pointermove 레이아웃 읽기 0 · transform/opacity만 · --liquid는 전이 시점만

'use strict';

/* ===================== 세이브 ===================== */
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.v === 1) return Object.assign(defaultSave(), s);
    }
  } catch (e) { /* 손상 시 새 세이브 */ }
  return defaultSave();
}
function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {}
}
const save = loadSave();

/* ===================== 하루 손님 큐 (dateSeed 결정론) =====================
   같은 날 새로고침 = 동일 큐. 날짜가 바뀌면 새 큐 생성 + 마감 플래그 리셋.
   세이브는 진행(idx/status/closed)만 — 큐 내용은 dateSeed로 재현 가능. */
function ensureDailyQueue() {
  const seed = todaySeed();
  const t = save.today;
  if (t.dateSeed !== seed || !t.customers || !t.customers.length) {
    t.dateSeed = seed;
    t.customers = buildDailyQueue(seed);
    t.idx = 0;
    t.closed = false;
    persist();
  }
}
ensureDailyQueue();

// 현재(첫 waiting) 손님을 game.crystal/recipe/modifier에 적재. 없으면 false(전원 완료).
function loadCurrentCustomer() {
  const t = save.today;
  // idx가 가리키는 손님이 이미 healed면 다음 waiting으로 전진
  while (t.idx < t.customers.length && t.customers[t.idx].status !== 'waiting') t.idx++;
  if (t.idx >= t.customers.length) return false;
  const c = t.customers[t.idx];
  game.crystal = CRYSTALS[c.crystal];
  game.recipe = RECIPES[c.recipe];
  game.modifier = c.modifier ? MODIFIERS[c.modifier] : null;
  return true;
}

/* ===================== 환경 ===================== */
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches || save.settings.reduced;
if (REDUCED) document.body.classList.add('reduced');

/* ===================== DOM 캐시 ===================== */
const $ = (id) => document.getElementById(id);
const el = {
  viewport: $('viewport'), track: $('track'), stage: $('stage'),
  hud: $('hud'), starCount: $('starCount'), codexCount: $('codexCount'), codexTotal: $('codexTotal'),
  custProg: $('custProg'),
  customer: $('customer'), customerSprite: $('customerSprite'),
  speechText: $('speechText'), speechMod: $('speechMod'), gestureFlow: $('gestureFlow'),
  cauldron: $('cauldron'), cauldronGlow: $('cauldronGlow'), cauldronLiquid: $('cauldronLiquid'), cauldronHint: $('cauldronHint'),
  mortar: $('mortar'), mortarBowl: $('mortarBowl'), mortarHerb: $('mortarHerb'), mortarHint: $('mortarHint'), grindGauge: $('grindGauge'), mortarRing: $('mortarRing'),
  bottle: $('bottle'),
  drawer: $('drawer'),
  codexBook: $('codexBook'), codexPanel: $('codexPanel'), codexClose: $('codexClose'), codexShelf: $('codexShelf'),
  dragGhost: $('dragGhost'), fxCanvas: $('fxCanvas'), sealFlash: $('sealFlash'),
  closingSheet: $('closingSheet'), csSub: $('csSub'), csHealed: $('csHealed'), csStars: $('csStars'), csStreak: $('csStreak'), csPreview: $('csPreview'), csClose: $('csClose'),
};

/* ===================== 게임 상태 ===================== */
const ST = { IDLE: 'IDLE', DRAGGING: 'DRAGGING', GRINDING: 'GRINDING', POURING: 'POURING', SEALING: 'SEALING' };
const game = {
  state: ST.IDLE,
  crystal: CRYSTALS.sleep,        // 현재 손님 결정 (큐에서 채움)
  recipe: RECIPE_BY_CRYSTAL.sleep,// 현재 손님이 원하는 레시피
  modifier: null,                 // 현재 손님 변덕(MODIFIERS[id]) — 없을 수도
  mortarHerb: null,    // 절구에 올린 약초 id (빻기 전)
  grind: 0,            // 빻기 진행도 0~1
  lastGrindStrength: 0,// 마지막으로 가마에 부은 가루의 빻기 세기(변덕 cold 판정)
  powderReady: null,   // 빻기 완료된 가루 약초 id
  added: [],           // 가마에 넣은 약초 id 목록
  cauldronHsl: null,   // 현재 가마색 [h,s,l] (null=빈 가마)
  sealed: false,
};

/* ===================== HSL 유틸 ===================== */
// hue 원형 최단경로 가중평균 (350°↔10° → 0°)
function blendHsl(list) {
  // list: [{hsl:[h,s,l], w}]
  let x = 0, y = 0, s = 0, l = 0, wsum = 0;
  for (const it of list) {
    const w = it.w;
    const rad = it.hsl[0] * Math.PI / 180;
    x += Math.cos(rad) * w;
    y += Math.sin(rad) * w;
    s += it.hsl[1] * w;
    l += it.hsl[2] * w;
    wsum += w;
  }
  if (wsum === 0) return null;
  let h = Math.atan2(y, x) * 180 / Math.PI;
  if (h < 0) h += 360;
  return [h, s / wsum, l / wsum];
}
// HSL 거리(가중) — 색근접도용
function hslDist(a, b) {
  let dh = Math.abs(a[0] - b[0]); if (dh > 180) dh = 360 - dh; // 원형
  const ds = a[1] - b[1], dl = a[2] - b[2];
  // hue를 색상감 비중으로 살짝 우대
  return Math.sqrt((dh / 180) ** 2 * 2 + (ds / 100) ** 2 + (dl / 100) ** 2);
}
const MAX_DIST = Math.sqrt(2 + 1 + 1); // 이론 최대(정규화 기준)
function cssHsl(hsl) { return `hsl(${hsl[0].toFixed(1)}, ${hsl[1].toFixed(0)}%, ${hsl[2].toFixed(0)}%)`; }

/* ===================== 품질 ===================== */
function colorProximity() {
  if (REDUCED) return 1;                 // §3 REDUCED 동등: 색근접도 만점
  if (!game.cauldronHsl) return 0;
  const d = hslDist(game.cauldronHsl, game.recipe.targetHsl);
  return Math.max(0, 1 - d / MAX_DIST);
}
function ingredientMatch() {
  const added = new Set(game.added);
  const ideal = new Set(game.recipe.ideal);
  let inter = 0; const uni = new Set([...added, ...ideal]);
  for (const id of added) if (ideal.has(id)) inter++;
  return uni.size === 0 ? 0 : inter / uni.size; // 자카드
}
// 변덕 충족 판정 — 현재 손님 변덕을 현재 조제 상태로 평가. null=변덕 없음.
function modifierState() {
  return {
    added: game.added,
    grindStrength: game.lastGrindStrength,
    pourCount: game.added.length,
  };
}
function modifierMet() {
  if (!game.modifier) return null;
  return !!game.modifier.check(modifierState());
}
function quality() {
  let q = 0.6 * colorProximity() + 0.4 * ingredientMatch();
  // §4: + 변덕 충족 가/감점
  const met = modifierMet();
  if (met === true) q += game.modifier.bonus;
  else if (met === false) q -= game.modifier.penalty;
  return Math.max(0, Math.min(1, q));
}

/* ===================== 렌더 ===================== */
function renderHud() {
  el.starCount.textContent = save.starCandy;
  // 도감: 발견한 레시피 수 / 전체 레시피 수 (하드코딩 금지 — RECIPES 길이 기반)
  let discovered = 0;
  for (const id in RECIPES) if (save.codex[id] && save.codex[id].discovered) discovered++;
  el.codexCount.textContent = discovered;
  el.codexTotal.textContent = '/' + Object.keys(RECIPES).length;
  // 손님 진행: 재운 수 / 전체
  const t = save.today;
  const healed = t.customers.filter((c) => c.status === 'healed').length;
  el.custProg.textContent = healed;
  el.custProg.nextElementSibling.textContent = '/' + t.customers.length;
}
function renderCustomer() {
  el.speechText.textContent = game.crystal.line;
  // 결정별 고유 스프라이트/실루엣 + 변덕 한 줄
  el.customerSprite.src = game.crystal.sprite;
  el.customerSprite.alt = game.crystal.name;
  el.customer.dataset.sink = game.crystal.sink;   // 잠드는 연출 변주 선택자
  if (game.modifier) {
    el.speechMod.textContent = '— ' + game.modifier.line;
    el.speechMod.hidden = false;
  } else {
    el.speechMod.textContent = '';
    el.speechMod.hidden = true;
  }
}
/* 손님 등장 — 떠오르며 + 말풍선 팝(첫 30초 후크 / 다음 손님 전환) */
function customerEnter() {
  renderCustomer();
  el.customer.classList.remove('entering', 'sleeping', 'yawning');
  void el.customer.offsetWidth;        // 애니메이션 재생 강제
  el.customer.classList.add('entering');
  setTimeout(() => el.customer.classList.remove('entering'), 1600);
}

/* 다음 행동 안내 — 현재 상태로 "지금 뭘" 결정해 제스처 흐름/힌트 갱신.
   단계: grind(약초→절구→빻기) → pour(가루→가마) → seal(봉인) */
function updateHints() {
  const steps = el.gestureFlow.querySelectorAll('.gf-step');
  let active = 'grind';                  // 기본: 약초를 절구에
  const ready = !el.bottle.disabled && !game.sealed;
  if (ready) active = 'seal';            // 색 무르익음 → 봉인
  else if (game.powderReady) active = 'pour';  // 가루 준비됨 → 가마로
  else if (game.added.length) active = 'pour'; // 이미 좀 넣었으면 계속 가마로
  else active = 'grind';

  const order = ['grind', 'pour', 'seal'];
  const ai = order.indexOf(active);
  steps.forEach((s) => {
    const i = order.indexOf(s.dataset.step);
    s.classList.toggle('now', i === ai);
    s.classList.toggle('done', i < ai);
  });

  // 절구/가마 힌트 텍스트도 상태에 맞춰(은은히)
  if (!game.mortarHerb && !game.powderReady) el.mortarHint.textContent = '약초를 올려요';
  if (!game.added.length && !game.sealed) el.cauldronHint.textContent = '가루를 넣어요';
}
// --liquid setProperty는 전이 시점(pour/리셋)에만 호출 (§9 매 프레임 금지)
function applyLiquid() {
  if (game.cauldronHsl) {
    document.documentElement.style.setProperty('--liquid', cssHsl(game.cauldronHsl));
    el.cauldron.classList.add('has-liquid');
  } else {
    document.documentElement.style.setProperty('--liquid', 'hsl(250, 18%, 28%)');
    el.cauldron.classList.remove('has-liquid');
  }
  updateProximity();
}
function updateProximity() {
  const p = game.added.length ? colorProximity() : 0;
  el.cauldronGlow.style.setProperty('--prox', p.toFixed(2));
  const ready = p >= 0.82 || (REDUCED && game.added.length >= game.recipe.ideal.length);
  el.cauldron.classList.toggle('ready', ready && !game.sealed);
  el.bottle.classList.toggle('active', ready && !game.sealed);
  el.bottle.disabled = !(ready && !game.sealed);
  if (typeof updateHints === 'function') updateHints();   // "봉인!" 단계 점등
}

/* ===================== 약초 서랍 ===================== */
function buildDrawer() {
  el.drawer.innerHTML = '';
  for (const id of Object.keys(HERBS)) {
    const h = HERBS[id];
    const chip = document.createElement('div');
    chip.className = 'herb-chip';
    chip.dataset.herb = id;
    // position:relative는 styles.css(.herb-chip)에 명시 — 인라인 제거(E)
    const count = save.inventory[id] || 0;
    if (count <= 0) chip.classList.add('depleted'); // §5 재고 0: 흐리게+드래그 불가
    chip.innerHTML =
      `<img class="herb-icon" src="${h.sprite}" alt="${h.name}" draggable="false" />` +
      `<span class="herb-name">${h.name}</span>` +
      `<span class="herb-count">${count}</span>`;
    el.drawer.appendChild(chip);
  }
}
function refreshDrawerCounts() {
  el.drawer.querySelectorAll('.herb-chip').forEach((chip) => {
    const id = chip.dataset.herb;
    const count = save.inventory[id] || 0;
    chip.querySelector('.herb-count').textContent = count;
    chip.classList.toggle('depleted', count <= 0);
  });
}

/* ===================== rect 캐시 (§9: pointerdown 1회) ===================== */
let rects = null;
function cacheRects() {
  rects = {
    mortar: el.mortar.getBoundingClientRect(),
    cauldron: el.cauldron.getBoundingClientRect(),
  };
}
function invalidateRects() { rects = null; }
window.addEventListener('resize', invalidateRects);
window.addEventListener('orientationchange', invalidateRects);
function inRect(r, x, y, pad = 0) {
  return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
}

/* ===================== 단일 PointerEvent 라우터 ===================== */
// setPointerCapture는 고정 루트(viewport)에 건다 (§9). 약초 엘리먼트 X.
const drag = { active: false, herbId: null, source: null, x: 0, y: 0, pointerId: null };

el.viewport.addEventListener('pointerdown', onPointerDown);

function onPointerDown(e) {
  if (game.state === ST.SEALING) return;
  const target = e.target;

  // 1) 약초 칩 → 드래그 시작
  const chip = target.closest && target.closest('.herb-chip');
  if (chip && !chip.classList.contains('depleted') && game.state === ST.IDLE) {
    startDrag(e, chip.dataset.herb, 'drawer');
    return;
  }

  // 2) 절구의 가루(빻기 완료) → 가마로 드래그
  if (game.powderReady && el.mortar.contains(target) && game.state === ST.IDLE) {
    startDrag(e, game.powderReady, 'mortar');
    return;
  }

  // 3) 절구에 약초 있고 아직 안 빻음 → 길게눌러 빻기 시작 (REDUCED는 탭 1회)
  if (game.mortarHerb && !game.powderReady && el.mortar.contains(target)) {
    if (REDUCED) { finishGrind(); return; }
    startGrind(e);
    return;
  }
}

/* --------- 드래그 --------- */
function startDrag(e, herbId, source) {
  if (!rects) cacheRects();
  drag.active = true; drag.herbId = herbId; drag.source = source; drag.pointerId = e.pointerId;
  drag.x = e.clientX; drag.y = e.clientY;
  game.state = ST.DRAGGING;
  el.viewport.setPointerCapture(e.pointerId); // 고정 루트

  el.dragGhost.innerHTML = `<img src="${HERBS[herbId].sprite}" alt="" draggable="false" />`;
  el.dragGhost.classList.remove('snapback');
  el.dragGhost.classList.add('active');
  el.dragGhost.style.willChange = 'transform';
  positionGhost();

  el.viewport.addEventListener('pointermove', onDragMove);
  el.viewport.addEventListener('pointerup', onDragUp);
  el.viewport.addEventListener('pointercancel', onDragUp);

  // dropover 하이라이트 대상 결정 — 유효 드롭존이 "여기 놓아요" 맥동
  if (source === 'drawer') el.mortar.classList.add('drop-target');
  else el.cauldron.classList.add('drop-target');
}
function positionGhost() {
  el.dragGhost.style.transform = `translate3d(${drag.x - 28}px, ${drag.y - 28}px, 0)`;
}
function onDragMove(e) {
  // §9: 좌표만 저장, 레이아웃 읽기 0 — rAF에서 적용
  drag.x = e.clientX; drag.y = e.clientY;
  if (!drag._raf) drag._raf = requestAnimationFrame(applyDrag);
}
function applyDrag() {
  drag._raf = 0;
  if (!drag.active) return;
  positionGhost();
  // 캐시된 rect로만 hover 판정
  let over;
  if (drag.source === 'drawer') {
    over = inRect(rects.mortar, drag.x, drag.y, 24);
    el.mortar.classList.toggle('dropover', over);
  } else {
    over = inRect(rects.cauldron, drag.x, drag.y, 18);
    el.cauldron.classList.toggle('dropover', over);
  }
  // 손맛: 드롭존 위면 고스트가 또렷+곧게(놓을 준비 신호)
  el.dragGhost.classList.toggle('over', over);
}
function onDragUp(e) {
  if (!drag.active) return;
  el.viewport.removeEventListener('pointermove', onDragMove);
  el.viewport.removeEventListener('pointerup', onDragUp);
  el.viewport.removeEventListener('pointercancel', onDragUp);
  try { el.viewport.releasePointerCapture(e.pointerId); } catch (_) {}

  let dropped = false;
  if (drag.source === 'drawer' && inRect(rects.mortar, drag.x, drag.y, 24)) {
    placeHerbInMortar(drag.herbId);
    dropped = true;
  } else if (drag.source === 'mortar' && inRect(rects.cauldron, drag.x, drag.y, 18)) {
    pourPowder(drag.herbId);
    dropped = true;
  }

  el.mortar.classList.remove('dropover', 'drop-target');
  el.cauldron.classList.remove('dropover', 'drop-target');
  el.dragGhost.classList.remove('over');
  el.dragGhost.style.willChange = '';

  if (dropped) {
    el.dragGhost.classList.remove('active');
    el.dragGhost.style.transform = 'translate3d(-100px,-100px,0)';
  } else {
    // §5 드롭존 밖: 서랍으로 스냅백, state 롤백
    el.dragGhost.classList.add('snapback');
    el.dragGhost.style.transform = 'translate3d(-100px,-100px,0)';
    setTimeout(() => { el.dragGhost.classList.remove('active', 'snapback'); }, 230);
  }

  drag.active = false; drag.herbId = null; drag.source = null;
  if (game.state === ST.DRAGGING) game.state = ST.IDLE;
}

/* --------- 절구: 약초 올리기 --------- */
function placeHerbInMortar(herbId) {
  if (save.inventory[herbId] <= 0) return;
  game.mortarHerb = herbId;
  game.grind = 0;
  game.powderReady = null;
  el.mortarHerb.src = HERBS[herbId].sprite;
  el.mortarHerb.hidden = false;
  el.mortar.classList.add('has-herb');
  el.mortar.classList.remove('powder');
  el.grindGauge.style.setProperty('--grind', '0');
  el.mortarHint.textContent = REDUCED ? '탭해서 빻기' : '길게 눌러 빻기';
  // 손맛: 안착 바운스(재시작 위해 클래스 리트리거)
  el.mortar.classList.remove('herb-drop');
  void el.mortar.offsetWidth; // 리플로우 강제(애니메이션 재생)
  el.mortar.classList.add('herb-drop');
  updateHints();
}

/* --------- 빻기: pointerdown→rAF 진행도 (§9 setTimeout 금지) --------- */
let grindRaf = 0, grindLast = 0;
function startGrind(e) {
  game.state = ST.GRINDING;
  el.mortar.classList.add('grinding');
  el.viewport.setPointerCapture(e.pointerId);
  drag.pointerId = e.pointerId;
  el.viewport.addEventListener('pointerup', stopGrind);
  el.viewport.addEventListener('pointercancel', stopGrind);
  el.viewport.addEventListener('pointermove', grindMove);
  grindLast = performance.now();
  grindRaf = requestAnimationFrame(grindStep);
}
function grindMove(e) { game._grindBonus = (game._grindBonus || 0) + 0.0006; } // 문지르기 가산
function grindStep(now) {
  const dt = Math.min(48, now - grindLast); grindLast = now;
  game.grind = Math.min(1, game.grind + dt * 0.00075 + (game._grindBonus || 0));
  game._grindBonus = 0;
  const g = game.grind;
  el.grindGauge.style.setProperty('--grind', g.toFixed(3));
  el.mortarRing.style.setProperty('--grind', g.toFixed(3)); // 손맛: 둘레 진행 링 차오름
  // 손맛: 빻을수록 점점 강해짐 — 흔들림 가속(.16s→.07s) + 진폭↑(1→1.8)
  el.mortarBowl.style.setProperty('--shake', (0.16 - g * 0.09).toFixed(3) + 's');
  el.mortarBowl.style.setProperty('--gi', (1 + g * 0.8).toFixed(2));
  // 손맛: 가루 파티clewide↑ — 후반일수록 더 자주/많이 튄다(스폰 간격 단축)
  const interval = 95 - g * 55;          // 95ms→40ms
  if (now - (grindStep._spark || 0) > interval) { spawnGrindParticles(g); grindStep._spark = now; }
  if (game.grind >= 1) { finishGrind(); return; }
  grindRaf = requestAnimationFrame(grindStep);
}
function stopGrind() {
  cancelAnimationFrame(grindRaf); grindRaf = 0;
  el.mortar.classList.remove('grinding');
  el.viewport.removeEventListener('pointerup', stopGrind);
  el.viewport.removeEventListener('pointercancel', stopGrind);
  el.viewport.removeEventListener('pointermove', grindMove);
  try { el.viewport.releasePointerCapture(drag.pointerId); } catch (_) {}
  // 손맛: 손 떼면 흔들림 진정(진행도/링은 보존)
  el.mortarBowl.style.removeProperty('--shake');
  el.mortarBowl.style.removeProperty('--gi');
  if (game.grind < 1) game.state = ST.IDLE; // 진행도 보존, 다시 누르면 이어감
}
function finishGrind() {
  cancelAnimationFrame(grindRaf); grindRaf = 0;
  el.mortar.classList.remove('grinding');
  el.viewport.removeEventListener('pointerup', stopGrind);
  el.viewport.removeEventListener('pointercancel', stopGrind);
  el.viewport.removeEventListener('pointermove', grindMove);
  try { el.viewport.releasePointerCapture(drag.pointerId); } catch (_) {}
  game.grind = 1;
  game.powderReady = game.mortarHerb;
  el.grindGauge.style.setProperty('--grind', '1');
  el.mortarRing.style.setProperty('--grind', '1');
  el.mortarBowl.style.removeProperty('--shake');
  el.mortarBowl.style.removeProperty('--gi');
  el.mortar.classList.add('powder');
  el.mortarBowl.style.setProperty('--powder-col', cssHsl(HERBS[game.powderReady].hsl));
  el.mortarHint.textContent = '가루를 가마로';
  // 손맛: 완료 스쿼시 + 톡 튀는 가루 무더기 한방
  if (!REDUCED) {
    el.mortar.classList.remove('grind-done');
    void el.mortar.offsetWidth;
    el.mortar.classList.add('grind-done');
    spawnGrindFinish();
  }
  game.state = ST.IDLE;
  updateHints();
}

/* --------- 가마: 가루 투입 + 색 블렌딩 --------- */
function pourPowder(herbId) {
  if (save.inventory[herbId] <= 0) return;
  const prevProx = game.added.length ? colorProximity() : 0; // 손맛: 따뜻해졌는지 비교용
  // 재료 소비
  save.inventory[herbId] = Math.max(0, save.inventory[herbId] - 1);
  game.added.push(herbId);
  game.lastGrindStrength = game.grind;  // 변덕(cold) 등 2차 빻기 판정 슬롯

  // §4 HSL 가중평균(potency) — pour마다 1회 계산
  const list = game.added.map((id) => ({ hsl: HERBS[id].hsl, w: HERBS[id].potency }));
  game.cauldronHsl = blendHsl(list);
  applyLiquid();          // setProperty 전이 시점에만

  // 절구 비우기
  resetMortar();
  refreshDrawerCounts();
  persist();

  // 손맛: 퐁당 파문 + 액체 솟구침 + (근접도 상승 시) 따뜻 플레어
  spawnPourParticles();
  if (!REDUCED) {
    el.cauldron.classList.remove('splash', 'warm-flare');
    void el.cauldron.offsetWidth;
    el.cauldron.classList.add('splash');
    const newProx = colorProximity();
    if (newProx > prevProx + 0.01) el.cauldron.classList.add('warm-flare'); // "맞춰가는" 신호
    setTimeout(() => el.cauldron.classList.remove('splash', 'warm-flare'), 720);
  }
  game.state = ST.IDLE;
  updateHints();
}
function resetMortar() {
  game.mortarHerb = null; game.grind = 0; game.powderReady = null;
  el.mortarHerb.hidden = true;
  el.mortar.classList.remove('has-herb', 'powder', 'grind-done', 'herb-drop');
  el.grindGauge.style.setProperty('--grind', '0');
  el.mortarRing.style.setProperty('--grind', '0');
  el.mortarHint.textContent = '약초를 올려요';
}

/* --------- 봉인 --------- */
el.bottle.addEventListener('click', () => {
  if (el.bottle.disabled || game.sealed) return;
  seal();
});
function seal() {
  game.sealed = true;
  game.state = ST.SEALING;
  el.bottle.classList.remove('active');
  el.bottle.disabled = true;

  const q = quality();
  const g = gradeFor(q);
  const perfect = g.label === '완벽';

  // 빛 번짐 플래시 — 완벽이면 더 화려하게
  if (!REDUCED) {
    el.sealFlash.classList.add('fire');
    if (perfect) el.sealFlash.classList.add('perfect');
    setTimeout(() => el.sealFlash.classList.remove('fire', 'perfect'), 1100);
  }
  spawnHealParticles(perfect);   // 완벽이면 별가루 차등(더 많이/멀리)

  // 변덕 충족/미충족 피드백 — 말풍선 변덕 줄에 ✓/… 표시(텍스트 토스트 아님, 인씬)
  const met = modifierMet();
  if (game.modifier) {
    el.speechMod.classList.remove('met', 'miss');
    el.speechMod.textContent = (met ? '✓ ' : '… ') + game.modifier.line;
    el.speechMod.classList.add(met ? 'met' : 'miss');
  }

  // 결정별 고유 잠드는 연출 차등(§3 payoff) — 하품/떨다 녹음/잿빛 옅어짐.
  // sink 변주는 customer.dataset.sink(=crystal.sink)로 CSS가 선택.
  el.customer.classList.add('yawning');   // 'yawning' = 잠들기 전 트리거(연출은 sink별 변주)
  setTimeout(() => el.customer.classList.add('sleeping'), REDUCED ? 0 : 260);

  // 보상: 도감 갱신(best만) + 별사탕
  const prev = save.codex[game.recipe.id];
  const isFirst = !prev || !prev.discovered;
  const gradeRank = { '평범': 1, '좋음': 2, '완벽': 3 };
  let best = g.label;
  if (prev && prev.best && gradeRank[prev.best] > gradeRank[g.label]) best = prev.best;
  save.codex[game.recipe.id] = { discovered: true, best: best };

  const reward = isFirst ? 10 : 3;       // §5 첫 제작 보너스 vs 반복 소액
  const perfectBonus = perfect ? 5 : 0;
  const modBonus = met === true ? 2 : 0; // 변덕 충족 소소한 별사탕
  const starGain = reward + perfectBonus + modBonus;
  save.starCandy += starGain;
  save.exp += 20;
  // 현재 손님 healed 처리 + 그날 누적 별사탕(마감 정산용)
  const cur = save.today.customers[save.today.idx];
  if (cur) { cur.status = 'healed'; cur.grade = g.label; }
  save.today.earned = (save.today.earned || 0) + starGain;
  persist();

  // 손맛: HUD 숫자는 바로 안 올리고, 팝이 "도착"할 때 올려 동기화
  buildCodex();
  if (REDUCED) {
    renderHud();
  } else {
    // 포션이 도감 책으로 비행해 꽂힘 + 별사탕/EXP 숫자가 HUD로 통통
    flyPotionToShelf();
    popReward('star', '+' + starGain, '★', 0, () => { renderHud(); bumpHud(el.starCount); });
    popReward('exp', 'EXP +20', '✦', 160, null);
  }

  // 봉인 후 잠시 뒤 새 손님 사이클 준비(슬라이스: 리셋만)
  setTimeout(() => { afterSeal(g); }, REDUCED ? 300 : 1900);
}
/* --------- payoff 헬퍼: 날아가는 포션 --------- */
function flyPotionToShelf() {
  const from = centerOf(el.cauldron);
  const to = centerOf(el.codexBook);   // 도감 책 = 선반 입구(디제틱)
  const fly = document.createElement('div');
  fly.className = 'fly-potion';
  // 목표색 틴팅으로 레시피색 포션(도감 카드와 동일 규칙)
  const hue = game.recipe.targetHsl[0] - 30;
  fly.innerHTML = `<img src="${game.recipe.sprite}" alt="" draggable="false" style="filter:drop-shadow(0 0 14px rgba(255,247,224,.7)) hue-rotate(${hue}deg) saturate(1.2);" />`;
  fly.style.setProperty('--fx', (from.x - 28) + 'px');
  fly.style.setProperty('--fy', (from.y - 28) + 'px');
  fly.style.setProperty('--tx', (to.x - 28) + 'px');
  fly.style.setProperty('--ty', (to.y - 28) + 'px');
  fly.style.setProperty('--fly-dur', '900ms');
  document.body.appendChild(fly);
  void fly.offsetWidth;
  fly.classList.add('go');
  // 도착 순간 도감 책이 살짝 반응(꽂혔다)
  setTimeout(() => { el.codexBook.classList.add('tuck'); setTimeout(() => el.codexBook.classList.remove('tuck'), 360); }, 820);
  setTimeout(() => fly.remove(), 980);
}
/* --------- payoff 헬퍼: 숫자 팝 → HUD --------- */
function popReward(kind, text, ico, delay, onArrive) {
  const from = centerOf(el.cauldron);
  const target = kind === 'star' ? el.starCount : el.codexCount;
  const to = centerOf(target);
  const pop = document.createElement('div');
  pop.className = 'num-pop ' + kind;
  pop.innerHTML = `<span class="np-ico">${ico}</span> ${text}`;
  pop.style.setProperty('--px', (from.x - 24) + 'px');
  pop.style.setProperty('--py', (from.y - 40) + 'px');
  pop.style.setProperty('--tx', (to.x - 18) + 'px');
  pop.style.setProperty('--ty', (to.y) + 'px');
  pop.style.setProperty('--np-dur', '1100ms');
  document.body.appendChild(pop);
  setTimeout(() => {
    void pop.offsetWidth;
    pop.classList.add('go');
    if (onArrive) setTimeout(onArrive, 950);  // 팝이 HUD 근처 도달 시 숫자 갱신
    setTimeout(() => pop.remove(), 1160);
  }, delay);
}
function bumpHud(node) {
  const item = node.closest('.hud-item');
  if (!item) return;
  item.classList.remove('bump'); void item.offsetWidth; item.classList.add('bump');
}
function afterSeal(grade) {
  // 가마/절구 리셋. 봉인된 손님은 잠든 상태로 사라지고 다음 손님이 온다.
  game.added = []; game.cauldronHsl = null; game.sealed = false;
  game.lastGrindStrength = 0;
  applyLiquid();
  el.cauldronHint.textContent = `${game.recipe.name} — ${grade.label} ${'★'.repeat(grade.stars)}`;
  el.cauldron.classList.remove('has-liquid');

  // 현재 손님 idx 전진 후, 다음 waiting 손님이 있으면 등장 / 없으면 마감.
  save.today.idx++;
  persist();
  renderHud();

  setTimeout(() => {
    el.customer.classList.remove('sleeping', 'yawning');
    if (loadCurrentCustomer()) {
      // 다음 손님: 결정·변덕 갱신 후 떠오르며 등장 + 말풍선 팝
      customerEnter();
      el.cauldronHint.textContent = '가루를 넣어요';
      game.state = ST.IDLE;
      updateHints();
    } else {
      // 그날 손님 전원 재움 → 불 끄기(마감)
      openClosing();
    }
  }, REDUCED ? 200 : 1400);
}

/* ===================== 마감(불 끄기) — 무압박 정산 시트 ===================== */
function openClosing() {
  // 연속일 +1 (마감 시 1회). closed 플래그로 중복 방지.
  if (!save.today.closed) {
    save.today.closed = true;
    save.streak = (save.streak || 0) + 1;
    persist();
  }
  const t = save.today;
  const healed = t.customers.filter((c) => c.status === 'healed').length;
  el.csHealed.textContent = `${healed} / ${t.customers.length}`;
  el.csStars.textContent = '★ ' + (t.earned || 0);
  el.csStreak.textContent = save.streak + '일';
  el.csSub.textContent = healed >= t.customers.length ? '정령들을 모두 재웠어요.' : '오늘은 여기까지도 충분해요.';
  // 내일 예고 한 줄 — 내일 dateSeed 큐의 첫 손님(가벼운 결정론 예고)
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const nextQ = buildDailyQueue(todaySeed(tomorrow));
  const firstName = CRYSTALS[nextQ[0].crystal].name;
  el.csPreview.textContent = `내일은 '${firstName}'이(가) 찾아올 것 같아요…`;
  el.closingSheet.classList.add('show');
  game.state = ST.SEALING;       // 입력 잠금(시트 위)
}
el.csClose.addEventListener('click', () => {
  el.closingSheet.classList.remove('show');
  // 마감 후: 무대는 잔잔히. 다음날 새로고침 시 새 큐. 지금은 잠든 무대 유지.
  game.state = ST.IDLE;
  el.cauldronHint.textContent = '오늘 영업은 끝났어요';
});

/* ===================== 도감 슬라이드 ===================== */
// 레시피 3종을 데이터 기반으로 슬롯 렌더 — 발견=틴팅 카드 / 미발견=??? 빈 슬롯.
// 잠금 슬롯은 RECIPES 길이 기반으로 짝수 그리드(2열)를 채우는 분량만(하드코딩 5 폐기).
function buildCodex() {
  el.codexShelf.innerHTML = '';
  const ids = Object.keys(RECIPES);
  for (const id of ids) {
    const r = RECIPES[id];
    const entry = save.codex[id];
    const card = document.createElement('div');
    if (entry && entry.discovered) {
      // A: 등급 → 채운 별 수(평범1/좋음2/완벽3) + 테두리 형태 클래스
      const stars = entry.best === '완벽' ? 3 : entry.best === '좋음' ? 2 : 1;
      const gradeClass = entry.best === '완벽' ? 'grade-perfect' : entry.best === '좋음' ? 'grade-good' : 'grade-plain';
      // A: ★☆ 5칸 고정 — 채운 별/빈 별 절대 위치(색 외 형태 구분)
      let starHtml = '';
      for (let i = 0; i < 5; i++) starHtml += i < stars ? '<span class="on">★</span>' : '<span class="off">☆</span>';
      card.className = `codex-card ${gradeClass}`;
      card.innerHTML =
        `<img class="card-potion" src="${r.sprite}" alt="${r.name}" ` +
        `style="filter:drop-shadow(0 2px 6px rgba(0,0,0,.5)) hue-rotate(${r.targetHsl[0] - 30}deg) saturate(1.2);" />` +
        `<div class="card-name">${r.name}</div>` +
        `<div class="card-stars" aria-label="${entry.best} ${stars}/5">${starHtml}</div>` +
        `<div class="card-grade">${entry.best}</div>` +
        `<div class="card-swatch" style="background:${cssHsl(r.targetHsl)}"></div>` +
        `<div class="card-hsl">${cssHsl(r.targetHsl)}</div>`;
    } else {
      card.className = 'codex-card empty';
      card.innerHTML = `<div class="card-q">?</div><div class="card-name" style="opacity:.6">???</div>`;
    }
    el.codexShelf.appendChild(card);
  }
  // "잠든 정령들의 선반" 무드 — 2열 그리드가 비지 않게 잠금 슬롯으로 채움(데이터 길이 기반).
  // 실제 레시피 칸 + 잠금 = 짝수가 되도록(현재 3 → +1=4칸, 다음 줄 여유 +2=6칸).
  const lockCount = (ids.length % 2 === 0 ? 0 : 1) + 2;
  for (let i = 0; i < lockCount; i++) {
    const lock = document.createElement('div');
    lock.className = 'codex-card locked';
    lock.setAttribute('aria-hidden', 'true');
    lock.innerHTML = `<div class="card-zzz">✦</div><div class="card-name" style="opacity:.45">잠든 정령</div>`;
    el.codexShelf.appendChild(lock);
  }
}
let codexOpen = false;
// F(perf §9): will-change는 전환 중에만 부착(상시 금지) — 끝나면 해제
function openCodex() {
  codexOpen = true;
  el.track.style.willChange = 'transform';
  el.track.classList.add('codex-open');
  invalidateRects();
}
function closeCodex() {
  codexOpen = false;
  el.track.style.willChange = 'transform';
  el.track.classList.remove('codex-open');
  invalidateRects();
}
el.track.addEventListener('transitionend', () => { el.track.style.willChange = ''; });
el.codexBook.addEventListener('click', openCodex);
el.codexClose.addEventListener('click', closeCodex);
// 닫기 = 반대 스와이프
let swipeX = null;
el.codexPanel.addEventListener('pointerdown', (e) => { if (codexOpen) swipeX = e.clientX; });
el.codexPanel.addEventListener('pointerup', (e) => {
  if (codexOpen && swipeX !== null && e.clientX - swipeX > 60) closeCodex();
  swipeX = null;
});

/* ===================== 파티클 풀 (단일 rAF, 캡 40) ===================== */
const fx = {
  ctx: el.fxCanvas.getContext('2d'),
  pool: [], active: [], cap: REDUCED ? 0 : 40, raf: 0, w: 0, h: 0, dpr: 1,
};
function fxResize() {
  fx.dpr = Math.min(2, window.devicePixelRatio || 1);
  fx.w = el.fxCanvas.clientWidth; fx.h = el.fxCanvas.clientHeight;
  el.fxCanvas.width = fx.w * fx.dpr; el.fxCanvas.height = fx.h * fx.dpr;
  fx.ctx.setTransform(fx.dpr, 0, 0, fx.dpr, 0, 0);
}
window.addEventListener('resize', fxResize);
function getParticle() {
  return fx.pool.pop() || { x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 2, col: '#fff' };
}
function emit(x, y, n, opt) {
  if (REDUCED) return;
  for (let i = 0; i < n; i++) {
    if (fx.active.length >= fx.cap) break;   // 초과분 드롭
    const p = getParticle();
    const a = Math.random() * Math.PI * 2;
    const sp = (opt.speed || 1) * (0.4 + Math.random());
    p.x = x; p.y = y;
    p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp - (opt.up || 0);
    p.max = p.life = opt.life || 600; p.size = opt.size || 2.5;
    p.col = opt.col || '#fff'; p.g = opt.g || 0.02;
    fx.active.push(p);
  }
  if (!fx.raf) fx.raf = requestAnimationFrame(fxStep);
}
function fxStep(now) {
  fx.raf = 0;
  const last = fxStep._last || now; const dt = Math.min(40, now - last); fxStep._last = now;
  fx.ctx.clearRect(0, 0, fx.w, fx.h);
  for (let i = fx.active.length - 1; i >= 0; i--) {
    const p = fx.active[i];
    p.life -= dt;
    if (p.life <= 0) { fx.active.splice(i, 1); fx.pool.push(p); continue; }
    p.vy += p.g; p.x += p.vx; p.y += p.vy;
    const alpha = p.life / p.max;
    fx.ctx.globalAlpha = alpha;
    fx.ctx.fillStyle = p.col;
    fx.ctx.beginPath();
    fx.ctx.arc(p.x, p.y, p.size * (0.5 + alpha * 0.5), 0, Math.PI * 2);
    fx.ctx.fill();
  }
  fx.ctx.globalAlpha = 1;
  if (fx.active.length) fx.raf = requestAnimationFrame(fxStep);
}
// 좌표 헬퍼(파티clewide 발생 시 1회 rect 읽기 — 이벤트성, 매 프레임 아님)
function centerOf(node) { const r = node.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
// 사각사각 — 진행도 g(0~1)에 따라 양↑·속도↑·크기↑ (점점 강해지는 손맛)
function spawnGrindParticles(g) {
  g = g || 0;
  const c = centerOf(el.mortarBowl);
  const col = game.mortarHerb ? cssHsl(HERBS[game.mortarHerb].hsl) : '#e8d6a8';
  const n = 3 + Math.round(g * 5);                     // 3→8
  emit(c.x, c.y - 6, n, { speed: 1.1 + g * 1.2, up: 0.5 + g * 0.6, life: 420, size: 1.8 + g * 1.2, col: col, g: 0.03 });
}
// 완료 한방 — 가루 무더기가 톡 튀어오름(마무리 도파민)
function spawnGrindFinish() {
  const c = centerOf(el.mortarBowl);
  const col = game.powderReady ? cssHsl(HERBS[game.powderReady].hsl) : '#e8d6a8';
  emit(c.x, c.y - 4, 16, { speed: 2.4, up: 1.6, life: 620, size: 3, col: col, g: 0.05 });
  emit(c.x, c.y - 4, 6, { speed: 1.4, up: 1.0, life: 560, size: 2.4, col: '#fff7e0', g: 0.04 }); // 반짝 섞기
}
function spawnPourParticles() {
  const c = centerOf(el.cauldron);
  emit(c.x, c.y + 20, 14, { speed: 1.6, up: -0.3, life: 700, size: 3, col: cssHsl(game.cauldronHsl || HERBS.moonherb.hsl), g: 0.01 }); // 퐁당 물방울
  // 근접도 높을수록 금빛 별가루 섞임("맞춰가는" 보상)
  const p = colorProximity();
  if (p > 0.5) emit(c.x, c.y + 14, Math.round(p * 8), { speed: 1.2, up: 0.4, life: 820, size: 2.2, col: '#fff2c8', g: -0.004 });
}
// 치유 별가루 — 완벽이면 더 많이/멀리/오래(품질 차등 연출)
function spawnHealParticles(perfect) {
  const c = centerOf(el.cauldron);
  emit(c.x, c.y, 30, { speed: 2.2, up: 1.2, life: 1100, size: 3, col: '#fff7e0', g: -0.005 });
  if (perfect) {
    // 화면 전체로 흩날리는 금빛 별가루 추가 한방
    emit(c.x, c.y, 18, { speed: 3.4, up: 1.6, life: 1500, size: 2.6, col: '#ffe7a3', g: -0.004 });
    emit(c.x, c.y - 10, 10, { speed: 2.0, up: 2.2, life: 1500, size: 3.2, col: '#fff', g: -0.006 });
  }
}

/* ===================== 부팅 ===================== */
function boot() {
  loadCurrentCustomer();   // 큐에서 현재(첫 waiting) 손님 적재 — crystal/recipe/modifier
  buildDrawer();
  renderHud();
  renderCustomer();
  applyLiquid();
  buildCodex();
  fxResize();
  updateHints();      // 첫 행동 안내 점등
  customerEnter();    // 손님 떠오르며 등장 + 말풍선 팝(첫 인상)
  // 무대 컨테이너 touch-action은 CSS에서. 첫 rect 캐시는 첫 pointerdown에.
  // 자동 데모(헤드리스 캡처용): URL ?demo=N 으로 상태 강제
  maybeDemo();
}
// 데모 헬퍼: 레시피 ideal로 가마를 채워 색 무르익은 상태 만들기
function demoFill(recipe) {
  game.added = recipe.ideal.slice();
  game.cauldronHsl = blendHsl(game.added.map((id) => ({ hsl: HERBS[id].hsl, w: HERBS[id].potency })));
  applyLiquid();
}
function maybeDemo() {
  const m = new URLSearchParams(location.search).get('demo');
  if (!m) return;
  if (m === 'grind') { placeHerbInMortar('moonherb'); game.grind = 0.62; el.grindGauge.style.setProperty('--grind', '0.62'); el.mortarRing.style.setProperty('--grind', '0.62'); el.mortarBowl.style.setProperty('--gi', '1.5'); el.mortar.classList.add('grinding', 'has-herb'); }
  if (m === 'color') { demoFill(game.recipe); el.cauldronHint.textContent = '색이 무르익었어요'; updateProximity(); }
  if (m === 'sealed') { demoFill(game.recipe); save.codex[game.recipe.id] = { discovered: true, best: '완벽' }; renderHud(); buildCodex(); el.customer.classList.add('sleeping'); }
  if (m === 'codex') {
    // 도감: 레시피 3종 중 2개 발견(완벽/좋음), 1개 미발견 — 3슬롯 차별 확인용
    const ids = Object.keys(RECIPES);
    save.codex[ids[0]] = { discovered: true, best: '완벽' };
    if (ids[1]) save.codex[ids[1]] = { discovered: true, best: '좋음' };
    renderHud(); buildCodex(); openCodex();
  }
}
boot();
