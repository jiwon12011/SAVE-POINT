/* SAVE POINT — 프로토타입 앱 로직 (P0)
 * 체크인 → 규칙엔진(engine.js) → 상태창 · 퀘스트 · NPC 대사 · 세이브 를 데이터로 구동.
 */
(function () {
  "use strict";

  var state = {
    data: { quests: null, dialogue: null },
    checkin: { hp: null, mp: null, focus: null, ailments: [], boss: "포트폴리오 정리" },
    status: null,
    quests: null,
    npc: "healer",
    completed: {},
    streak: 4,
    stardust: 0
  };

  var DEFAULT_CHECKIN = {
    hp: 2, mp: 1, focus: 2,
    ailments: ["sleep_deprivation", "deadline_fear", "notification_overload"],
    boss: "포트폴리오 정리"
  };

  var MODE_LABEL = { survival: "Survival", easy: "Easy", normal: "Normal", challenge: "Challenge" };
  var MODE_COPY = {
    survival: "HP와 MP가 낮은 날입니다. 오늘의 목표는 완성이 아니라, 다시 켤 수 있게 남겨두는 것.",
    easy: "여유가 조금 있는 날. 가볍게 한 걸음만 떼도 충분해요.",
    normal: "평범한 하루. 본업 한 블록이면 오늘의 몫은 충분합니다.",
    challenge: "컨디션이 좋은 날. 오늘은 보스를 정면으로 마주해도 좋아요."
  };
  var NPC_NAME = { healer: "힐러", innkeeper: "여관주인", guildmaster: "길드마스터", rival: "라이벌", wizard: "마법사" };
  var REASON_COPY = {
    survival_hp_crisis: "지금은 회복이 먼저예요",
    decision_paralysis: "선택이 어려울 땐 함께 정리해요",
    emotional_care: "마음이 무거워 보여요",
    easy_rest: "가볍게 쉬어가기 좋은 날",
    normal_routine: "오늘 루틴을 함께 점검해요",
    challenge_support: "도전하는 당신을 받쳐줄게요",
    default: "오늘을 함께할게요"
  };
  // 보유한 표정 스프라이트 (없으면 폴백)
  var SPRITES = {
    healer: ["default", "comfort", "joy", "cheer", "relax", "embrace"],
    innkeeper: ["default", "comfort", "joy", "relax", "welcome", "serving"], // cheer 없음 → joy 폴백
    guildmaster: ["default", "comfort", "joy", "cheer", "relax", "strategy"],
    rival: ["default", "comfort", "joy", "cheer", "relax", "protect"],
    wizard: ["default", "comfort", "joy", "cheer", "relax", "thinking"]
  };

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  /* ---------- 뷰 전환 ---------- */
  function setView(name) {
    $$("[data-view]").forEach(function (v) { v.classList.toggle("active-view", v.dataset.view === name); });
    $$(".bottom-nav [data-go]").forEach(function (b) { b.classList.toggle("active", b.dataset.go === name); });
    $(".phone").className = "phone view-" + name;
    if (name === "npc") startDialogue(state.npc);
  }

  /* ---------- 스프라이트 폴백 ---------- */
  function npcSprite(npc, expr) {
    var have = SPRITES[npc] || ["default"];
    var e = expr;
    if (have.indexOf(e) < 0) {
      if (e === "cheer" && have.indexOf("joy") >= 0) e = "joy";
      else e = "default";
    }
    return "assets/" + npc + "-" + e + ".png";
  }

  /* ---------- 렌더: 상태창 ---------- */
  function renderStatus() {
    var s = state.status, c = state.checkin;
    $("#st-mode").textContent = MODE_LABEL[s.mode];
    $("#st-title").textContent = s.title;
    $("#st-copy").textContent = MODE_COPY[s.mode];
    function meter(id, lvl) {
      $("#st-" + id + "-bar").style.width = (lvl / 4 * 100) + "%";
      $("#st-" + id + "-val").textContent = lvl + "/4";
    }
    meter("hp", c.hp); meter("mp", c.mp); meter("focus", c.focus);

    var box = $("#st-ailments");
    box.innerHTML = "";
    if (!c.ailments.length) {
      box.innerHTML = '<span class="ghost">상태이상 없음 ✨</span>';
    } else {
      c.ailments.forEach(function (id) {
        var a = byId(id); if (!a) return;
        var el = document.createElement("span");
        el.innerHTML = '<img src="assets/' + a.icon + '.png" alt="" />' + a.name;
        box.appendChild(el);
      });
    }
  }

  function byId(id) {
    var list = window.Engine.AILMENTS;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /* ---------- 렌더: 퀘스트 ---------- */
  function renderQuests() {
    var q = state.quests, list = $("#quest-list");
    list.innerHTML = "";
    state.completed = {};
    var total = 0;

    q.main.forEach(function (it, i) { addQuest(list, "main", "MAIN · " + q.timeBox + "분", it, "m" + i); total++; });
    q.sub.forEach(function (it, i) { addQuest(list, "sub", "SUB", it, "s" + i); total++; });
    q.forbidden.forEach(function (it, i) { addQuest(list, "forbid", "FORBIDDEN", it, "f" + i); });
    if (state.checkin.boss && state.checkin.boss.trim()) {
      var card = document.createElement("article");
      card.className = "quest-card boss";
      card.innerHTML = '<img src="assets/icon-boss.png" alt="" /><small>TODAY\'S BOSS</small><h3>' +
        esc(state.checkin.boss.trim()) + "</h3>";
      list.appendChild(card);
    }
    state.questTotal = total;
    updateQuestCount();
  }

  function addQuest(list, kind, label, it, key) {
    var card = document.createElement("article");
    card.className = "quest-card " + (kind === "main" ? "main-quest" : kind === "forbid" ? "forbid" : "sub-quest");
    var icon = kind === "forbid" ? "icon-forbidden" : kind === "main" ? "icon-quest" : "icon-star-candy";
    card.innerHTML = '<img src="assets/' + icon + '.png" alt="" /><small>' + label + "</small><h3>" +
      esc(it.title) + "</h3>" + (it.flavor ? "<p>" + esc(it.flavor) + "</p>" : "");
    if (kind !== "forbid") {
      card.classList.add("checkable");
      card.addEventListener("click", function () {
        state.completed[key] = !state.completed[key];
        card.classList.toggle("done", state.completed[key]);
        updateQuestCount();
      });
    }
    list.appendChild(card);
  }

  function completedCount() {
    var n = 0; for (var k in state.completed) if (state.completed[k]) n++; return n;
  }
  function updateQuestCount() {
    $("#quest-count").textContent = completedCount() + "/" + state.questTotal;
  }

  /* ---------- NPC 대화 장면 (RPG 대화창) ---------- */
  var DIAGNOSIS = {
    survival: "오늘은 거의 방전된 날이네요. 완성보다 회복이 먼저예요.",
    easy: "여유가 조금 있는 날이에요. 가볍게 한 걸음이면 충분해요.",
    normal: "무난한 하루네요. 본업 한 블록이면 오늘 몫은 충분해요.",
    challenge: "컨디션이 좋아 보여요. 오늘은 정면으로 부딪쳐도 좋아요."
  };
  var HANDOFF = {
    healer: "오늘의 퀘스트, 아주 작게 준비했어요. 받아볼래요? ▼",
    innkeeper: "오늘 할 만한 것만 골라뒀어요. 보러 갈까요? ▼"
  };
  var REDUCED = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var dlg = { lines: [], idx: 0, typing: false, timer: null, full: "" };

  function buildScript(npc) {
    var s = state.status, c = state.checkin;
    var diag = DIAGNOSIS[s.mode] + "\n(HP " + c.hp + "/4 · MP " + c.mp + "/4 · 집중 " + c.focus + "/4)";
    var seed = s.base + c.ailments.length;
    var warm = window.Engine.pickDialogue({ dialogues: state.data.dialogue.dialogues }, npc, s.category, seed);
    var hand = HANDOFF[npc] || "오늘의 퀘스트를 정리해뒀어요. 받아볼래요? ▼";
    return [diag, warm, hand];
  }

  function startDialogue(npc) {
    state.npc = npc || state.npc || (state.status && state.status.recommendedNpc) || "healer";
    npc = state.npc;
    var s = state.status;
    $("#npc-sprite").src = npcSprite(npc, s ? s.expression : "default");
    $("#npc-sprite").className = "npc-portrait " + npc;
    $("#npc-name").textContent = NPC_NAME[npc];
    $$("#npc-list .npc-card").forEach(function (b) { b.classList.toggle("selected", b.dataset.npc === npc); });
    dlg.lines = s ? buildScript(npc) : ["..."];
    dlg.idx = 0;
    typeLine(dlg.lines[0]);
  }

  function typeLine(text) {
    var el = $("#npc-speech"), arrow = $("#next-arrow");
    dlg.full = text;
    clearInterval(dlg.timer);
    arrow.classList.remove("ready");
    if (REDUCED) { el.textContent = text; dlg.typing = false; arrow.classList.add("ready"); return; }
    el.textContent = "";
    dlg.typing = true;
    var i = 0;
    dlg.timer = setInterval(function () {
      el.textContent = dlg.full.slice(0, ++i);
      if (i >= dlg.full.length) { clearInterval(dlg.timer); dlg.typing = false; arrow.classList.add("ready"); }
    }, 26);
  }

  function advanceDialogue() {
    if (dlg.typing) {
      clearInterval(dlg.timer);
      $("#npc-speech").textContent = dlg.full;
      dlg.typing = false;
      $("#next-arrow").classList.add("ready");
      return;
    }
    if (dlg.idx < dlg.lines.length - 1) { dlg.idx++; typeLine(dlg.lines[dlg.idx]); }
    else { setView("quest"); }
  }

  /* ---------- 체크인 적용 ---------- */
  function applyCheckin(c) {
    state.checkin = { hp: c.hp, mp: c.mp, focus: c.focus, ailments: c.ailments.slice(), boss: c.boss };
    state.status = window.Engine.computeStatus(state.checkin);
    state.quests = window.Engine.buildQuests(
      state.data.quests, state.status.mode, state.checkin.boss, state.status.base + state.checkin.ailments.length
    );
    renderStatus();
    renderQuests();
    state.npc = state.status.recommendedNpc;
  }

  /* ---------- 세이브 ---------- */
  function doSave() {
    var done = completedCount();
    var gained = 10 + done * 5;
    state.stardust += gained;
    state.streak += 1;
    $("#save-stardust").textContent = "별사탕 +" + gained;
    $("#save-streak").textContent = "연속 " + state.streak + "일";
    $("#streak-line").textContent = "연속 세이브 " + state.streak + "일";
    $("#save-copy").textContent = done === 0
      ? "퀘스트 클리어가 없어도 이 기록은 사라지지 않아요. 오늘도 저장했어요."
      : done + "개의 퀘스트를 완료했어요. 좋은 하루였네요.";
  }

  /* ---------- 체크인 화면 입력 ---------- */
  function buildAilmentChips() {
    var wrap = $("#ailment-chips");
    window.Engine.AILMENTS.forEach(function (a) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.dataset.id = a.id;
      btn.innerHTML = '<img src="assets/' + a.icon + '.png" alt="" />' + a.name;
      btn.addEventListener("click", function () {
        btn.classList.toggle("on");
        refreshSaveEnabled();
      });
      wrap.appendChild(btn);
    });
  }

  function refreshSaveEnabled() {
    var hp = $('.stat-pick[data-stat="hp"] .sel');
    var mp = $('.stat-pick[data-stat="mp"] .sel');
    var fo = $('.stat-pick[data-stat="focus"] .sel');
    $("#checkin-save").disabled = !(hp && mp && fo);
  }

  function readCheckinForm() {
    function lvl(stat) {
      var b = $('.stat-pick[data-stat="' + stat + '"] .sel');
      return b ? parseInt(b.dataset.level, 10) : 2;
    }
    var ail = $$("#ailment-chips .chip.on").map(function (b) { return b.dataset.id; });
    return { hp: lvl("hp"), mp: lvl("mp"), focus: lvl("focus"), ailments: ail, boss: $("#boss-input").value };
  }

  /* ---------- init ---------- */
  function wire() {
    // 스탯 선택
    $$(".stat-pick[data-stat] .level-row button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var row = btn.parentNode;
        Array.prototype.forEach.call(row.children, function (c) { c.classList.remove("sel"); });
        btn.classList.add("sel");
        refreshSaveEnabled();
      });
    });
    // 네비/이동 버튼
    $$("[data-go]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (b.id === "checkin-save") applyCheckin(readCheckinForm());
        if (b.dataset.go === "save") doSave();
        setView(b.dataset.go);
      });
    });
    // NPC 전환 (대화 다시 시작)
    $$("#npc-list .npc-card[data-npc]").forEach(function (b) {
      b.addEventListener("click", function () { startDialogue(b.dataset.npc); });
    });
    // 대화창 탭 → 다음 대사 (타이핑 중이면 즉시 완성)
    var box = $("#dialogue-box");
    if (box) {
      box.addEventListener("click", advanceDialogue);
      box.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); advanceDialogue(); }
      });
    }
  }

  function init() {
    // 이벤트 연결은 데이터와 무관하게 항상 먼저 — 데이터가 없어도 네비게이션은 살아있게.
    buildAilmentChips();
    wire();

    function useData(quests, dialogue) {
      state.data.quests = quests;
      state.data.dialogue = dialogue;
      applyCheckin(DEFAULT_CHECKIN);
    }

    // 1순위: 임베드된 data.js (file:// 에서도 동작, 서버 불필요)
    if (window.SAVEPOINT_DATA) {
      useData(window.SAVEPOINT_DATA.quests, window.SAVEPOINT_DATA.dialogue);
      return;
    }
    // 폴백: 서버로 띄운 경우 docs/data 에서 fetch
    Promise.all([
      fetch("docs/data/fallback-quests.json").then(function (r) { return r.json(); }),
      fetch("docs/data/fallback-dialogue.json").then(function (r) { return r.json(); })
    ]).then(function (res) { useData(res[0], res[1]); })
      .catch(function (e) { console.error("데이터 로드 실패 — data.js 확인:", e); });
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (m) {
    return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[m];
  }); }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
