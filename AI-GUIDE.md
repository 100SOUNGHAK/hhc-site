# Happy Home Care (HHC) 웹 프로그램 — AI 협업용 인수인계 문서

> 이 문서를 ChatGPT 등 다른 AI에게 그대로 붙여넣으면, 이 프로젝트의 구조와 규칙을
> 이해한 상태에서 작업을 시작할 수 있습니다. **여기 적힌 규칙을 어기는 수정은
> 실서비스 화면을 깨뜨립니다.** 마지막 갱신: 2026-08-24

---

## 0. ⛔ 작업 시작 전 3초 점검 (가장 사고가 잦은 곳)

1. **도메인** — 코드에 쓰는 기본 주소는 `https://happyhomecare.com.my` 다.
   오래된 사본에는 `hhc-3p8.pages.dev` 가 들어 있다. **옛 주소가 든 파일을 그대로 올리면
   도메인 전환이 그 파일만 되돌아간다.** 산출 직전 반드시 `hhc-3p8` 검색해 확인할 것.
   (단 4장의 「허용목록」 두 곳은 의도적으로 옛 주소를 남겨 둔 것이니 지우지 말 것)
2. **미러 스텁** — 3장 목록의 2~3KB 「길 안내」 파일을 큰 파일로 덮어쓰지 말 것.
3. **`_redirects`** — 지금 내용은 `/  /home  301` 한 줄. 늘리지 말 것.

---

## 1. 프로젝트 개요

- 말레이시아 홈케어 업체 **Happy Home Care** (법인: HAPPY WORKS SERVICES SDN. BHD., 1278908-M)의
  업무·고객용 웹 프로그램 모음.
- **빌드 도구 없음. 파일 하나 = 화면 하나**인 단일 HTML 파일들이다.
  npm, 번들러, 프레임워크(React 등) 절대 도입하지 말 것. 바닐라 HTML+CSS+JS만 사용.
- 저장소: GitHub `100SOUNGHAK/hhc-site` → **Cloudflare Pages** 자동 배포
- **정식 주소: `https://happyhomecare.com.my`** (2026-08-24 전환 완료)
  옛 주소 `https://hhc-3p8.pages.dev` 도 계속 살아 있다 — 기존 발송 링크 보호용, 폐기 금지
- 데이터: **Firebase Firestore** (프로젝트 `happywork-packageplan`) + Firebase Storage(사진·영상)
- 언어: 고객 화면은 **한국어/영어 이중 언어** (`T={ko:{...},en:{...}}` 객체 + `render()` 다시 그리기 방식)
- 연락처: WhatsApp +60 17-247 2774 / 입금계좌 MAY BANK 562179535697 (HAPPY WORKS SERVICES SDN BHD)

## 2. 파일 지도 (역할별)

### 고객용 화면
| 파일 | 역할 |
|---|---|
| `my.html` | 고객 마이페이지 (핵심). 앱형 UI: 흰 상단바·남색 인사카드·납부예정·**상단 고정 빠른메뉴**·회원권잔액/포인트·문서현황 행·하단 4탭. PWA 설치 지원 |
| `hhc-invoice.html` | 인보이스 작성(관리자)+고객 보기(`?view=ID`). Firebase **compat SDK** 사용 (유일). 첨부 사진 기능 있음 |
| `inspect.html` | 고객용 점검보고서 (부위 다이어그램·냉방성능·팝업). 관리자 화면은 inspect-admin |
| `quote.html` | 고객용 견적서 (`?id=`) |
| `admin.html` | 계약서 작성 + 고객 보기(`?view=ID&mode=all`) + 서비스 이용내역 |
| `coupon.html` | 고객용 상품권 보기 |
| `booking.html` / `request.html` | 예약 신청서 / 서비스 의뢰 요청서 |
| `home.html` | **현재 홈페이지.** 가격정보 섹션 앵커는 `#pricing` |
| `service-info.html` | **예전 홈페이지.** 아직 저장소에 남아 있으나 어디서도 연결하지 않는다. 새 링크를 여기로 걸지 말 것 |
| `membership.html` | 멤버십 패키지 안내장 (영문 og용 `membership-en.html`) |
| `evoucher.html` / `points.html` | 전자상품권 · 적립포인트 안내장 (membership과 같은 구조) |
| `coupon-info.html` | 상품권/할인권 이용약관 |
| `my-en.html`, `request-en.html` | 영문 og 카드용 넘겨주기 페이지 (몇 KB, 실내용은 본 파일로 redirect) |
| `namecard.html` | 전자명함. **QR이 정적 SVG로 박혀 있다** — 4장 참조 |

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
- `sw.js`, `my-manifest.json`, `manifest*.json` — PWA (전부 상대경로 — 도메인 바뀌어도 손댈 필요 없음)
- `r.html` — 단축링크 리다이렉터(`?k=`)
- `_redirects` — Cloudflare 리다이렉트. 내용은 `/  /home  301` 한 줄만. **함부로 늘리지 말 것**
  (Cloudflare는 파일이 있어도 리다이렉트를 우선하므로 잘못 넣으면 화면이 사라짐)
- `worker.js` — 구글 캘린더 → Firestore 동기화 Worker (웹사이트 아님)
- `my (30).html` — 과거 백업본이 실수로 커밋된 것. 사용되지 않음, 수정하지 말 것

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
memo-admin.html, schedule.html, home.html, membership.html, expense-admin.html, namecard.html 등.

## 4. 🌐 도메인 · 인프라 (2026-08-24 전환 완료)

### 현재 주소 구성
| 주소 | 역할 | 상태 |
|---|---|---|
| **happyhomecare.com.my** | **메인 도메인** — 모든 프로그램의 정식 주소 | ✅ 운영 중 |
| www.happyhomecare.com.my | 메인으로 연결 (Pages custom domain) | ✅ |
| happyhomecare.my | 메인으로 **301 리다이렉트** (경로 보존) | ✅ |
| hhc-3p8.pages.dev | **여전히 유효** — 기존 발송 링크 보호용, **폐기하지 말 것** | ✅ 유지 |

### 함정 4가지 (실제로 사고가 났던 곳)

**① 작업 사본이 옛 도메인일 수 있다**
전환 이전에 내려받은 파일에는 `hhc-3p8.pages.dev` 가 남아 있다.
그 파일을 그대로 올리면 **그 파일만 도메인이 되돌아간다.** (2026-08-24 my.html·hhc-invoice.html에서 실제 발생)
→ 산출 직전 `hhc-3p8` 를 검색해 확인한다. 바꿀 대상: `BASE`, `BASE_URL`, `BASE_SHORT`,
`SITE`, `HOME`, `PAGE_BASE`, `MY_BASE`, `INV_BASE`, og:url, og:image, twitter:image, canonical, JSON-LD.

**② 문서 뷰어 허용목록은 두 도메인 모두 남긴다**
`customer-admin.html`, `my.html` 의 검사식은 **일부러** 옛 도메인을 함께 허용한다.
지우면 Firestore에 저장된 기존 링크가 열리지 않는다. 「옛 도메인 잔재」로 오해하지 말 것.
```js
return /(^|\.)hhc-3p8\.pages\.dev$/i.test(u.hostname) || /(^|\.)happyhomecare\.com\.my$/i.test(u.hostname);
```

**③ `namecard.html` 의 QR은 정적 SVG다**
QR이 미리 그려진 SVG(`qrKo`, `qrEn`)로 코드에 박혀 있다. 주소 글자는 실행 시점에 다시 그려지므로
**도메인 상수만 바꾸면 글자는 새 주소·QR 그림은 옛 주소**가 된다.
→ 도메인이 바뀌면 **SVG 자체를 재생성**해야 한다. 확신이 없으면 이 파일은 건드리지 말 것.

**④ Cloudflare에서 `hhc-site` 라는 이름이 두 곳에 있다**
| 항목 | 실체 | 주의 |
|---|---|---|
| **Pages 프로젝트 `hhc`** | **실제 웹사이트** | 도메인·배포는 **여기** |
| Worker `hhc-site` | 캘린더 동기화 (`worker.js`) | 웹사이트 아님 |
| Worker `hhc-cal-sync2` | 구버전 동기화 Worker | 미사용 추정 |

이름이 헷갈려 도메인을 Worker에 잘못 연결한 사고가 있었다.
구분법: 대시보드 URL이 `/pages/view/...` 면 Pages, `/workers/services/view/...` 면 Worker.

### 설정 현황 (참고)
- Cloudflare: 두 도메인 모두 Free 플랜 zone, Active
  - `happyhomecare.com.my` NS: `nelci` / `patryk`.ns.cloudflare.com
  - `happyhomecare.my` NS: `heidi` / `henry`.ns.cloudflare.com
  - `.my` 리다이렉트: DNS A `@`/`www` → `192.0.2.1` (**Proxied 필수**) + Redirect Rule
    `concat("https://happyhomecare.com.my", http.request.uri.path)` / 301
- Google OAuth (`happywork-packageplan`) 클라이언트 `HHC Invoice Web`
  승인된 JavaScript 원본 4개: workers.dev · pages.dev · happyhomecare.com.my · www.happyhomecare.com.my
- 등록업체 Exabytes / 만기 `.com.my` 2031-08-22 · `.my` 2027-08-23 / **자동갱신 ON**
- 미완: EmailJS 템플릿 내 옛 주소 확인, SPF·DMARC 미설정, 회사 이메일(@happyhomecare.com.my) 미개설

## 5. 데이터 구조 (Firestore 컬렉션)

`customers`(고객 원장: name, phone, aliases[], member 등급, ca_ch 연락경로, pt_used/pt_adj/pt_ovr 포인트) ·
`invoices`(id=INV번호, customer{name,phone}, items[], status: billing/paid/overdue, creditUse, pointUse, **files[] 첨부**) ·
`inspections`(client, phone, type: inspect/dispatch/install/washer, results[], coolUnits[], workVideos[]) ·
`contracts`(name, package_id, amount_paid, usage_history JSON) · `coupons`(name 구매자, receiver, code, type: gift/discount, status) ·
`bookings`(customer_name, booking_date/time, status: waiting/booked/confirmed) · `quotes` · `memos`(수리요청: name, req_date, visit_date, status: pending/contacted/done) ·
`schedules` · `settings/{points,kakao,insp_phrases}`

- 고객 매칭 규칙: 이름 정규화(`공백 제거·소문자`) + 별칭(aliases) + 전화번호 뒷자리. 수동 연결은 `ca_link`/`ca_links` 필드.
- 고객정보 통합(HHCC 엔진): 이름/전화 수정 시 9개 컬렉션에 전파. customer-admin이 원장.

## 6. 마이페이지(my.html) 주소 규칙 · 화면 구성

`my.html?c={고객문서ID}&v=iv,ip,ct,cp&lang=ko&f=bk&install=1`
- `c` 고객 ID (필수) · `v` 표시 항목(iv 인보이스, ip 점검, ct 계약, cp 상품권 — 없으면 기본 iv,ip,ct,cp)
- 상품권(cp)·견적·수리요청·예약은 v와 무관하게 항상 표시됨
- `f` 열자마자 강조·이동할 섹션 (iv·ip·ct·cp·qt·bk·mm·pt·ap설치·sv의뢰·fee추가비용)
- `install=1` 설치 오버레이 즉시 표시 (카톡→외부브라우저 전환 흐름)
- 영문 발송은 `my-en.html?c=...` (og 카드가 영어로 나오게 하는 우회)

**화면 구성 (2026-08 기준)**
- 상단 고정 **빠른메뉴** `#qtiles` : 인보이스·점검보고서·정비내역·상품권·견적서 (자료 없는 항목은 자동 숨김,
  스크롤하면 상단바 아래 고정). 인보이스·점검보고서·정비내역·견적서는 누르면 내역 목록이 바로 펼쳐진다
- 납부 예정 금액 카드 → 「결제정보 보기」는 **입금계좌 팝업**(`#bank-pop`)을 연다
- 「문서 및 서비스 현황」 한 줄 행 : 인보이스 · 점검보고서 · 수리요청 처리내역 · **견적서** (같은 형식)
- 하단 4탭 : 홈 · 예약 · **가격정보**(`/home#pricing`) · 문의
- 열림 상태는 `OPEN={iv,ip,mm,qt,ec,pt}` 전역, 허브 배선은 `window.__hubSet` / `window.__openHub(k)`

## 7. 발송 메시지 규칙 (customer-admin)

- WhatsApp: 전체 문구+주소 그대로. `wa.me/60{전화}` 로 대화방 직접 열기
- **카카오톡: 텍스트형 카드 최대 200자.** 주소 줄과 「📱 MY PAGE」류 제목 줄은 자동 제거되고
  카드 하단 「마이페이지 열기」 버튼이 대신한다. JS 키는 `settings/kakao.jsKey` + localStorage `hhc_kakao_key`
- 메시지 꼬리 형식: `\n\n📱 MY PAGE\n🔗 {주소}\n\nHappy Home Care 📞 +60 17-247 2774`

## 8. 디자인 토큰 (새 색 만들지 말 것)

고객 화면: 남색 `#0E2350→#16346E`, 청록 `#0b5f59→#0f766e`, 금색 `#C9A44C/#B98A16`,
빨강 `#DC2626`, 초록 `#0E9B63`, 잉크 `#14192A/#5A6478/#98A1B4`, 선 `#E4E9F2`, 배경 `#F6F8FC`.
그림자는 겹쳐서(접촉+중간+퍼짐). 카드 14px·히어로 16~18px·버튼 13px·배지 999px.
글꼴 Pretendard. 보라 그라데이션·왼쪽 색 세로줄·카드 3개 나열 같은 「AI 티」 패턴 금지.

## 9. 작업 수칙 (반드시)

1. **기존 파일을 읽고 그 안의 패턴을 따른다.** 추측으로 새 구조를 만들지 않는다.
2. 수정 후 각 `<script>` 블록이 문법 오류 없는지 확인한다 (`node --check` 수준).
3. 고객 화면은 한/영 양쪽 문구를 모두 넣는다 (`T` 객체).
4. 모바일 360/390/412px에서 가로 넘침이 없어야 한다.
5. Firebase 필드명을 바꾸지 않는다 — 다른 화면들이 같은 컬렉션을 읽는다.
6. 미러 스텁(3장)을 덮어쓰지 않는다. `_redirects`를 늘리지 않는다.
7. **산출 직전 `hhc-3p8` 를 검색해 옛 도메인이 남지 않았는지 확인한다** (0장·4장 참조).
8. 파일 전체를 다시 쓰지 말고 **필요한 부분만 고친 전체 파일**을 산출한다
   (부분 코드 조각만 주면 통합 과정에서 사고가 난다).
9. 완성 파일은 배포 전 Claude(또는 검증 가능한 쪽)에서 Playwright 실화면 검증을 거친다.

## 10. 협업 흐름

1. 사장님이 GitHub의 해당 파일(또는 배포 주소)을 ChatGPT에 전달
2. ChatGPT는 이 문서의 규칙 안에서 수정안 작성 → 수정된 **전체 파일** 산출
3. 사장님이 그 파일을 Claude에 전달 → Claude가 규칙 위반·충돌 검토 + Playwright 검증 → 배포 파일 확정
4. GitHub 업로드는 항상 마지막에, 어떤 파일을 올리는지 명시된 목록대로만

## 11. 최근 완료된 주요 작업 (2026-08 기준)

**도메인 전환** — `hhc-3p8.pages.dev` → `happyhomecare.com.my` (25개 파일 106곳, `_redirects` `/  /home  301`,
namecard QR SVG 재생성, OAuth 원본 추가). 4장 참조

**마이페이지** — 앱형 개편(상단바·문서현황 행·하단 4탭·집 사진 히어로) ·
상단 고정 빠른메뉴 재구성(납부 제거, 정비내역·상품권·견적서 추가, 자료 없는 항목 자동 숨김) ·
결제정보 팝업(입금계좌) · 최근 서비스명 관리코드 숨김 + 한/영 서비스명 변환 ·
하단 탭 「서비스」→「가격정보」(`/home#pricing`) · 회원권/포인트 카드 컴팩트화 ·
견적서를 「문서 및 서비스 현황」 한 줄 행으로 통합 · PWA 설치 오버레이

**인보이스** — 첨부 사진 기능(작성·고객 화면·PDF·목록 📎 표시. 커튼 세탁 무게 측정 사진용) ·
인보이스 불러오기 고객 검색

**점검보고서** — 부위 다이어그램+팝업·배수관 표시·냉방능력 요약·구분 기본 접힘·표지 축소·
점검대상 설비 표지 이동 · 계측기 사진 7세그먼트 OCR(8↔6·9↔5 획 누락 보정, 정확도 100%) ·
점검항목별 비고 자동문구(빠른선택 시트 포함)

**메시지·안내장** — 예약확정/방문안내 메시지 개편+카카오 카드 발송 ·
전자상품권·적립포인트 안내장 신설 · 상품권 v= 무관 항상 표시

---

## 12. 이 문서의 위치와 사용법 (상시 협업 장치)

- 이 파일은 저장소에 **`AI-GUIDE.md`** 로 올려 둔다. 갱신 시 이 파일만 다시 올리면 된다.
- 원문 주소(어느 AI에게든 이 주소를 주면 됨):
  `https://raw.githubusercontent.com/100SOUNGHAK/hhc-site/main/AI-GUIDE.md`
- 큰 작업이 끝날 때마다 11장(최근 작업)을 갱신해 두면, 어떤 AI와 새 대화를 시작해도
  같은 지점에서 이어서 작업할 수 있다.
