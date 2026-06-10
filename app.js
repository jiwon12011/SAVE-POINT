/* SAVE POINT — 연금술 게임 로직
 * 홈 = NPC가 배경에 서 있는 공방(탭하면 대화). 정산·채집·상점·공방·텃밭·도감 = 버튼/네비로 뜨는 팝업(모달).
 */
(function () {
  "use strict";

  var state = {
    npc: "healer",
    lastSave: null,
    streak: 4, stardust: 0, level: 7, xp: 40, xpMax: 100,
    badges: {}, completedEver: 0, npcMet: {},
    /* 포션 연금술 */
    materials: {}, seeds: {}, plots: [], potionCodex: {}, activeRequest: null, requestIndex: 0,
    /* 일일 플래그 (정산/채집 가용) */
    settledToday: false, foragedToday: {}
  };

  var NPC_NAME = { healer: "힐러", innkeeper: "여관주인", guildmaster: "길드마스터", rival: "라이벌", wizard: "마법사" };

  /* 고정 게임 톤 NPC 대사 (state.status 의존 제거) */
  var GAME_LINES = {
    healer: [
      { text: "어서 와요, 연금술사. 오늘은 어떤 포션을 빚어볼까요? 🌿", expr: "default" },
      { text: "재료가 부족하면 달빛 숲으로 채집을 떠나봐요. 허브가 많거든요.", expr: "relax" },
      { text: "급할 거 없어요. 좋은 포션은 천천히, 고르게 저어야 나와요.", expr: "comfort" }
    ],
    innkeeper: [
      { text: "채집은 잘 다녀왔어요? 어디든 하루 한 번은 들를 수 있어요. 🗺️", expr: "default" },
      { text: "동굴엔 광물이, 연못엔 희귀한 게 가라앉아 있죠. 골라서 가봐요.", expr: "joy" },
      { text: "정산하고 푹 자고 나면 또 새 길이 열려요. 무리 말고요.", expr: "relax" }
    ],
    guildmaster: [
      { text: "의뢰가 들어왔네. 공방에서 확인해봐. 보상은 두둑하니까. 📜", expr: "default" },
      { text: "품질 좋은 포션일수록 별사탕을 많이 쳐줘. 손맛을 키워봐.", expr: "cheer" },
      { text: "꾸준히 정산하는 연금술사를 길드는 좋아하지.", expr: "joy" }
    ],
    rival: [
      { text: "또 왔네. 오늘 내 도감은 한 칸 더 찼는데, 넌? 😏", expr: "default" },
      { text: "완벽한 포션, 만들어본 적 있어? 별 표시 말이야.", expr: "cheer" },
      { text: "지는 건 싫으니까, 너도 분발해. 같이 가는 게 재밌잖아.", expr: "joy" }
    ],
    wizard: [
      { text: "흥미롭군요. 재료가 필요하면 상점에서 결정체를 구할 수 있어요. 🔮", expr: "thinking" },
      { text: "결정체는 포션의 뼈대예요. 거기에 작물 향을 더하면 품질이 올라가죠.", expr: "default" },
      { text: "손이 기억하는 리듬이 재료보다 중요할 때가 있습니다.", expr: "relax" }
    ]
  };
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

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (m) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[m]; }); }
  function byId(id) { var l = window.Engine.AILMENTS; for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }

  /* ---------- 뷰 클래스 (배경 전환) ---------- */
  function setViewClass(name) {
    var phone = $(".phone");
    if (!phone) return;
    ["home", "npc", "workshop", "garden", "codex", "forage", "shop"].forEach(function (v) {
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

  /* ---------- 홈 배너 업데이트 (도감 진행도 안내) ---------- */
  function updateBanner() {
    var banner = $("#save-banner-sec");
    var streakLine = $("#streak-line");
    var bannerMsg = $("#banner-msg");
    var total = (PD.potions || []).length;
    var unlocked = Object.keys(state.potionCodex || {}).length;
    if (streakLine) streakLine.textContent = "포션 도감 " + unlocked + " / " + total;
    if (banner) banner.classList.toggle("saved-today", total > 0 && unlocked >= total);
    if (bannerMsg) {
      bannerMsg.textContent = (total > 0 && unlocked >= total)
        ? "도감을 모두 채웠어요. 완벽한 포션도 노려봐요. ✨"
        : "빛나는 장소를 탭해 채집하고, 공방에서 포션을 빚어요.";
    }
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
  /* ---------- 영속(localStorage) ---------- */
  var SAVE_KEY = "savepoint_state_v1";
  function persist() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        streak: state.streak, stardust: state.stardust, level: state.level, xp: state.xp, xpMax: state.xpMax,
        badges: state.badges, npcMet: state.npcMet, completedEver: state.completedEver,
        materials: state.materials, seeds: state.seeds, plots: state.plots, potionCodex: state.potionCodex, activeRequest: state.activeRequest, requestIndex: state.requestIndex,
        settledToday: state.settledToday, foragedToday: state.foragedToday
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
      state.requestIndex = s.requestIndex || 0;
      state.settledToday = !!s.settledToday; state.foragedToday = s.foragedToday || {};
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
    if (name === "npc") renderNpcModalContent();
    if (name === "workshop") { ensureRequest(); renderWorkshop(); }
    if (name === "garden") renderGarden();
    if (name === "codex") renderPotionCodex();
    if (name === "shop") renderShop();
    $("#modal-layer").hidden = false;
    $$(".modal").forEach(function (m) { m.classList.toggle("show", m.id === "modal-" + name); });
    setNav(name);
  }
  function closeModal() {
    setViewClass("home");
    $("#modal-layer").hidden = true;
    $$(".modal").forEach(function (m) { m.classList.remove("show"); });
    setNav("home");
    updateHome();   // 홈 NPC·말풍선·배너 동기화(NPC 전환 반영)
  }

  /* ---------- NPC 대화 모달 ---------- */
  var NPC_AVAIL = ["healer", "innkeeper", "guildmaster", "rival", "wizard"];
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
    var lines = (GAME_LINES[npc] || GAME_LINES.healer).slice();
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
    NPC_AVAIL.forEach(function (npcId) {
      var btn = document.createElement("button");
      btn.className = "npc-card" + (npcId === npc ? " selected" : "");
      btn.innerHTML = '<img src="assets/' + npcId + '-default.png" alt="" /><span>' + NPC_NAME[npcId] + "</span>";
      btn.addEventListener("click", function () {
        state.npc = npcId; state.npcMet[npcId] = true;
        var seed = dropNpcSeed(npcId);   // NPC 씨앗 보장 드롭(세션당 1회, healer/innkeeper만 풀 보유)
        renderNpcModalContent();
        if (seed) floatReward($("#npc-portrait"), "🌱 " + cropName(seed) + " 씨앗");
        persist();
      });
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

  function setHomeSprite(expr) {
    $("#home-npc").src = npcSprite(state.npc, expr);
    $("#home-npc").className = "home-npc " + state.npc;
  }
  /* 홈 NPC 탭 반응: 점프 애니(.react 토글). REDUCED면 무시. */
  function reactHomeNpc() {
    if (REDUCED) return;
    var npc = $("#home-npc"); if (!npc) return;
    npc.classList.remove("react"); void npc.offsetWidth; npc.classList.add("react");
    setTimeout(function () { npc.classList.remove("react"); }, 480);
  }
  function updateHome() {
    var npc = state.npc || "healer";
    $("#home-npc-name").textContent = NPC_NAME[npc];
    homeLines = (GAME_LINES[npc] || GAME_LINES.healer).slice();
    homeIdx = 0;
    setHomeSprite(homeLines[0].expr);
    typeInto($("#home-speech"), homeLines[0].text);
    updateBanner();
    initSceneHotspots();   // 채집 핫스팟 wire + done 상태 반영
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

  /* ---------- 채집 (forage) — 홈 씬 핫스팟 터치 ----------
   * 결과 DOM/모달은 폐기. 핵심(addMaterial/addSeed/persist)만 유지하고 loot을 반환해
   * 핫스팟 모션의 onDone에서 비행할 대표 재료를 고를 수 있게 한다. */
  function forageAt(pid) {
    var f = (PD.forage || {})[pid];
    if (!f || state.foragedToday[pid]) return null;
    state.foragedToday[pid] = true;
    var loot = [];   // {id, seed:bool}
    var n = 1 + Math.floor(Math.random() * 2) + Math.floor(Math.random() * 2);   // 1~3개, 2 중심 가중치(2d2-1)
    for (var i = 0; i < n; i++) {
      var id = f.pool[Math.floor(Math.random() * f.pool.length)];
      addMaterial(id, 1); loot.push({ id: id, seed: false });
    }
    if (f.seeds && f.seeds.length && Math.random() < (f.seedChance || 0)) {
      var c = f.seeds[Math.floor(Math.random() * f.seeds.length)];
      addSeed(c, 1); loot.push({ id: c, seed: true });
    }
    updateWorkshopBadge(); persist();
    return loot;
  }

  /* ===========================================================================
   * 채집 모션 (motion-engineer 설계) — 핫스팟 터치 → 재료 아이콘이 HUD로 비행
   * 성능: 파티클·ripple 풀링, rAF 단일 루프, 동시 비행 6개 캡, will-change는 비행 엘만.
   * REDUCED: 모든 모션 건너뛰고 결과(forageAt)만 즉시 반영.
   * ======================================================================== */
  var flyParticles = [];   // 비행 중인 파티클 {el, t, dur, x0,y0, x1,y1, cx,cy, onDone}
  var flyPool = [];        // 재사용 풀
  var flyRAF = 0;
  var ripplePool = [];
  var FLY_CAP = 6;

  function bezier3(a, b, c, t) {   // 2차 베지어(시작 a, 제어 b, 끝 c)
    var u = 1 - t;
    return u * u * a + 2 * u * t * b + c * t * t;
  }

  function acquireFly() {
    var el = flyPool.pop();
    if (!el) {
      el = document.createElement("div");
      el.className = "fly-particle";
      el.style.willChange = "transform, opacity";   // 비행 엘에만
    }
    return el;
  }
  function releaseFly(el) {
    el.style.opacity = "0";
    if (el.parentNode) el.parentNode.removeChild(el);
    if (flyPool.length < FLY_CAP + 2) flyPool.push(el);
  }

  function flyTick(now) {
    flyRAF = 0;
    var phone = $(".phone"); if (!phone) { flyParticles.length = 0; return; }
    for (var i = flyParticles.length - 1; i >= 0; i--) {
      var p = flyParticles[i];
      if (!p.start) p.start = now;
      var t = Math.min(1, (now - p.start) / p.dur);
      var e = t * (2 - t);                       // easeOutQuad
      var x = bezier3(p.x0, p.cx, p.x1, e);
      var y = bezier3(p.y0, p.cy, p.y1, e);
      var s = 1 - 0.45 * e;
      p.el.style.transform = "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px) scale(" + s.toFixed(3) + ")";
      p.el.style.opacity = (t < 0.85 ? 1 : (1 - (t - 0.85) / 0.15)).toFixed(3);
      if (t >= 1) {
        var done = p.onDone; releaseFly(p.el); flyParticles.splice(i, 1);
        if (done) done();
      }
    }
    if (flyParticles.length) flyRAF = requestAnimationFrame(flyTick);
  }

  /* 재료 아이콘이 from(핫스팟)→star-chip으로 포물선 비행. onDone은 도착 시 1회. */
  function flyToHud(fromEl, matInfoObj, onDone) {
    var phone = $(".phone"), target = $(".star-chip");
    if (!phone || !target || flyParticles.length >= FLY_CAP) { if (onDone) onDone(); return; }
    var pr = phone.getBoundingClientRect();
    var fr = fromEl.getBoundingClientRect();
    var tr = target.getBoundingClientRect();
    var x0 = fr.left - pr.left + fr.width / 2;
    var y0 = fr.top - pr.top + fr.height / 2;
    var x1 = tr.left - pr.left + tr.width / 2;
    var y1 = tr.top - pr.top + tr.height / 2;
    var el = acquireFly();
    el.innerHTML = matInfoObj && matInfoObj.img
      ? '<img src="' + matInfoObj.img + '" alt="" />'
      : '<span>' + ((matInfoObj && matInfoObj.emoji) || "🌿") + "</span>";
    el.style.opacity = "1";
    el.style.transform = "translate(" + x0.toFixed(1) + "px," + y0.toFixed(1) + "px) scale(1)";
    phone.appendChild(el);
    var pdata = {
      el: el, start: 0, dur: 620,
      x0: x0, y0: y0, x1: x1, y1: y1,
      cx: (x0 + x1) / 2 + (x1 - x0) * 0.12,        // 살짝 위로 솟는 제어점
      cy: Math.min(y0, y1) - 70,
      onDone: onDone
    };
    flyParticles.push(pdata);
    if (!flyRAF) flyRAF = requestAnimationFrame(flyTick);
    // orphan 안전망: rAF 체인이 끊겨도 반드시 정리 + onDone 1회
    setTimeout(function () {
      var idx = flyParticles.indexOf(pdata);
      if (idx >= 0) { flyParticles.splice(idx, 1); releaseFly(pdata.el); if (pdata.onDone) pdata.onDone(); }
    }, pdata.dur + 400);
  }

  /* 터치 ripple (풀링) */
  function spawnRipple(btn, e) {
    if (REDUCED) return;
    var r = ripplePool.pop();
    if (!r) { r = document.createElement("span"); r.className = "scene-ripple"; }
    var rect = btn.getBoundingClientRect();
    var pt = (e && e.touches && e.touches[0]) || e;
    var cx = pt ? (pt.clientX - rect.left) : rect.width / 2;
    var cy = pt ? (pt.clientY - rect.top) : rect.height / 2;
    r.style.left = cx + "px"; r.style.top = cy + "px";
    btn.appendChild(r);
    r.classList.remove("go"); void r.offsetWidth; r.classList.add("go");
    setTimeout(function () {
      if (r.parentNode) r.parentNode.removeChild(r);
      if (ripplePool.length < 4) ripplePool.push(r);
    }, 560);
  }

  /* 대표 재료(첫 비-씨앗, 없으면 첫 씨앗) info — 비행 아이콘용 */
  function lootLeadInfo(loot) {
    if (!loot || !loot.length) return { emoji: "🌿" };
    var lead = null;
    for (var i = 0; i < loot.length; i++) { if (!loot[i].seed) { lead = loot[i]; break; } }
    if (!lead) lead = loot[0];
    if (lead.seed) return { img: "assets/seeds/seed_" + lead.id + ".png" };
    return matInfo(lead.id);
  }

  function markHotspotDone(btn) {
    btn.classList.add("done");
    btn.disabled = true;
    btn.setAttribute("aria-disabled", "true");
  }

  /* 핫스팟 1회 채집 연출: ripple → 아이콘 흔들기 → 비행(도착 시 forageAt+done+HUD pop) */
  function playHarvestMotion(btn, pid, e) {
    if (state.foragedToday[pid] || btn.classList.contains("done")) return;
    // 게임 로직은 즉시 확정(연출과 무관) — 채집·done·HUD를 바로 처리
    var loot = forageAt(pid);
    if (!loot) return;
    markHotspotDone(btn);
    popHud();
    if (REDUCED) return;
    // 이하 순수 연출
    spawnRipple(btn, e);
    var icon = btn.querySelector(".hotspot-icon");
    if (icon && icon.animate) {
      icon.animate(
        [{ transform: "scale(1) rotate(0)" }, { transform: "scale(1.3) rotate(-12deg)" },
         { transform: "scale(1.15) rotate(10deg)" }, { transform: "scale(1) rotate(0)" }],
        { duration: 340, easing: "ease-out" }
      );
    }
    flyToHud(btn, lootLeadInfo(loot), null);
  }

  function popHud() {
    var chip = $(".star-chip"); if (!chip) return;
    chip.classList.remove("pop"); void chip.offsetWidth; chip.classList.add("pop");
    setTimeout(function () { chip.classList.remove("pop"); }, 420);
  }

  /* 핫스팟 초기화/상태 반영 (홈 표시될 때마다 호출) */
  function initSceneHotspots() {
    $$("#scene-hotspots .hotspot").forEach(function (btn) {
      var pid = btn.dataset.place;
      var done = !!state.foragedToday[pid];
      btn.classList.toggle("done", done);
      btn.disabled = done;
      btn.setAttribute("aria-disabled", done ? "true" : "false");
      if (btn._hsWired) return;       // 리스너 1회만
      btn._hsWired = true;
      btn.addEventListener("click", function (e) { playHarvestMotion(btn, pid, e); });
    });
  }

  /* ---------- 상점 (shop) ---------- */
  function renderShop() {
    var sd = $("#shop-stardust"); if (sd) sd.textContent = "⭐ " + state.stardust;
    var sh = PD.shop || {};
    var seedWrap = $("#shop-seeds"), matWrap = $("#shop-materials");
    if (seedWrap) {
      seedWrap.innerHTML = "";
      (sh.seeds || []).forEach(function (c) {
        var afford = state.stardust >= sh.seedCost;
        var b = document.createElement("button");
        b.type = "button"; b.className = "shop-item" + (afford ? "" : " broke");
        b.disabled = !afford;
        b.innerHTML =
          '<img src="assets/seeds/seed_' + c + '.png" alt="" />' +
          "<b>" + esc(cropName(c)) + " 씨앗</b>" +
          '<span class="shop-price">⭐ ' + sh.seedCost + "</span>";
        b.addEventListener("click", function () { buyShop("seed", c, sh.seedCost); });
        seedWrap.appendChild(b);
      });
    }
    if (matWrap) {
      matWrap.innerHTML = "";
      (sh.materials || []).forEach(function (id) {
        var afford = state.stardust >= sh.materialCost;
        var m = matInfo(id);
        var b = document.createElement("button");
        b.type = "button"; b.className = "shop-item" + (afford ? "" : " broke");
        b.disabled = !afford;
        b.innerHTML = matVisual(m) + "<b>" + esc(m.name) + "</b><span class=\"shop-price\">⭐ " + sh.materialCost + "</span>";
        b.addEventListener("click", function () { buyShop("mat", id, sh.materialCost); });
        matWrap.appendChild(b);
      });
    }
  }
  function buyShop(kind, id, cost) {
    if (state.stardust < cost) return;
    state.stardust -= cost;
    if (kind === "seed") addSeed(id, 1); else addMaterial(id, 1);
    updateHud(); updateWorkshopBadge(); persist(); renderShop();
  }

  /* ========================================================================
   * 포션 연금술 (1차 MVP) — docs/포션연금술-기획.md
   * ===================================================================== */
  var PD = window.POTION_DATA || {};
  var QUALITY_NAME = ["평범한 포션", "좋은 포션", "완벽한 포션"];
  var QUALITY_ICON = ["○", "◆", "★"];
  var brew = { potionId: null, active: false, lastAng: null, rounds: 0, deltas: [], target: 3 };

  function potionById(id) { var l = PD.potions || []; for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }

  /* ---- 재료/씨앗 정보 룩업 (신규 마스터 없이 기존 데이터 참조) ----
   * 결정체 재료(crystal): 게임 표시명은 POTION_DATA.materialName 우선.
   * 아이콘은 engine AILMENTS에 있으면 그 아이콘, 없는 가상 id(sadness/procrastination 등)는 reward-potion 폴백. */
  var MAT_NAME = PD.materialName || {};
  function matInfo(id) {
    if (PD.crops && PD.crops[id]) return { name: PD.crops[id].name, kind: "crop", img: "assets/crops/" + id + ".png" };
    if (PD.recovery && PD.recovery[id]) return { name: PD.recovery[id].name, kind: "recovery", emoji: PD.recovery[id].emoji };
    var a = byId(id);
    if (a || MAT_NAME[id]) {
      var name = MAT_NAME[id] || (a ? a.name : id);
      return { name: name, kind: "crystal", img: a ? ("assets/" + a.icon + ".png") : "assets/reward-potion.png" };
    }
    return { name: id, kind: "x", emoji: "💎" };
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
  // NPC 전환 시 그 NPC의 씨앗 1개(세션당 NPC별 1회 보장)
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
    var line = matCount() === 0 ? PD.mentorLines.noMaterial : PD.mentorLines.rhythm;
    var ml = $("#workshop-mentor-line"); if (ml) ml.textContent = line;
    var mp = $("#workshop-mentor-img"); if (mp) mp.src = npcSprite("wizard", "thinking");

    // 재료 인벤토리 (보유분만, 축별)
    var inv = $("#workshop-materials"); inv.innerHTML = "";
    var keys = Object.keys(state.materials).filter(function (k) { return state.materials[k] > 0; });
    if (!keys.length) { inv.innerHTML = '<p class="ws-empty">아직 재료가 없어요. 채집·상점·텃밭으로 재료를 모아보세요.</p>'; }
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
    if (!pool.length) { list.innerHTML = '<p class="ws-empty">제조할 수 있는 포션이 아직 없어요. 채집·상점에서 결정체를 모아보세요.</p>'; }
    pool.forEach(function (p) {
      var plan = brewPlan(p);
      var card = document.createElement("article");
      card.className = "brew-card";
      var hint = plan && plan.matchScore >= 4 ? "완벽 가능 ★" : plan && plan.matchScore >= 2 ? "좋음 가능 ◆" : "평범 ○";
      card.innerHTML =
        '<img class="brew-thumb" src="' + potionImg(p) + '" alt="" width="46" height="46" decoding="async" loading="lazy" />' +
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
    var liq = $("#brew-liquid"); if (liq) { liq.style.transform = "rotate(0deg) scaleY(0.36)"; }
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
    var rect = brew.padRect;                       // perf: pointerdown에서 1회 캐시한 rect 사용(레이아웃 스래싱 방지)
    if (!rect) { var pad0 = $("#stir-pad"); if (!pad0) return; rect = brew.padRect = pad0.getBoundingClientRect(); }
    var ang = stirAngle(e, rect);
    if (brew.lastAng !== null) {
      var d = ang - brew.lastAng;
      if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI;
      brew.rounds += Math.abs(d) / (2 * Math.PI);
      brew.deltas.push(Math.abs(d)); if (brew.deltas.length > 40) brew.deltas.shift();
      var liq = $("#brew-liquid");
      if (liq) {
        // perf: height(레이아웃) 대신 scaleY(합성)로만 — transform 한 번에 write
        var scale = Math.min(1, 0.36 + brew.rounds / brew.target * 0.64);
        liq.style.transform = "rotate(" + (ang * 180 / Math.PI) + "deg) scaleY(" + scale.toFixed(3) + ")";
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
    growPlotsOnSave();   // 제조 1개 = 텃밭 전체 +1단계(정산이 하던 역할을 제조로 이동)
    // 보상
    var reward = 10 + q * 7;
    state.stardust += reward; gainXp(reward); updateHud();
    // 의뢰 충족
    var reqMsg = checkRequestFulfill(p.id, q);
    // 결과 표시
    var liq = $("#brew-liquid"); if (liq) liq.style.transform = "rotate(0deg) scaleY(1)";
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
    updateBanner();   // 도감 진행도 갱신
    persist();
  }
  function closeBrew() { $("#brew-stage").hidden = true; renderWorkshop(); }

  /* ---- 의뢰 (정산 시 완료된 의뢰는 다음 의뢰로 순환) ---- */
  function requestPool() { return (PD.requests && PD.requests.length) ? PD.requests : (PD.request ? [PD.request] : []); }
  function currentRequestDef() {
    var pool = requestPool(); if (!pool.length) return null;
    return pool[state.requestIndex % pool.length];
  }
  function ensureRequest() {
    if (state.activeRequest) return;
    var r = currentRequestDef(); if (!r) return;
    state.activeRequest = { id: r.id, npc: r.npc, wants: r.wantsPotion || r.wantsPotion, quality: r.wantsQuality, status: "open" };
  }
  // 정산 시: 완료된 의뢰면 다음 의뢰로 교체
  function rotateRequestIfDone() {
    if (state.activeRequest && state.activeRequest.status === "done") {
      state.requestIndex = (state.requestIndex + 1) % Math.max(1, requestPool().length);
      state.activeRequest = null;
      ensureRequest();
    }
  }
  function updateRequestCard() {
    var wrap = $("#workshop-request"); if (!wrap) return;
    var r = currentRequestDef(), ar = state.activeRequest;
    if (!r || !ar) { wrap.hidden = true; return; }
    wrap.hidden = false;
    var done = ar.status === "done";
    wrap.innerHTML =
      '<img class="req-npc" src="' + npcSprite(r.npc, done ? "joy" : "thinking") + '" alt="" />' +
      '<div class="req-body"><span class="req-tag">' + NPC_NAME[r.npc] + "의 의뢰" + (done ? " · 완료 (정산하면 새 의뢰)" : "") + "</span>" +
      "<p>" + esc(done ? r.doneLine : r.offerLines[0]) + "</p>" +
      '<small>요구: ' + esc(potionById(r.wantsPotion).name) + " · 좋음 이상 · 보상 별사탕 +" + r.rewardStardust + "</small></div>";
  }
  function checkRequestFulfill(potionId, q) {
    var ar = state.activeRequest, r = currentRequestDef();
    if (!ar || !r || ar.status !== "open" || ar.wants !== potionId || q < ar.quality) return null;
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
          '<span class="plot-progress">' + left + "번 더 제조하면 수확 🌱</span>";
      }
      grid.appendChild(cell);
    });
    // 보유 씨앗 요약
    var sw = $("#garden-seeds"); sw.innerHTML = "";
    var seedKeys = Object.keys(state.seeds).filter(function (k) { return state.seeds[k] > 0; });
    if (!seedKeys.length) sw.innerHTML = '<p class="ws-empty">씨앗이 없어요. 채집·상점·정산으로 씨앗을 받아요.</p>';
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
      b.innerHTML = '<img src="assets/seeds/seed_' + c + '.png" alt="" /><b>' + esc(cropName(c)) + '</b><small>제조 ' + g + '회</small>';
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
        el.innerHTML = '<img src="' + potionImg(p) + '" alt="" width="54" height="54" decoding="async" loading="lazy" /><b>' + esc(p.name) + "</b>" +
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
    // 홈 액션: 공방 / 텃밭 (채집은 씬 핫스팟 터치로, 정산은 폐기)
    var wsBtn = $("#act-workshop"); if (wsBtn) wsBtn.addEventListener("click", function () { openModal("workshop"); });
    var gdBtn = $("#act-garden"); if (gdBtn) gdBtn.addEventListener("click", function () { openModal("garden"); });
    // 홈 NPC 탭 → 점프 반응 후 NPC 대화 모달
    $("#home-npc").addEventListener("click", function () { reactHomeNpc(); openModal("npc"); });
    $("#home-npc").addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); reactHomeNpc(); openModal("npc"); } });
    // 홈 말풍선 탭 → 그 자리에서 다음 대사 (NPC와 잡담)
    var bubble = $("#home-bubble"); if (bubble) bubble.addEventListener("click", homeTalk);
    // NPC 대화창 탭 → 다음 대사
    var dlgBox = $("#npc-dialogue-box");
    if (dlgBox) {
      dlgBox.addEventListener("click", advanceNpcDialogue);
      dlgBox.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); advanceNpcDialogue(); } });
    }
    // 공방 휘젓기
    var pad = $("#stir-pad");
    if (pad) {
      pad.addEventListener("pointerdown", function (e) { brew.active = true; brew.lastAng = null; brew.padRect = pad.getBoundingClientRect(); try { pad.setPointerCapture(e.pointerId); } catch (x) {} });
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
    wire(); initSplash();

    var restored = restore();
    var isNewDay = checkDailyReset();

    applyHomeTheme(); setViewClass("home");
    ensurePlots(); ensureRequest();

    if (isNewDay) {
      // 새 날: 별사탕·레벨·인벤토리는 유지, 채집 가용만 리셋(정산이 하던 일일 리셋을 날짜 기준으로 대체)
      state.foragedToday = {};
      state.settledToday = false;       // 미사용이나 세이브 호환 위해 초기화
      rotateRequestIfDone();            // 완료된 의뢰면 새 날에 다음 의뢰로 교체(정산이 하던 역할)
      if (restored) persist();
    }
    if (!restored) {
      // 첫 방문: 데모 재료·씨앗(공방·텃밭이 비어 보이지 않게)
      state.npcMet["healer"] = true;
      ["sleep_deprivation", "deadline_fear", "notification_overload"].forEach(function (id) { addMaterial(id, 1); });
      addMaterial("tea", 1); addMaterial("walk", 1);
      addSeed("moonherb", 1); addSeed("dew_berry", 1);
      persist();
    }

    updateHud(); updateWorkshopBadge(); updateHome();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
