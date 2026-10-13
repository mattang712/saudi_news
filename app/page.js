"use client";
import React, { useState, useMemo, useEffect, useCallback } from "react";

/* ───────── 고정 정보 ───────── */
const H = 3600 * 1000;
const STALE_MIN = 40; // 마지막 수집 성공 후 이 시간(분)이 지나면 경고 (수집은 10분마다)
const LIVE_URL = process.env.NEXT_PUBLIC_DATA_URL || "";

// 1순위: GitHub에서 최신 데이터 바로 받기 / 실패하면 사이트에 들어 있는 데이터
async function fetchNews() {
  const tries = [LIVE_URL, "/data/news.json"].filter(Boolean);
  let lastErr;
  for (const u of tries) {
    try {
      const res = await fetch(u + "?t=" + Date.now(), { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      return await res.json();
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

const REGIONS = [
  { id: "all", name: "사우디 전체" },
  { id: "jafurah", name: "자푸라" },
  { id: "dammam", name: "담맘" },
  { id: "eastern", name: "동부주" },
  { id: "riyadh", name: "리야드" },
  { id: "jeddah", name: "제다" },
  { id: "airport", name: "주요 공항" },
];
const REGION_NAME = Object.fromEntries(REGIONS.map((r) => [r.id, r.name]));
const PRIORITY_REGIONS = ["jafurah", "dammam"];

const VSTATUS = {
  official: { label: "공식 기관 확인", cls: "vs-official", desc: "정부나 대사관, 사우디 국영통신이 직접 발표한 소식이에요." },
  multi: { label: "복수 언론 확인", cls: "vs-multi", desc: "믿을 만한 언론사 두 곳 이상이 따로따로 보도했어요." },
  single: { label: "단일 언론 보도", cls: "vs-single", desc: "아직 한 곳에서만 보도했어요. 조금 더 지켜봐야 해요." },
  claim: { label: "공격 주체 주장", cls: "vs-claim", desc: "공격했다는 쪽의 주장만 있어요. 진짜 일어났는지는 아직 확인 안 됐어요." },
  unver: { label: "미확인 정보", cls: "vs-unver", desc: "어디서 나온 얘기인지 분명하지 않아요. 사실로 믿진 마세요." },
};

const TYPES = {
  missile: "미사일 공격·요격", drone: "드론 공격·요격", fire: "폭발·화재", energy: "에너지 시설",
  airport: "공항·항공편", evacuation: "공식 대피 지시", advisory: "여행경보 변경", korean: "한국인 안전 공지",
  security: "치안·안보",
};

const CATS = [
  { id: "kr", name: "한국 뉴스", who: "연합뉴스 · KBS · MBC · SBS 등 주요 언론" },
  { id: "wire", name: "해외 통신사", who: "Reuters · AP · AFP" },
  { id: "local", name: "사우디·중동", who: "SPA · Arab News · Saudi Gazette" },
  { id: "official", name: "공식 공지", who: "외교부 · 주사우디 대사관" },
];

/* ───────── 시간 ───────── */
const pad = (n) => String(n).padStart(2, "0");
function fmt(ts, offsetH) {
  const d = new Date(ts + offsetH * H);
  return `${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
const toTs = (v) => (v == null ? null : typeof v === "number" ? v : Date.parse(v) || null);
function TwoZone({ ts, unknown = "언제 일어났는지 아직 몰라요" }) {
  if (ts == null) return <span className="unk">{unknown}</span>;
  return <span className="mono">사우디 {fmt(ts, 3)} · 한국 {fmt(ts, 9)}</span>;
}
function ago(ts) {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}시간 전` : `${Math.floor(h / 24)}일 전`;
}
// 외교부 공지는 작성 '날짜'만 있고 시각이 없어서, 시각을 지어내지 않고 날짜만 보여준다
const dayKST = (ts) => new Date(ts + 9 * H).toISOString().slice(0, 10).replace(/-/g, ".");
const firstReport = (e) => (e.sources.length ? Math.min(...e.sources.map((s) => s.reportedAt)) : null);
const sortKey = (e) => e.occurredAt ?? firstReport(e) ?? e.collectedAt;

/* 수집기 JSON을 화면용으로 정리 */
function normalize(json) {
  const events = (json.events || []).map((e) => ({
    ...e,
    occurredAt: toTs(e.occurredAt),
    collectedAt: toTs(e.collectedAt),
    regions: e.regions?.length ? e.regions : ["all"],
    sources: (e.sources || []).map((s) => ({ ...s, reportedAt: toTs(s.reportedAt) })),
  }));
  const timeline = (json.timeline || [])
    .map((t) => ({ ...t, reportedAt: toTs(t.reportedAt), regions: t.regions?.length ? t.regions : ["all"] }))
    .filter((t) => t.reportedAt)
    .sort((a, b) => b.reportedAt - a.reportedAt);
  const m = json.meta || {};
  return {
    events,
    timeline,
    meta: {
      ...m,
      lastSuccessAt: toTs(m.lastSuccessAt),
      lastAttemptAt: toTs(m.lastAttemptAt),
      status: m.status || "never",
      sources: m.sources || [],
      summaryKo: m.summaryKo || [],
    },
  };
}

/* ───────── 작은 부품 ───────── */
const AutoTag = () => <span className="auto-tag">(자동번역)</span>;
function TitleKo({ ko, en, auto }) {
  if (!ko) return <h3>{en}</h3>;
  return (
    <>
      <h3>{ko} {auto && <AutoTag />}</h3>
      {auto && en && <p className="orig-title">{en}</p>}
    </>
  );
}
const VBadge = ({ s }) => <span className={"vs " + (VSTATUS[s] || VSTATUS.unver).cls}>{(VSTATUS[s] || VSTATUS.unver).label}</span>;

function EventCard({ e, onOpen }) {
  const outlets = [...new Set(e.sources.map((s) => s.outlet))];
  return (
    <button className={"ev sev-" + (e.sev || "low")} onClick={() => onOpen(e)}>
      <div className="ev-meta">
        <VBadge s={e.status} />
        <span className="tag">{TYPES[e.type] || "기타"}</span>
        {e.directive === "advice" && <span className="tag">조심하라는 권고 (대피 지시는 아님)</span>}
        {e.directive === "evacuation" && <span className="tag evac">공식 대피 지시</span>}
      </div>
      <h3>{e.title} {e.titleAuto && <AutoTag />}</h3>
      <div className="ev-meta">
        {e.regions.filter((r) => r !== "all").map((r) => <span key={r} className="tag">{REGION_NAME[r] || r}</span>)}
        {e.inferred && <span className="tag inferred">관련 지역 추정</span>}
      </div>
      <div className="ev-time">발생: <TwoZone ts={e.occurredAt} /></div>
      <div className="ev-src">
        {outlets.length ? `출처 ${outlets.length}곳 · ${outlets.join(", ")}` : "아직 확인된 출처가 없어요"}
      </div>
    </button>
  );
}

function Empty({ text = "지금은 새로 들어온 소식이 없어요" }) {
  return <div className="empty"><b>{text}</b></div>;
}

function DetailSheet({ e, onClose }) {
  useEffect(() => {
    const k = (ev) => ev.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = ""; };
  }, [onClose]);
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="사건 상세" onClick={(ev) => ev.stopPropagation()}>
        <div className="sheet-head">
          <h2>{e.title}</h2>
          <button className="iconbtn" onClick={onClose}>닫기</button>
        </div>
        <div className="stack">
          <div className="notice">
            <strong><VBadge s={e.status} /></strong>
            {(VSTATUS[e.status] || VSTATUS.unver).desc}
          </div>
          {e.inferred && (
            <div className="notice"><strong>관련 지역 추정</strong>{e.inferNote || "기사에 지역 이름이 직접 나오지 않아 관련 있을 수도 있다고 짐작했어요."}</div>
          )}
          <div className="card">
            <div className="label">시간 정보</div>
            <dl className="times">
              <dt>사건 발생</dt><dd><TwoZone ts={e.occurredAt} /></dd>
              <dt>첫 보도</dt><dd>{e.sources.length > 0 && e.sources.every((x) => x.dateOnly) ? <span className="mono">작성일 {dayKST(firstReport(e))}</span> : <TwoZone ts={firstReport(e)} unknown="보도 시각 정보 없음" />}</dd>
              <dt>가져온 시각</dt><dd><TwoZone ts={e.collectedAt} unknown="정보 없음" /></dd>
            </dl>
          </div>
          <div className="card">
            <div className="sec-title">출처 확인 <span className="count">{e.sources.length}건</span></div>
            {e.sources.length === 0 && <p className="muted" style={{ margin: "8px 0 0" }}>확인할 수 있는 출처가 없어서 내용은 정리하지 않았어요.</p>}
            {e.sources.map((s, i) => (
              <div className="art" key={i}>
                <div className="by"><b style={{ color: "var(--fg)" }}>{s.outlet}</b>{s.reportedAt && <span className="mono">{s.dateOnly ? `작성일 ${dayKST(s.reportedAt)}` : `${fmt(s.reportedAt, 9)} 한국`}</span>}</div>
                <TitleKo ko={s.titleKo} en={s.title} auto={!!s.titleKo} />
                {s.summary && <p>{s.summary}</p>}
                <a className="linkbtn" href={s.url} target="_blank" rel="noopener noreferrer">원문 보기 ↗</a>
              </div>
            ))}
          </div>
          {e.aiNote && <p className="muted small" style={{ margin: 0 }}>{e.aiNote}</p>}
        </div>
      </div>
    </div>
  );
}

function RegionChips({ region, setRegion }) {
  return (
    <div>
      <div className="label" style={{ marginBottom: 6 }}>어느 지역 볼까요?</div>
      <div className="chips" role="group" aria-label="지역 필터">
        {REGIONS.map((r) => (
          <button key={r.id} className="chip" aria-pressed={region === r.id} onClick={() => setRegion(r.id)}>{r.name}</button>
        ))}
      </div>
    </div>
  );
}

function Section({ title, list, onOpen }) {
  return (
    <section className="stack" style={{ marginTop: 6 }}>
      <h2 className="sec-title">{title} <span className="count">{list.length}건</span></h2>
      {list.length ? list.map((e) => <EventCard key={e.id} e={e} onOpen={onOpen} />) : <div className="card"><Empty /></div>}
    </section>
  );
}

const STATUS_PILL = {
  ok: ["ok", "잘 가져오는 중"],
  partial: ["warn", "일부 출처 실패"],
  failed: ["fail", "가져오기 실패"],
  never: ["fail", "아직 한 번도 못 가져옴"],
};

function StatusCard({ meta, loadError }) {
  const stale = meta.lastSuccessAt && Date.now() - meta.lastSuccessAt > STALE_MIN * 60000;
  const [cls, label] = loadError ? ["fail", "불러오기 실패"] : STATUS_PILL[meta.status] || STATUS_PILL.never;
  const failed = meta.sources.filter((s) => !s.ok);
  return (
    <div className="card">
      <div className="row">
        <h2 className="sec-title">뉴스 가져오기</h2>
        <span className={"pill " + cls}><span className="dot"></span>{label}</span>
      </div>
      <div className="status-grid">
        <div><div className="label">마지막으로 가져온 때</div><div className="v mono">{meta.lastSuccessAt ? ago(meta.lastSuccessAt) : "아직 없어요"}</div></div>
        <div><div className="label">마지막 시도</div><div className="v mono">{meta.lastAttemptAt ? ago(meta.lastAttemptAt) : "—"}</div></div>
      </div>
      {meta.lastSuccessAt && (
        <p className="muted small" style={{ margin: "8px 0 0" }}>가져온 시각: <TwoZone ts={meta.lastSuccessAt} /></p>
      )}
      {loadError && <p className="small" style={{ margin: "8px 0 0", color: "var(--crit)" }}>소식 파일을 못 불러왔어요. 인터넷 연결을 확인하고 새로고침 해 주세요. 지금 보이는 건 이전에 받아 둔 내용일 수 있어요.</p>}
      {stale && <p className="small" style={{ margin: "8px 0 0", color: "var(--warn)", fontWeight: 700 }}>마지막으로 가져온 지 {ago(meta.lastSuccessAt).replace(" 전", "")} 지났어요. 자동 수집이 멈췄을 수 있어서 최신 소식이 빠졌을 수 있어요.</p>}
      {failed.length > 0 && <p className="small" style={{ margin: "8px 0 0", color: "var(--warn)" }}>못 가져온 곳: {failed.map((s) => s.name).join(", ")}</p>}
    </div>
  );
}

/* ───────── 화면들 ───────── */
function HomeView({ data, loadError, goTimeline }) {
  const { meta } = data;
  const lines = meta.summaryKo;
  return (
    <div className="stack">
      <div className="card summary">
        <div className="row">
          <h2 className="sec-title">지금 사우디 상황</h2>
          {meta.aiSummary ? <span className="pill demo">AI 정리</span> : <span className="pill demo">자동 집계</span>}
        </div>
        {lines.length ? (
          <ul className="brief-lines">
            {lines.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        ) : <Empty />}
        {meta.aiSummary && (
          <p className="muted small" style={{ margin: "10px 0 0" }}>
            {meta.summaryAt && <b style={{ color: "var(--fg)" }}>{ago(Date.parse(meta.summaryAt))} 갱신 · </b>}
            AI가 기사 제목만 보고 정리했어요. 새 소식이 있으면 2시간마다 다시 정리해요.
          </p>
        )}
      </div>
      <button className="iconbtn big" onClick={goTimeline}>타임라인 보기 →</button>
      <StatusCard meta={meta} loadError={loadError} />
    </div>
  );
}

const TL_STATUS = (t) => (t.official ? "official" : t.claim ? "claim" : null);

function TimelineItem({ t }) {
  const st = TL_STATUS(t);
  return (
    <a className={"ev sev-" + (t.sev || "low")} href={t.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", color: "inherit" }}>
      <div className="ev-meta">
        <span className="tag" style={{ color: "var(--fg)" }}>{t.outlet}</span>
        {st && <VBadge s={st} />}
        <span className="tag">{TYPES[t.type] || "기타"}</span>
      </div>
      <TitleKo ko={t.titleKo} en={t.title} auto={!!t.titleKo} />
      {t.summary && <p style={{ margin: 0, fontSize: ".94rem" }}>{t.summary}</p>}
      {t.regions.some((r) => r !== "all") && (
        <div className="ev-meta">
          {t.regions.filter((r) => r !== "all").map((r) => <span key={r} className="tag">{REGION_NAME[r] || r}</span>)}
          {t.inferred && <span className="tag inferred">관련 지역 추정</span>}
        </div>
      )}
      <dl className="times">
        {t.dateOnly ? (
          <><dt>작성일</dt><dd className="mono">{dayKST(t.reportedAt)} (시각 미표기)</dd></>
        ) : (
          <>
            <dt>보도 · 사우디</dt><dd className="mono">{fmt(t.reportedAt, 3)}</dd>
            <dt>보도 · 한국</dt><dd className="mono">{fmt(t.reportedAt, 9)}</dd>
          </>
        )}
      </dl>
      <span className="linkbtn" style={{ minHeight: 0 }}>원문 보기 ↗</span>
    </a>
  );
}

function TimelineView({ timeline, region, setRegion }) {
  const [range, setRange] = useState("24");
  const now = Date.now();
  const list = timeline
    .filter((t) => region === "all" || t.regions.includes(region))
    .filter((t) => range === "all" || now - t.reportedAt <= 24 * H);
  let lastDay = null;
  return (
    <div className="stack">
      <RegionChips region={region} setRegion={setRegion} />
      <div className="seg" role="group" aria-label="기간">
        <button aria-pressed={range === "24"} onClick={() => setRange("24")}>최근 24시간</button>
        <button aria-pressed={range === "all"} onClick={() => setRange("all")}>전체 (최근 3일)</button>
      </div>
      <p className="muted small" style={{ margin: 0 }}>로이터와 사우디 국영통신(SPA) 보도만, 보도된 순서대로 보여줘요. 최신이 위예요.</p>
      {list.length === 0 ? <div className="card"><Empty /></div> : (
        <div className="tl">
          {list.map((t) => {
            const d = fmt(t.reportedAt, t.dateOnly ? 9 : 3).slice(0, 5);
            const show = d !== lastDay; lastDay = d;
            return (
              <React.Fragment key={t.id}>
                {show && <div className="tl-day">사우디 날짜 {d}</div>}
                <div className={"tl-item sev-" + (t.sev || "low")}>
                  <div className="ev-time mono" style={{ marginBottom: 4 }}>{t.dateOnly ? "외교부 공지 · 날짜만 표기" : ago(t.reportedAt)}</div>
                  <TimelineItem t={t} />
                </div>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NewsView({ events }) {
  const [cat, setCat] = useState("kr");
  const arts = events.flatMap((e) => e.sources.map((s) => ({ ...s, ev: e })))
    .filter((a) => a.cat === cat)
    .sort((a, b) => (b.reportedAt || 0) - (a.reportedAt || 0));
  const c = CATS.find((x) => x.id === cat);
  return (
    <div className="stack">
      <div className="chips" role="group" aria-label="뉴스 출처 분류">
        {CATS.map((x) => <button key={x.id} className="chip" aria-pressed={cat === x.id} onClick={() => setCat(x.id)}>{x.name}</button>)}
      </div>
      <div className="card">
        <h2 className="sec-title">{c.name} <span className="count">{arts.length}건</span></h2>
        <p className="muted small" style={{ margin: "4px 0 6px" }}>여기서 모아 봐요: {c.who}</p>
        {cat === "official" && arts.length === 0 && (
          <p className="small" style={{ margin: "0 0 6px" }}>최근 3일 안에 나온 외교부 공지가 없어요. 이전 공지는 <b>공식·연락처</b> 탭에서 볼 수 있어요.</p>
        )}
        {arts.length === 0 ? <Empty /> : arts.map((a, i) => (
          <div className="art" key={i}>
            <div className="by"><b style={{ color: "var(--fg)" }}>{a.outlet}</b><VBadge s={a.ev.status} /></div>
            <TitleKo ko={a.titleKo} en={a.title} auto={!!a.titleKo} />
            {a.summary && <p>{a.summary}</p>}
            {a.reportedAt && <div className="by mono">{a.dateOnly ? `작성일 ${dayKST(a.reportedAt)}` : `보도 사우디 ${fmt(a.reportedAt, 3)} · 한국 ${fmt(a.reportedAt, 9)}`}</div>}
            <a className="linkbtn" href={a.url} target="_blank" rel="noopener noreferrer">원문 보기 ↗</a>
          </div>
        ))}
      </div>
    </div>
  );
}

function InfoView({ theme, setTheme, meta }) {
  const [copied, setCopied] = useState(false);
  const num = "+82-2-3210-0404";
  const copy = async () => {
    try { await navigator.clipboard.writeText(num); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { const el = document.getElementById("callnum"); const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
  };
  const links = [
    ["외교부 해외안전여행", "여행경보 · 안전 공지 (0404.go.kr)", "https://www.0404.go.kr"],
    ["주사우디아라비아 대한민국 대사관", "재외국민 안전 공지", "https://overseas.mofa.go.kr/sa-ko/index.do"],
    ["Saudi Press Agency (SPA)", "사우디 국영통신 · 정부 공식 발표", "https://www.spa.gov.sa"],
  ];
  return (
    <div className="stack">
      <div className="card">
        <h2 className="sec-title">공식 사이트 바로 가기</h2>
        <div style={{ marginTop: 6 }}>
          {links.map(([t, d, u]) => (
            <a key={u} className="offlink" href={u} target="_blank" rel="noopener noreferrer">
              <span><b>{t}</b><small>{d}</small></span><span aria-hidden="true">↗</span>
            </a>
          ))}
        </div>
      </div>
      <div className="card">
        <h2 className="sec-title">외교부 최근 공지 (사우디)</h2>
        {(meta.mofaLatest || []).length === 0 ? (
          <p className="muted small" style={{ margin: "8px 0 0" }}>아직 가져온 공지가 없어요.</p>
        ) : (
          <ul className="srclist">
            {meta.mofaLatest.map((m, i) => (
              <li key={i} style={{ alignItems: "flex-start" }}>
                <span><small className="muted" style={{ display: "block", fontSize: ".78rem" }}>{m.outlet} · 작성일 {m.date}</small>{m.title}</span>
              </li>
            ))}
          </ul>
        )}
        <a className="linkbtn" href="https://www.0404.go.kr" target="_blank" rel="noopener noreferrer">해외안전여행 사이트에서 전문 보기 ↗</a>
      </div>
      <div className="card">
        <h2 className="sec-title">외교부 영사콜센터 (24시간)</h2>
        <div className="phone">
          <a id="callnum" className="num mono" href="tel:+82232100404">{num}</a>
          <button className="iconbtn" onClick={copy}>{copied ? "복사됨" : "번호 복사"}</button>
        </div>
      </div>
      <div className="card">
        <h2 className="sec-title">어디서 가져오나요?</h2>
        {meta.sources.length === 0 ? <p className="muted small" style={{ margin: "8px 0 0" }}>아직 수집 기록이 없어요.</p> : (
          <ul className="srclist">
            {meta.sources.map((s) => (
              <li key={s.name}>
                <span>{s.name}{(s.error || s.note) && <small className="muted" style={{ display: "block", fontSize: ".78rem" }}>{s.error || s.note}</small>}</span>
                {s.ok ? <span className="pill ok">{s.count}건</span> : <span className="pill fail">실패</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="card">
        <h2 className="sec-title">이 표시는 무슨 뜻이에요?</h2>
        <div className="legend">
          {Object.entries(VSTATUS).map(([k, v]) => <div key={k}><span className={"vs " + v.cls}>{v.label}</span><span>{v.desc}</span></div>)}
        </div>
      </div>
      <div className="card">
        <h2 className="sec-title">화면 모드</h2>
        <div className="seg" role="group" aria-label="화면 모드" style={{ marginTop: 10 }}>
          {[["system", "기기 설정"], ["light", "밝게"], ["dark", "어둡게"]].map(([k, l]) => (
            <button key={k} aria-pressed={theme === k} onClick={() => setTheme(k)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="card">
        <h2 className="sec-title">홈 화면에 추가하기</h2>
        <ul className="todo">
          <li><b>아이폰</b>: Safari 아래쪽 공유 버튼 → "홈 화면에 추가"</li>
          <li><b>갤럭시</b>: 삼성 인터넷이나 크롬 메뉴(≡ 또는 ⋮) → "홈 화면에 추가"</li>
        </ul>
      </div>
      <div className="card">
        <div className="row"><h2 className="sec-title">아직 준비 중인 기능</h2><span className="pill demo">곧 추가</span></div>
        <ul className="todo">
          <li>중요한 소식 생기면 휴대폰 알림</li>
        </ul>
      </div>
    </div>
  );
}

/* ───────── 앱 ───────── */
const ICONS = {
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  tl: <><circle cx="6" cy="6" r="2" /><circle cx="6" cy="18" r="2" /><path d="M6 8v8M11 6h10M11 18h10M11 12h7" /></>,
  news: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 8h10M7 12h10M7 16h6" /></>,
  info: <><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M12 10v5M12 7.5v.5" /></>,
};
const Icon = ({ n }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{ICONS[n]}</svg>;

/* ───────── 홈 화면 앱 설치 안내 ───────── */
function InstallBanner() {
  const [mode, setMode] = useState(null); // "prompt" | "ios" | "inapp" | null
  useEffect(() => {
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone;
    if (standalone) return; // 이미 앱으로 설치해서 여는 중
    try { if (Date.now() - Number(localStorage.getItem("installHideAt") || 0) < 3 * 86400000) return; } catch {}
    if (window.__inApp) { setMode("inapp"); return; }
    if (window.__bip) setMode("prompt");
    else if (window.__ios) setMode("ios");
    const onReady = () => setMode("prompt");
    window.addEventListener("bip-ready", onReady);
    const onInstalled = () => setMode(null);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("bip-ready", onReady); window.removeEventListener("appinstalled", onInstalled); };
  }, []);
  if (!mode) return null;
  const hide = () => { setMode(null); try { localStorage.setItem("installHideAt", String(Date.now())); } catch {} };
  const install = async () => {
    const e = window.__bip; if (!e) return;
    e.prompt();
    try { const r = await e.userChoice; if (r.outcome === "accepted") setMode(null); } catch {}
    window.__bip = null;
  };
  return (
    <div className="install">
      <div className="install-txt">
        {mode === "prompt" && <><b>홈 화면에 앱으로 설치</b>아이콘 한 번 눌러서 바로 열 수 있어요.</>}
        {mode === "ios" && <><b>홈 화면에 추가하기</b>아래 공유 버튼(□↑) → <b style={{ display: "inline" }}>홈 화면에 추가</b>를 눌러 주세요.</>}
        {mode === "inapp" && <><b>크롬이나 사파리로 열어 주세요</b>오른쪽 위 메뉴(⋮ 또는 ···)에서 "다른 브라우저로 열기"를 누르면 앱으로 설치할 수 있어요.</>}
      </div>
      <div className="install-btns">
        {mode === "prompt" && <button className="iconbtn primary" onClick={install}>앱 설치</button>}
        <button className="iconbtn" onClick={hide} aria-label="닫기">닫기</button>
      </div>
    </div>
  );
}

const EMPTY = normalize({});

export default function App() {
  const [tab, setTab] = useState("home");
  const [region, setRegion] = useState("all");
  const [open, setOpen] = useState(null);
  const [theme, setThemeS] = useState("system");
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    try { const t = localStorage.getItem("theme"); if (t) setThemeS(t); } catch {}
  }, []);
  const setTheme = (t) => {
    setThemeS(t);
    const r = document.documentElement;
    if (t === "system") r.removeAttribute("data-theme"); else r.setAttribute("data-theme", t);
    try { localStorage.setItem("theme", t); } catch {}
  };

  const load = useCallback(async (manual) => {
    setLoading(true);
    try {
      const next = normalize(await fetchNews());
      setData(next);
      setLoadError(false);
      if (manual) {
        const s = next.meta.status;
        setToast(s === "ok" ? `최신 내용으로 바꿨어요 (${next.meta.lastSuccessAt ? ago(next.meta.lastSuccessAt) + " 수집" : ""})`
          : s === "partial" ? "불러왔어요. 다만 일부 출처는 지난번에 못 가져왔어요."
          : "불러왔지만, 최근 뉴스 수집이 실패한 상태예요.");
      }
    } catch {
      setLoadError(true);
      if (manual) setToast("새 소식을 못 불러왔어요. 인터넷 연결을 확인해 주세요.");
    } finally {
      setLoading(false);
      if (manual) setTimeout(() => setToast(null), 4000);
    }
  }, []);

  useEffect(() => {
    load(false);
    // 화면을 켜 둔 채로 있으면 5분마다, 다시 앱으로 돌아오면 바로 새로 불러오기
    const iv = setInterval(() => load(false), 5 * 60000);
    const vis = () => document.visibilityState === "visible" && load(false);
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(iv); document.removeEventListener("visibilitychange", vis); };
  }, [load]);

  const events = useMemo(() => {
    const all = data.events;
    const f = region === "all" ? all : all.filter((e) => e.regions.includes(region));
    return [...f].sort((a, b) => {
      const pa = a.regions.some((r) => PRIORITY_REGIONS.includes(r)) ? 1 : 0;
      const pb = b.regions.some((r) => PRIORITY_REGIONS.includes(r)) ? 1 : 0;
      if (tab === "home" && pa !== pb) return pb - pa;
      return sortKey(b) - sortKey(a);
    });
  }, [data, region, tab]);

  const closeSheet = useCallback(() => setOpen(null), []);

  return (
    <>
      <header className="topbar">
        <div className="topbar-in">
          <div className="brand">
            <h1>사우디 현황 모아보기</h1>
            <small>자푸라 · 담맘 · 동부주 중심</small>
          </div>
          <button className="iconbtn primary" onClick={() => load(true)} disabled={loading} aria-label="새로고침">
            <svg className={loading ? "spin" : ""} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" /></svg>
            새로고침
          </button>
        </div>
      </header>

      <main className="wrap">
        <InstallBanner />
        {loading && data === EMPTY ? (
          <div className="stack"><div className="card"><Empty text="소식 불러오는 중이에요…" /></div></div>
        ) : (
          <>
            {tab === "home" && <HomeView data={data} loadError={loadError} goTimeline={() => { setTab("tl"); window.scrollTo(0, 0); }} />}
            {tab === "tl" && <TimelineView timeline={data.timeline} region={region} setRegion={setRegion} />}
            {tab === "news" && <NewsView events={events} />}
            {tab === "info" && <InfoView theme={theme} setTheme={setTheme} meta={data.meta} />}
          </>
        )}
      </main>

      {toast && <div className="toast" role="status">{toast}</div>}
      {open && <DetailSheet e={open} onClose={closeSheet} />}

      <nav className="nav" aria-label="주 메뉴">
        <div className="nav-in">
          {[["home", "요약"], ["tl", "타임라인"], ["news", "출처별 뉴스"], ["info", "공식·연락처"]].map(([k, l]) => (
            <button key={k} aria-current={tab === k ? "page" : undefined} onClick={() => { setTab(k); window.scrollTo(0, 0); }}>
              <Icon n={k} />{l}
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}
