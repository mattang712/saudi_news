// 뉴스 수집기 — GitHub Actions가 30분마다 실행한다.
// 결과는 public/data/news.json 한 파일에 저장되고, 사이트는 이 파일을 읽어 보여준다.
//
// 원칙
// - 기사에 없는 내용은 만들지 않는다 (발생 시각을 모르면 null)
// - 확인 상태(공식/복수/단일/주장)는 AI가 아니라 이 코드가 규칙으로 정한다
// - 수집이 실패하면 실패했다고 기록하고, 이전 결과를 지우지 않는다

import fs from "node:fs/promises";
import crypto from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import {
  FEEDS, KR_OUTLETS, SAUDI_WORDS, TYPE_RULES, INCIDENT_WORDS, DISRUPT_WORDS, REGION_RULES, CLAIM_WORDS,
} from "./sources.mjs";

const OUT = "public/data/news.json";
const KEEP_HOURS = 72;
const NOW = Date.now();
const H = 3600 * 1000;
// AI 요약: OPENAI_API_KEY(GPT) 또는 ANTHROPIC_API_KEY(Claude) 중 있는 것을 사용. 둘 다 있으면 GPT 우선.
const OPENAI_KEY = process.env.OPENAI_API_KEY || "";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";
const AI_KEY = OPENAI_KEY || ANTHROPIC_KEY;
const AI_MODEL = process.env.AI_MODEL || (OPENAI_KEY ? "gpt-5-mini" : "claude-haiku-5-5");
const MAX_AI_ARTICLES = 60;
const PROMPT_VERSION = 4; // AI 지시문을 고치면 숫자를 올린다
const AI_EVERY_MIN = Number(process.env.AI_EVERY_MIN || 120); // 상황 요약·사건 묶기 간격(분)
// 타임라인에 쓰는 출처 (국내 언론은 늦게 보도하는 경우가 많아 제외)
const TIMELINE_FEEDS = new Set(["Reuters", "SPA (사우디 국영통신)"]);

/* ───────── 도구 ───────── */
const iso = (ts) => (ts == null ? null : new Date(ts).toISOString());
const idOf = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 12);
const stripTags = (s) => String(s || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
const rx = (w) => new RegExp(w.startsWith("\\b") ? w : w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
const hasAny = (text, words) => words.some((w) => rx(w).test(text));
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

async function readJson(path, fallback) {
  try { return JSON.parse(await fs.readFile(path, "utf8")); } catch { return fallback; }
}

/* ───────── 1. 가져오기 ───────── */
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

// 검색 주소 하나에서 기사 목록 받기
async function fetchUrl(feed, url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (family news reader; contact via GitHub)" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  const doc = parser.parse(xml);
  let items = doc?.rss?.channel?.item || [];
  if (!Array.isArray(items)) items = [items];

  const out = [];
  for (const it of items) {
    const srcName = stripTags(typeof it.source === "object" ? it.source["#text"] : it.source);
    const srcUrl = typeof it.source === "object" ? it.source["@_url"] : "";
    let title = stripTags(it.title);
    if (srcName && title.endsWith(" - " + srcName)) title = title.slice(0, -(srcName.length + 3));
    let snippet = stripTags(it.description);
    if (snippet.startsWith(title)) snippet = snippet.slice(title.length).trim();
    if (srcName && snippet.endsWith(srcName)) snippet = snippet.slice(0, -srcName.length).trim();

    let outlet = feed.outlet || srcName;
    if (feed.cat === "kr") {
      const hit = KR_OUTLETS.find((o) => srcName === o || srcName.startsWith(o + " ") || srcName.startsWith(o));
      if (!hit) continue; // 목록에 없는 언론사는 제외
      outlet = hit;
    }
    if (feed.domains) {
      const h = hostOf(srcUrl);
      if (!feed.domains.some((d) => h === d || h.endsWith("." + d))) continue;
    }

    const reportedAt = Date.parse(it.pubDate) || null;
    if (reportedAt && NOW - reportedAt > KEEP_HOURS * H) continue;

    out.push({
      id: idOf(outlet + "|" + title.toLowerCase()),
      feed: feed.name, cat: feed.cat, official: !!feed.official, lang: feed.lang,
      outlet, title, snippet, url: it.link, reportedAt,
    });
  }
  return out;
}

// 출처 하나에 딸린 검색 주소 여러 개를 차례로 돌려서 합친다. 전부 실패할 때만 '실패'
async function fetchFeed(feed) {
  const urls = feed.urls || [feed.url];
  const merged = new Map();
  let okCount = 0, lastErr;
  for (const u of urls) {
    try {
      for (const a of await fetchUrl(feed, u)) if (!merged.has(a.id)) merged.set(a.id, a);
      okCount++;
    } catch (e) { lastErr = e; }
    await new Promise((r) => setTimeout(r, 300)); // 구글에 너무 몰아서 요청하지 않게
  }
  if (!okCount) throw lastErr || new Error("모든 검색 실패");
  return [...merged.values()];
}

/* ───────── 2. 분류 (규칙) ───────── */
function classify(a) {
  const text = `${a.title} ${a.snippet}`;
  if (!hasAny(text, SAUDI_WORDS)) return null;

  let type = null;
  for (const r of TYPE_RULES) {
    if (!hasAny(text, r.words)) continue;
    if (r.needs === "INCIDENT" && !hasAny(text, INCIDENT_WORDS)) continue;
    if (r.needs === "DISRUPT" && !hasAny(text, DISRUPT_WORDS)) continue;
    type = r.type; break;
  }
  if (!type) return null; // 안전과 관련 없는 일반 기사(경제, 스포츠 등)는 제외

  const regions = REGION_RULES.filter((r) => hasAny(text, r.words)).map((r) => r.id);
  if ((regions.includes("dammam") || regions.includes("jafurah")) && !regions.includes("eastern")) regions.push("eastern");
  let inferred = false, inferNote = null;
  if (type === "energy" && !regions.includes("jafurah") && hasAny(text, ["gas", "가스"]) && (regions.includes("eastern") || regions.length === 0)) {
    regions.push("jafurah"); if (!regions.includes("eastern")) regions.push("eastern");
    inferred = true;
    inferNote = "기사에 '자푸라'라는 이름은 안 나오고 가스 시설 얘기만 있어서, 관련 있을 수도 있다고 짐작한 거예요.";
  }
  const attackish = ["missile", "drone", "energy", "security", "fire"].includes(type);
  return { type, regions: regions.length ? regions : ["all"], inferred, inferNote, claim: attackish && hasAny(text, CLAIM_WORDS) };
}

/* ───────── 3. 묶기 (AI 없을 때: 거의 같은 제목만 묶음) ───────── */
const tokens = (s) => new Set(s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 1));
function jaccard(a, b) { const A = tokens(a), B = tokens(b); let n = 0; for (const x of A) if (B.has(x)) n++; return n / (A.size + B.size - n || 1); }

function ruleClusters(arts) {
  const groups = [];
  for (const a of arts) {
    const g = groups.find((g) => g.type === a.cls.type && Math.abs((g.arts[0].reportedAt || 0) - (a.reportedAt || 0)) < 12 * H && g.arts.some((b) => b.lang === a.lang && jaccard(b.title, a.title) >= 0.5));
    if (g) g.arts.push(a); else groups.push({ type: a.cls.type, arts: [a] });
  }
  return groups.map((g) => ({ articleIds: g.arts.map((a) => a.id) }));
}

/* ───────── 4. AI 정리 (선택) ───────── */
const VALID_TYPES = new Set(TYPE_RULES.map((t) => t.type));
const VALID_REGIONS = new Set(["jafurah", "dammam", "eastern", "riyadh", "jeddah", "airport", "all"]);

async function aiOrganize(arts, cachedSummaries, cachedTitles) {
  const list = arts.map((a) => ({
    id: a.id, outlet: a.outlet, reportedAt: iso(a.reportedAt), title: a.title, snippet: a.snippet.slice(0, 300),
    ...(cachedSummaries[a.id] ? { summaryKoAlreadyDone: true } : {}),
    ...(a.lang === "ko" || cachedTitles[a.id] ? { titleKoAlreadyDone: true } : {}),
  }));
  const prompt = `너는 사우디아라비아 동부(담맘·자푸라 가스전) 근처에서 일하는 가족을 둔 한국 가족을 위해 뉴스를 정리한다.
아래 기사 목록(JSON)은 제목과 짧은 요약만 있다. 이 안에 적힌 내용만 사용하고, 없는 사실·숫자·시각을 절대 만들지 마라.

해야 할 일:
1. 같은 사건을 다룬 기사끼리 묶어라(clusters). 서로 다른 사건이면 따로 둔다. 확실하지 않으면 묶지 마라.
2. 묶음마다:
   - titleKo: 한국어 제목 한 줄. 공격 주체의 주장만 있으면 "~라고 주장"처럼 주장임이 드러나게 쓴다.
   - type: ${[...VALID_TYPES].join(", ")} 중 하나
   - regions: jafurah, dammam, eastern, riyadh, jeddah, airport 중 해당하는 것 (없으면 빈 배열)
   - regionInferred: 기사에 지명이 직접 없고 추정했으면 true, inferNote에 이유를 한국어 한 문장(해요체)으로
   - claimOnly: 공격 주체(후티 등)의 주장만 있고 사우디 당국이나 독립 언론의 확인이 없으면 true
   - evacuationOrder: 공식 기관이 실제 대피를 지시했다고 기사에 명시된 경우만 true (단순 권고는 false)
   - occurredAt: 기사에 사건 발생 시각이 명시된 경우에만 ISO 8601(UTC)로, 아니면 null
3. articleSummariesKo: summaryKoAlreadyDone이 없는 기사마다, 제목·요약에 있는 내용만으로 한국어 1~2문장(해요체) 요약
3-1. articleTitlesKo: titleKoAlreadyDone이 없는 기사마다, 원문 제목을 자연스러운 한국어 제목 한 줄로 번역 (주장은 "~라고 주장"으로)
4. irrelevant: 사우디 안전과 관계없는 기사 id 목록
5. summaryKo: 여러 기사를 하나로 통합한 아주 짧은 상황 요약. 문장 배열로 2~4개.
   - 문장 하나에 사건 하나만. 각 문장 35자 이내, 차분한 해요체
   - 같은 사건을 다룬 기사들은 한 문장으로 합쳐라. 같은 내용을 두 번 쓰지 마라
   - 순서: 담맘·자푸라·동부주 → 공항·항공편 → 다른 지역 공격 → 외교부 공지
   - 확인 정도는 짧게 녹여라 (예: "로이터 보도", "국영통신 발표", "후티 주장, 미확인")
   - 수식어, 배경 설명, 번호, 글머리 기호 없이
   - "안전하다", "위험 없다", "공격 없다"처럼 단정하지 마라
   - 최근 24시간 동안 눈에 띄는 일이 없으면 ["최근 24시간 동안 눈에 띄는 새 사건 보도는 없어요."]
   - 기사가 하나도 없으면 빈 배열

JSON만 출력하라. 형식:
{"clusters":[{"articleIds":[],"titleKo":"","type":"","regions":[],"regionInferred":false,"inferNote":"","claimOnly":false,"evacuationOrder":false,"occurredAt":null}],"articleSummariesKo":{"id":"요약"},"articleTitlesKo":{"id":"한국어 제목"},"irrelevant":[],"summaryKo":[]}

기사 목록:
${JSON.stringify(list)}`;

  const text = await callAI(prompt);
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s < 0 || e < 0) throw new Error("AI 응답에 JSON이 없음");
  return JSON.parse(text.slice(s, e + 1));
}

const callAI = (prompt) => (OPENAI_KEY ? callOpenAI(prompt) : callClaude(prompt));

// 영어 기사 제목만 한국어로 번역 (이미 번역한 건 다시 안 함). 80개씩 나눠서 요청.
let TITLES_KO = {};
async function translateTitles(arts, titlesKo) {
  const todo = arts.filter((a) => a.lang !== "ko" && !titlesKo[a.id]);
  for (let i = 0; i < todo.length; i += 80) {
    const batch = todo.slice(i, i + 80).map((a) => ({ id: a.id, title: a.title }));
    const prompt = `아래 영어 뉴스 제목들을 자연스러운 한국어 뉴스 제목으로 번역하라.
- 원문에 없는 내용을 더하거나 빼지 마라. 숫자·지명·기관명은 그대로 옮긴다.
- 누가 "주장했다(claim)"는 제목이면 주장이라는 점이 드러나게 번역한다.
- 지명은 한국 언론 표기를 따른다 (Riyadh 리야드, Jeddah 제다, Dammam 담맘, Houthi 후티, Aramco 아람코).
JSON만 출력: {"id": "한국어 제목", ...}

${JSON.stringify(batch)}`;
    const text = await callAI(prompt);
    const s = text.indexOf("{"), e = text.lastIndexOf("}");
    if (s < 0 || e < 0) throw new Error("번역 응답에 JSON이 없음");
    const out = JSON.parse(text.slice(s, e + 1));
    const ids = new Set(batch.map((b) => b.id));
    for (const [id, t] of Object.entries(out)) {
      if (ids.has(id) && typeof t === "string" && t.length > 0 && t.length < 200) titlesKo[id] = t.trim();
    }
  }
}

async function callOpenAI(prompt) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 16000,
      // gpt-5 계열은 '생각' 토큰도 요금이 붙어서 최소로
      ...(AI_MODEL.startsWith("gpt-5") ? { reasoning_effort: "minimal" } : {}),
    }),
    signal: AbortSignal.timeout(180000),
  });
  if (!res.ok) throw new Error(`GPT HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  return body.choices?.[0]?.message?.content || "";
}

async function callClaude(prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: AI_MODEL, max_tokens: 8000, messages: [{ role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`Claude HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  return (body.content || []).map((c) => c.text || "").join("");
}

/* ───────── 5. 사건 만들기 + 확인 상태(코드 규칙) ───────── */
const SEV = { evacuation: "high", missile: "high", drone: "high", energy: "high", security: "mid", advisory: "mid", korean: "mid", airport: "mid", fire: "mid" };

function buildEvent(c, byId, ai) {
  const arts = c.articleIds.map((id) => byId.get(id)).filter(Boolean);
  if (!arts.length) return null;
  arts.sort((a, b) => (a.reportedAt || 0) - (b.reportedAt || 0));
  const ruleTypes = arts.map((a) => a.cls.type);
  const type = ai && VALID_TYPES.has(c.type) ? c.type : ruleTypes[0];

  let regions = ai && Array.isArray(c.regions) ? c.regions.filter((r) => VALID_REGIONS.has(r) && r !== "all") : [];
  for (const a of arts) for (const r of a.cls.regions) if (r !== "all" && !regions.includes(r)) regions.push(r);
  if ((regions.includes("dammam") || regions.includes("jafurah")) && !regions.includes("eastern")) regions.push("eastern");
  const inferred = (ai && c.regionInferred === true) || arts.every((a) => a.cls.inferred);
  const inferNote = (ai && c.inferNote) || arts.find((a) => a.cls.inferNote)?.cls.inferNote || null;

  // 확인 상태: 공식 > 주장 > 복수 언론 > 단일 언론
  const outlets = [...new Set(arts.map((a) => a.outlet))];
  const official = arts.some((a) => a.official || a.cat === "official");
  const claim = ai ? c.claimOnly === true : arts.every((a) => a.cls.claim);
  const status = official ? "official" : claim ? "claim" : outlets.length >= 2 ? "multi" : "single";

  let directive = null;
  if (official && ai && c.evacuationOrder === true) directive = "evacuation";
  else if (official && ["advisory", "korean"].includes(type)) directive = "advice";

  // 발생 시각: AI가 기사에서 찾은 경우만, 그리고 보도 시각과 앞뒤가 맞을 때만 사용
  let occurredAt = null;
  if (ai && c.occurredAt) {
    const t = Date.parse(c.occurredAt);
    const first = arts[0].reportedAt;
    if (t && first && t <= first + H && t >= first - KEEP_HOURS * H) occurredAt = t;
  }

  const krTitle = arts.find((a) => a.lang === "ko")?.title;
  const autoTitle = !krTitle && ((ai && c.titleKo) || TITLES_KO[arts[0].id]) ? true : false;
  return {
    id: idOf(arts.map((a) => a.id).sort().join(",")),
    articleIds: arts.map((a) => a.id),
    type, sev: SEV[type] || "low", status, directive,
    title: krTitle || (ai && c.titleKo) || TITLES_KO[arts[0].id] || arts[0].title,
    titleAuto: autoTitle,
    regions: regions.length ? regions : ["all"],
    inferred: inferred && regions.length > 0, inferNote,
    occurredAt: iso(occurredAt),
    collectedAt: iso(Math.min(...arts.map((a) => a.firstSeen))),
    aiNote: ai ? "제목과 요약은 AI가 기사 내용만 보고 정리했어요." : null,
    sources: arts.map((a) => ({
      outlet: a.outlet, cat: a.cat, title: a.title, titleKo: a.lang === "ko" ? null : TITLES_KO[a.id] || null, summary: a.summaryKo || (a.lang === "ko" ? a.snippet : "") || "",
      reportedAt: iso(a.reportedAt), url: a.url,
    })),
  };
}

function countSummary(events) {
  const d24 = events.filter((e) => NOW - Date.parse(e.occurredAt || e.sources[0]?.reportedAt || e.collectedAt) <= 24 * H);
  if (!d24.length) return ["최근 24시간 동안 새로 모은 사우디 안전 관련 소식은 없어요.", "아래 '전체' 타임라인에서 최근 3일 소식을 볼 수 있어요."];
  const n = (s) => d24.filter((e) => e.status === s).length;
  const east = d24.filter((e) => e.regions.some((r) => ["jafurah", "dammam", "eastern"].includes(r))).length;
  return [
    `최근 24시간 동안 사우디 안전 관련 소식 ${d24.length}건을 모았어요.`,
    `그중 담맘·자푸라·동부주 관련은 ${east}건이에요.`,
    `확인 정도: 공식 확인 ${n("official")}건 · 여러 언론 ${n("multi")}건 · 한 곳만 보도 ${n("single")}건 · 공격 주체 주장 ${n("claim")}건`,
    "자세한 내용은 아래 카드를 눌러 원문으로 확인해요.",
  ];
}

/* ───────── 실행 ───────── */
async function main() {
  const prev = await readJson(OUT, { meta: {}, events: [], _cache: {} });
  const cache = prev._cache || {};
  const prevArticles = cache.articles || [];
  const firstSeen = Object.fromEntries(prevArticles.map((a) => [a.id, a.firstSeen]));
  const summaries = cache.summaries || {};
  const titlesKo = cache.titlesKo || {};

  const results = await Promise.all(FEEDS.map(async (f) => {
    try { const items = await fetchFeed(f); return { feed: f, ok: true, items }; }
    catch (e) { return { feed: f, ok: false, error: String(e.message || e).slice(0, 120), items: [] }; }
  }));

  const okCount = results.filter((r) => r.ok).length;
  const sourcesMeta = results.map((r) => ({ name: r.feed.name, ok: r.ok, count: r.items.length, ...(r.ok ? {} : { error: r.error }) }));
  const status = okCount === FEEDS.length ? "ok" : okCount === 0 ? "failed" : "partial";

  // 실패한 출처는 지난번에 받아 둔 기사(3일 이내)를 그대로 유지
  const failedFeeds = new Set(results.filter((r) => !r.ok).map((r) => r.feed.name));
  let raw = results.flatMap((r) => r.items);
  // 지난번에 받아 둔 기사도 3일 동안 계속 보관 (검색 기간을 짧게 잡아도 3일 치 유지, 실패한 출처 대비)
  for (const a of prevArticles) {
    if (a.reportedAt && NOW - a.reportedAt <= KEEP_HOURS * H) raw.push(a);
  }
  const seen = new Set();
  raw = raw.filter((a) => !seen.has(a.id) && seen.add(a.id));

  const arts = [];
  for (const a of raw) {
    const cls = classify(a);
    if (!cls) continue;
    arts.push({ ...a, cls, firstSeen: firstSeen[a.id] || NOW, summaryKo: summaries[a.id] || null });
  }
  arts.sort((a, b) => (b.reportedAt || 0) - (a.reportedAt || 0));
  const byId = new Map(arts.map((a) => [a.id, a]));

  // 모두 실패: 지난 결과를 지우지 않고 실패만 기록
  if (status === "failed") {
    const out = { ...prev, meta: { ...prev.meta, status, lastAttemptAt: iso(NOW), sources: sourcesMeta } };
    await fs.writeFile(OUT, JSON.stringify(out, null, 1));
    console.log("모든 출처 실패 — 이전 결과 유지");
    return;
  }

  let clusters = null, aiOk = false, aiError = null, summaryKo = null;

  // 영어 제목 번역 (요약·묶기와 따로, 실패해도 나머지는 그대로 진행)
  if (AI_KEY && arts.length) {
    try { await translateTitles(arts, titlesKo); }
    catch (e) { aiError = "제목 번역 실패: " + String(e.message || e).slice(0, 150); console.error(aiError); }
  }
  TITLES_KO = titlesKo;
  const newIds = arts.filter((a) => !prevArticles.some((p) => p.id === a.id)).length;
  // 비용 절약: 사건 묶기·상황 요약은 AI_EVERY_MIN분에 한 번만. 그 사이 새 기사는 규칙으로 붙인다.
  // 요약 지시문을 바꾸면 2시간을 기다리지 않고 다음 수집 때 바로 새로 정리
  const aiDue = NOW - (cache.lastAiAt || 0) >= AI_EVERY_MIN * 60000 || cache.promptVersion !== PROMPT_VERSION;
  const reuseAi = AI_KEY && cache.aiClusters && arts.length > 0 && (newIds === 0 || !aiDue);
  let lastAiAt = cache.lastAiAt || 0;

  if (AI_KEY && arts.length && !reuseAi) {
    try {
      const target = arts.slice(0, MAX_AI_ARTICLES);
      const r = await aiOrganize(target, summaries, titlesKo);
      const ids = new Set(target.map((a) => a.id));
      const irrelevant = new Set((r.irrelevant || []).filter((id) => ids.has(id)));
      for (const [id, s] of Object.entries(r.articleSummariesKo || {})) {
        if (ids.has(id) && typeof s === "string" && s.length < 400) { summaries[id] = s; byId.get(id).summaryKo = s; }
      }
      for (const [id, t] of Object.entries(r.articleTitlesKo || {})) {
        if (ids.has(id) && typeof t === "string" && t.length < 200) titlesKo[id] = t;
      }
      const used = new Set();
      clusters = (r.clusters || [])
        .map((c) => ({ ...c, articleIds: (c.articleIds || []).filter((id) => ids.has(id) && !irrelevant.has(id) && !used.has(id) && used.add(id)) }))
        .filter((c) => c.articleIds.length);
      // AI가 빠뜨린 기사는 각각 따로 사건으로
      for (const a of target) if (!used.has(a.id) && !irrelevant.has(a.id)) clusters.push({ articleIds: [a.id] });
      // 60건을 넘는 오래된 기사는 규칙으로 묶기
      clusters.push(...ruleClusters(arts.slice(MAX_AI_ARTICLES)).map((c) => ({ ...c, fromRule: true })));
      summaryKo = Array.isArray(r.summaryKo) ? r.summaryKo.filter((s) => typeof s === "string").map((s) => s.replace(/^\s*(\d+[.)]|[-•·*])\s*/, "").trim()).filter(Boolean).slice(0, 4) : null;
      aiOk = true;
      lastAiAt = NOW;
    } catch (e) {
      aiError = String(e.message || e).slice(0, 200);
      console.error("AI 정리 실패, 규칙으로 대신 처리:", aiError);
    }
  } else if (reuseAi) {
    const covered = new Set();
    clusters = cache.aiClusters
      .map((c) => ({ ...c, articleIds: c.articleIds.filter((id) => byId.has(id) && !covered.has(id) && covered.add(id)) }))
      .filter((c) => c.articleIds.length);
    const fresh = arts.filter((a) => !covered.has(a.id));
    clusters.push(...ruleClusters(fresh).map((c) => ({ ...c, fromRule: true })));
    summaryKo = cache.aiSummaryKo || null; aiOk = true;
  }

  const useAi = aiOk && clusters;
  if (!useAi) clusters = ruleClusters(arts);

  const events = clusters
    .map((c) => buildEvent(c, byId, useAi && !c.fromRule))
    .filter(Boolean)
    .sort((a, b) => Date.parse(b.sources.at(-1).reportedAt || b.collectedAt) - Date.parse(a.sources.at(-1).reportedAt || a.collectedAt));

  const finalSummary = useAi && summaryKo?.length ? summaryKo : countSummary(events);

  // 타임라인: 묶지 않고 로이터·사우디 국영통신(SPA) 기사만 보도 시각 순서대로
  const timeline = arts
    .filter((a) => TIMELINE_FEEDS.has(a.feed) && a.reportedAt)
    .sort((a, b) => b.reportedAt - a.reportedAt)
    .map((a) => ({
      id: a.id,
      outlet: a.outlet,
      official: !!a.official,
      claim: !a.official && a.cls.claim,
      type: a.cls.type,
      sev: SEV[a.cls.type] || "low",
      regions: a.cls.regions,
      inferred: a.cls.inferred,
      titleKo: titlesKo[a.id] || null,
      title: a.title,
      summary: summaries[a.id] || "",
      reportedAt: iso(a.reportedAt),
      url: a.url,
    }));

  // 오래된 요약 캐시 정리
  const keepIds = new Set(arts.map((a) => a.id));
  for (const id of Object.keys(summaries)) if (!keepIds.has(id)) delete summaries[id];
  for (const id of Object.keys(titlesKo)) if (!keepIds.has(id)) delete titlesKo[id];

  const out = {
    meta: {
      status,
      lastSuccessAt: iso(NOW),
      lastAttemptAt: iso(NOW),
      aiSummary: !!(useAi && summaryKo?.length),
      aiError,
      summaryKo: finalSummary,
      sources: sourcesMeta,
    },
    events,
    timeline,
    _cache: {
      articles: arts.map(({ cls, summaryKo, ...a }) => a),
      summaries,
      titlesKo,
      aiClusters: useAi ? clusters : null,
      aiSummaryKo: useAi ? summaryKo : null,
      lastAiAt,
      promptVersion: lastAiAt === NOW ? PROMPT_VERSION : cache.promptVersion || null,
    },
  };
  await fs.writeFile(OUT, JSON.stringify(out, null, 1));
  console.log(`완료: 상태 ${status}, 기사 ${arts.length}건 → 사건 ${events.length}건, AI ${useAi ? "사용" : "미사용"}`);
}

main().catch(async (e) => {
  // 예상 못 한 오류도 '실패'로 기록해서 사이트가 정상인 척하지 않게 한다
  console.error(e);
  const prev = await readJson(OUT, { meta: {}, events: [] });
  prev.meta = { ...prev.meta, status: "failed", lastAttemptAt: iso(NOW) };
  await fs.writeFile(OUT, JSON.stringify(prev, null, 1));
  process.exitCode = 1;
});
