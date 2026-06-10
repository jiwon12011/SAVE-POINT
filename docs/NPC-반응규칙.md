# SAVE POINT — 상태창 → NPC 반응 규칙

본 문서는 설계 명세다. 코드/구현 없이 규칙·결정 테이블·매핑만 정의한다. **MVP는 힐러·여관주인 2종만 존재**한다는 제약을 모든 규칙에서 끝까지 유지한다. 대사 문구는 [[대사풀]], 캐릭터·표정 정의는 [[캐릭터시트]], 상위 로직은 [[기획]] §2-3 참조.

---

## 0. 용어 · 입력 전제

| 항목 | 값/범위 | 비고 |
|---|---|---|
| `mode` | survival / easy / normal / challenge | 상태창 결과 |
| `energy_score` | 0–100 (정수) | 에너지 점수 |
| `ailment_tags[]` | 문자열 배열 (예: `decision_paralysis`, `fatigue`, `anxiety`) | 0개 이상 |
| HP / MP / focus | 1–4 (정수) | 1=최저, 4=최고 |
| `onboarding_pref_npc` | healer / innkeeper / (구5종 값도 입력될 수 있음) | 온보딩 선호 |
| MVP NPC | `healer`, `innkeeper` | 이 2종만 표면화 |
| 폴백 NPC | `innkeeper` (1차) → `healer` (2차) | 미구현 NPC 호출 시 |

특수상황 신호(파생값, 입력에서 계산):

| 신호 | 정의 | 트리거 |
|---|---|---|
| `consecutive_survival` | 직전까지 연속 survival 모드 횟수 | ≥3 → "무기력 개입" |
| `gap_days` | 마지막 접속 이후 경과일 | ≥7 → "컴백" |
| `is_first_time` | 첫 상태창 여부 | true → 환영 |
| `all_max` | HP=MP=focus=4 AND energy≥80 | 위로 불필요 상황 |

---

## 1. NPC 추천 규칙 (MVP 2종 확정판)

### 1-1. 구5종 → 2종 접기 매핑

| 구5종 규칙 | 원래 추천 | MVP 2종 접기 결과 |
|---|---|---|
| 생존 OR HP=1 | 힐러 | **힐러** (유지) |
| 쉬움(easy) | 여관주인 | **여관주인** (유지) |
| 보통(normal) → 길드마스터 | 길드마스터 | **여관주인** (폴백) |
| 도전(challenge) → 라이벌 | 라이벌 | **여관주인** (폴백) |
| 결정장애 태그 → 마법사 | 마법사 | **힐러** (폴백, 심리·정서 케어 성격이 가까움) |

> 접기 원칙: **정서/회복 계열(생존·HP위기·결정장애·불안)은 힐러**, **활동/계획/일상 계열(쉬움·보통·도전)은 여관주인**으로 귀속.

### 1-2. 추천 결정 테이블 (위→아래 우선순위, 첫 매칭 채택)

| 순위 | 조건 | 추천 NPC | 추천 사유 `reason_key` |
|---|---|---|---|
| P1 | `mode == survival` **OR** `HP == 1` | healer | `survival_hp_crisis` |
| P2 | `ailment_tags`에 `decision_paralysis` 포함 | healer | `decision_paralysis` |
| P3 | `ailment_tags`에 정서태그(`anxiety`/`burnout`/`sadness`) 포함 | healer | `emotional_care` |
| P4 | `mode == easy` | innkeeper | `easy_rest` |
| P5 | `mode == normal` | innkeeper | `normal_routine` |
| P6 | `mode == challenge` | innkeeper | `challenge_support` |
| P7 | 위 모두 미해당 (기본 폴백) | innkeeper | `default` |

### 1-3. 동률·충돌·타이브레이커

| 상황 | 처리 |
|---|---|
| 복수 조건 동시 충족 | **1-2 표의 위쪽(낮은 순위 번호) 우선**. 결정론적. |
| HP=1 & mode=easy | P1(힐러) 우선. |
| 온보딩 선호 타이브레이커 | 명확한 정서신호(P1–P3)일 때는 **선호 무시(안전 우선)**. P4–P7(일상 계열)에서만 `pref==healer`이면 healer로 승격. |

선호 변환: healer→healer, innkeeper→innkeeper, guildmaster/rival→innkeeper, mage→healer.

---

## 2. 표정 선택 규칙

표정 슬롯 5종(힐러·여관주인 **공통 슬롯명**): `default` / `comfort`(위로·걱정) / `joy`(기쁨) / `cheer`(놀람·격려) / `relax`(나른·쉬어).

### 2-1. 표정 결정 테이블 (위→아래, 첫 매칭)

| 순위 | 조건 | 표정 슬롯 |
|---|---|---|
| E1 | `gap_days ≥ 7` (컴백) | `joy` |
| E2 | `consecutive_survival ≥ 3` (무기력 개입) | `comfort` |
| E3 | `mode == survival` **OR** `HP == 1` | `comfort` |
| E4 | `all_max == true` (도전인데 위로 불필요) | `cheer` |
| E5 | `mode == challenge` | `cheer` |
| E6 | `mode == easy` | `relax` |
| E7 | `mode == normal` | `default` |
| E8 | `is_first_time == true` 且 위 미해당 | `default` |
| E9 | 그 외 | `default` |

> 표정 선택은 **추천 NPC와 무관하게 동일 입력→동일 슬롯**. NPC별로 다른 건 슬롯 안의 아트/문구뿐. 여관주인은 `relax` 비중↑, 힐러는 `comfort` 비중↑.

---

## 3. 대사 컨텍스트 객체 (LLM/폴백 입력 스키마)

### 3-1. 스키마

| 필드 | 타입 | 필수 | 예 | 설명 |
|---|---|---|---|---|
| `npc` | enum(healer/innkeeper) | Y | `"healer"` | 표면화될 NPC |
| `mode` | enum | Y | `"survival"` | 상태창 모드 |
| `energy` | int(0–100) | Y | `22` | energy_score |
| `ailment_tags` | string[] | Y | `["fatigue"]` | 0개 가능 |
| `hp` / `mp` / `focus` | int(1–4) | Y | `1` | 스탯 |
| `expression` | enum(5슬롯) | Y | `"comfort"` | §2에서 결정 |
| `boss_text` | string\|null | N | `"보고서 마감"` | 비면 null |
| `gap_days` | int | N | `9` | 컴백 판정 |
| `consecutive_survival` | int | N | `3` | 무기력 판정 |
| `is_first_time` | bool | N | `false` | 첫 사용 |
| `category` | enum(§3-2) | Y | `"survival_comfort"` | 대사 카테고리 |

### 3-2. P0 폴백: 컨텍스트 → 대사 풀 카테고리 매핑 (`category`)

| 카테고리 키 | 선택 조건(위→아래, 첫 매칭) | 대표 표정 |
|---|---|---|
| `comeback` | `gap_days ≥ 7` | joy |
| `apathy_intervene` | `consecutive_survival ≥ 3` | comfort |
| `first_welcome` | `is_first_time == true` | default |
| `survival_comfort` | `mode==survival` OR `hp==1` | comfort |
| `decision_help` | `decision_paralysis` ∈ tags | comfort |
| `all_max_praise` | `all_max == true` | cheer |
| `challenge_cheer` | `mode==challenge` | cheer |
| `easy_rest` | `mode==easy` | relax |
| `normal_routine` | `mode==normal` | default |
| `generic` | 그 외 | default |

> 폴백은 카테고리+npc 키로 [[대사풀]]에서 **결정론적 선택**(상태창 ID 해시 → 풀 인덱스, 같은 입력=같은 대사). `boss_text`가 있으면 `{boss}` 슬롯 치환, null이면 보스 미언급 변형 사용.

---

## 4. 반응 트리거 우선순위

한 상태가 복수 특수상황에 걸릴 때 **카테고리 선택 순서**(§3-2 위→아래와 일치, 단일 진실원):

`comeback` → `apathy_intervene` → `first_welcome` → `survival_comfort` → `decision_help` → `all_max_praise` → `challenge_cheer` → `easy_rest` → `normal_routine` → `generic`

규칙: **카테고리는 항상 1개만 선택**(첫 매칭). 표정(§2)과 카테고리(§3-2)는 같은 우선순위 사상을 공유 → 불일치 발생 안 함. 예) 컴백+생존 동시 → `comeback`/`joy` 채택, 생존 케어 문구는 버림.

---

## 5. 화면별 노출

| 화면 | NPC 반응 표면화 | 추천 강조 | 선택 가능 |
|---|---|---|---|
| **상태창 결과** | 추천 NPC 1명 카드 + 표정 썸네일 + 추천 사유 1줄 | 추천 1명만 배지 강조 | "다른 NPC 상담" 보조 버튼 → 상담소 |
| **NPC 상담소** | 추천 사유 박스 + NPC 카드 **2종 모두** 노출 | 추천 NPC 상단/하이라이트 | 2종 자유 선택 |
| **대화** | 선택 NPC의 표정 슬롯 + 카테고리 대사 출력 | 해당 NPC 단독 | NPC 전환은 뒤로→상담소 |

### 5-1. 추천 사유 카피 (결정론적, LLM 불필요)

| `reason_key` | 사유 카피(템플릿) |
|---|---|
| `survival_hp_crisis` | "지금은 회복이 먼저예요. 힐러를 추천해요." |
| `decision_paralysis` | "선택이 어려울 땐 힐러와 정리해봐요." |
| `emotional_care` | "마음이 무거워 보여요. 힐러를 추천해요." |
| `easy_rest` | "가볍게 쉬어가기 좋은 날, 여관주인을 추천해요." |
| `normal_routine` | "오늘 루틴은 여관주인과 점검해요." |
| `challenge_support` | "도전하는 당신, 여관주인이 든든히 받쳐줄게요." |
| `default` | "여관주인이 오늘을 함께할게요." |

- `{boss}`가 비어있지 않으면 카피 끝에 "(목표: {boss})" 선택적 부가. 비면 생략.

---

## 6. 데이터 연결 (`npc_dialogues`)

저장 시점: **대화 화면 진입(해당 NPC 대사 확정) 시 1행 insert.** 상태창 결과 노출 단계에서는 추천 메타만 계산, 대사 미생성(불필요 호출 방지).

| 필드 | 값 |
|---|---|
| `status_result_id` | 상태창 결과 FK |
| `npc` | healer/innkeeper |
| `category` | §3-2 키 |
| `expression` | 5슬롯 |
| `dialogue_text` | 최종 대사 |
| `source` | `ai` / `fallback` (P0=항상 `fallback`) |
| `reason_key` | §1-2 |

### NPC 전환 시 재생성·비용
- 캐시 키 = `(status_result_id, npc)`. 조합당 최초 1회만 생성, 이후 0.
- P0(fallback): LLM 0회, 결정론적이라 항상 동일.
- **상태창 1건당 LLM 호출 ≤ 2회**(NPC 2종 각 1회 캐시). 초과는 캐시·폴백. (호출 상한은 [[기획]] §5-2와 연결)

---

## 7. 엣지케이스

| 케이스 | 처리 | 결과 |
|---|---|---|
| 보스 비움 | `boss_text=null` → "보스 미언급" 변형, 카피의 "(목표: …)" 생략 | 정상 |
| 태그 0개 | P2/P3 미발동, mode 기반 결정 | 정상 |
| 모든 스탯 최고(도전) | `all_max==true` → `cheer`/`all_max_praise`, comfort 계열 강제 차단 | 위로 대사 안 나옴 |
| 확장 NPC 호출 | 접기표 변환(mage→healer, guildmaster/rival→innkeeper), 불가 시 innkeeper→healer 폴백 | 항상 2종 중 하나 |
| 추천≠선택 | 사용자가 비추천 NPC 선택 가능, 그 NPC 풀로 동일 카테고리 대사 | 자유 선택 존중 |
| 컴백+무기력 동시 | §4: `comeback` 우선 | 컴백 |
| 선호=확장NPC인데 P1 강함 | 선호는 P4–P7만 적용 → P1 healer 유지 | 안전 우선 |
| 입력 결측(gap_days 등) | null→트리거 미발동(false 처리) | 일반 규칙 |

### 설계 불변식
1. 표면 NPC는 **항상 healer/innkeeper 2종**. 그 외는 접기/폴백으로 귀속.
2. 추천(§1)·표정(§2)·카테고리(§3-2)·트리거(§4)는 **동일 우선순위 사상 공유** → 결정론적·상호 모순 없음.
3. 폴백(P0)은 LLM 0회, 동일 입력=동일 출력.
4. 캐시 키 `(status_result_id, npc)`, 상태창당 LLM 호출 상한 2회.
