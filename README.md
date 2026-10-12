# 사우디 현황 모아보기 — 올리는 방법

코딩 없이 웹사이트에서 클릭만으로 진행해요. 처음 한 번만 30분~1시간 정도 걸려요.
준비물: 이메일 주소 하나 (GitHub, Vercel 가입용). **모두 무료**예요.

> 비밀번호 없이 열려 있어서, 주소를 아는 사람은 누구나 볼 수 있어요. 검색엔진에는 안 나오게 해 뒀어요.

---

## 전체 구조 (한 번만 읽어 두기)

```
GitHub (저장소)                     Vercel (사이트 주소)
 ├─ 사이트 화면 파일        ──────▶  가족이 휴대폰으로 접속
 └─ 뉴스 수집 로봇 (30분마다)
      └─ news.json 갱신 ─── 자동으로 사이트에 반영
```

---

## 1단계. GitHub에 파일 올리기 (10분)

1. https://github.com 에서 회원가입
2. 오른쪽 위 **+** → **New repository**
   - Repository name: `saudi-watch`
   - **Private** 선택 (중요: 남들이 못 보게)
   - **Create repository** 클릭
3. 다음 화면에서 **uploading an existing file** 링크 클릭
4. 받은 zip을 풀고, 폴더 **안의 내용물 전부**를 브라우저로 끌어다 놓기
   - `app`, `lib`, `public`, `scripts`, `package.json` 등이 보여야 해요
5. 아래 **Commit changes** 클릭

### ⚠ 꼭 확인: 뉴스 수집 로봇 파일
`.github` 폴더는 이름이 점(.)으로 시작해서 컴퓨터에서 숨김 처리되어 안 올라갈 때가 많아요.
저장소 첫 화면에 `.github` 폴더가 **안 보이면**:

1. **Add file** → **Create new file**
2. 파일 이름 칸에 `.github/workflows/collect.yml` 그대로 입력
3. zip 안의 `.github/workflows/collect.yml` 내용을 메모장으로 열어 전부 복사해서 붙여넣기
4. **Commit changes**

## 2단계. 로봇이 저장할 수 있게 허락하기 (2분)

1. 저장소 위쪽 **Settings** → 왼쪽 **Actions** → **General**
2. 맨 아래 **Workflow permissions** 에서 **Read and write permissions** 선택 → **Save**

## 3단계. 뉴스 처음 한 번 가져와 보기 (3분)

1. 저장소 위쪽 **Actions** 탭
2. 왼쪽 **뉴스 수집** → 오른쪽 **Run workflow** → 초록 버튼 **Run workflow**
3. 1~2분 뒤 초록 체크(✓)가 뜨면 성공. 빨간 X면 화면을 캡처해서 Claude에게 보내 주세요.

이후로는 **30분마다 자동**으로 돌아가요.

## 4단계. Vercel로 사이트 주소 만들기 (10분)

1. https://vercel.com → **Sign Up** → **Continue with GitHub** (GitHub 계정으로 가입)
   - 요금제는 **Hobby (무료)** 선택
2. **Add New…** → **Project** → `saudi-watch` 옆 **Import**
   - 목록에 안 보이면 **Adjust GitHub App Permissions**에서 저장소 접근 허용
3. 아무것도 바꾸지 말고 **Deploy** 클릭 → 1~2분 기다리면 축하 화면과 함께 주소가 나와요
   (예: `saudi-watch-abc.vercel.app`)
4. 주소를 휴대폰으로 열어 잘 나오는지 확인

> 빌드가 실패하면(빨간 Error) 그 화면을 캡처해서 Claude에게 보내 주세요. 바로 고쳐 드려요.

## 5단계. 가족에게 보내기

카톡으로 **주소**를 보내고, 홈 화면에 추가하는 법을 알려 주세요.

- **아이폰**: Safari로 열기 → 아래 공유 버튼(□↑) → **홈 화면에 추가**
- **갤럭시**: 삼성 인터넷 또는 크롬으로 열기 → 메뉴(≡ 또는 ⋮) → **홈 화면에 추가**

---

## (선택) AI 한국어 요약 켜기

지금 상태로도 동작하지만, 영어 기사는 **영어 제목 그대로** 나오고 "지금 사우디 상황"은 건수만 세어 줘요.
AI를 켜면 영어 기사도 **한국어 제목·요약**으로 바뀌고, 같은 사건을 다룬 한국어·영어 기사를 하나로 묶어 줘요.

GPT(OpenAI)나 Claude 중 **하나만** 골라서 키를 넣으면 돼요.

- **비용**: API 사용료가 들어요 (새 기사가 있을 때만 호출). 처음엔 소액(예: 5달러) 충전 후 사용량을 보고 정하는 걸 추천해요. ChatGPT Plus 같은 월 구독과는 별개로 결제해야 해요.

**GPT로 쓰기**
1. https://platform.openai.com 가입 → **Billing**에서 결제 수단 등록·충전 → **API keys** → **Create new secret key** → 키 복사
2. GitHub 저장소 → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**
3. Name: `OPENAI_API_KEY`, Secret: 복사한 키 → **Add secret**

**Claude로 쓰기**
1. https://console.anthropic.com 가입 → 결제 수단 등록 → **API Keys** → **Create Key** → 키 복사
2. 위와 같은 곳에 Name: `ANTHROPIC_API_KEY`로 등록

- 둘 다 넣으면 GPT를 먼저 써요.
- 키는 GitHub 비밀 저장소에만 있고, 사이트 화면에는 절대 들어가지 않아요.
- AI가 실패해도 사이트는 멈추지 않고, 그 회차만 AI 없이 정리돼요.

---

## 자주 묻는 것

**"마지막으로 가져온 지 ○시간 지났어요" 경고가 떠요**
GitHub **Actions** 탭에서 최근 실행이 빨간 X인지 확인해 주세요. 캡처해서 Claude에게 보내면 돼요.

**뉴스는 어디서 가져오나요?**
구글 뉴스 검색 피드(RSS)를 통해 아래 언론사 기사 제목과 링크만 가져와요. 기사 본문은 복사하지 않고, "원문 보기"로 언론사 사이트에 연결해요.
- 한국: 연합뉴스, KBS, MBC, SBS, JTBC, YTN 등 주요 언론 (목록은 `scripts/sources.mjs`)
- 해외 통신사: Reuters, AP, AFP
- 사우디: SPA(국영통신), Arab News, Saudi Gazette

**확인 상태는 누가 정하나요?**
AI가 아니라 정해진 규칙이 정해요.
- 공식 기관 확인: 사우디 국영통신(SPA)이나 공식 기관 출처가 있을 때
- 공격 주체 주장: 주장만 있고 확인이 없을 때 (여러 언론이 그 주장을 전해도 '주장'으로 남아요)
- 복수 언론 확인: 서로 다른 언론사 2곳 이상
- 단일 언론 보도: 1곳

**아직 안 된 것**
- 외교부·대사관 공지 자동 수집 (공공데이터포털 인증키 신청 후 연결 예정)
- 휴대폰 알림
