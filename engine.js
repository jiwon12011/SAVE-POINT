/* SAVE POINT — 규칙 엔진 (순수 함수)
 * 브라우저(window.Engine)·Node(module.exports) 양쪽에서 사용.
 * 기획 §2-2 기준: energy 0~9 단일 척도. all_max 는 energy 임계가 아니라 스탯으로 판정(감사 #1 해소).
 */
(function (root) {
  "use strict";

  // 상태이상 마스터(체크인 표시용). 제공된 아이콘에 맞춰 정의 + severe/npcSignal 의미 부여.
  // (docs/data/ailments.json 과 의미 동기화 — 아이콘 세트 기준으로 정렬)
  var AILMENTS = [
    { id: "sleep_deprivation",     name: "수면 부족",   icon: "ailment-sleep",        severe: true,  npcSignal: null },
    { id: "deadline_fear",         name: "마감 공포",   icon: "ailment-deadline",     severe: true,  npcSignal: null },
    { id: "escapism",              name: "현실 도피",   icon: "ailment-escape",       severe: true,  npcSignal: null },
    { id: "caffeine_overload",     name: "카페인 과다", icon: "ailment-caffeine",     severe: false, npcSignal: null },
    { id: "focus_lost",            name: "집중력 실종", icon: "ailment-focus",        severe: false, npcSignal: null },
    { id: "notification_overload", name: "알림 과부하", icon: "ailment-notification", severe: false, npcSignal: null },
    { id: "decision_paralysis",    name: "결정 장애",   icon: "ailment-decision",     severe: false, npcSignal: "decision" },
    { id: "anxiety",               name: "불안",        icon: "ailment-anxiety",      severe: false, npcSignal: "emotional" },
    { id: "burnout",               name: "번아웃",      icon: "ailment-low-battery",  severe: false, npcSignal: "emotional" },
    { id: "social_drain",          name: "사람에 지침", icon: "ailment-social",       severe: false, npcSignal: "emotional" },
    { id: "hunger",                name: "허기",        icon: "ailment-hunger",       severe: false, npcSignal: null },
    { id: "messy_room",            name: "어질러진 방", icon: "ailment-messy-room",   severe: false, npcSignal: null }
  ];
  var AILMENT_BY_ID = {};
  AILMENTS.forEach(function (a) { AILMENT_BY_ID[a.id] = a; });

  // 스탯 단계(1~4) → 점수(0~3)
  function scoreOf(level) { return Math.max(0, Math.min(3, level - 1)); }

  // 차감 계산 (기획 §2-2)
  function deduction(ailmentIds) {
    var d = 0;
    ailmentIds.forEach(function (id) {
      d += 0.5;
      var a = AILMENT_BY_ID[id];
      if (a && a.severe) d += 0.5;
    });
    if (ailmentIds.length >= 3) d += 1.0;
    return Math.min(4.0, d);
  }

  // energy(0~9) → 모드
  function modeOf(energy) {
    if (energy < 2.1) return "survival";
    if (energy < 4.6) return "easy";
    if (energy < 7.1) return "normal";
    return "challenge";
  }

  function titleOf(mode, ailmentIds) {
    if (mode === "survival") {
      if (ailmentIds.indexOf("deadline_fear") >= 0) return "마감 직전 생존자";
      if (ailmentIds.indexOf("sleep_deprivation") >= 0) return "침대와 동맹한 용사";
      return "오늘을 버티는 자";
    }
    if (mode === "easy") return "쉬어가는 여행자";
    if (mode === "normal") return "꾸준한 모험가";
    return "정면돌파자";
  }

  // 추천 NPC (MVP 2종 확정판, NPC-반응규칙 §1-2)
  function recommendNpc(mode, hp, ailmentIds) {
    if (mode === "survival" || hp === 1) return { npc: "healer", reason: "survival_hp_crisis" };
    if (ailmentIds.indexOf("decision_paralysis") >= 0) return { npc: "healer", reason: "decision_paralysis" };
    var hasEmotional = ailmentIds.some(function (id) {
      var a = AILMENT_BY_ID[id]; return a && a.npcSignal === "emotional";
    });
    if (hasEmotional) return { npc: "healer", reason: "emotional_care" };
    if (mode === "easy") return { npc: "innkeeper", reason: "easy_rest" };
    if (mode === "normal") return { npc: "innkeeper", reason: "normal_routine" };
    if (mode === "challenge") return { npc: "innkeeper", reason: "challenge_support" };
    return { npc: "innkeeper", reason: "default" };
  }

  // 표정 슬롯 (NPC-반응규칙 §2)
  function expressionOf(ctx) {
    if (ctx.gapDays >= 7) return "joy";
    if (ctx.consecutiveSurvival >= 3) return "comfort";
    if (ctx.mode === "survival" || ctx.hp === 1) return "comfort";
    if (ctx.allMax) return "cheer";
    if (ctx.mode === "challenge") return "cheer";
    if (ctx.mode === "easy") return "relax";
    return "default";
  }

  // 대사 카테고리 (NPC-반응규칙 §3-2) + categoryResolution
  var CATEGORY_RESOLUTION = { decision_help: "survival_comfort", all_max_praise: "challenge_cheer", generic: "normal_routine" };
  function categoryOf(ctx) {
    var cat;
    if (ctx.gapDays >= 7) cat = "comeback";
    else if (ctx.consecutiveSurvival >= 3) cat = "apathy_intervene";
    else if (ctx.isFirstTime) cat = "first_welcome";
    else if (ctx.mode === "survival" || ctx.hp === 1) cat = "survival_comfort";
    else if (ctx.ailmentIds.indexOf("decision_paralysis") >= 0) cat = "decision_help";
    else if (ctx.allMax) cat = "all_max_praise";
    else if (ctx.mode === "challenge") cat = "challenge_cheer";
    else if (ctx.mode === "easy") cat = "easy_rest";
    else if (ctx.mode === "normal") cat = "normal_routine";
    else cat = "generic";
    return cat;
  }

  // 핵심: 체크인 → 상태 결과
  function computeStatus(checkin) {
    var hp = checkin.hp, mp = checkin.mp, focus = checkin.focus;
    var ailmentIds = checkin.ailments || [];
    var base = scoreOf(hp) + scoreOf(mp) + scoreOf(focus);
    var energy = Math.max(0, base - deduction(ailmentIds));
    var mode = modeOf(energy);
    var allMax = hp === 4 && mp === 4 && focus === 4;
    var rec = recommendNpc(mode, hp, ailmentIds);
    var ctx = {
      mode: mode, hp: hp, allMax: allMax, ailmentIds: ailmentIds,
      gapDays: checkin.gapDays || 0, consecutiveSurvival: checkin.consecutiveSurvival || 0,
      isFirstTime: !!checkin.isFirstTime
    };
    return {
      energy: Math.round(energy * 10) / 10,
      base: base,
      mode: mode,
      allMax: allMax,
      title: titleOf(mode, ailmentIds),
      recommendedNpc: rec.npc,
      reason: rec.reason,
      expression: expressionOf(ctx),
      category: categoryOf(ctx)
    };
  }

  function resolveCategory(npcDialogues, npc, category) {
    var pool = npcDialogues[npc] || {};
    if (pool[category] && pool[category].length) return category;
    var alt = CATEGORY_RESOLUTION[category];
    if (alt && pool[alt] && pool[alt].length) return alt;
    return pool.survival_comfort && pool.survival_comfort.length ? "survival_comfort" : "generic";
  }

  // 대사 1개 선택 (결정론적)
  function pickDialogue(data, npc, category, seed) {
    var resolved = resolveCategory(data.dialogues, npc, category);
    var pool = (data.dialogues[npc] && data.dialogues[npc][resolved]) || [];
    if (!pool.length) return "";
    var idx = Math.abs(seed || 0) % pool.length;
    return pool[idx];
  }

  // 퀘스트 슬롯 생성 (fallback-quests.json + 토큰 치환)
  function buildQuests(questData, mode, boss, seed) {
    var params = questData.modeParams[mode];
    var t = questData.templates[mode];
    var timeBox = params.timeBoxMin;
    var hasBoss = !!(boss && boss.trim());
    var s = Math.abs(seed || 0);

    function sub(str) {
      return str.replace(/\{boss\}/g, hasBoss ? boss.trim() : "오늘의 일")
                .replace(/\{time_box\}/g, timeBox);
    }
    function take(pool, n, offset) {
      var out = [], len = pool.length;
      if (!len) return out;
      for (var i = 0; i < n; i++) out.push(pool[(s + offset + i) % len]);
      return out;
    }
    var mainPool = hasBoss ? t.main_with_boss : t.main_no_boss;
    var fbPool = t.forbidden.filter(function (f) { return hasBoss || !f.needsBoss; });

    function fmt(items) {
      return items.map(function (it) { return { title: sub(it.title), flavor: sub(it.flavor || "") }; });
    }
    return {
      params: params,
      timeBox: timeBox,
      main: fmt(take(mainPool, params.main, 0)),
      sub: fmt(take(t.sub, params.sub, 3)),
      forbidden: fmt(take(fbPool, params.forbidden, 7))
    };
  }

  var Engine = {
    AILMENTS: AILMENTS,
    scoreOf: scoreOf,
    deduction: deduction,
    modeOf: modeOf,
    computeStatus: computeStatus,
    pickDialogue: pickDialogue,
    buildQuests: buildQuests,
    CATEGORY_RESOLUTION: CATEGORY_RESOLUTION
  };

  if (typeof module !== "undefined" && module.exports) module.exports = Engine;
  else root.Engine = Engine;
})(typeof window !== "undefined" ? window : this);
