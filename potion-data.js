/* SAVE POINT — 포션 연금술 데이터 (1차 MVP)
 * 기획: docs/포션연금술-기획.md. 거대한 생성 파일 data.js는 건드리지 않고 여기서 포션 시스템 데이터를 정의한다.
 * 재료 id 네임스페이스: A축=ailment id(engine) · B축=recovery id · D축=cropId · 씨앗=seed_{cropId}
 */
window.POTION_DATA = {
  /* A축 — 상태이상(결정체) 마스터: id·표시이름·아이콘만. byId() 룩업용(구 engine.js에서 이관). */
  ailments: [
    { id: "sleep_deprivation",     name: "수면 부족",   icon: "ailment-sleep" },
    { id: "deadline_fear",         name: "마감 공포",   icon: "ailment-deadline" },
    { id: "escapism",              name: "현실 도피",   icon: "ailment-escape" },
    { id: "caffeine_overload",     name: "카페인 과다", icon: "ailment-caffeine" },
    { id: "focus_lost",            name: "집중력 실종", icon: "ailment-focus" },
    { id: "notification_overload", name: "알림 과부하", icon: "ailment-notification" },
    { id: "decision_paralysis",    name: "결정 장애",   icon: "ailment-decision" },
    { id: "anxiety",               name: "불안",        icon: "ailment-anxiety" },
    { id: "burnout",               name: "번아웃",      icon: "ailment-low-battery" },
    { id: "social_drain",          name: "사람에 지침", icon: "ailment-social" },
    { id: "hunger",                name: "허기",        icon: "ailment-hunger" },
    { id: "messy_room",            name: "어질러진 방", icon: "ailment-messy-room" },
    { id: "sadness",               name: "가라앉음",    icon: "ailment-sleep" },
    { id: "procrastination",       name: "미루기",      icon: "ailment-messy-room" }
  ],

  /* B축 — 작은 실천의 씨앗 (recoveryItem id 재사용, 이모지 아이콘) */
  recovery: {
    tea:        { name: "온기 증류수", emoji: "🍵" },
    water:      { name: "맑은 샘물", emoji: "💧" },
    coffee:     { name: "각성 추출물", emoji: "☕" },
    walk:       { name: "바람의 흔적", emoji: "🚶" },
    nap:        { name: "달빛 침잠", emoji: "😴" },
    meditation: { name: "고요의 향", emoji: "🧘" },
    potion:     { name: "회복 포션", emoji: "🧪" }
  },

  /* D축 — 재배 작물 (1차: 보유 일러 12종). img=assets/crops/{id}.png, seed=assets/seeds/seed_{id}.png
   * cat 허브H/꽃F/버섯M/뿌리R/열매B · rarity C흔함/U고급/R희귀/L전설 · grow 수확까지 세이브 횟수 */
  crops: {
    moonherb:         { name: "달풀",          cat: "H", rarity: "C", grow: 3 },
    dreambell:        { name: "꿈초롱 꽃",      cat: "F", rarity: "C", grow: 3 },
    clarity_moss:     { name: "맑음이끼",       cat: "H", rarity: "C", grow: 3 },
    echo_thyme:       { name: "메아리백리향",   cat: "H", rarity: "C", grow: 3 },
    still_lavender:   { name: "고요라벤더",     cat: "F", rarity: "C", grow: 3 },
    dew_berry:        { name: "이슬열매",       cat: "B", rarity: "C", grow: 3 },
    marsh_root:       { name: "늪뿌리",         cat: "R", rarity: "C", grow: 5 },
    foxfire_cap:      { name: "여우불버섯",     cat: "M", rarity: "C", grow: 5 },
    compass_vine:     { name: "나침반덩굴",     cat: "H", rarity: "U", grow: 5 },
    signal_grass:     { name: "신호풀",         cat: "H", rarity: "U", grow: 5 },
    ghost_pepper_mild:{ name: "순한 망령고추",  cat: "B", rarity: "U", grow: 3 },
    void_lily:        { name: "공허백합",       cat: "F", rarity: "U", grow: 5 }
  },

  /* 포션 11종(ailment 1:1) + 와일드카드.
   * ail=대응 상태이상 id(없으면 null=와일드) · rec=[A축 결정체, B축 추천] · crops={cropId:보너스점수} */
  potions: [
    { id: "dream_fog_elixir",     name: "꿈안개 증류액",   ail: "sleep_deprivation",     lore: "한 모금에 잊혔던 꿈이 되돌아온다",        rec: ["sleep_deprivation", "nap"],        crops: { moonherb: 1, dreambell: 2 } },
    { id: "clarity_wash",         name: "각성 세척제",     ail: "caffeine_overload",     lore: "과잉된 각성을 부드럽게 가라앉힌다",       rec: ["caffeine_overload", "water"],      crops: { dew_berry: 1, clarity_moss: 1 } },
    { id: "focus_lantern",        name: "집중 등불 포션",  ail: "focus_lost",            lore: "마음속 안개가 걷히고 점 하나가 보인다",   rec: ["focus_lost", "walk"],              crops: { clarity_moss: 1 } },
    { id: "maze_compass",         name: "미로 나침반 포션",ail: "decision_paralysis",    lore: "모든 길이 아닌, 지금 나에게 맞는 길 하나", rec: ["decision_paralysis", "tea"],       crops: { compass_vine: 2 } },
    { id: "silence_seal",         name: "소음 결계 포션",  ail: "notification_overload", lore: "귓가의 울림이 하나씩 꺼진다",            rec: ["notification_overload", "walk"],   crops: { echo_thyme: 1, signal_grass: 2 } },
    { id: "shadow_ward",          name: "그림자 방어 포션",ail: "anxiety",               lore: "그림자가 사라지는 게 아니라, 무섭지 않아진다", rec: ["anxiety", "meditation"],        crops: { still_lavender: 1, signal_grass: 2 } },
    { id: "mana_kindle",          name: "마나 점화 포션",  ail: "burnout",               lore: "다 꺼진 줄 알았는데, 재가 아직 따뜻하다", rec: ["burnout", "tea"],                  crops: { foxfire_cap: 2 } },
    { id: "swamp_float",          name: "늪 부상 포션",    ail: "sadness",               lore: "바닥에서 올라오는 데 힘이 필요하지 않다", rec: ["sadness", "tea"],                  crops: { marsh_root: 2 } },
    { id: "dimension_lock",       name: "차원 잠금 포션",  ail: "escapism",              lore: "어디로도 가지 않고, 여기 있기로 한다",    rec: ["escapism", "walk"],                crops: { void_lily: 2 } },
    { id: "deadline_ghost_repel", name: "망령 퇴치 포션",  ail: "deadline_fear",         lore: "망령은 실체가 없다. 다가가면 흩어진다",   rec: ["deadline_fear", "potion"],         crops: { ghost_pepper_mild: 1 } },
    { id: "tide_pull",            name: "조류 견인 포션",  ail: "procrastination",       lore: "시작만 맡는다. 계속은 네 몫",            rec: ["procrastination", "tea"],          crops: { dew_berry: 1 } },
    { id: "daily_distillate",     name: "오늘의 증류액",   ail: null,                    lore: "오늘의 상태를 한 병에 증류했다. 열어봐야 안다", rec: [],                              crops: {} }
  ],

  /* C축 — NPC 흔적 + 씨앗 (1차: healer/innkeeper만 활성, 새 손님이 찾아올 때 보장 드롭) */
  npcSeeds: {
    healer:    ["moonherb", "dreambell", "still_lavender"],
    innkeeper: ["dew_berry", "echo_thyme", "marsh_root"]
  },

  /* 의뢰 풀 — 정산 시 완료되면 다음 의뢰로 순환 (requests[0]=첫 의뢰) */
  requests: [
    {
      id: "req_wizard_maze_compass", npc: "wizard", wantsPotion: "maze_compass", wantsQuality: 1,
      rewardStardust: 35, rewardMaterial: "decision_paralysis", rewardQty: 2,
      offerLines: [
        "흥미롭군요. 미궁의 결정체를 모으는데 증류 단계에서 자꾸 방향이 흔들려요.",
        "좋음 이상의 미로 나침반 포션 하나, 만들어줄 수 있나요? 재료는 돌려드릴게요."
      ],
      doneLine: "정확하게 만들었군요. 흥미롭습니다. 다음엔 더 어려운 걸 부탁해도 될까요?"
    },
    {
      id: "req_healer_dream_fog", npc: "healer", wantsPotion: "dream_fog_elixir", wantsQuality: 1,
      rewardStardust: 28, rewardMaterial: "sleep_deprivation", rewardQty: 2,
      offerLines: [
        "요즘 잠 못 드는 손님이 많아요. 꿈안개 증류액이 좀 필요한데…",
        "좋음 이상으로 하나만 빚어줄래요? 재료는 제가 채워드릴게요. 🌿"
      ],
      doneLine: "고마워요. 이 향이면 다들 푹 잘 거예요. 손이 좋네요, 정말."
    },
    {
      id: "req_guild_silence_seal", npc: "guildmaster", wantsPotion: "silence_seal", wantsQuality: 1,
      rewardStardust: 30, rewardMaterial: "notification_overload", rewardQty: 2,
      offerLines: [
        "길드 회의실이 너무 시끄러워. 소음 결계 포션이 필요하네.",
        "좋음 이상이면 길드 표준으로 쳐주지. 만들어 오게. 📜"
      ],
      doneLine: "이 품질이면 길드 표준 이상이야. 다음 의뢰도 자네에게 맡기지."
    }
  ],

  /* 순수 게임 전환: 상태이상 id의 표시명을 게임 재료명으로 (id는 코드 키로 유지) */
  materialName: {
    sleep_deprivation: "몽환의 결정", caffeine_overload: "번개 수정", focus_lost: "안개 유리",
    decision_paralysis: "미로 나침석", notification_overload: "울림 파편", anxiety: "그림자 수정",
    burnout: "재 결정", sadness: "침잠석", escapism: "차원 파편",
    deadline_fear: "망령의 재", procrastination: "이끼 수정"
  },

  /* 채집(Forage) — 장소 3곳. pool에서 1~3개 랜덤 드롭, seedChance로 씨앗 1개 추가 가능 */
  forage: {
    forest: { name: "달빛 숲", emoji: "🌲", desc: "허브와 꽃이 자라는 고요한 숲",
      pool: ["moonherb", "dreambell", "still_lavender", "sleep_deprivation", "decision_paralysis", "procrastination"],
      seeds: ["moonherb", "dreambell", "still_lavender"], seedChance: 0.35 },
    cave: { name: "안개 동굴", emoji: "🕳️", desc: "광물과 결정이 묻힌 동굴",
      pool: ["clarity_moss", "echo_thyme", "foxfire_cap", "caffeine_overload", "focus_lost", "notification_overload", "burnout", "deadline_fear"],
      seeds: ["clarity_moss", "echo_thyme"], seedChance: 0.2 },
    pond: { name: "공허 연못", emoji: "🌌", desc: "희귀한 것이 가라앉은 연못",
      pool: ["marsh_root", "void_lily", "anxiety", "sadness", "escapism", "compass_vine", "signal_grass"],
      seeds: ["dew_berry", "ghost_pepper_mild", "void_lily"], seedChance: 0.35 }
  },

  /* 상점 — 씨앗·기본 재료 구매(별사탕). 1차는 구매만(판매는 2차) */
  shop: {
    seeds: ["moonherb", "dew_berry", "clarity_moss", "still_lavender"], seedCost: 18,
    materials: ["sleep_deprivation", "caffeine_overload", "focus_lost", "decision_paralysis", "procrastination"], materialCost: 15
  },

  /* 마법사 멘토 공방 한 줄 대사 */
  mentorLines: {
    noMaterial: "재료가 없군요. 달빛 숲이나 동굴에서 채집해오거나, 상점에서 결정체를 구할 수 있어요.",
    rhythm:     "나쁘지 않아요. 조금만 더 느리게, 조금만 더 고르게.",
    perfect:    "완벽하군요. 재료보다 손이 기억하는 게 더 많은 것 같습니다.",
    good:       "좋은 포션이에요. 정성이 담겼어요.",
    plain:      "오늘 가진 것으로 만든 포션. 그것만으로 충분합니다.",
    zeroDay:    "재료가 많지 않아도 괜찮아요. 손이 먼저 기억할 거예요. 한 번 저어봐요."
  }
};
