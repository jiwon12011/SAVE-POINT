/* SAVE POINT — 프로토타입 앱 로직 (P0)
 * 홈 = NPC가 배경에 서 있는 내 공간(탭하면 대화). 체크인·상태창·퀘스트·세이브 = 버튼으로 뜨는 팝업(모달).
 */
(function () {
  "use strict";

  var state = {
    data: { quests: null, dialogue: null },
    checkin: { hp: null, mp: null, focus: null, ailments: [], boss: "포트폴리오 정리" },
    status: null, quests: null, npc: "healer",
    completed: {}, rewardedKeys: {}, questTotal: 0,
    streak: 4, stardust: 0, level: 7, xp: 40, xpMax: 100,
    badges: {}, completedEver: 0, npcMet: {}
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
  var DIAGNOSIS = {
    survival: "오늘은 거의 방전된 날이네요. 완성보다 회복이 먼저예요.",
    easy: "여유가 조금 있는 날이에요. 가볍게 한 걸음이면 충분해요.",
    normal: "무난한 하루네요. 본업 한 블록이면 오늘 몫은 충분해요.",
    challenge: "컨디션이 좋아 보여요. 오늘은 정면으로 부딪쳐도 좋아요."
  };
  var NPC_NAME = { healer: "힐러", innkeeper: "여관주인", guildmaster: "길드마스터", rival: "라이벌", wizard: "마법사" };
  var SPRITES = {
    healer: ["default", "comfort", "joy", "cheer", "relax", "embrace"],
    innkeeper: ["default", "comfort", "joy", "relax", "welcome", "serving"],
    guildmaster: ["default", "comfort", "joy", "cheer", "relax", "strategy"],
    rival: ["default", "comfort", "joy", "cheer", "relax", "protect"],
    wizard: ["default", "comfort", "joy", "cheer", "relax", "thinking"]
  };
  var REDUCED = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var BADGES = [
    { id: "first-save", name: "첫 세이브" },
    { id: "no-zero-day", name: "포기하지 않은 자" },
    { id: "survival-day", name: "버티는 자" },
    { id: "comeback", name: "돌아온 모험가" },
    { id: "boss-crown", name: "정면돌파자" },
    { id: "seven-day", name: "7일 생존자" },
    { id: "sleep-recovery", name: "침대와 동맹한 용사" },
    { id: "focus-spark", name: "집중의 불씨" },
    { id: "tea-break", name: "차 한 잔의 여유" },
    { id: "gentle-warrior", name: "다정한 전사" },
    { id: "room-key", name: "여관의 단골" },
    { id: "star-candy-collector", name: "별사탕 수집가" }
  ];

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (m) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[m]; }); }
  function byId(id) { var l = window.Engine.AILMENTS; for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }

  function npcSprite(npc, expr) {
    var have = SPRITES[npc] || ["default"];
    var e = expr;
    if (have.indexOf(e) < 0) e = (e === "cheer" && have.indexOf("joy") >= 0) ? "joy" : "default";
    return "assets/" + npc + "-" + e + ".png";
  }

  /* ---------- HUD: 레벨/EXP/별사탕 + 보상 연출 ---------- */
  function updateHud() {
    $("#hud-lv").textContent = "Lv." + state.level;
    $("#hud-xp").style.width = (state.xp / state.xpMax * 100) + "%";
    $("#hud-stardust").textContent = state.stardust;
  }
  function gainXp(n) {
    state.xp += n;
    var leveled = false;
    while (state.xp >= state.xpMax) { state.xp -= state.xpMax; state.level += 1; state.xpMax += 20; leveled = true; }
    updateHud();
    if (leveled) { var chip = $("#lv-chip"); chip.classList.remove("pop"); void chip.offsetWidth; chip.classList.add("pop"); }
    return leveled;
  }
  function floatReward(anchor, text) {
    if (REDUCED || !anchor) return;
    var phone = $(".phone"); if (!phone) return;
    var pr = phone.getBoundingClientRect(), ar = anchor.getBoundingClientRect();
    var el = document.createElement("div");
    el.className = "float-reward"; el.textContent = text;
    el.style.left = (ar.left - pr.left + ar.width / 2) + "px";
    el.style.top = (ar.top - pr.top + 8) + "px";
    phone.appendChild(el);
    setTimeout(function () { el.parentNode && el.parentNode.removeChild(el); }, 950);
  }
  function unlockBadges(done) {
    var b = state.badges, s = state.status;
    b["first-save"] = true; b["tea-break"] = true;
    if (done === 0) b["no-zero-day"] = true;
    if (s && s.mode === "survival") b["survival-day"] = true;
    if (s && s.mode === "challenge") b["boss-crown"] = true;
    if (state.streak >= 7) b["seven-day"] = true;
    if (state.checkin.ailments.indexOf("sleep_deprivation") >= 0) b["sleep-recovery"] = true;
    if (state.checkin.ailments.indexOf("focus_lost") >= 0) b["focus-spark"] = true;
    if (state.stardust >= 50) b["star-candy-collector"] = true;
  }

  /* ---------- 모달 ---------- */
  function setNav(name) {
    $$(".bottom-nav [data-open]").forEach(function (b) { b.classList.toggle("active", b.dataset.open === name); });
  }
  function openModal(name) {
    if (name === "home") { closeModal(); return; }
    if (name === "status") renderStatus();
    if (name === "quest") renderQuests();
    if (name === "records") renderRecords();
    if (name === "save") doSave();
    $("#modal-layer").hidden = false;
    $$(".modal").forEach(function (m) { m.classList.toggle("show", m.id === "modal-" + name); });
    setNav(name);
  }
  function closeModal() {
    $("#modal-layer").hidden = true;
    $$(".modal").forEach(function (m) { m.classList.remove("show"); });
    setNav("home");
  }

  /* ---------- 홈 NPC ---------- */
  var homeLines = [], homeIdx = 0, homeType = { timer: null, full: "", typing: false };

  function buildHomeLines(npc) {
    var s = state.status, c = state.checkin;
    var diag = DIAGNOSIS[s.mode] + " (HP " + c.hp + "/4 · MP " + c.mp + "/4 · 집중 " + c.focus + "/4)";
    var warm = window.Engine.pickDialogue({ dialogues: state.data.dialogue.dialogues }, npc, s.category, s.base + c.ailments.length);
    // 대사마다 어울리는 표정: 진단=상태표정 → 위로=comfort/cheer → 마무리=relax/joy
    return [
      { text: diag, expr: s.expression },
      { text: warm, expr: s.mode === "challenge" ? "cheer" : "comfort" },
      { text: "오늘의 퀘스트는 아래 버튼에서 받을 수 있어요. 천천히 와요.", expr: s.mode === "survival" ? "relax" : "joy" }
    ];
  }
  function setHomeSprite(expr) {
    $("#home-npc").src = npcSprite(state.npc, expr);
    $("#home-npc").className = "home-npc " + state.npc;
  }
  function updateHome() {
    var s = state.status;
    $("#home-npc-name").textContent = NPC_NAME[state.npc];
    homeLines = s ? buildHomeLines(state.npc) : [{ text: "안녕하세요. 오늘 체크인부터 해볼까요?", expr: "default" }];
    homeIdx = 0;
    setHomeSprite(homeLines[0].expr);
    typeInto($("#home-speech"), homeLines[0].text);
  }
  function typeInto(el, text) {
    homeType.full = text; clearInterval(homeType.timer);
    if (REDUCED) { el.textContent = text; homeType.typing = false; return; }
    el.textContent = ""; homeType.typing = true; var i = 0;
    homeType.timer = setInterval(function () {
      el.textContent = homeType.full.slice(0, ++i);
      if (i >= homeType.full.length) { clearInterval(homeType.timer); homeType.typing = false; }
    }, 24);
  }
  function homeTalk() {
    if (homeType.typing) { clearInterval(homeType.timer); $("#home-speech").textContent = homeType.full; homeType.typing = false; return; }
    if (!homeLines.length) return;
    homeIdx = (homeIdx + 1) % homeLines.length;
    setHomeSprite(homeLines[homeIdx].expr);
    typeInto($("#home-speech"), homeLines[homeIdx].text);
  }

  /* ---------- 렌더: 상태창 ---------- */
  function renderStatus() {
    var s = state.status, c = state.checkin;
    if (!s) return;
    $("#st-mode").textContent = MODE_LABEL[s.mode];
    $("#st-title").textContent = s.title;
    $("#st-copy").textContent = MODE_COPY[s.mode];
    function meter(id, lvl) { $("#st-" + id + "-bar").style.width = (lvl / 4 * 100) + "%"; $("#st-" + id + "-val").textContent = lvl + "/4"; }
    meter("hp", c.hp); meter("mp", c.mp); meter("focus", c.focus);
    var box = $("#st-ailments"); box.innerHTML = "";
    if (!c.ailments.length) { box.innerHTML = '<span class="ghost">상태이상 없음 ✨</span>'; return; }
    c.ailments.forEach(function (id) {
      var a = byId(id); if (!a) return;
      var el = document.createElement("span");
      el.innerHTML = '<img src="assets/' + a.icon + '.png" alt="" />' + a.name;
      box.appendChild(el);
    });
  }

  /* ---------- 렌더: 퀘스트 ---------- */
  function renderQuests() {
    var q = state.quests, list = $("#quest-list"); if (!q) return;
    list.innerHTML = ""; state.completed = {}; state.rewardedKeys = {}; var total = 0;
    q.main.forEach(function (it, i) { addQuest(list, "main", "MAIN · " + q.timeBox + "분", it, "m" + i); total++; });
    q.sub.forEach(function (it, i) { addQuest(list, "sub", "SUB", it, "s" + i); total++; });
    q.forbidden.forEach(function (it, i) { addQuest(list, "forbid", "FORBIDDEN", it, "f" + i); });
    if (state.checkin.boss && state.checkin.boss.trim()) {
      var card = document.createElement("article");
      card.className = "quest-card boss";
      card.innerHTML = '<img src="assets/icon-boss.png" alt="" /><small>TODAY\'S BOSS</small><h3>' + esc(state.checkin.boss.trim()) + "</h3>";
      list.appendChild(card);
    }
    state.questTotal = total; updateQuestCount();
  }
  function addQuest(list, kind, label, it, key) {
    var card = document.createElement("article");
    card.className = "quest-card " + (kind === "main" ? "main-quest" : kind === "forbid" ? "forbid" : "sub-quest");
    var icon = kind === "forbid" ? "icon-forbidden" : kind === "main" ? "icon-quest" : "icon-star-candy";
    card.innerHTML = '<img src="assets/' + icon + '.png" alt="" /><small>' + label + "</small><h3>" + esc(it.title) + "</h3>" + (it.flavor ? "<p>" + esc(it.flavor) + "</p>" : "");
    if (kind !== "forbid") {
      card.classList.add("checkable");
      card.addEventListener("click", function () {
        state.completed[key] = !state.completed[key];
        card.classList.toggle("done", state.completed[key]);
        if (state.completed[key] && !state.rewardedKeys[key]) {
          state.rewardedKeys[key] = true;
          state.stardust += 5; gainXp(5);
          floatReward(card, "+5 ⭐");
        }
        updateQuestCount();
      });
    }
    list.appendChild(card);
  }
  function completedCount() { var n = 0; for (var k in state.completed) if (state.completed[k]) n++; return n; }
  function updateQuestCount() { $("#quest-count").textContent = completedCount() + "/" + state.questTotal; }

  /* ---------- 세이브 ---------- */
  function doSave() {
    var done = completedCount();
    var gained = 10 + done * 5;
    var xpGain = 20 + done * 10;
    state.stardust += gained; state.streak += 1; state.completedEver += done;
    if (state.npc) state.npcMet[state.npc] = true;
    var leveled = gainXp(xpGain);
    unlockBadges(done);
    updateHud();
    $("#save-stardust").textContent = "별사탕 +" + gained;
    $("#save-streak").textContent = "연속 " + state.streak + "일";
    $("#streak-line").textContent = "연속 세이브 " + state.streak + "일";
    $("#save-lv").textContent = "Lv." + state.level;
    $("#save-exp").textContent = "EXP +" + xpGain;
    $("#save-xp").style.width = (state.xp / state.xpMax * 100) + "%";
    $("#save-levelup").hidden = !leveled;
    $("#save-copy").textContent = done === 0
      ? "퀘스트 클리어가 없어도 이 기록은 사라지지 않아요. 오늘도 저장했어요."
      : done + "개의 퀘스트를 완료했어요. 좋은 하루였네요.";
  }

  /* ---------- 생존 기록 · 도감 ---------- */
  function renderRecords() {
    $("#rec-streak").textContent = state.streak;
    var npcN = Object.keys(state.npcMet).length;
    $("#rec-stats").innerHTML =
      '<span><b>' + state.completedEver + '</b>완료 퀘스트</span>' +
      '<span><b>' + npcN + '</b>만난 NPC</span>' +
      '<span><b>' + state.stardust + '</b>별사탕</span>';
    var grid = $("#badge-grid"); grid.innerHTML = ""; var unlocked = 0;
    BADGES.forEach(function (bd) {
      var on = !!state.badges[bd.id];
      if (on) unlocked++;
      var el = document.createElement("div");
      el.className = "badge-item" + (on ? "" : " locked");
      el.innerHTML = '<img src="assets/badge-' + bd.id + '.png" alt="" /><span>' + (on ? bd.name : "???") + "</span>";
      grid.appendChild(el);
    });
    $("#rec-badge-count").textContent = unlocked + " / " + BADGES.length;
  }

  /* ---------- 체크인 ---------- */
  function applyCheckin(c) {
    state.checkin = { hp: c.hp, mp: c.mp, focus: c.focus, ailments: c.ailments.slice(), boss: c.boss };
    state.status = window.Engine.computeStatus(state.checkin);
    state.quests = window.Engine.buildQuests(state.data.quests, state.status.mode, state.checkin.boss, state.status.base + state.checkin.ailments.length);
    state.npc = state.status.recommendedNpc;
    renderStatus(); renderQuests(); updateHome();
  }
  function buildAilmentChips() {
    var wrap = $("#ailment-chips");
    window.Engine.AILMENTS.forEach(function (a) {
      var btn = document.createElement("button");
      btn.type = "button"; btn.className = "chip"; btn.dataset.id = a.id;
      btn.innerHTML = '<img src="assets/' + a.icon + '.png" alt="" />' + a.name;
      btn.addEventListener("click", function () { btn.classList.toggle("on"); });
      wrap.appendChild(btn);
    });
  }
  function refreshSaveEnabled() {
    var ok = $('.stat-pick[data-stat="hp"] .sel') && $('.stat-pick[data-stat="mp"] .sel') && $('.stat-pick[data-stat="focus"] .sel');
    $("#checkin-save").disabled = !ok;
  }
  function readCheckinForm() {
    function lvl(stat) { var b = $('.stat-pick[data-stat="' + stat + '"] .sel'); return b ? parseInt(b.dataset.level, 10) : 2; }
    var ail = $$("#ailment-chips .chip.on").map(function (b) { return b.dataset.id; });
    return { hp: lvl("hp"), mp: lvl("mp"), focus: lvl("focus"), ailments: ail, boss: $("#boss-input").value };
  }

  /* ---------- init ---------- */
  function wire() {
    // 스탯 선택
    $$(".stat-pick[data-stat] .level-row button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        Array.prototype.forEach.call(btn.parentNode.children, function (c) { c.classList.remove("sel"); });
        btn.classList.add("sel"); refreshSaveEnabled();
      });
    });
    // 홈 버튼
    $("#act-checkin").addEventListener("click", function () { openModal("checkin"); });
    $("#act-status").addEventListener("click", function () { openModal("status"); });
    $("#act-quest").addEventListener("click", function () { openModal("quest"); });
    // 홈 NPC 탭 → 대화
    $("#home-npc").addEventListener("click", homeTalk);
    $("#home-npc").addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); homeTalk(); } });
    // 체크인 저장
    $("#checkin-save").addEventListener("click", function () { applyCheckin(readCheckinForm()); closeModal(); });
    // 모달 열기/닫기 (네비, 모달 내 이동 버튼)
    $$("[data-open]").forEach(function (b) { b.addEventListener("click", function () { openModal(b.dataset.open); }); });
    $$("[data-close]").forEach(function (b) { b.addEventListener("click", closeModal); });
  }

  function init() {
    buildAilmentChips(); wire();
    function useData(q, d) {
      state.data.quests = q; state.data.dialogue = d;
      applyCheckin(DEFAULT_CHECKIN);
      state.badges["first-save"] = true; state.badges["tea-break"] = true; state.badges["survival-day"] = true;
      state.npcMet["healer"] = true;
      updateHud();
    }
    if (window.SAVEPOINT_DATA) { useData(window.SAVEPOINT_DATA.quests, window.SAVEPOINT_DATA.dialogue); return; }
    Promise.all([
      fetch("docs/data/fallback-quests.json").then(function (r) { return r.json(); }),
      fetch("docs/data/fallback-dialogue.json").then(function (r) { return r.json(); })
    ]).then(function (res) { useData(res[0], res[1]); })
      .catch(function (e) { console.error("데이터 로드 실패:", e); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
