# Happy Home Care (HHC) 웹 프로그램 — AI 협업용 인수인계 문서

> 이 문서를 ChatGPT 등 다른 AI에게 그대로 붙여넣으면, 이 프로젝트의 구조와 규칙을
> 이해한 상태에서 작업을 시작할 수 있습니다. **여기 적힌 규칙을 어기는 수정은
> 실서비스 화면을 깨뜨립니다.** 마지막 갱신: 2026-08-23

---

## 1. 프로젝트 개요

- 말레이시아 홈케어 업체 **Happy Home Care** (법인: HAPPY WORKS SERVICES SDN. BHD., 1278908-M)의
  업무·고객용 웹 프로그램 모음.
- **빌드 도구 없음. 파일 하나 = 화면 하나**인 단일 HTML 파일들이다.
  npm, 번들러, 프레임워크(React 등) 절대 도입하지 말 것. 바닐라 HTML+CSS+JS만 사용.
- 저장소: GitHub `100SOUNGHAK/hhc-site` → **Cloudflare Pages** 자동 배포
- 배포 주소: `https://hhc-3p8.pages.dev`
- 데이터: **Firebase Firestore** (프로젝트 `happywork-packageplan`) + Firebase Storage(사진·영상)
- 언어: 고객 화면은 **한국어/영어 이중 언어** (`T={ko:{...},en:{...}}` 객체 + `render()` 다시 그리기 방식)
- 연락처: WhatsApp +60 17-247 2774 / 입금계좌 MAY BANK 562179535697 (HAPPY WORKS SERVICES SDN BHD)

## 2. 파일 지도 (역할별)

### 고객용 화면
| 파일 | 역할 |
|---|---|
| `my.html` | 고객 마이페이지 (핵심). 앱형 UI: 흰 상단바·남색 인사카드·납부예정·빠른메뉴 4타일·회원권잔액/포인트·입금계좌·문서현황 행·하단 4탭. PWA 설치 지원 |
| `hhc-invoice.html` | 인보이스 작성(관리자)+고객 보기(`?view=ID`). Firebase **compat SDK** 사용 (유일) |
| `inspect.html` | 고객용 점검보고서 (부위 다이어그램·냉방성능·팝업). 관리자 화면은 inspect-admin |
| `quote.html` | 고객용 견적서 (`?id=`) |
| `admin.html` | 계약서 작성 + 고객 보기(`?view=ID&mode=all`) + 서비스 이용내역 |
| `coupon.html` | 고객용 상품권 보기 |
| `booking.html` / `request.html` | 예약 신청서 / 서비스 의뢰 요청서 |
| `home.html`, `service-info.html` | 홈페이지 · 가격/서비스 안내 |
| `membership.html` | 멤버십 패키지 안내장 (영문 og용 `membership-en.html`) |
| `evoucher.html` / `points.html` | 전자상품권 · 적립포인트 안내장 (membership과 같은 구조) |
| `coupon-info.html` | 상품권/할인권 이용약관 |
| `my-en.html`, `request-en.html` | 영문 og 카드용 넘겨주기 페이지 (몇 KB, 실내용은 본 파일로 redirect) |

### 관리자 화면
| 파일 | 역할 |
|---|---|
| `customer-admin.html` | **총괄 고객관리** (허브). 고객 통합·검색·상세보기·마이페이지 발송(20여 종 메시지 템플릿·카카오톡 카드·WhatsApp)·문서 만들기 버튼 |
| `inspect-admin.html` | 점검보고서 작성 (점검항목·측정 OCR 7세그먼트 판독·문제사진·영상 첨부·자주쓰는 문구) |
| `booking-admin.html` | 예약 관리 (방문 안내 메시지 3종 포함) |
| `schedule.html` | 일정 캘린더 (방문 안내 메시지 3종 포함) |
| `quote-admin.html` / `request-admin.html` / `memo-admin.html` / `coupon-admin.html` / `expense-admin.html` / `review-admin.html` | 견적·의뢰·메모(수리요청)·상품권·지출·리뷰 관리 |
| `staffapp.html` | 직원용 허브 |

### 기타
- `sw.js`, `my-manifest.json`, `manifest*.json` — PWA
- `r.html` — 단축링크 리다이렉터(`?k=`)
- `_redirects` — Cloudflare 리다이렉트. 내용은 `/  /service-info  301` 한 줄만. **함부로 늘리지 말 것**
  (Cloudflare는 파일이 있어도 리다이렉트를 우선하므로 잘못 넣으면 화면이 사라짐)

## 3. ⚠️ 미러 스텁 파일 — 절대 덮어쓰지 말 것

과거 주소 호환용으로, 아래 파일들은 **2~3KB짜리 「길 안내」 스텁**이다
(`location.replace('본파일'+location.search+location.hash)`만 수행).
**같은 이름의 큰 파일로 덮어쓰면 안 되고, 본 파일을 수정할 때 이 스텁을 같이 수정할 필요도 없다.**

```
inspectadmin.html → inspect-admin.html    hhcinvoice.html → hhc-invoice.html
bookingadmin.html → booking-admin.html    requestadmin.html → request-admin.html
quoteadmin.html → quote-admin.html        couponadmin.html → coupon-admin.html
customeradmin.html → customer-admin.html  reviewadmin.html → review-admin.html
serviceinfo.html → service-info.html      couponinfo.html → coupon-info.html
staff-app.html → staffapp.html            adminhub.html → staffapp.html
```
단독 파일(미러 없음): my.html, admin.html, inspect.html, quote.html, coupon.html,
memo-admin.html, schedule.html, home.html, membership.html, expense-admin.html 등.

## 4. 데이터 구조 (Firestore 컬렉션)

`customers`(고객 원장: name, phone, aliases[], member 등급, ca_ch 연락경로, pt_used/pt_adj/pt_ovr 포인트) ·
`invoices`(id=INV번호, customer{name,phone}, items[], status: billing/paid/overdue, creditUse, pointUse) ·
`inspections`(client, phone, type: inspect/dispatch/install/washer, results[], coolUnits[], workVideos[]) ·
`contracts`(name, package_id, amount_paid, usage_history JSON) · `coupons`(name 구매자, receiver, code, type: gift/discount, status) ·
`bookings`(customer_name, booking_date/time, status: waiting/booked/confirmed) · `quotes` · `memos`(수리요청: name, req_date, visit_date, status: pending/contacted/done) ·
`schedules` · `settings/{points,kakao,insp_phrases}`

- 고객 매칭 규칙: 이름 정규화(`공백 제거·소문자`) + 별칭(aliases) + 전화번호 뒷자리. 수동 연결은 `ca_link`/`ca_links` 필드.
- 고객정보 통합(HHCC 엔진): 이름/전화 수정 시 9개 컬렉션에 전파. customer-admin이 원장.

## 5. 마이페이지(my.html) 주소 규칙

`my.html?c={고객문서ID}&v=iv,ip,ct,cp&lang=ko&f=bk&install=1`
- `c` 고객 ID (필수) · `v` 표시 항목(iv 인보이스, ip 점검, ct 계약, cp 상품권 — 없으면 기본 iv,ip,ct,cp)
- 상품권(cp)·견적·수리요청·예약은 v와 무관하게 항상 표시됨
- `f` 열자마자 강조·이동할 섹션 (iv·ip·ct·cp·qt·bk·mm·pt·ap설치·sv의뢰·fee추가비용)
- `install=1` 설치 오버레이 즉시 표시 (카톡→외부브라우저 전환 흐름)
- 영문 발송은 `my-en.html?c=...` (og 카드가 영어로 나오게 하는 우회)

## 6. 발송 메시지 규칙 (customer-admin)

- WhatsApp: 전체 문구+주소 그대로. `wa.me/60{전화}` 로 대화방 직접 열기
- **카카오톡: 텍스트형 카드 최대 200자.** 주소 줄과 「📱 MY PAGE」류 제목 줄은 자동 제거되고
  카드 하단 「마이페이지 열기」 버튼이 대신한다. JS 키는 `settings/kakao.jsKey` + localStorage `hhc_kakao_key`
- 메시지 꼬리 형식: `\n\n📱 MY PAGE\n🔗 {주소}\n\nHappy Home Care 📞 +60 17-247 2774`

## 7. 디자인 토큰 (새 색 만들지 말 것)

고객 화면: 남색 `#0E2350→#16346E`, 청록 `#0b5f59→#0f766e`, 금색 `#C9A44C/#B98A16`,
빨강 `#DC2626`, 초록 `#0E9B63`, 잉크 `#14192A/#5A6478/#98A1B4`, 선 `#E4E9F2`, 배경 `#F6F8FC`.
그림자는 겹쳐서(접촉+중간+퍼짐). 카드 14px·히어로 16~18px·버튼 13px·배지 999px.
글꼴 Pretendard. 보라 그라데이션·왼쪽 색 세로줄·카드 3개 나열 같은 「AI 티」 패턴 금지.

## 8. 작업 수칙 (반드시)

1. **기존 파일을 읽고 그 안의 패턴을 따른다.** 추측으로 새 구조를 만들지 않는다.
2. 수정 후 각 `<script>` 블록이 문법 오류 없는지 확인한다 (`node --check` 수준).
3. 고객 화면은 한/영 양쪽 문구를 모두 넣는다 (`T` 객체).
4. 모바일 360/390/412px에서 가로 넘침이 없어야 한다.
5. Firebase 필드명을 바꾸지 않는다 — 다른 화면들이 같은 컬렉션을 읽는다.
6. 미러 스텁(3장)을 덮어쓰지 않는다. `_redirects`를 늘리지 않는다.
7. 파일 전체를 다시 쓰지 말고 **필요한 부분만 고친 전체 파일**을 산출한다
   (부분 코드 조각만 주면 통합 과정에서 사고가 난다).
8. 완성 파일은 배포 전 Claude(또는 검증 가능한 쪽)에서 Playwright 실화면 검증을 거친다.

## 9. 협업 흐름 제안

1. 사장님이 GitHub의 해당 파일(또는 배포 주소)을 ChatGPT에 전달
2. ChatGPT는 이 문서의 규칙 안에서 수정안 작성 → 수정된 **전체 파일** 산출
3. 사장님이 그 파일을 Claude에 전달 → Claude가 규칙 위반·충돌 검토 + Playwright 검증 → 배포 파일 확정
4. GitHub 업로드는 항상 마지막에, 어떤 파일을 올리는지 명시된 목록대로만

## 10. 최근 완료된 주요 작업 (2026-08 기준)

마이페이지 앱형 개편(상단바·4타일·문서현황 행·하단 4탭·집 사진 히어로) · 상단 고정 바로가기 메뉴(스크롤 스파이·내역 바로 열기) ·
PWA 설치 오버레이(카톡→브라우저 전환 시 즉시 표시) · 점검보고서: 부위 다이어그램+팝업·배수관 표시·냉방능력 요약·구분 기본 접힘·
표지 축소·점검대상 설비 표지 이동 · 계측기 사진 7세그먼트 OCR(8↔6·9↔5 획 누락 보정, 정확도 100%) ·
점검항목별 비고 자동문구(빠른선택 시트 포함) · 예약확정/방문안내 메시지 개편+카카오 카드 발송 ·
전자상품권·적립포인트 안내장 신설 · 인보이스 불러오기 고객 검색 · 상품권 v= 무관 항상 표시

---

## 11. 이 문서의 위치와 사용법 (상시 협업 장치)

- 이 파일은 저장소에 **`AI-GUIDE.md`** 로 올려 둔다. 갱신 시 이 파일만 다시 올리면 된다.
- 원문 주소(어느 AI에게든 이 주소를 주면 됨):
  `https://raw.githubusercontent.com/100SOUNGHAK/hhc-site/main/AI-GUIDE.md`
- 큰 작업이 끝날 때마다 10장(최근 작업)을 갱신해 두면, 어떤 AI와 새 대화를 시작해도
  같은 지점에서 이어서 작업할 수 있다.
