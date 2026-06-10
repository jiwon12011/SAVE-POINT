/* SAVE POINT — 프로토타입 앱 로직 (P0)
 * 홈 = NPC가 배경에 서 있는 내 공간(탭하면 대화). 체크인·상태창·퀘스트·세이브 = 버튼으로 뜨는 팝업(모달).
 */
(function () {
  "use strict";

  var state = {
    data: { quests: null, dialogue: null },
    checkin: { hp: null, mp: null, focus: null, ailments: [], boss: "포트폴리오 정리" },
    status: null, quests: null, npc: "healer",
    completed: {}, rewardedKeys: {}, questTotal: 0, savedToday: false, lastSave: null,
    streak: 4, stardust: 0, level: 7, xp: 40, xpMax: 100,
    badges: {}, completedEver: 0, npcMet: {},
    /* 포션 연금술 (1차) */
    materials: {}, seeds: {}, plots: [], potionCodex: {}, activeRequest: null
  };

  var DEFAULT_CHECKIN = {
    hp: 2, mp: 1, focus: 2,
    ailments: ["sleep_deprivation", "deadline_fear", "notification_overload"],
    boss: "포트폴리오 정리"
  };

  var MODE_LABEL = { survival: "Survival", easy: "Easy", normal: "Normal", challenge: "Challenge" };
  var MODE_EMOJI = { survival: "🛡️", easy: "💧", normal: "⚡", challenge: "⚔️" };
  var MODE_BANNER = {
    survival: "오늘은 회복이 먼저예요. 작은 것 하나면 충분해요. 🌿",
    easy:     "여유가 조금 있는 날이에요. 가볍게 한 걸음이면 돼요. ✨",
    normal:   "무난한 하루네요. 본업 한 블록이면 오늘 몫은 충분해요. ⚡",
    challenge:"컨디션 좋은 날이에요. 오늘 보스를 정면으로 마주해요. ⚔️"
  };
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
  var HOME_THEMES = ["rainy", "fireplace", "potion", "bedroom", "guild", "dawn"];
  var homeTheme = HOME_THEMES[Math.floor(Math.random() * HOME_THEMES.length)];
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

  /* ---------- 뷰 클래스 (배경 전환) ---------- */
  function setViewClass(name) {
    var phone = $(".phone");
    if (!phone) return;
    ["home", "checkin", "status", "quest", "save", "records", "npc"].forEach(function (v) {
      phone.classList.remove("view-" + v);
    });
    phone.classList.add("view-" + (name || "home"));
  }

  /* ---------- 스플래시 ---------- */
  function initSplash() {
    var splash = $("#splash");
    if (!splash) return;
    setTimeout(function () {
      splash.classList.add("done");
      setTimeout(function () { splash.hidden = true; }, 750);
    }, 2000);
  }

  /* ---------- 홈 배너 업데이트 ---------- */
  function updateBanner() {
    var s = state.status;
    var modeRow = $("#mode-row");
    var hints = $("#checkin-hints");
    var banner = $("#save-banner-sec");

    if (!s) {
      if (modeRow) modeRow.hidden = true;
      if (hints) hints.hidden = false;
      if (banner) banner.classList.remove("saved-today");
      var msg = $("#banner-msg");
      if (msg) msg.textContent = "오늘의 나를 저장하고, 다시 시작해요.";
      return;
    }

    if (hints) hints.hidden = true;

    if (modeRow) {
      modeRow.hidden = false;
      var pill = $("#mode-badge-pill");
      if (pill) {
        pill.textContent = MODE_EMOJI[s.mode] + " " + MODE_LABEL[s.mode];
        pill.className = "mode-pill mode-" + s.mode;
      }
      var q = state.quests;
      var hint = $("#quest-hint");
      if (hint && q) {
        var checkable = q.main.length + q.sub.length;
        hint.textContent = "퀘스트 " + checkable + "개 · " + q.timeBox + "분";
      }
    }

    var bannerMsg = $("#banner-msg");
    if (bannerMsg) {
      bannerMsg.textContent = state.savedToday
        ? "오늘의 모험가가 저장되었습니다. 수고했어요. ✨"
        : MODE_BANNER[s.mode];
    }
    if (banner) banner.classList.toggle("saved-today", state.savedToday);
  }

  /* ---------- NPC 세이브 대사 ---------- */
  function pickDialogueForSave() {
    if (!state.data.dialogue) return "";
    var npc = state.npc || "healer";
    var pool = ((state.data.dialogue.dialogues || {})[npc] || {})["save_complete"] || [];
    if (!pool.length) return "";
    return pool[Math.abs(state.streak) % pool.length];
  }

  function npcSprite(npc, expr) {
    var have = SPRITES[npc] || ["default"];
    var e = expr;
    if (have.indexOf(e) < 0) e = (e === "cheer" && have.indexOf("joy") >= 0) ? "joy" : "default";
    return "assets/" + npc + "-" + e + ".png";
  }

  function applyHomeTheme() {
    var phone = $(".phone");
    if (!phone) return;
    HOME_THEMES.forEach(function (theme) { phone.classList.remove("home-theme-" + theme); });
    phone.classList.add("home-theme-" + homeTheme);
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
    var b = state.badges, s = state.status, names = [];
    function set(id, name) { if (!b[id]) { b[id] = true; names.push(name); } }
    set("first-save", "첫 세이브");
    set("tea-break", "차 한 잔의 여유");
    if (done === 0) set("no-zero-day", "포기하지 않은 자");
    if (s && s.mode === "survival") set("survival-day", "버티는 자");
    if (s && s.mode === "challenge") set("boss-crown", "정면돌파자");
    if (state.streak >= 7) set("seven-day", "7일 생존자");
    if (state.checkin.ailments.indexOf("sleep_deprivation") >= 0) set("sleep-recovery", "침대와 동맹한 용사");
    if (state.checkin.ailments.indexOf("focus_lost") >= 0) set("focus-spark", "집중의 불씨");
    if (state.stardust >= 50) set("star-candy-collector", "별사탕 수집가");
    return names;
  }

  /* ---------- 영속(localStorage) ---------- */
  var SAVE_KEY = "savepoint_state_v1";
  function persist() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        streak: state.streak, stardust: state.stardust, level: state.level, xp: state.xp, xpMax: state.xpMax,
        badges: state.badges, npcMet: state.npcMet, completedEver: state.completedEver,
        materials: state.materials, seeds: state.seeds, plots: state.plots, potionCodex: state.potionCodex, activeRequest: state.activeRequest
      }));
    } catch (e) {}
  }
  function restore() {
    try {
      var s = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
      if (!s) return false;
      state.streak = s.streak; state.stardust = s.stardust; state.level = s.level; state.xp = s.xp; state.xpMax = s.xpMax;
      state.badges = s.badges || {}; state.npcMet = s.npcMet || {}; state.completedEver = s.completedEver || 0;
      // 포션 슬롯: 구버전 localStorage 호환(없으면 기본값)
      state.materials = s.materials || {}; state.seeds = s.seeds || {};
      state.plots = s.plots || []; state.potionCodex = s.potionCodex || {};
      state.activeRequest = (typeof s.activeRequest === "undefined") ? null : s.activeRequest;
      return true;
    } catch (e) { return false; }
  }

  /* ---------- 모달 ---------- */
  function setNav(name) {
    $$(".bottom-nav [data-open]").forEach(function (b) { b.classList.toggle("active", b.dataset.open === name); });
  }
  function openModal(name) {
    if (name === "home") { closeModal(); return; }
    setViewClass(name);
    if (name === "status") renderStatus();
    if (name === "quest") renderQuests();
    if (name === "records") renderRecords();
    if (name === "save") doSave();
    if (name === "npc") renderNpcModalContent();
    if (name === "workshop") { ensureRequest(); renderWorkshop(); }
    if (name === "garden") renderGarden();
    if (name === "codex") renderPotionCodex();
    $("#modal-layer").hidden = false;
    $$(".modal").forEach(function (m) { m.classList.toggle("show", m.id === "modal-" + name); });
    setNav(name);
  }
  function closeModal() {
    setViewClass("home");
    $("#modal-layer").hidden = true;
    $$(".modal").forEach(function (m) { m.classList.remove("show"); });
    setNav("home");
    updateBanner();
  }

  /* ---------- NPC 대화 모달 ---------- */
  var NPC_AVAIL = ["healer", "innkeeper"];
  var NPC_LOCKED = ["guildmaster", "rival", "wizard"];
  var npcDlgLines = [], npcDlgIdx = 0, npcDlgType = { timer: null, full: "", typing: false };

  function typeIntoNpc(text) {
    var el = $("#npc-dialogue-text");
    var arrow = $("#npc-next-arrow");
    if (!el) return;
    if (arrow) arrow.classList.remove("ready");
    npcDlgType.full = text; clearInterval(npcDlgType.timer);
    if (REDUCED) { el.textContent = text; npcDlgType.typing = false; if (arrow) arrow.classList.add("ready"); return; }
    el.textContent = ""; npcDlgType.typing = true; var i = 0;
    npcDlgType.timer = setInterval(function () {
      el.textContent = npcDlgType.full.slice(0, ++i);
      if (i >= npcDlgType.full.length) { clearInterval(npcDlgType.timer); npcDlgType.typing = false; if (arrow) arrow.classList.add("ready"); }
    }, 28);
  }

  function buildNpcDialogueLines(npc) {
    if (!state.data.dialogue) return [{ text: "오늘 체크인을 먼저 해보면 어때? 30초면 돼. 🌿", expr: "default" }];
    var s = state.status;
    var dialogues = state.data.dialogue.dialogues;
    var npcPool = dialogues[npc] || {};
    var seed = s ? (s.base + (state.checkin.ailments || []).length) : 0;
    var lines = [];

    var cat = s ? s.category : "first_welcome";
    var l1 = window.Engine.pickDialogue({ dialogues: dialogues }, npc, cat, seed);
    if (l1) lines.push({ text: l1, expr: s ? s.expression : "default" });

    if (s) {
      var questPool = npcPool["quest_offer"] || [];
      if (questPool.length) lines.push({ text: questPool[Math.abs(seed + 1) % questPool.length], expr: "cheer" });
    }

    var onePool = npcPool["one_liner"] || [];
    if (onePool.length) lines.push({ text: onePool[Math.abs(seed + 2) % onePool.length], expr: "relax" });

    return lines.length ? lines : [{ text: "...", expr: "default" }];
  }

  function renderNpcModalContent() {
    var npc = state.npc || "healer";
    var nameEl = $("#npc-modal-name"); if (nameEl) nameEl.textContent = NPC_NAME[npc];
    var plate = $("#npc-name-plate"); if (plate) plate.textContent = NPC_NAME[npc];
    npcDlgLines = buildNpcDialogueLines(npc); npcDlgIdx = 0;
    var portrait = $("#npc-portrait"); if (portrait) portrait.src = npcSprite(npc, npcDlgLines[0].expr);
    typeIntoNpc(npcDlgLines[0].text);

    var container = $("#npc-switch"); if (!container) return;
    container.innerHTML = "";
    NPC_AVAIL.concat(NPC_LOCKED).forEach(function (npcId) {
      var available = NPC_AVAIL.indexOf(npcId) >= 0;
      var btn = document.createElement("button");
      btn.className = "npc-card" + (npcId === npc ? " selected" : "") + (!available ? " locked" : "");
      btn.innerHTML = '<img src="assets/' + npcId + '-default.png" alt="" /><span>' + NPC_NAME[npcId] + "</span>";
      if (available) {
        btn.addEventListener("click", function () {
          state.npc = npcId; state.npcMet[npcId] = true;
          var seed = dropNpcSeed(npcId);   // C축: NPC 씨앗 보장 드롭(세션당 1회)
          renderNpcModalContent();
          if (seed) floatReward($("#npc-portrait"), "🌱 " + cropName(seed) + " 씨앗");
          persist();
        });
      }
      container.appendChild(btn);
    });
  }

  function advanceNpcDialogue() {
    if (npcDlgType.typing) {
      clearInterval(npcDlgType.timer); npcDlgType.typing = false;
      var el = $("#npc-dialogue-text"); if (el) el.textContent = npcDlgType.full;
      var arrow = $("#npc-next-arrow"); if (arrow) arrow.classList.add("ready");
      return;
    }
    npcDlgIdx = (npcDlgIdx + 1) % npcDlgLines.length;
    var line = npcDlgLines[npcDlgIdx];
    var portrait = $("#npc-portrait"); if (portrait) portrait.src = npcSprite(state.npc || "healer", line.expr);
    typeIntoNpc(line.text);
  }

  /* ---------- 홈 NPC ---------- */
  var homeLines = [], homeIdx = 0, homeType = { timer: null, full: "", typing: false };

  function timeGreeting() {
    var h = new Date().getHours();
    if (h < 6)  return "새벽에 왔구나";
    if (h < 11) return "아침이야";
    if (h < 17) return "오후네";
    if (h < 21) return "저녁이야";
    return "밤이 깊었네";
  }

  var PRE_CHECKIN_LINES = [
    { text: "안녕, 모험가. 오늘 HP는 어때? 30초만 줘봐. 🗡️", expr: "default" },
    { text: "여기는 세이브 포인트야. 아무것도 못 해도 저장은 돼. 그게 이 앱의 전부야. 🌿", expr: "relax" },
    { text: "오늘 컨디션에 맞는 퀘스트를 같이 찾아볼게. 체크인 해봐. ✨", expr: "cheer" }
  ];

  function buildHomeLines(npc) {
    var s = state.status;
    var warm = window.Engine.pickDialogue({ dialogues: state.data.dialogue.dialogues }, npc, s.category, s.base + state.checkin.ailments.length);
    var greet = timeGreeting();
    var openingText = greet + ". " + DIAGNOSIS[s.mode];
    var questLine = s.mode === "survival"
      ? "퀘스트는 1개야. " + (state.quests ? state.quests.timeBox : 5) + "분짜리. 그것 하나면 충분해."
      : "퀘스트 " + (state.quests ? (state.quests.main.length + state.quests.sub.length) : 0) + "개 기다리고 있어. 아래 버튼에서 받아봐.";
    return [
      { text: openingText, expr: s.expression },
      { text: warm, expr: s.mode === "challenge" ? "cheer" : "comfort" },
      { text: questLine, expr: s.mode === "survival" ? "relax" : "joy" }
    ];
  }
  function setHomeSprite(expr) {
    $("#home-npc").src = npcSprite(state.npc, expr);
    $("#home-npc").className = "home-npc " + state.npc;
  }
  function updateHome() {
    var s = state.status;
    var npc = state.npc || "healer";
    $("#home-npc-name").textContent = NPC_NAME[npc];
    homeLines = s ? buildHomeLines(npc) : PRE_CHECKIN_LINES;
    homeIdx = 0;
    setHomeSprite(homeLines[0].expr);
    typeInto($("#home-speech"), homeLines[0].text);
    updateBanner();
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
    list.innerHTML = ""; var total = 0; // 완료 상태는 보존(applyCheckin에서만 리셋)
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
      if (state.completed[key]) card.classList.add("done");
      card.addEventListener("click", function () {
        state.completed[key] = !state.completed[key];
        card.classList.toggle("done", state.completed[key]);
        if (state.completed[key]) {
          card.classList.remove("checking");
          void card.offsetWidth;
          card.classList.add("checking");
          if (!state.rewardedKeys[key]) {
            state.rewardedKeys[key] = true;
            var mult = (state.status && state.data.quests.modeParams[state.status.mode].rewardMultiplier) || 1;
            var r = Math.round(5 * mult);
            state.stardust += r; gainXp(r); floatReward(card, "+" + r + " ⭐");
            dropQuestSeed();   // B축: 작은 실천의 씨앗(추천 회복) 드롭
            persist();
          }
        }
        updateQuestCount();
      });
    }
    list.appendChild(card);
  }
  function completedCount() { var n = 0; for (var k in state.completed) if (state.completed[k]) n++; return n; }
  function updateQuestCount() { $("#quest-count").textContent = completedCount() + "/" + state.questTotal; }

  /* ---------- 세이브 (멱등: 같은 날 중복 적립 방지) ---------- */
  function doSave() {
    if (!state.savedToday) {
      var done = completedCount();
      var gained = 10 + done * 5;
      var xpGain = 20 + done * 10;
      state.stardust += gained; state.streak += 1; state.completedEver += done;
      if (state.npc) state.npcMet[state.npc] = true;
      var leveled = gainXp(xpGain);
      var newBadges = unlockBadges(done);
      growPlotsOnSave();                          // 텃밭 한 단계 성장
      var streakSeed = dropStreakSeed();          // 출석 씨앗
      state.lastSave = { gained: gained, xpGain: xpGain, leveled: leveled, done: done, newBadges: newBadges, streakSeed: streakSeed };
      state.savedToday = true;
      updateWorkshopBadge();
      persist();
    }
    renderSaveModal();
  }
  function renderSaveModal() {
    var ls = state.lastSave || { gained: 10, xpGain: 20, leveled: false, done: 0, newBadges: [] };
    $("#save-stardust").textContent = "별사탕 +" + ls.gained;
    $("#save-streak").textContent = "연속 " + state.streak + "일";
    $("#streak-line").textContent = "연속 세이브 " + state.streak + "일";
    $("#save-lv").textContent = "Lv." + state.level;
    $("#save-exp").textContent = "EXP +" + ls.xpGain;
    $("#save-xp").style.width = (state.xp / state.xpMax * 100) + "%";
    $("#save-levelup").hidden = !ls.leveled;
    var nb = $("#save-badge");
    if (ls.newBadges && ls.newBadges.length) { nb.hidden = false; nb.textContent = "🏅 칭호 해금: " + ls.newBadges.join(", "); }
    else nb.hidden = true;
    var sd = $("#save-seed");
    if (sd) {
      if (ls.streakSeed) { sd.hidden = false; sd.textContent = "🌱 출석 보상: " + cropName(ls.streakSeed) + " 씨앗"; }
      else sd.hidden = true;
    }
    var zeroCopy = ls.done === 0
      ? "퀘스트 클리어가 없어도 이 기록은 사라지지 않아요. 오늘도 저장했어요."
      : ls.done + "개의 퀘스트를 완료했어요. 수고했어요.";
    $("#save-copy").textContent = zeroCopy;

    var npcLine = pickDialogueForSave();
    var npcEl = $("#npc-save-line");
    if (npcEl) {
      if (npcLine) { npcEl.hidden = false; npcEl.textContent = "“" + npcLine + "”"; }
      else npcEl.hidden = true;
    }
    updateBanner();
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
    state.completed = {}; state.rewardedKeys = {}; state.savedToday = false; // 새 체크인 = 새 하루
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

  /* ========================================================================
   * 포션 연금술 (1차 MVP) — docs/포션연금술-기획.md
   * ===================================================================== */
  var PD = window.POTION_DATA || {};
  var QUALITY_NAME = ["평범한 포션", "좋은 포션", "완벽한 포션"];
  var QUALITY_ICON = ["○", "◆", "★"];
  var brew = { potionId: null, active: false, lastAng: null, rounds: 0, deltas: [], target: 3 };

  // ail → 추천 회복(B축) 역맵 (포션 rec[1]에서 도출)
  var REC_BY_AIL = {};
  (PD.potions || []).forEach(function (p) { if (p.ail && p.rec && p.rec[1]) REC_BY_AIL[p.ail] = p.rec[1]; });

  function potionById(id) { var l = PD.potions || []; for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }

  /* ---- 재료/씨앗 정보 룩업 (신규 마스터 없이 기존 데이터 참조) ---- */
  function matInfo(id) {
    if (PD.crops && PD.crops[id]) return { name: PD.crops[id].name, kind: "crop", img: "assets/crops/" + id + ".png" };
    if (PD.recovery && PD.recovery[id]) return { name: PD.recovery[id].name, kind: "recovery", emoji: PD.recovery[id].emoji };
    var a = byId(id); if (a) return { name: a.name, kind: "crystal", img: "assets/" + a.icon + ".png" };
    return { name: id, kind: "x", emoji: "❔" };
  }
  function matVisual(m) { return m.img ? '<img src="' + m.img + '" alt="" />' : '<span class="mat-emoji">' + (m.emoji || "❔") + "</span>"; }
  function cropName(c) { return (PD.crops && PD.crops[c] ? PD.crops[c].name : c); }

  function addMaterial(id, n) { state.materials[id] = (state.materials[id] || 0) + (n || 1); if (state.materials[id] <= 0) delete state.materials[id]; }
  function addSeed(c, n) { state.seeds[c] = (state.seeds[c] || 0) + (n || 1); if (state.seeds[c] <= 0) delete state.seeds[c]; }
  function matCount() { var n = 0; for (var k in state.materials) n += state.materials[k]; return n; }
  function firstMaterial() { for (var k in state.materials) if (state.materials[k] > 0) return k; return null; }
  function updateWorkshopBadge() {
    var b = $("#workshop-badge"); if (!b) return;
    var n = matCount(); b.textContent = n; b.hidden = n <= 0;
  }

  /* ---- 드롭 훅 ---- */
  // A축: 체크인에서 상태이상 태그를 고르는 순간 결정체 1개씩
  function dropCheckinCrystals(ailments) {
    (ailments || []).forEach(function (id) { addMaterial(id, 1); });
    updateWorkshopBadge();
  }
  // B축: 퀘스트 완료 시 그날 첫 상태이상의 추천 회복(없으면 water)
  function dropQuestSeed() {
    var ail = (state.checkin.ailments && state.checkin.ailments[0]) || null;
    var rec = (ail && REC_BY_AIL[ail]) || "water";
    addMaterial(rec, 1); updateWorkshopBadge();
    return rec;
  }
  // C축: NPC 전환 시 그 NPC의 씨앗 1개(세션당 NPC별 1회 보장)
  var npcSeedGiven = {};
  function dropNpcSeed(npc) {
    if (npcSeedGiven[npc]) return null;
    var pool = (PD.npcSeeds || {})[npc]; if (!pool || !pool.length) return null;
    npcSeedGiven[npc] = true;
    var c = pool[Math.abs(state.streak + Object.keys(npcSeedGiven).length) % pool.length];
    addSeed(c, 1);
    return c;
  }
  // 출석: 세이브로 streak이 임계값에 도달하는 순간 씨앗 1개
  function dropStreakSeed() {
    var c = (PD.streakSeeds || {})[state.streak];
    if (c) { addSeed(c, 1); return c; }
    return null;
  }
  // 세이브 시 텃밭 한 단계 성장
  function growPlotsOnSave() {
    state.plots.forEach(function (p) {
      if (p && p.cropId && !p.ready) { p.progress += 1; if (p.progress >= p.required) p.ready = true; }
    });
  }

  /* ---- 공방(Workshop) ---- */
  function brewablePotions() {
    return (PD.potions || []).filter(function (p) {
      if (p.ail) return !!state.materials[p.ail];          // 결정체 보유 시 제조 가능
      return matCount() > 0;                                // 와일드카드: 재료 아무거나
    });
  }
  function brewPlan(p) {
    if (!p) return null;
    var use = [], matchScore = 0, bonusCrop = null, bonus = 0;
    if (p.ail) { if (!state.materials[p.ail]) return null; use.push(p.ail); }
    else { var any = firstMaterial(); if (!any) return null; use.push(any); }
    var recB = p.rec && p.rec[1];
    if (recB && state.materials[recB] && use.indexOf(recB) < 0) { use.push(recB); matchScore += 2; }
    for (var c in (p.crops || {})) { if (state.materials[c] && p.crops[c] > bonus) { bonusCrop = c; bonus = p.crops[c]; } }
    if (bonusCrop) { use.push(bonusCrop); matchScore += bonus; }
    return { use: use, matchScore: matchScore, bonusCrop: bonusCrop };
  }

  function renderWorkshop() {
    // 멘토
    var line = matCount() === 0 ? PD.mentorLines.noMaterial
      : (state.lastSave && state.lastSave.done === 0 ? PD.mentorLines.zeroDay : PD.mentorLines.rhythm);
    var ml = $("#workshop-mentor-line"); if (ml) ml.textContent = line;
    var mp = $("#workshop-mentor-img"); if (mp) mp.src = npcSprite("wizard", "thinking");

    // 재료 인벤토리 (보유분만, 축별)
    var inv = $("#workshop-materials"); inv.innerHTML = "";
    var keys = Object.keys(state.materials).filter(function (k) { return state.materials[k] > 0; });
    if (!keys.length) { inv.innerHTML = '<p class="ws-empty">아직 재료가 없어요. 체크인·퀘스트·NPC로 재료가 쌓여요.</p>'; }
    keys.forEach(function (id) {
      var m = matInfo(id);
      var el = document.createElement("span");
      el.className = "mat-chip k-" + m.kind;
      el.innerHTML = matVisual(m) + "<b>" + esc(m.name) + "</b><i>×" + state.materials[id] + "</i>";
      inv.appendChild(el);
    });

    // 제조 가능 포션
    var list = $("#workshop-potions"); list.innerHTML = "";
    var pool = brewablePotions();
    if (!pool.length) { list.innerHTML = '<p class="ws-empty">제조할 수 있는 포션이 아직 없어요. 상태이상 결정체를 모아보세요.</p>'; }
    pool.forEach(function (p) {
      var plan = brewPlan(p);
      var card = document.createElement("article");
      card.className = "brew-card";
      var hint = plan && plan.matchScore >= 4 ? "완벽 가능 ★" : plan && plan.matchScore >= 2 ? "좋음 가능 ◆" : "평범 ○";
      card.innerHTML =
        '<img class="brew-thumb" src="' + potionImg(p) + '" alt="" />' +
        '<div class="brew-meta"><b>' + esc(p.name) + "</b><small>" + esc(p.lore) + "</small>" +
        '<span class="brew-hint">' + hint + "</span></div>" +
        '<button class="brew-go" type="button">휘저어 만들기</button>';
      card.querySelector(".brew-go").addEventListener("click", function () { openBrew(p.id); });
      list.appendChild(card);
    });
    updateRequestCard();
  }

  function potionImg(p) {
    if (!p.ail) return "assets/reward-potion.png";
    var a = byId(p.ail); return a ? "assets/" + a.icon + ".png" : "assets/reward-potion.png";
  }

  /* ---- 휘젓기 제조 ---- */
  function openBrew(potionId) {
    brew = { potionId: potionId, active: false, lastAng: null, rounds: 0, deltas: [], target: 3 };
    var p = potionById(potionId);
    $("#brew-title").textContent = p.name;
    var plan = brewPlan(p);
    var used = $("#brew-ingredients"); used.innerHTML = "";
    (plan ? plan.use : []).forEach(function (id) {
      var m = matInfo(id);
      var el = document.createElement("span"); el.className = "mat-chip k-" + m.kind + " small";
      el.innerHTML = matVisual(m) + "<b>" + esc(m.name) + "</b>"; used.appendChild(el);
    });
    $("#brew-flask").style.setProperty("--liquid", potionTint(p));
    $("#brew-flask").classList.remove("filling");
    $("#brew-stage").hidden = false;
    $("#brew-done").hidden = true;
    var pad = $("#stir-pad"), btn = $("#brew-reduced-btn"), tip = $("#stir-tip");
    if (REDUCED) { pad.hidden = true; btn.hidden = false; tip.textContent = "버튼을 눌러 제조해요."; }
    else { pad.hidden = false; btn.hidden = true; tip.textContent = "플라스크 위를 빙글빙글 저어요."; resetStirVisual(); }
  }
  function potionTint(p) {
    var map = { sleep_deprivation: "#9fb6e8", caffeine_overload: "#e8c79f", focus_lost: "#bfe0d2", decision_paralysis: "#d8bdf0",
      notification_overload: "#f0c2c2", anxiety: "#c9d8f0", burnout: "#f0b59f", sadness: "#a9c4e0", escapism: "#cdbcf0",
      deadline_fear: "#e0a9b8", procrastination: "#bcd6c0" };
    return (p.ail && map[p.ail]) || "#d9c7f2";
  }
  function resetStirVisual() {
    var liq = $("#brew-liquid"); if (liq) { liq.style.transform = "rotate(0deg)"; liq.style.height = "26%"; }
    var tip = $("#stir-tip"); if (tip) tip.classList.remove("ready");
  }
  function stirAngle(e, rect) {
    var cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    var pt = (e.touches && e.touches[0]) || e;
    return Math.atan2(pt.clientY - cy, pt.clientX - cx);
  }
  function onStirMove(e) {
    if (!brew.active) return;
    e.preventDefault();
    var pad = $("#stir-pad"); var rect = pad.getBoundingClientRect();
    var ang = stirAngle(e, rect);
    if (brew.lastAng !== null) {
      var d = ang - brew.lastAng;
      if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI;
      brew.rounds += Math.abs(d) / (2 * Math.PI);
      brew.deltas.push(Math.abs(d)); if (brew.deltas.length > 40) brew.deltas.shift();
      var liq = $("#brew-liquid");
      if (liq) {
        liq.style.transform = "rotate(" + (ang * 180 / Math.PI) + "deg)";
        liq.style.height = Math.min(72, 26 + brew.rounds / brew.target * 46) + "%";
      }
    }
    brew.lastAng = ang;
    if (brew.rounds >= brew.target) { var tip = $("#stir-tip"); if (tip && !tip.classList.contains("ready")) { tip.classList.add("ready"); tip.textContent = "다 저었어요! 손을 떼면 완성돼요 ✨"; } }
  }
  function endStir() {
    if (!brew.active) return;
    brew.active = false; brew.lastAng = null;
    if (brew.rounds >= brew.target) finishBrew(rhythmScore());
  }
  function rhythmScore() {
    var d = brew.deltas; if (d.length < 4) return 0.5;
    var mean = 0; d.forEach(function (x) { mean += x; }); mean /= d.length;
    var varr = 0; d.forEach(function (x) { varr += (x - mean) * (x - mean); }); varr /= d.length;
    var sd = Math.sqrt(varr);
    var cv = mean > 0 ? sd / mean : 1;           // 변동계수 작을수록 일정한 리듬
    return Math.max(0, Math.min(1, 1 - cv));
  }

  function finishBrew(rhythm01) {
    var p = potionById(brew.potionId); if (!p) return;
    var plan = brewPlan(p); if (!plan) return;
    var score = 2 + plan.matchScore + Math.round(rhythm01 * 4);   // 기본2 + 재료 + 리듬(최대4)
    var q = score >= 7 ? 2 : score >= 4 ? 1 : 0;
    // 재료 소비
    plan.use.forEach(function (id) { addMaterial(id, -1); });
    // 도감 등록(최고 품질 유지)
    var cx = state.potionCodex[p.id];
    if (!cx) state.potionCodex[p.id] = { firstAt: Date.now(), bestQuality: q, count: 1 };
    else { cx.bestQuality = Math.max(cx.bestQuality, q); cx.count += 1; }
    // 보상
    var reward = 8 + q * 6;
    state.stardust += reward; gainXp(reward); updateHud();
    // 의뢰 충족
    var reqMsg = checkRequestFulfill(p.id, q);
    // 결과 표시
    var liq = $("#brew-liquid"); if (liq) liq.style.height = "72%";
    $("#brew-flask").classList.add("filling");
    $("#brew-result-name").textContent = p.name;
    $("#brew-result-quality").textContent = QUALITY_ICON[q] + " " + QUALITY_NAME[q];
    $("#brew-result-quality").className = "brew-quality q" + q;
    $("#brew-result-reward").textContent = "별사탕 +" + reward;
    var mline = q === 2 ? PD.mentorLines.perfect : q === 1 ? PD.mentorLines.good : PD.mentorLines.plain;
    $("#brew-result-mentor").textContent = reqMsg || mline;
    $("#brew-done").hidden = false;
    if ($("#stir-pad")) $("#stir-pad").hidden = true;
    if ($("#brew-reduced-btn")) $("#brew-reduced-btn").hidden = true;
    $("#stir-tip").textContent = "";
    updateWorkshopBadge();
    persist();
  }
  function closeBrew() { $("#brew-stage").hidden = true; renderWorkshop(); }

  /* ---- 의뢰 ---- */
  function ensureRequest() {
    if (!state.activeRequest && PD.request) {
      var r = PD.request;
      state.activeRequest = { id: r.id, npc: r.npc, wants: r.wantsPotion, quality: r.wantsQuality, status: "open" };
    }
  }
  function updateRequestCard() {
    var wrap = $("#workshop-request"); if (!wrap) return;
    var r = PD.request, ar = state.activeRequest;
    if (!r || !ar) { wrap.hidden = true; return; }
    wrap.hidden = false;
    var done = ar.status === "done";
    wrap.innerHTML =
      '<img class="req-npc" src="' + npcSprite(r.npc, done ? "joy" : "thinking") + '" alt="" />' +
      '<div class="req-body"><span class="req-tag">' + NPC_NAME[r.npc] + "의 의뢰" + (done ? " · 완료" : "") + "</span>" +
      "<p>" + esc(done ? r.doneLine : r.offerLines[0]) + "</p>" +
      '<small>요구: ' + esc(potionById(r.wantsPotion).name) + " · 좋음 이상 · 보상 별사탕 +" + r.rewardStardust + "</small></div>";
  }
  function checkRequestFulfill(potionId, q) {
    var ar = state.activeRequest, r = PD.request;
    if (!ar || ar.status !== "open" || ar.wants !== potionId || q < ar.quality) return null;
    ar.status = "done";
    state.stardust += r.rewardStardust; gainXp(r.rewardStardust); updateHud();
    addMaterial(r.rewardMaterial, r.rewardQty);
    return "🎁 " + NPC_NAME[r.npc] + " 의뢰 완료! 별사탕 +" + r.rewardStardust + " · " + r.doneLine;
  }

  /* ---- 텃밭(Garden) ---- */
  function ensurePlots() { while (state.plots.length < 3) state.plots.push({ cropId: null, progress: 0, required: 0, ready: false }); }
  function renderGarden() {
    ensurePlots();
    var grid = $("#garden-plots"); grid.innerHTML = "";
    state.plots.forEach(function (p, i) {
      var cell = document.createElement("div");
      cell.className = "plot";
      if (!p.cropId) {
        cell.classList.add("empty");
        cell.innerHTML = '<span class="plot-dirt">🟫</span><span class="plot-label">빈 화분</span>';
        cell.addEventListener("click", function () { openSeedPicker(i); });
      } else if (p.ready) {
        cell.classList.add("ready");
        cell.innerHTML = '<img class="plot-crop" src="assets/crops/' + p.cropId + '.png" alt="" /><button class="plot-harvest" type="button">수확하기</button>';
        cell.querySelector(".plot-harvest").addEventListener("click", function () { harvest(i); });
      } else {
        var ratio = p.required ? p.progress / p.required : 0;
        var left = Math.max(0, p.required - p.progress);
        cell.classList.add("growing");
        cell.innerHTML =
          '<img class="plot-crop growing-img" style="opacity:' + (0.45 + ratio * 0.55).toFixed(2) + ';transform:scale(' + (0.6 + ratio * 0.4).toFixed(2) + ')" src="assets/crops/' + p.cropId + '.png" alt="" />' +
          '<span class="plot-label">' + esc(cropName(p.cropId)) + "</span>" +
          '<span class="plot-progress">' + left + "번 더 기록하면 수확 🌱</span>";
      }
      grid.appendChild(cell);
    });
    // 보유 씨앗 요약
    var sw = $("#garden-seeds"); sw.innerHTML = "";
    var seedKeys = Object.keys(state.seeds).filter(function (k) { return state.seeds[k] > 0; });
    if (!seedKeys.length) sw.innerHTML = '<p class="ws-empty">씨앗이 없어요. 출석·NPC·퀘스트로 씨앗을 받아요.</p>';
    seedKeys.forEach(function (c) {
      var el = document.createElement("span"); el.className = "seed-chip";
      el.innerHTML = '<img src="assets/seeds/seed_' + c + '.png" alt="" /><b>' + esc(cropName(c)) + "</b><i>×" + state.seeds[c] + "</i>";
      sw.appendChild(el);
    });
  }
  function openSeedPicker(plotIdx) {
    var seedKeys = Object.keys(state.seeds).filter(function (k) { return state.seeds[k] > 0; });
    var picker = $("#seed-picker"), listEl = $("#seed-picker-list");
    listEl.innerHTML = "";
    if (!seedKeys.length) { listEl.innerHTML = '<p class="ws-empty">심을 씨앗이 없어요.</p>'; }
    seedKeys.forEach(function (c) {
      var b = document.createElement("button"); b.type = "button"; b.className = "seed-pick";
      var g = PD.crops[c] ? PD.crops[c].grow : 3;
      b.innerHTML = '<img src="assets/seeds/seed_' + c + '.png" alt="" /><b>' + esc(cropName(c)) + '</b><small>세이브 ' + g + '회</small>';
      b.addEventListener("click", function () { plant(plotIdx, c); picker.hidden = true; });
      listEl.appendChild(b);
    });
    picker.hidden = false;
  }
  function plant(idx, cropId) {
    var g = PD.crops[cropId] ? PD.crops[cropId].grow : 3;
    addSeed(cropId, -1);
    state.plots[idx] = { cropId: cropId, progress: 0, required: g, ready: false };
    persist(); renderGarden();
  }
  function harvest(idx) {
    var p = state.plots[idx]; if (!p || !p.ready) return;
    addMaterial(p.cropId, 1);
    state.plots[idx] = { cropId: null, progress: 0, required: 0, ready: false };
    updateWorkshopBadge(); persist(); renderGarden();
  }

  /* ---- 포션 도감 ---- */
  function renderPotionCodex() {
    var grid = $("#codex-grid"); grid.innerHTML = "";
    var all = PD.potions || []; var unlocked = 0;
    all.forEach(function (p) {
      var cx = state.potionCodex[p.id]; var on = !!cx; if (on) unlocked++;
      var el = document.createElement("div");
      el.className = "codex-card" + (on ? "" : " locked") + (on && cx.bestQuality === 2 ? " perfect" : "");
      if (on) {
        el.innerHTML = '<img src="' + potionImg(p) + '" alt="" /><b>' + esc(p.name) + "</b>" +
          '<span class="codex-q q' + cx.bestQuality + '">' + QUALITY_ICON[cx.bestQuality] + " " + QUALITY_NAME[cx.bestQuality] + "</span>" +
          '<small>' + esc(p.lore) + "</small><i>×" + cx.count + "</i>";
      } else {
        var hintImg = p.ail ? (function () { var a = byId(p.ail); return a ? "assets/" + a.icon + ".png" : "assets/reward-potion.png"; })() : "assets/reward-potion.png";
        el.innerHTML = '<img class="silh" src="' + hintImg + '" alt="" /><b>???</b><small>아직 만들지 않은 포션</small>';
      }
      grid.appendChild(el);
    });
    var cnt = $("#codex-count"); if (cnt) cnt.textContent = unlocked + " / " + all.length;
  }

  /* ---------- 데일리 리셋 ---------- */
  var TODAY_KEY = "savepoint_today_date";
  function checkDailyReset() {
    var today = new Date().toDateString();
    var last = localStorage.getItem(TODAY_KEY);
    if (last !== today) {
      localStorage.setItem(TODAY_KEY, today);
      return true;
    }
    return false;
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
    // 홈 NPC 탭 → NPC 대화 모달
    $("#home-npc").addEventListener("click", function () { openModal("npc"); });
    $("#home-npc").addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openModal("npc"); } });
    // NPC 대화창 탭 → 다음 대사
    var dlgBox = $("#npc-dialogue-box");
    if (dlgBox) {
      dlgBox.addEventListener("click", advanceNpcDialogue);
      dlgBox.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); advanceNpcDialogue(); } });
    }
    // 체크인 저장 (+ A축 결정체 드롭)
    $("#checkin-save").addEventListener("click", function () {
      var form = readCheckinForm();
      applyCheckin(form);
      dropCheckinCrystals(form.ailments);   // 고른 상태이상 = 결정체
      persist();
      openModal("status");
    });
    // 공방 휘젓기
    var pad = $("#stir-pad");
    if (pad) {
      pad.addEventListener("pointerdown", function (e) { brew.active = true; brew.lastAng = null; try { pad.setPointerCapture(e.pointerId); } catch (x) {} });
      pad.addEventListener("pointermove", onStirMove);
      pad.addEventListener("pointerup", endStir);
      pad.addEventListener("pointercancel", endStir);
    }
    var rbtn = $("#brew-reduced-btn"); if (rbtn) rbtn.addEventListener("click", function () { finishBrew(0.5); });
    var bdone = $("#brew-done-btn"); if (bdone) bdone.addEventListener("click", closeBrew);
    var bcancel = $("#brew-cancel"); if (bcancel) bcancel.addEventListener("click", closeBrew);
    var spc = $("#seed-picker-close"); if (spc) spc.addEventListener("click", function () { $("#seed-picker").hidden = true; });
    // 모달 열기/닫기 (네비, 모달 내 이동 버튼)
    $$("[data-open]").forEach(function (b) { b.addEventListener("click", function () { openModal(b.dataset.open); }); });
    $$("[data-close]").forEach(function (b) { b.addEventListener("click", closeModal); });
  }

  function init() {
    buildAilmentChips(); wire(); initSplash();
    function useData(q, d) {
      state.data.quests = q; state.data.dialogue = d;
      var restored = restore();
      var isNewDay = checkDailyReset();

      updateHud(); applyHomeTheme(); setViewClass("home");
      ensurePlots(); ensureRequest(); updateWorkshopBadge();

      if (isNewDay && restored) {
        // 새 날: streak·별사탕·레벨은 유지, 오늘 체크인은 리셋 → 빈 홈 표시
        state.status = null; state.quests = null;
        state.completed = {}; state.rewardedKeys = {}; state.savedToday = false;
        updateHome();
      } else if (!restored) {
        // 첫 방문: 데모 상태로 시작 (앱이 어떻게 생겼는지 보여줌)
        state.badges["first-save"] = true; state.badges["tea-break"] = true; state.badges["survival-day"] = true;
        state.npcMet["healer"] = true;
        // 데모 재료·씨앗(공방·텃밭이 비어 보이지 않게)
        DEFAULT_CHECKIN.ailments.forEach(function (id) { addMaterial(id, 1); });
        addMaterial("tea", 1); addMaterial("walk", 1);
        addSeed("moonherb", 1); addSeed("dew_berry", 1);
        updateWorkshopBadge();
        applyCheckin(DEFAULT_CHECKIN);
      } else {
        // 같은 날 재방문: 오늘 체크인 상태 유지
        applyCheckin(DEFAULT_CHECKIN);
      }
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
