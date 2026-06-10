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
    badges: {}, completedEver: 0, npcMet: {}
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
        badges: state.badges, npcMet: state.npcMet, completedEver: state.completedEver
      }));
    } catch (e) {}
  }
  function restore() {
    try {
      var s = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
      if (!s) return false;
      state.streak = s.streak; state.stardust = s.stardust; state.level = s.level; state.xp = s.xp; state.xpMax = s.xpMax;
      state.badges = s.badges || {}; state.npcMet = s.npcMet || {}; state.completedEver = s.completedEver || 0;
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
          renderNpcModalContent(); persist();
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
            state.stardust += r; gainXp(r); floatReward(card, "+" + r + " ⭐"); persist();
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
      state.lastSave = { gained: gained, xpGain: xpGain, leveled: leveled, done: done, newBadges: newBadges };
      state.savedToday = true;
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
    // 체크인 저장
    $("#checkin-save").addEventListener("click", function () { applyCheckin(readCheckinForm()); openModal("status"); });
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

      if (isNewDay && restored) {
        // 새 날: streak·별사탕·레벨은 유지, 오늘 체크인은 리셋 → 빈 홈 표시
        state.status = null; state.quests = null;
        state.completed = {}; state.rewardedKeys = {}; state.savedToday = false;
        updateHome();
      } else if (!restored) {
        // 첫 방문: 데모 상태로 시작 (앱이 어떻게 생겼는지 보여줌)
        state.badges["first-save"] = true; state.badges["tea-break"] = true; state.badges["survival-day"] = true;
        state.npcMet["healer"] = true;
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
