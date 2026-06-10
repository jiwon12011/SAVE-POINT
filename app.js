/* SAVE POINT — 연금술 게임 로직
 * 홈 = NPC가 배경에 서 있는 공방(탭하면 대화). 정산·채집·상점·공방·텃밭·도감 = 버튼/네비로 뜨는 팝업(모달).
 */
(function () {
  "use strict";

  var state = {
    npc: "healer",
    streak: 4, stardust: 0, level: 7, xp: 40, xpMax: 100,
    /* 포션 연금술 */
    materials: {}, seeds: {}, plots: [], potionCodex: {},
    /* 스토리 챕터 (NPC 방문 진행) — currentChapter: 진행 인덱스, chapterPhase: story→quest→done */
    currentChapter: 0, chapterPhase: "story",
    /* 마지막 챕터 이후 자유 의뢰(freeRequest) 루프 인덱스 */
    requestIndex: 0,
    /* 일일 플래그 (채집 가용) */
    foragedToday: {},
    /* 첫 플레이 튜토리얼 단계 (0 미시작…4 완료) */
    tutorialStep: 0
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
      { text: "포션 하나 빚고 나면 또 새 길이 열려요. 무리하지 말고요.", expr: "relax" }
    ],
    guildmaster: [
      { text: "의뢰가 들어왔네. 공방에서 확인해봐. 보상은 두둑하니까. 📜", expr: "default" },
      { text: "품질 좋은 포션일수록 별사탕을 많이 쳐줘. 손맛을 키워봐.", expr: "cheer" },
      { text: "꾸준히 포션을 납품하는 연금술사를 길드는 좋아하지.", expr: "joy" }
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
  function byId(id) { var l = (window.POTION_DATA && window.POTION_DATA.ailments) || []; for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }

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

  /* ---------- HUD 도감 진행 칩 ---------- */
  function updateBanner() {
    var prog = $("#codex-prog");
    var total = (PD.potions || []).length;
    var unlocked = Object.keys(state.potionCodex || {}).length;
    if (prog) prog.textContent = unlocked + "/" + total;
  }

  /* ---------- 스토리 챕터 (NPC 순차 방문) ---------- */
  var CD = window.CHAPTER_DATA || { loopMode: "freeRequest", chapters: [] };
  function chapters() { return CD.chapters || []; }
  function isFreeMode() { return state.currentChapter >= chapters().length; }
  function currentChapter() {
    var list = chapters();
    if (!list.length) return null;
    return isFreeMode() ? null : list[state.currentChapter];
  }
  // 현재 챕터의 방문 NPC (자유 의뢰면 freeRequest 의뢰의 npc, 둘 다 없으면 healer)
  function chapterNpc() {
    var ch = currentChapter();
    if (ch) return ch.npc;
    var fr = freeRequestDef();
    return (fr && fr.npc) || "healer";
  }
  // 마지막 챕터 후 자유 의뢰: PD.requests 순환 폴백
  function freeRequestDef() {
    var pool = PD.requests || [];
    if (!pool.length) return null;
    return pool[state.requestIndex % pool.length];
  }
  // 현재 챕터/자유의뢰를 통일된 형태로 — { npc, wantsPotion, wantsQuality, rewardStardust, rewardMaterial, rewardQty }
  function activeQuest() {
    var ch = currentChapter();
    if (ch) return ch;
    var fr = freeRequestDef();
    if (!fr) return null;
    return { npc: fr.npc, title: NPC_NAME[fr.npc] + "의 의뢰",
      wantsPotion: fr.wantsPotion, wantsQuality: fr.wantsQuality,
      rewardStardust: fr.rewardStardust, rewardMaterial: fr.rewardMaterial, rewardQty: fr.rewardQty, free: true };
  }
  // 홈/모달에서 "방문 NPC가 할 말 있음" — story 미열람(phase story) 또는 퀘스트 충족 대기(phase done)
  function chapterHasNews() {
    // 자유 의뢰도 새 의뢰(story) / 충족 대기(done)면 알림
    return state.chapterPhase === "story" || state.chapterPhase === "done";
  }
  // 제조 결과가 현재 퀘스트를 충족하면 phase를 done으로 (보상은 done 대사 후 1회)
  function checkChapterFulfill(potionId, q) {
    if (state.chapterPhase !== "quest") return false;
    var quest = activeQuest();
    if (!quest) return false;
    if (quest.wantsPotion !== potionId || q < quest.wantsQuality) return false;
    state.chapterPhase = "done";
    return true;
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
    if (leveled) {
      var chip = $("#lv-chip"); chip.classList.remove("pop"); void chip.offsetWidth; chip.classList.add("pop");
      levelUpRitual(state.level);
    }
    return leveled;
  }
  /* 레벨에서 파생되는 칭호(저장 불필요 — 도감 완성 보상에서도 재활용) */
  function titleForLevel(lv) {
    if (lv >= 21) return "달의 정련사";
    if (lv >= 13) return "밤의 연금술사";
    if (lv >= 8) return "포션 사냥꾼";
    if (lv >= 4) return "달빛 공방 조수";
    return "새벽의 견습생";
  }
  /* 레벨업 "의식": .phone에 반투명 오버레이 1회 — 큰 Lv.N + 칭호 + 금빛 별 방사.
   * 중복 방지(이미 떠 있으면 무시). 약 1.4초 후 fade-out, 2초 후 remove.
   * REDUCED면 파티클 스킵 + 오버레이는 정적으로 잠깐만 표시(애니는 전역 미디어쿼리가 제거). */
  function levelUpRitual(lv) {
    var phone = $(".phone"); if (!phone) return;
    if ($(".levelup-overlay")) return;   // 중복 생성 방지
    var ov = document.createElement("div");
    ov.className = "levelup-overlay";
    ov.innerHTML =
      '<div class="levelup-card">' +
        '<span class="levelup-tag">LEVEL UP</span>' +
        '<b class="levelup-lv">Lv.' + lv + "</b>" +
        '<span class="levelup-title">' + esc(titleForLevel(lv)) + "</span>" +
      "</div>";
    phone.appendChild(ov);
    if (!REDUCED) levelUpStarBurst();
    setTimeout(function () { if (ov.parentNode) ov.classList.add("fade-out"); }, 1400);
    setTimeout(function () { if (ov.parentNode) ov.parentNode.removeChild(ov); }, 2000);
  }
  /* 화면 중앙에서 8방향 금빛 ✦ 방사 — fly 풀(acquireFly/flyParticles/flyTick) 재활용, FLY_CAP 준수. */
  function levelUpStarBurst() {
    var phone = $(".phone"); if (!phone) return;
    var pr = phone.getBoundingClientRect();
    var cx0 = pr.width / 2, cy0 = pr.height / 2;
    var dist = 96;
    for (var a = 0; a < 8; a++) {
      if (flyParticles.length >= FLY_CAP) break;
      var ang = a * Math.PI / 4;
      var x1 = cx0 + Math.cos(ang) * dist;
      var y1 = cy0 + Math.sin(ang) * dist;
      var el = acquireFly();
      el.innerHTML = '<span style="color:var(--gold)">✦</span>';
      el.style.opacity = "1";
      el.style.transform = "translate(" + cx0.toFixed(1) + "px," + cy0.toFixed(1) + "px) scale(0.6)";
      phone.appendChild(el);
      var pdata = {
        el: el, start: 0, dur: 640,
        x0: cx0, y0: cy0, x1: x1, y1: y1,
        cx: (cx0 + x1) / 2, cy: (cy0 + y1) / 2,
        onDone: null
      };
      flyParticles.push(pdata);
      (function (pd) {
        setTimeout(function () {
          var idx = flyParticles.indexOf(pd);
          if (idx >= 0) { flyParticles.splice(idx, 1); releaseFly(pd.el); }
        }, pd.dur + 300);
      })(pdata);
    }
    if (!flyRAF) flyRAF = requestAnimationFrame(flyTick);
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
        npc: state.npc,
        streak: state.streak, stardust: state.stardust, level: state.level, xp: state.xp, xpMax: state.xpMax,
        materials: state.materials, seeds: state.seeds, plots: state.plots, potionCodex: state.potionCodex,
        currentChapter: state.currentChapter, chapterPhase: state.chapterPhase, requestIndex: state.requestIndex,
        foragedToday: state.foragedToday,
        tutorialStep: state.tutorialStep
      }));
    } catch (e) {}
  }
  function restore() {
    try {
      var s = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
      if (!s) return false;
      state.streak = s.streak; state.stardust = s.stardust; state.level = s.level; state.xp = s.xp; state.xpMax = s.xpMax;
      // 포션 슬롯: 구버전 localStorage 호환(없으면 기본값)
      state.materials = s.materials || {}; state.seeds = s.seeds || {};
      state.plots = s.plots || []; state.potionCodex = s.potionCodex || {};
      // 챕터 슬롯: 구버전 세이브엔 없으므로 0/story 기본
      state.currentChapter = s.currentChapter || 0;
      state.chapterPhase = s.chapterPhase || "story";
      state.requestIndex = s.requestIndex || 0;
      state.npc = s.npc || state.npc;
      state.foragedToday = s.foragedToday || {};
      // 튜토리얼 단계: 구버전 세이브엔 없으므로 0(미시작) 기본. 복원된 유저는 init에서 강제로 시작하지 않음.
      state.tutorialStep = (typeof s.tutorialStep === "number") ? s.tutorialStep : 0;
      return true;
    } catch (e) { return false; }
  }

  /* ---------- 모달 ---------- */
  function setNav(name) {
    $$(".bottom-nav [data-open]").forEach(function (b) { b.classList.toggle("active", b.dataset.open === name); });
  }
  function openModal(name) {
    if (name === "home") { closeModal(); return; }
    // 도감에서 다른 모달로 전환 시에도 isNew 소거
    var codexEl = $("#modal-codex");
    if (name !== "codex" && codexEl && codexEl.classList.contains("show")) clearCodexNew();
    // 모달 전환 시 공방 휘젓기/씨앗 고르기 오버레이 잔류 방지
    var bs = $("#brew-stage"); if (bs) bs.hidden = true;
    var sp = $("#seed-picker"); if (sp) sp.hidden = true;
    brew.active = false;
    setViewClass(name);
    if (name === "workshop") { renderWorkshop(); advanceTutorial(2); }
    if (name === "garden") renderGarden();
    if (name === "codex") renderPotionCodex();
    if (name === "shop") renderShop();
    $("#modal-layer").hidden = false;
    $$(".modal").forEach(function (m) { m.classList.toggle("show", m.id === "modal-" + name); });
    // 페이지 스크롤 위치 리셋(이전 모달의 스크롤 잔상 방지)
    var body = $("#modal-" + name + " .modal-body"); if (body) body.scrollTop = 0;
    setNav(name);
    // 튜토리얼 링 재평가(홈 타깃은 페이지에서 숨겨지므로 자동으로 안 그려짐)
    if (state.tutorialStep >= 1 && state.tutorialStep < 4) tutorialHighlight(state.tutorialStep);
    else clearTutorialRing();
  }
  function closeModal() {
    // 도감을 닫는 중이면 isNew(첫 등록) 플래그 소거 + 영속
    var codexEl = $("#modal-codex");
    if (codexEl && codexEl.classList.contains("show")) clearCodexNew();
    setViewClass("home");
    $("#modal-layer").hidden = true;
    $$(".modal").forEach(function (m) { m.classList.remove("show"); });
    setNav("home");
    updateHome();   // 홈 NPC·말풍선·배너 동기화(NPC 전환 반영)
  }

  /* ---------- NPC 대화 모달 (스토리 챕터: 순차 방문) ----------
   * 수동 선택 폐기. 모달 진입 시 현재 챕터 phase에 따라 대사가 전개된다.
   *  - story:  story[] 순서 진행 → 마지막에 의뢰 수락 버튼 → phase "quest"
   *  - quest:  대기 안내 1줄 + 공방 유도 버튼
   *  - done:   doneStory[] 진행 → 보상 지급 → currentChapter++ → 다음 챕터 story
   */
  // 현재 phase가 보여줄 대사 라인 배열
  function chapterDialogueLines() {
    var ch = currentChapter();
    var phase = state.chapterPhase;
    if (phase === "done") {
      if (ch && ch.doneStory && ch.doneStory.length) return ch.doneStory.slice();
      // 자유 의뢰: 해당 의뢰의 doneLine 사용
      var frDone = freeRequestDef();
      if (frDone && frDone.doneLine) return [{ text: frDone.doneLine, expr: "joy" }];
      return [{ text: "고마워요. 덕분에 큰 도움이 됐어요.", expr: "joy" }];
    }
    if (phase === "quest") {
      var quest = activeQuest();
      var pn = quest ? potionById(quest.wantsPotion) : null;
      var qn = quest ? QUALITY_NAME[quest.wantsQuality] : "";
      var txt = pn ? ("아직 " + pn.name + "(" + qn + " 이상)을 기다리고 있어요. 공방에서 빚어와요. 🧪")
                   : "공방에서 의뢰한 포션을 빚어와요. 🧪";
      return [{ text: txt, expr: "thinking" }];
    }
    // story
    if (ch && ch.story && ch.story.length) return ch.story.slice();
    // 자유 의뢰(freeRequest) — 챕터 없음
    var fr = freeRequestDef();
    if (fr && fr.offerLines) return fr.offerLines.map(function (t) { return { text: t, expr: "default" }; });
    return [{ text: "오늘도 잘 부탁해요, 연금술사.", expr: "default" }];
  }

  // done 대사 끝: 보상 1회 지급 → 다음 챕터로 진행 → 홈 안내(새 손님) 갱신
  function completeChapter() {
    var quest = activeQuest();
    if (quest && state.chapterPhase === "done") {
      state.stardust += quest.rewardStardust; gainXp(quest.rewardStardust);
      if (quest.rewardMaterial) addMaterial(quest.rewardMaterial, quest.rewardQty || 1);
      updateHud(); updateWorkshopBadge();
      floatReward($("#home-npc"), "🎁 별사탕 +" + quest.rewardStardust);
    }
    // 다음 챕터로. 자유 의뢰면 의뢰 인덱스 순환.
    if (isFreeMode()) { state.requestIndex = state.requestIndex + 1; }
    else { state.currentChapter += 1; state.streak += 1; }
    state.chapterPhase = "story";
    persist();
    // 인씬 대화 종료 → 새 손님 안내가 말풍선에 뜨도록 홈 갱신
    conv.active = false;
    updateHome();
    updateRequestCard();
  }

  /* ---------- 홈 NPC: 인씬 대화 (팝업 폐기) ----------
   * 말풍선에서 현재 챕터 phase 대사를 전개한다.
   *  - story: ch.story[] 진행 → 끝에서 의뢰 수락 버튼(→quest, 공방 페이지)
   *  - quest: 대기 안내 → "공방으로 가기" 버튼
   *  - done:  ch.doneStory[] 진행 → "다음 손님 맞이하기"(completeChapter)
   * idle(대화 아님): updateHome가 안내/잡담 한 줄을 말풍선에 띄움.
   */
  var conv = { lines: [], idx: 0, mode: null, active: false };
  var homeType = { timer: null, full: "", typing: false };

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

  function typeInto(el, text) {
    if (!el) return;
    homeType.full = text; clearInterval(homeType.timer);
    if (REDUCED) { el.textContent = text; homeType.typing = false; return; }
    el.textContent = ""; homeType.typing = true; var i = 0;
    homeType.timer = setInterval(function () {
      el.textContent = homeType.full.slice(0, ++i);
      if (i >= homeType.full.length) { clearInterval(homeType.timer); homeType.typing = false; }
    }, 24);
  }

  /* 인씬 대화 시작: 현재 phase 대사 첫 줄부터 */
  function startConv() {
    advanceTutorial(1);   // 튜토리얼 1단계(NPC 말 걸기) 충족
    var npc = chapterNpc();
    state.npc = npc;
    $("#home-npc-name").textContent = NPC_NAME[npc];
    conv.mode = state.chapterPhase;
    conv.lines = chapterDialogueLines();
    conv.idx = 0;
    conv.active = true;
    // 새 손님이 처음 말 걸 때(스토리 단계) 그 NPC 씨앗 1개 보장 드롭(세션당 1회)
    if (state.chapterPhase === "story") {
      var seed = dropNpcSeed(npc);
      if (seed) { persist(); floatReward($("#home-npc"), "🌱 " + cropName(seed) + " 씨앗"); }
    }
    showConvLine();
  }
  function showConvLine() {
    var line = conv.lines[conv.idx] || { text: "...", expr: "default" };
    setHomeSprite(line.expr);
    typeInto($("#home-speech"), line.text);
    var atEnd = conv.idx >= conv.lines.length - 1;
    var next = $("#bubble-next");
    if (next) next.hidden = atEnd;
    if (atEnd) renderBubbleAction();
    else { var ba = $("#bubble-action"); if (ba) { ba.hidden = true; ba.innerHTML = ""; } }
  }
  /* 말풍선 탭/NPC 탭: 타이핑 중이면 완성, 마지막이면 액션 유지, 아니면 다음 줄 */
  function advanceConv() {
    if (homeType.typing) {
      clearInterval(homeType.timer); homeType.typing = false;
      $("#home-speech").textContent = homeType.full;
      if (conv.idx >= conv.lines.length - 1) { var nx = $("#bubble-next"); if (nx) nx.hidden = true; renderBubbleAction(); }
      return;
    }
    if (conv.idx >= conv.lines.length - 1) { renderBubbleAction(); return; }
    conv.idx += 1;
    showConvLine();
  }
  /* 말풍선 하단 행동 영역: phase별 버튼 (기존 renderNpcAction 로직 이전) */
  function renderBubbleAction() {
    var box = $("#bubble-action"); if (!box) return;
    box.innerHTML = ""; box.hidden = true;
    if (conv.idx < conv.lines.length - 1) return;

    if (conv.mode === "story") {
      var quest = activeQuest();
      if (!quest) return;
      var pn = potionById(quest.wantsPotion);
      var qn = QUALITY_NAME[quest.wantsQuality];
      var ch = currentChapter();
      var info = document.createElement("p");
      info.className = "bubble-quest-line";
      info.textContent = "📜 " + (ch ? ch.questText : (pn ? (pn.name + " · " + qn + " 이상") : ""));
      box.appendChild(info);
      var meta = document.createElement("small");
      meta.className = "bubble-quest-meta";
      meta.textContent = "요구: " + (pn ? pn.name : "?") + " · " + qn + " 이상 · 보상 별사탕 +" + quest.rewardStardust;
      box.appendChild(meta);
      var accept = document.createElement("button");
      accept.type = "button"; accept.className = "bubble-accept";
      accept.textContent = "수락하고 공방으로 🧪";
      accept.addEventListener("click", function () {
        state.chapterPhase = "quest"; persist();
        conv.active = false;
        openModal("workshop");
      });
      box.appendChild(accept);
      box.hidden = false;
    } else if (conv.mode === "quest") {
      var go = document.createElement("button");
      go.type = "button"; go.className = "bubble-accept";
      go.textContent = "공방으로 가기 🧪";
      go.addEventListener("click", function () { conv.active = false; openModal("workshop"); });
      box.appendChild(go);
      box.hidden = false;
    } else if (conv.mode === "done") {
      var nextBtn = document.createElement("button");
      nextBtn.type = "button"; nextBtn.className = "bubble-accept";
      nextBtn.textContent = "다음 손님 맞이하기 ✨";
      nextBtn.addEventListener("click", completeChapter);
      box.appendChild(nextBtn);
      box.hidden = false;
    }
  }

  function updateHome() {
    // 방문 NPC = 현재 챕터(또는 자유 의뢰)의 NPC. state.npc를 동기화.
    var npc = chapterNpc();
    state.npc = npc;
    $("#home-npc-name").textContent = NPC_NAME[npc];
    // 홈으로 돌아오면 대화 세션 리셋(idle 안내로 복귀)
    conv.active = false;
    var ba = $("#bubble-action"); if (ba) { ba.hidden = true; ba.innerHTML = ""; }
    var nx = $("#bubble-next"); if (nx) nx.hidden = true;

    // 할 말이 있으면(스토리 미열람·퀘스트 충족 대기) 안내 한 줄, 아니면 잡담 한 줄.
    var news = chapterHasNews();
    var bubble = $("#home-bubble");
    if (bubble) bubble.classList.toggle("has-news", news);
    var lead, expr;
    if (news) {
      var ch = currentChapter();
      lead = (state.chapterPhase === "done")
        ? "손님이 기다려요. 탭해서 포션을 전해줘요. ✨"
        : (ch ? ch.title + " · 손님이 찾아왔어요. 탭해서 말 걸어봐요. ✨" : "새 의뢰가 들어왔어요. 들어볼까요? ✨");
      expr = state.chapterPhase === "done" ? "joy" : "default";
    } else if (state.chapterPhase === "quest") {
      var q = activeQuest();
      var qpn = q ? potionById(q.wantsPotion) : null;
      lead = qpn ? ("공방에서 " + qpn.name + "을(를) 빚어와요 🧪") : "공방에서 의뢰한 포션을 빚어와요 🧪";
      expr = "thinking";
    } else if (allForagedToday()) {
      lead = "오늘 채집은 끝났어요. 공방에서 포션을 빚어볼까요? 🧪";
      expr = "relax";
    } else {
      var chat = (GAME_LINES[npc] || GAME_LINES.healer)[0];
      lead = chat.text; expr = chat.expr;
    }
    setHomeSprite(expr);
    typeInto($("#home-speech"), lead);
    updateBanner();
    initSceneHotspots();   // 채집 핫스팟 wire + done 상태 반영
    // 홈으로 돌아오면 현재 튜토리얼 단계 하이라이트 재배치(페이지 전환으로 어긋남 방지)
    if (state.tutorialStep >= 1 && state.tutorialStep < 4) {
      setTimeout(function () { if ($("#modal-layer").hidden) tutorialHighlight(state.tutorialStep); }, 60);
    } else {
      clearTutorialRing();
    }
  }

  /* ---------- 채집 (forage) — 홈 씬 핫스팟 터치 ----------
   * 결과 DOM/모달은 폐기. 핵심(addMaterial/addSeed/persist)만 유지하고 loot을 반환해
   * 핫스팟 모션의 onDone에서 비행할 대표 재료를 고를 수 있게 한다. */
  /* 오늘의 특별 채집 씬 — 날짜 해시로 forage 3곳 중 1곳 결정(서버 없이 모두 같은 날 같은 결과).
   * 일일 리셋/새로고침 때 todaySpecial을 갱신한다. */
  function getTodaySpecialScene() {
    var keys = Object.keys((PD && PD.forage) || {});
    if (!keys.length) return null;
    var now = new Date();
    var hash = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
    return keys[hash % keys.length];
  }
  var todaySpecial = getTodaySpecialScene();
  // 특별 씬별 보장 희귀 재료
  var SPECIAL_RARE = { forest: "dreambell", cave: "foxfire_cap", pond: "void_lily" };

  /* 오늘 채집 가능한 모든 씬을 다 했는지 — 홈 idle 안내용 */
  function allForagedToday() {
    var keys = Object.keys((PD && PD.forage) || {});
    if (!keys.length) return false;
    for (var i = 0; i < keys.length; i++) { if (!state.foragedToday[keys[i]]) return false; }
    return true;
  }

  function forageAt(pid) {
    var f = (PD.forage || {})[pid];
    if (!f || state.foragedToday[pid]) return null;
    state.foragedToday[pid] = true;
    var special = (pid === todaySpecial);
    var loot = [];   // {id, seed:bool}
    var n = 1 + Math.floor(Math.random() * 2) + Math.floor(Math.random() * 2);   // 1~3개, 2 중심 가중치(2d2-1)
    if (special) n += 1;   // 오늘의 특별 씬: 드롭 +1
    for (var i = 0; i < n; i++) {
      var id = f.pool[Math.floor(Math.random() * f.pool.length)];
      addMaterial(id, 1); loot.push({ id: id, seed: false });
    }
    if (special) {   // 희귀 재료 1개 보장 + 비행 연출 포함
      var rare = SPECIAL_RARE[pid];
      if (rare) { addMaterial(rare, 1); loot.push({ id: rare, seed: false }); }
    }
    if (f.seeds && f.seeds.length && Math.random() < (f.seedChance || 0)) {
      var c = f.seeds[Math.floor(Math.random() * f.seeds.length)];
      addSeed(c, 1); loot.push({ id: c, seed: true });
    }
    if (pid === "forest") advanceTutorial(3);   // 튜토리얼 3단계(숲 채집) 충족 시 진행
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

  /* 포션 탄생 스타버스트: 플라스크 중심에서 6방향으로 ✦ 파티클이 퍼짐.
   * fly 풀(acquireFly/flyParticles/flyTick) 재활용, onDone:null. 좌표는 phone 상대(flask 중심 기준).
   * 품질별 색: q0 은빛 / q1 금빛 / q2 보라금. REDUCED면 스킵. */
  var BURST_COLOR = ["#c8a8f0", "#f0c88a", "#f0a8c8"];
  function potionBirthBurst(flaskEl, q) {
    if (REDUCED || !flaskEl) return;
    var phone = $(".phone"); if (!phone) return;
    var pr = phone.getBoundingClientRect();
    var fr = flaskEl.getBoundingClientRect();
    var cx0 = fr.left - pr.left + fr.width / 2;
    var cy0 = fr.top - pr.top + fr.height / 2;
    var color = BURST_COLOR[q] || BURST_COLOR[0];
    var dist = 64;
    for (var a = 0; a < 6; a++) {
      if (flyParticles.length >= FLY_CAP) break;
      var ang = a * Math.PI / 3;                 // 0/60/120/180/240/300°
      var x1 = cx0 + Math.cos(ang) * dist;
      var y1 = cy0 + Math.sin(ang) * dist;
      var el = acquireFly();
      el.innerHTML = '<span style="color:' + color + '">✦</span>';
      el.style.opacity = "1";
      el.style.transform = "translate(" + cx0.toFixed(1) + "px," + cy0.toFixed(1) + "px) scale(0.6)";
      phone.appendChild(el);
      var pdata = {
        el: el, start: 0, dur: 560,
        x0: cx0, y0: cy0, x1: x1, y1: y1,
        cx: (cx0 + x1) / 2, cy: (cy0 + y1) / 2,   // 직선 방사(제어점=중점)
        onDone: null
      };
      flyParticles.push(pdata);
      (function (pd) {
        setTimeout(function () {
          var idx = flyParticles.indexOf(pd);
          if (idx >= 0) { flyParticles.splice(idx, 1); releaseFly(pd.el); }
        }, pd.dur + 300);
      })(pdata);
    }
    if (!flyRAF) flyRAF = requestAnimationFrame(flyTick);
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

  /* 획득 loot 요약 텍스트 — "대표이름 외 N개 획득" / 1개면 "이름 획득" */
  function lootSummary(loot) {
    if (!loot || !loot.length) return "획득 없음";
    var leadId = loot[0].id;
    var leadName = loot[0].seed ? (cropName(leadId) + " 씨앗") : matInfo(leadId).name;
    var extra = loot.length - 1;
    return extra > 0 ? (leadName + " 외 " + extra + "개 획득") : (leadName + " 획득");
  }
  /* REDUCED 정적 토스트 — 홈 상단에 1.5초 표시 후 제거(애니 없음, 단일 인스턴스). */
  function staticToast(text) {
    var phone = $(".phone"); if (!phone) return;
    var old = $(".static-toast"); if (old && old.parentNode) old.parentNode.removeChild(old);
    var t = document.createElement("div");
    t.className = "static-toast"; t.textContent = text;
    phone.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 1500);
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
    if (REDUCED) { staticToast(lootSummary(loot)); return; }   // 모션 끈 사용자도 획득 피드백
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
      // 오늘의 특별 채집 씬: 아직 안 채집했으면 강조 + 뱃지, 채집했으면 제거
      var special = (pid === todaySpecial) && !done;
      btn.classList.toggle("special-today", special);
      var badge = btn.querySelector(".special-badge");
      if (special && !badge) {
        badge = document.createElement("span");
        badge.className = "special-badge"; badge.textContent = "✨ 오늘";
        btn.appendChild(badge);
      } else if (!special && badge) {
        badge.parentNode.removeChild(badge);
      }
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
  // 새 손님(챕터 NPC)이 찾아올 때 그 NPC의 씨앗 1개(세션당 NPC별 1회 보장, healer/innkeeper만 풀 보유)
  var npcSeedGiven = {};
  function dropNpcSeed(npc) {
    if (npcSeedGiven[npc]) return null;
    var pool = (PD.npcSeeds || {})[npc]; if (!pool || !pool.length) return null;
    npcSeedGiven[npc] = true;
    var c = pool[Math.abs(state.streak + Object.keys(npcSeedGiven).length) % pool.length];
    addSeed(c, 1);
    return c;
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
    if (!keys.length) { inv.innerHTML = '<p class="ws-empty">플라스크가 비어 있군요. 달빛 숲이나 동굴로 채집을 다녀와요.</p>'; }
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
    if (!pool.length) { list.innerHTML = '<p class="ws-empty">결정체가 있어야 포션을 빚을 수 있어요. 숲이나 동굴 채집부터요.</p>'; }
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
    // 도감 등록(최고 품질 유지). 첫 등록이면 isNew 플래그(도감 열어 닫으면 소거).
    var cx = state.potionCodex[p.id];
    var codexFirst = !cx;
    if (!cx) state.potionCodex[p.id] = { firstAt: Date.now(), bestQuality: q, count: 1, isNew: true };
    else { cx.bestQuality = Math.max(cx.bestQuality, q); cx.count += 1; }
    growPlotsOnSave();   // 제조 1개 = 텃밭 전체 +1단계(정산이 하던 역할을 제조로 이동)
    // 보상
    var reward = 10 + q * 7;
    state.stardust += reward; gainXp(reward); updateHud();
    // 의뢰 충족
    var reqMsg = checkRequestFulfill(p.id, q);
    // 결과 표시
    var liq = $("#brew-liquid"); if (liq) liq.style.transform = "rotate(0deg) scaleY(1)";
    var flaskEl = $("#brew-flask");
    flaskEl.classList.remove("filling"); void flaskEl.offsetWidth; flaskEl.classList.add("filling");
    potionBirthBurst(flaskEl, q);   // 별 스타버스트 (REDUCED면 내부에서 스킵)
    // 도감 첫 등록 배너
    var codexNote = $("#brew-result-codex-note");
    if (codexNote) {
      if (codexFirst) { codexNote.textContent = "📖 도감에 처음 기록됐어요!"; codexNote.hidden = false; }
      else { codexNote.textContent = ""; codexNote.hidden = true; }
    }
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

  /* ---- 의뢰 (스토리 챕터 = 현재 방문 NPC의 의뢰) ---- */
  // 공방 의뢰 카드: 현재 챕터(또는 자유 의뢰)를 phase별로 보여준다.
  function updateRequestCard() {
    var wrap = $("#workshop-request"); if (!wrap) return;
    var quest = activeQuest();
    if (!quest) { wrap.hidden = true; return; }
    var pn = potionById(quest.wantsPotion);
    var qn = QUALITY_NAME[quest.wantsQuality];
    var phase = state.chapterPhase;
    var npc = quest.npc;
    var ch = currentChapter();
    var tagSuffix = phase === "done" ? " · 완료! 손님에게 가져가요" : phase === "story" ? " · 새 손님" : "";
    var body = phase === "done"
      ? "포션이 준비됐어요. 손님에게 전해주러 가요. ✨"
      : (ch ? ch.questText : (pn ? (pn.name + "을 부탁해요.") : "의뢰를 기다리고 있어요."));
    wrap.hidden = false;
    wrap.innerHTML =
      '<img class="req-npc" src="' + npcSprite(npc, phase === "done" ? "joy" : "thinking") + '" alt="" />' +
      '<div class="req-body"><span class="req-tag">' + NPC_NAME[npc] + "의 의뢰" + tagSuffix + "</span>" +
      "<p>" + esc(body) + "</p>" +
      '<small>요구: ' + esc(pn ? pn.name : "?") + " · " + qn + " 이상 · 보상 별사탕 +" + quest.rewardStardust + "</small></div>";
  }
  // 제조 결과가 현재 의뢰를 충족하면 phase를 done으로(보상은 done 대사 후). 결과창 안내문 반환.
  function checkRequestFulfill(potionId, q) {
    if (!checkChapterFulfill(potionId, q)) return null;
    var quest = activeQuest();
    return "🎁 " + NPC_NAME[quest.npc] + "의 의뢰 충족! 홈에서 전해주고 보상을 받아요.";
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
          '<span class="plot-progress">' + left + "번 더 빚으면 수확 가능 🌱</span>";
      }
      grid.appendChild(cell);
    });
    // 보유 씨앗 요약
    var sw = $("#garden-seeds"); sw.innerHTML = "";
    var seedKeys = Object.keys(state.seeds).filter(function (k) { return state.seeds[k] > 0; });
    // 화분이 가득 찼는데 심을 씨앗이 남아 있으면 안내(수확 유도)
    var emptyPlots = state.plots.filter(function (p) { return !p || !p.cropId; }).length;
    if (emptyPlots === 0 && seedKeys.length > 0) {
      var full = document.createElement("p");
      full.className = "ws-empty garden-full-note";
      full.textContent = "화분이 가득 찼어요. 수확하면 새 씨앗을 심을 수 있어요. 🌿";
      sw.appendChild(full);
    }
    if (!seedKeys.length) sw.innerHTML = '<p class="ws-empty">씨앗이 없어요. 채집하거나 상점에서 사거나, 손님과 대화하면 씨앗이 생겨요.</p>';
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
        if (cx.isNew) el.classList.add("is-new");
        el.innerHTML = '<img src="' + potionImg(p) + '" alt="" width="54" height="54" decoding="async" loading="lazy" /><b>' + esc(p.name) + "</b>" +
          '<span class="codex-q q' + cx.bestQuality + '">' + QUALITY_ICON[cx.bestQuality] + " " + QUALITY_NAME[cx.bestQuality] + "</span>" +
          '<small>' + esc(p.lore) + "</small><i>×" + cx.count + "</i>" +
          (cx.isNew ? '<span class="codex-new-badge">NEW</span>' : "");
      } else {
        var hintImg = p.ail ? (function () { var a = byId(p.ail); return a ? "assets/" + a.icon + ".png" : "assets/reward-potion.png"; })() : "assets/reward-potion.png";
        el.innerHTML = '<img class="silh" src="' + hintImg + '" alt="" /><b>???</b><small>아직 빚어본 적 없는 포션</small>';
      }
      grid.appendChild(el);
    });
    var cnt = $("#codex-count"); if (cnt) cnt.textContent = unlocked + " / " + all.length;
  }
  /* 도감을 닫을 때 첫 등록(isNew) 플래그 소거 */
  function clearCodexNew() {
    var changed = false;
    for (var id in state.potionCodex) {
      if (state.potionCodex[id] && state.potionCodex[id].isNew) { delete state.potionCodex[id].isNew; changed = true; }
    }
    if (changed) persist();
  }

  /* ===========================================================================
   * 첫 플레이 튜토리얼 (D1 리텐션) — 힌트만, 강제 차단 없음.
   * step: 0 미시작 / 1 NPC 말 걸기 / 2 공방 열기 / 3 숲 채집 / 4 완료
   * 단계별 대상 셀렉터·안내 메시지. 대상 위에 .tutorial-ring 1개를 phone 기준 절대배치.
   * ======================================================================== */
  var TUTORIAL_STEPS = {
    1: { sel: "#home-npc", msg: "힐러가 기다려요. 탭해서 말 걸어봐요 👆", round: true },
    2: { sel: '.bottom-nav [data-open="workshop"]', msg: "공방에서 첫 포션을 빚어봐요 🧪", round: false },
    3: { sel: '#scene-hotspots .hotspot[data-place="forest"]', msg: "달빛 숲에서 재료를 채집해봐요 🌲", round: true }
  };
  function clearTutorialRing() {
    var ring = $(".tutorial-ring");
    if (ring && ring.parentNode) ring.parentNode.removeChild(ring);
    var toast = $(".tutorial-toast");
    if (toast && toast.parentNode) toast.parentNode.removeChild(toast);
  }
  /* 대상 위에 링 1개 + 안내 메시지(홈이면 말풍선, 아니면 토스트). 단계 바뀔 때 재배치. */
  function tutorialHighlight(step) {
    clearTutorialRing();
    var cfg = TUTORIAL_STEPS[step];
    if (!cfg) return;
    var phone = $(".phone"); if (!phone) return;
    var target = $(cfg.sel);
    if (!target) return;
    var tr = target.getBoundingClientRect();
    // 대상이 지금 화면에 실제로 보일 때만 표시(visibility:hidden 조상이면 rect는 있어도 안 보임 → 스킵)
    var visible = tr.width > 0 && tr.height > 0 && window.getComputedStyle(target).visibility !== "hidden";
    if (!visible) return;   // 이 화면에 대상이 없으면 링·안내 모두 띄우지 않음
    var pr = phone.getBoundingClientRect();
    var ring = document.createElement("div");
    ring.className = "tutorial-ring";
    var pad = 8;
    var w = tr.width + pad * 2, h = tr.height + pad * 2;
    if (cfg.round) { var d = Math.max(w, h); w = h = d; }
    ring.style.left = (tr.left - pr.left + tr.width / 2 - w / 2) + "px";
    ring.style.top = (tr.top - pr.top + tr.height / 2 - h / 2) + "px";
    ring.style.width = w + "px";
    ring.style.height = h + "px";
    ring.style.borderRadius = cfg.round ? "50%" : "16px";
    phone.appendChild(ring);
    // 안내 메시지: 홈(모달 닫힘)이면 말풍선, 모달 열림이면 작은 토스트
    var modalOpen = !$("#modal-layer").hidden;
    if (!modalOpen && step !== 2) {
      typeInto($("#home-speech"), cfg.msg);
    } else {
      var toast = document.createElement("div");
      toast.className = "tutorial-toast"; toast.textContent = cfg.msg;
      phone.appendChild(toast);
    }
  }
  /* completedStep을 끝냈을 때 다음 단계로. 현재 단계와 일치할 때만 진행(힌트만, 강제 아님). */
  function advanceTutorial(completedStep) {
    if (state.tutorialStep !== completedStep) return;
    state.tutorialStep = completedStep + 1;
    persist();
    if (state.tutorialStep >= 4) { clearTutorialRing(); return; }
    // 다음 단계 하이라이트(약간 지연 — 모달 전환/렌더 후 위치 안정)
    setTimeout(function () { tutorialHighlight(state.tutorialStep); }, 60);
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
    // 공방/텃밭은 하단 네비로(중복 제거), 채집은 씬 핫스팟 터치로.
    // 홈 NPC/말풍선 탭 → 점프 반응 후 인씬 대화 시작/진행
    function talk() { reactHomeNpc(); if (conv.active) advanceConv(); else startConv(); }
    function talkKey(e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); talk(); } }
    var npcEl = $("#home-npc");
    if (npcEl) { npcEl.addEventListener("click", talk); npcEl.addEventListener("keydown", talkKey); }
    var bubble = $("#home-bubble");
    if (bubble) {
      bubble.addEventListener("click", function (e) {
        // 액션 버튼 클릭은 버블 advance로 가로채지 않음
        if (e.target.closest && e.target.closest(".bubble-action")) return;
        talk();
      });
      bubble.addEventListener("keydown", talkKey);
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

    // 날짜 라벨 동적 갱신("M월 D일 요일")
    var dl = $("#date-label");
    if (dl) {
      var now = new Date();
      var days = ["일", "월", "화", "수", "목", "금", "토"];
      dl.textContent = (now.getMonth() + 1) + "월 " + now.getDate() + "일 " + days[now.getDay()] + "요일";
    }

    var restored = restore();
    var isNewDay = checkDailyReset();

    applyHomeTheme(); setViewClass("home");
    ensurePlots();

    if (isNewDay) {
      // 새 날: 별사탕·레벨·인벤토리·챕터 진행은 유지, 채집 가용만 리셋.
      state.foragedToday = {};
      todaySpecial = getTodaySpecialScene();   // 오늘의 특별 씬 갱신
      if (restored) persist();
    }
    if (!restored) {
      // 첫 방문: 데모 재료·씨앗(공방·텃밭이 비어 보이지 않게). 첫 챕터의 의뢰 재료를 포함.
      ["sleep_deprivation", "deadline_fear", "notification_overload"].forEach(function (id) { addMaterial(id, 1); });
      addMaterial("tea", 1); addMaterial("walk", 1);
      addSeed("moonherb", 1); addSeed("dew_berry", 1);
      // 첫 방문만 튜토리얼 시작(1단계). 복원 유저는 기존 step 유지(보통 0=스킵).
      state.tutorialStep = 1;
      persist();
    }

    updateHud(); updateWorkshopBadge(); updateHome();
    // 튜토리얼 진행 중이면 현재 단계 하이라이트(홈 렌더 후 위치 안정 위해 지연)
    if (state.tutorialStep >= 1 && state.tutorialStep < 4) {
      setTimeout(function () { tutorialHighlight(state.tutorialStep); }, 400);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
