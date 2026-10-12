// 어디서, 어떤 단어로 뉴스를 가져올지 정하는 설정 파일.
// 출처를 늘리거나 단어를 바꾸고 싶으면 이 파일만 고치면 된다.

const gnews = (q, lang) =>
  lang === "ko"
    ? `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ko&gl=KR&ceid=KR:ko`
    : `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

const KR_Q =
  "사우디 (담맘 OR 자푸라 OR 동부 OR 리야드 OR 제다 OR 공항 OR 미사일 OR 드론 OR 공격 OR 요격 OR 폭발 OR 화재 OR 대피 OR 여행경보 OR 교민) when:3d";

// cat: kr(한국 뉴스) / wire(해외 통신사) / local(사우디·중동) / official(공식 공지)
// domains: 이 주소에서 온 기사만 받는다 (다른 사이트가 섞이지 않게)
export const FEEDS = [
  { name: "한국 주요 언론", cat: "kr", lang: "ko", url: gnews(KR_Q, "ko") },
  { name: "Reuters", cat: "wire", lang: "en", outlet: "Reuters", domains: ["reuters.com"], url: gnews("Saudi site:reuters.com when:3d", "en") },
  { name: "AP", cat: "wire", lang: "en", outlet: "AP", domains: ["apnews.com"], url: gnews("Saudi site:apnews.com when:3d", "en") },
  { name: "AFP", cat: "wire", lang: "en", outlet: "AFP", domains: ["afp.com", "france24.com"], url: gnews("Saudi AFP (site:afp.com OR site:france24.com) when:3d", "en") },
  { name: "Arab News", cat: "local", lang: "en", outlet: "Arab News", domains: ["arabnews.com"], url: gnews("site:arabnews.com Saudi when:3d", "en") },
  { name: "Saudi Gazette", cat: "local", lang: "en", outlet: "Saudi Gazette", domains: ["saudigazette.com.sa"], url: gnews("site:saudigazette.com.sa when:3d", "en") },
  { name: "SPA (사우디 국영통신)", cat: "local", lang: "en", outlet: "SPA (사우디 국영통신)", official: true, domains: ["spa.gov.sa"], url: gnews("site:spa.gov.sa when:3d", "en") },
];

// 한국 기사는 이 언론사들 것만 받는다 ("기타 주요 국내 언론" 포함)
export const KR_OUTLETS = [
  "연합뉴스", "연합뉴스TV", "KBS", "MBC", "SBS", "JTBC", "YTN", "뉴시스", "뉴스1",
  "조선일보", "중앙일보", "동아일보", "한겨레", "경향신문", "한국일보", "국민일보", "세계일보",
  "한국경제", "매일경제", "서울경제", "머니투데이", "아시아경제", "MBN", "채널A", "TV조선",
];

// 사우디 관련 기사인지 확인하는 단어
export const SAUDI_WORDS = [
  "사우디", "saudi", "riyadh", "리야드", "jeddah", "제다", "dammam", "담맘", "dhahran", "다란",
  "aramco", "아람코", "jafurah", "자푸라", "eastern province", "동부주", "khobar", "코바르", "jubail", "주바일",
];

// 사건 종류 (위에 있을수록 먼저 정해진다)
export const TYPE_RULES = [
  { type: "evacuation", words: ["대피령", "대피 지시", "대피 명령", "철수 권고", "evacuation order", "ordered to evacuate", "evacuate"] },
  { type: "advisory", words: ["여행경보", "여행금지", "특별여행주의보", "출국권고", "travel advisory", "travel warning", "do not travel"] },
  { type: "korean", words: ["교민", "한국인", "재외국민", "우리 국민", "주사우디", "korean nationals", "south korean"] },
  { type: "missile", words: ["미사일", "탄도", "missile", "ballistic"] },
  { type: "drone", words: ["드론", "무인기", "drone", "uav"] },
  { type: "energy", words: ["아람코", "가스전", "정유", "석유 시설", "에너지 시설", "aramco", "refinery", "gas field", "oil field", "oil facilit", "gas facilit", "gas plant", "energy facilit", "pipeline", "jafurah", "자푸라"], needs: "INCIDENT" },
  { type: "airport", words: ["공항", "항공편", "영공", "airport", "flight", "airspace", "airline"], needs: "DISRUPT" },
  { type: "fire", words: ["폭발", "화재", "explosion", "blast", "\\bfire\\b", "blaze"] },
  { type: "security", words: ["공격", "피격", "요격", "후티", "attack", "strike", "intercept", "houthi"] },
];

export const INCIDENT_WORDS = ["공격", "피격", "요격", "드론", "미사일", "폭발", "화재", "attack", "strike", "drone", "missile", "explosion", "blast", "\\bfire\\b", "intercept", "sabotage"];
export const DISRUPT_WORDS = ["폐쇄", "결항", "지연", "운항 중단", "운항 차질", "회항", "closed", "closure", "suspend", "cancel", "delay", "divert", "disrupt", "halt", "grounded"];

// 지역
export const REGION_RULES = [
  { id: "jafurah", words: ["jafurah", "자푸라"] },
  { id: "dammam", words: ["dammam", "담맘", "king fahd international"] },
  { id: "eastern", words: ["eastern province", "동부주", "동부 지역", "sharqiya", "ras tanura", "라스타누라", "abqaiq", "아브카이크", "jubail", "주바일", "dhahran", "다란", "khobar", "코바르", "qatif", "카티프"] },
  { id: "riyadh", words: ["riyadh", "리야드"] },
  { id: "jeddah", words: ["jeddah", "제다"] },
  { id: "airport", words: ["airport", "공항"] },
];

// 공격 주체가 "주장"만 한 경우를 찾는 표현
export const CLAIM_WORDS = ["주장", "\\bclaim\\b", "claimed", "claims", "claim responsibility", "claimed responsibility", "said it targeted", "said they targeted", "said it had targeted", "yahya saree", "야히야 사리"];
