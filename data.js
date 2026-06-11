// data.js — 「달빛 조제실」 콘텐츠 상수 (§4 데이터 모델 그대로)
// 원칙: 콘텐츠(약초·결정·레시피)는 코드 상수, 세이브는 '진행'만.
// 1차 플레이어블: 결정 3종 × 약초 5종 × 레시피 3개 + 변덕(modifier) + 손님 큐·마감.

// 약초 HERBS — 색 기여는 HSL로(RGB 평균은 죽탕됨). potency 가중평균 재료.
// tags: 변덕(modifier) 판정용 약초 성격 분류('sweet'=달콤, 'cool'=차가움). 2차 슬롯도 겸함.
const HERBS = {
  moonherb:       { id: 'moonherb',       name: '달빛풀',     hsl: [230, 60, 55], potency: 1.0, sprite: 'assets/crops/moonherb.png',       tags: [] },
  still_lavender: { id: 'still_lavender', name: '고요 라벤더', hsl: [270, 45, 60], potency: 1.0, sprite: 'assets/crops/still_lavender.png', tags: ['sweet'] }, // 은은한 단내
  dreambell:      { id: 'dreambell',      name: '꿈종풀',     hsl: [210, 55, 62], potency: 1.0, sprite: 'assets/crops/dreambell.png',      tags: ['sweet'] }, // 종꿀 향
  clarity_moss:   { id: 'clarity_moss',   name: '맑음 이끼',   hsl: [110, 45, 50], potency: 0.9, sprite: 'assets/crops/clarity_moss.png',   tags: ['cool'] }, // 연두 — 서늘
  dew_berry:      { id: 'dew_berry',      name: '이슬 열매',   hsl: [175, 55, 48], potency: 1.1, sprite: 'assets/crops/dew_berry.png',      tags: ['cool', 'sweet'] }, // 청록 — 차고 달콤
};

// 결정 CRYSTALS — 단순 주문서가 아니라 '개입' 슬롯 예약(interfere). 지금은 비워둠.
// sink: 결정별 잠드는 연출 변주(§3 치유 payoff). 'yawn'|'tremble'|'ashfade'.
const CRYSTALS = {
  sleep: {
    id: 'sleep',
    name: '졸린 달',
    silhouette: 'crescent',
    sprite: 'assets/ailment-sleep.png',
    line: '졸린 달이 찾아왔어요…',     // 말풍선 기본 문구
    requester: '여관집 단골이 통 잠을 못 잔대요.', // 의뢰자 한 줄(자산 0, 미니 스토리)
    sink: 'yawn',                       // 하품하며 가라앉음
    interfere: null,                    // 2차: 'shake'|'murk' 등 가마 개입 슬롯 — 지금은 비워둠
  },
  anxiety: {
    id: 'anxiety',
    name: '불안의 그림자',
    silhouette: 'shadow',
    sprite: 'assets/ailment-anxiety.png',
    line: '불안의 그림자가 떨고 있어요…',
    requester: '길드 마스터가 손이 떨린다며 데려왔어요.',
    sink: 'tremble',                    // 떨다 녹아 사라짐
    interfere: null,
  },
  burnout: {
    id: 'burnout',
    name: '다 탄 재',
    silhouette: 'ember',
    sprite: 'assets/ailment-low-battery.png',
    line: '다 탄 재가 식어가고 있어요…',
    requester: '라이벌이 며칠 밤샜다며 슬그머니 왔네요.',
    sink: 'ashfade',                    // 잿빛이 옅어지며 가라앉음
    interfere: null,
  },
};

// 레시피 RECIPES — 결정 종속 + 집합 일치(순서 무시) + 목표색.
// 약초 5종으로 3 레시피가 구분되게 ideal/targetHsl을 갈라 둠.
const RECIPES = {
  potion_calm: {
    id: 'potion_calm',
    name: '안식 포션',
    forCrystal: 'sleep',
    ideal: ['moonherb', 'still_lavender'],   // 보랏빛 진정
    targetHsl: [248, 52, 56],
    sprite: 'assets/reward-potion.png',       // 도감 틴팅으로 레시피별 차별화
  },
  potion_ease: {
    id: 'potion_ease',
    name: '진정 포션',
    forCrystal: 'anxiety',
    ideal: ['dreambell', 'clarity_moss'],     // 파랑+연두 → 청록빛
    targetHsl: [170, 50, 56],
    sprite: 'assets/reward-potion.png',
  },
  potion_warmth: {
    id: 'potion_warmth',
    name: '온기 포션',
    forCrystal: 'burnout',
    ideal: ['dew_berry', 'moonherb'],         // 청록+달빛 → 서늘한 회복
    targetHsl: [200, 55, 54],
    sprite: 'assets/reward-potion.png',
  },
};

// 결정 → 레시피 역인덱스(손님이 원하는 포션 찾기용)
const RECIPE_BY_CRYSTAL = {};
for (const key in RECIPES) {
  RECIPE_BY_CRYSTAL[RECIPES[key].forCrystal] = RECIPES[key];
}

// 변덕 요구 MODIFIERS (★1차 필수) — 품질식에 가/감점으로 반영(§4: + 변덕 충족 가/감점).
// check(state) → true=충족(+보너스), false=미충족(-감점). 충족 가능 시점은 봉인 직전 평가.
//   state = { added:[herbId...], grindStrength:0~1, pourCount:int }
//   bonus: 충족 시 quality 가산, penalty: 미충족 시 감산(절대값).
const MODIFIERS = {
  sweet: {
    id: 'sweet',
    label: '조금 달게',
    line: '오늘은 조금 달게 해주세요.',
    bonus: 0.10, penalty: 0.08,
    // 달콤 약초(tags에 'sweet') 1개 이상 포함 시 충족
    check: (s) => s.added.some((id) => HERBS[id] && HERBS[id].tags.includes('sweet')),
  },
  cold: {
    id: 'cold',
    label: '차갑게',
    line: '차갑게 식혀 주세요.',
    bonus: 0.10, penalty: 0.08,
    // 차가움 약초(tags에 'cool': 맑음 이끼·이슬 열매) 1개 이상 포함 시 충족.
    // (빻기 약화는 §5의 100% 게이팅 유지를 위해 2차 — 지금은 '차가운 약초'로 결정론 충족)
    check: (s) => s.added.some((id) => HERBS[id] && HERBS[id].tags.includes('cool')),
  },
  quick: {
    id: 'quick',
    label: '3번 안에',
    line: '재료는 세 번 안에 끝내주세요.',
    bonus: 0.10, penalty: 0.08,
    // 가마에 넣은 재료 수 ≤ 3 충족
    check: (s) => s.pourCount <= 3,
  },
};
const MODIFIER_IDS = Object.keys(MODIFIERS);
const CRYSTAL_IDS = Object.keys(CRYSTALS);

// 세이브 스키마 기본값 (단일 키 moonlit.save.v1, §4)
const SAVE_KEY = 'moonlit.save.v1';
function defaultSave() {
  return {
    v: 1,
    lv: 1,
    exp: 0,
    starCandy: 0,
    streak: 0,
    codex: {},          // { potion_calm: { discovered:true, best:'완벽' } } — 영속
    // today: 그날의 손님 큐(결정+변덕은 dateSeed로 결정론 배정). closed=마감 여부.
    today: { dateSeed: null, customers: [], idx: 0, closed: false },
    inventory: { moonherb: 6, still_lavender: 6, dreambell: 6, clarity_moss: 6, dew_berry: 6 },
    settings: { reduced: false },
  };
}

// 등급 라벨(§4 품질식) — 색만으로 구분 금지: 별 개수 + 라벨 병기.
const GRADES = [
  { min: 0.85, stars: 3, label: '완벽' },
  { min: 0.50, stars: 2, label: '좋음' },
  { min: 0.0,  stars: 1, label: '평범' },
];
function gradeFor(quality) {
  for (const g of GRADES) if (quality >= g.min) return g;
  return GRADES[GRADES.length - 1];
}

// ===== dateSeed 결정론 유틸 (같은 날 새로고침 = 동일 큐) =====
// 오늘 날짜 문자열(YYYYMMDD)을 정수 seed로.
function todaySeed(now) {
  const d = now || new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}
// mulberry32 — 작은 결정론 PRNG. seed 같으면 수열 동일.
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// 하루 손님 큐 생성 — 2~3명, 결정+변덕을 dateSeed로 결정론 배정.
function buildDailyQueue(seed) {
  const rng = makeRng(seed);
  const count = 2 + Math.floor(rng() * 2); // 2 또는 3명
  const customers = [];
  for (let i = 0; i < count; i++) {
    const crystalId = CRYSTAL_IDS[Math.floor(rng() * CRYSTAL_IDS.length)];
    const modifierId = MODIFIER_IDS[Math.floor(rng() * MODIFIER_IDS.length)];
    const recipe = RECIPE_BY_CRYSTAL[crystalId];
    customers.push({ crystal: crystalId, recipe: recipe.id, modifier: modifierId, status: 'waiting' });
  }
  return customers;
}
