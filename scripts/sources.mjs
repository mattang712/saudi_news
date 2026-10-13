// 어디서, 어떤 단어로 뉴스를 가져올지 정하는 설정 파일.
// 출처를 늘리거나 단어를 바꾸고 싶으면 이 파일만 고치면 된다.

const GN_LANG = { ko: "hl=ko&gl=KR&ceid=KR:ko", en: "hl=en-US&gl=US&ceid=US:en", ar: "hl=ar&gl=SA&ceid=SA:ar" };
const gnews = (q, lang) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&${GN_LANG[lang] || GN_LANG.en}`;

// 구글 뉴스는 검색 한 번에 최대 100건, 그것도 '관련도순'으로 준다.
// 기사가 많은 날엔 최신 기사가 잘리므로, 기간을 짧게 + 동부주·공항 전용 검색을 따로 돌려서 합친다.
const KR_BASE = "사우디 (담맘 OR 자푸라 OR 동부 OR 리야드 OR 제다 OR 공항 OR 미사일 OR 드론 OR 공격 OR 요격 OR 폭발 OR 화재 OR 대피 OR 여행경보 OR 교민)";
const KR_EAST = "(담맘 OR 자푸라 OR 사우디 동부 OR 다란 OR 주바일 OR 아람코)";
const KR_AIR = "사우디 (공항 OR 항공편 OR 운항 OR 결항 OR 영공)";
const EAST = '(Dammam OR Jafurah OR "Eastern Province" OR Dhahran OR Khobar OR Jubail OR "Ras Tanura" OR Abqaiq OR Qatif)';
const AIR = "Saudi (airport OR flights OR airline OR airspace OR airways)";

// site: 조건 하나로 세 가지 검색 주소를 만든다 (최근 12시간 전체 / 최근 2일 동부주 / 최근 1일 공항·항공)
const wireUrls = (site) => [
  gnews(`Saudi ${site} when:12h`, "en"),
  gnews(`Saudi ${site} when:1d`, "en"),
  gnews(`${EAST} ${site} when:2d`, "en"),
  gnews(`${AIR} ${site} when:1d`, "en"),
];

const direct = (url) => ({ url }); // 언론사 RSS 주소 (구글 뉴스 아님)

// cat: kr(한국 뉴스) / wire(해외 통신사) / local(사우디·중동) / official(공식 공지)
// domains: 이 주소에서 온 기사만 받는다 (다른 사이트가 섞이지 않게)
// 지난 수집에서 받아 둔 기사는 3일 동안 계속 보관하므로, 검색 기간이 짧아도 3일 치가 유지된다.
export const FEEDS = [
  { name: "한국 주요 언론", cat: "kr", lang: "ko", urls: [gnews(`${KR_BASE} when:12h`, "ko"), gnews(`${KR_BASE} when:1d`, "ko"), gnews(`${KR_EAST} when:2d`, "ko"), gnews(`${KR_AIR} when:1d`, "ko")] },
  { name: "Reuters", cat: "wire", lang: "en", outlet: "Reuters", domains: ["reuters.com"], urls: wireUrls("site:reuters.com") },
  { name: "AP", cat: "wire", lang: "en", outlet: "AP", domains: ["apnews.com"], urls: wireUrls("site:apnews.com") },
  { name: "AFP", cat: "wire", lang: "en", outlet: "AFP", domains: ["afp.com", "france24.com"], urls: wireUrls("(site:afp.com OR site:france24.com)") },
  { name: "Arab News", cat: "local", lang: "en", outlet: "Arab News", domains: ["arabnews.com"], urls: [direct("https://www.arabnews.com/rss.xml"), ...wireUrls("site:arabnews.com")] },
  { name: "Saudi Gazette", cat: "local", lang: "en", outlet: "Saudi Gazette", domains: ["saudigazette.com.sa"], urls: [direct("https://saudigazette.com.sa/rssFeed/74"), gnews("site:saudigazette.com.sa when:1d", "en"), gnews(`${EAST} site:saudigazette.com.sa when:2d`, "en")] },
  // ── 언론사 RSS 직접 받기 (구글 뉴스 지연 없음) ──
  { name: "Asharq Al-Awsat", cat: "local", lang: "en", outlet: "Asharq Al-Awsat", domains: ["aawsat.com"], urls: [direct("https://english.aawsat.com/feed")] },
  { name: "Al Jazeera", cat: "local", lang: "en", outlet: "Al Jazeera", domains: ["aljazeera.com"], urls: [direct("https://www.aljazeera.com/xml/rss/all.xml"), ...wireUrls("site:aljazeera.com")] },  // 직접 받기가 막히면 구글 뉴스로 대신
  // ── 외교부 공공데이터 API (GitHub Secrets의 MOFA_API_KEY 필요) ──
  { name: "외교부 여행경보", cat: "official", lang: "ko", outlet: "외교부 여행경보", official: true, presetType: "advisory", mofa: ["CountryHistoryService2/getCountryHistoryList2"] },
  { name: "외교부 안전공지", cat: "official", lang: "ko", outlet: "외교부 안전공지", official: true, presetType: "korean", mofa: ["CountrySafetyService7/getCountrySafetyList7", "CountrySafetyService7/getCountrySafetyList"] },
  { name: "SPA (사우디 국영통신)", cat: "local", lang: "en", outlet: "SPA (사우디 국영통신)", official: true, domains: ["spa.gov.sa"], urls: [gnews("site:spa.gov.sa when:12h", "en"), gnews("site:spa.gov.sa when:1d", "en"), gnews(`${EAST} site:spa.gov.sa when:2d`, "en")] },
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
  "السعودية", "السعودي", "المملكة", "الرياض", "جدة", "الدمام", "الجافورة", "الشرقية", "الظهران", "الخبر", "الجبيل", "أرامكو",
];

// 사건 종류 (위에 있을수록 먼저 정해진다)
export const TYPE_RULES = [
  { type: "evacuation", words: ["대피령", "대피 지시", "대피 명령", "철수 권고", "evacuation order", "ordered to evacuate", "evacuate", "إخلاء"] },
  { type: "advisory", words: ["여행경보", "여행금지", "특별여행주의보", "출국권고", "travel advisory", "travel warning", "do not travel", "تحذير من السفر"] },
  { type: "korean", words: ["교민", "한국인", "재외국민", "우리 국민", "주사우디", "korean nationals", "south korean"] },
  { type: "missile", words: ["미사일", "탄도", "missile", "ballistic", "صاروخ", "صواريخ", "باليستي"] },
  { type: "drone", words: ["드론", "무인기", "drone", "uav", "مسيرة", "مسيّرة", "مسيرات", "طائرة بدون طيار"] },
  { type: "energy", words: ["아람코", "가스전", "정유", "석유 시설", "에너지 시설", "aramco", "refinery", "gas field", "oil field", "oil facilit", "gas facilit", "gas plant", "energy facilit", "pipeline", "jafurah", "자푸라", "أرامكو", "مصفاة", "حقل غاز", "منشأة نفطية", "الجافورة"], needs: "INCIDENT" },
  { type: "airport", words: ["공항", "항공편", "영공", "airport", "flight", "airspace", "airline", "مطار", "رحلات", "الطيران", "المجال الجوي"], needs: "DISRUPT" },
  { type: "fire", words: ["폭발", "화재", "explosion", "blast", "\\bfire\\b", "blaze", "انفجار", "حريق"] },
  { type: "security", words: ["공격", "피격", "요격", "후티", "attack", "strike", "intercept", "houthi", "هجوم", "استهداف", "اعتراض", "الحوثي"] },
];

export const INCIDENT_WORDS = ["공격", "피격", "요격", "드론", "미사일", "폭발", "화재", "attack", "strike", "drone", "missile", "explosion", "blast", "\\bfire\\b", "intercept", "sabotage", "هجوم", "استهداف", "اعتراض", "انفجار", "حريق", "صاروخ", "مسيرة", "مسيّرة"];
export const DISRUPT_WORDS = ["폐쇄", "결항", "지연", "운항 중단", "운항 차질", "회항", "closed", "closure", "suspend", "cancel", "delay", "divert", "disrupt", "halt", "grounded", "إغلاق", "تعليق", "إلغاء", "تأخير", "تحويل"];

// 지역
export const REGION_RULES = [
  { id: "jafurah", words: ["jafurah", "자푸라", "الجافورة"] },
  { id: "dammam", words: ["dammam", "담맘", "king fahd international", "الدمام", "مطار الملك فهد"] },
  { id: "eastern", words: ["eastern province", "동부주", "동부 지역", "sharqiya", "ras tanura", "라스타누라", "abqaiq", "아브카이크", "jubail", "주바일", "dhahran", "다란", "khobar", "코바르", "qatif", "카티프", "المنطقة الشرقية", "الشرقية", "الظهران", "الخبر", "الجبيل", "رأس تنورة", "بقيق", "القطيف"] },
  { id: "riyadh", words: ["riyadh", "리야드", "الرياض"] },
  { id: "jeddah", words: ["jeddah", "제다", "جدة"] },
  { id: "airport", words: ["airport", "공항", "مطار"] },
];

// 공격 주체가 "주장"만 한 경우를 찾는 표현
export const CLAIM_WORDS = ["주장", "\\bclaim\\b", "claimed", "claims", "claim responsibility", "claimed responsibility", "said it targeted", "said they targeted", "said it had targeted", "yahya saree", "야히야 사리", "تبنت", "تبنّت", "يزعم", "زعم", "ادعى"];
