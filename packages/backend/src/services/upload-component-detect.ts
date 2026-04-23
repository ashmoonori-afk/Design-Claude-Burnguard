/**
 * Component-sample detector for uploaded PDF / PPTX design systems.
 *
 * Slice 4 of the P4.2 follow-up pulled this logic out of the Python
 * extractor so the CTA / form / badge heuristics can carry a second
 * locale (Korean) without forcing a Python regex rewrite. The Python
 * side now returns raw text lines (headings / bodies / misc) and this
 * function classifies them into BurnGuard's canonical component
 * buckets.
 */

export interface ComponentSamples {
  buttons: string[];
  cards: string[];
  forms: string[];
  tables: string[];
  badges: string[];
  headings: string[];
  body: string[];
}

// CTA / form / badge regexes are keyed by locale so the list stays
// scannable — adding a new locale is just a new entry in each map.
const CTA_PATTERNS: Record<string, RegExp> = {
  en: /^(get|start|learn|try|view|read|download|contact|continue|book|open|next|sign\s*up|log\s*in)\b/i,
  ko: /^(시작|자세히|더\s*보기|보기|다운로드|문의|계속|다음|열기|신청|가입|로그인|바로가기)/,
};

const FORM_PATTERNS: Record<string, RegExp> = {
  en: /\b(email|name|phone|password|search|company|title|message|address)\b/i,
  ko: /(이메일|이름|전화|비밀번호|검색|회사|제목|메시지|주소|성명|연락처|검색어)/,
};

const BADGE_PATTERNS: Record<string, RegExp> = {
  en: /\b(draft|beta|live|new|published|approved|pending)\b/i,
  ko: /(초안|베타|라이브|신규|발행|승인|대기|진행\s*중|완료)/,
};

function matchesAny(line: string, patterns: Record<string, RegExp>): boolean {
  for (const pattern of Object.values(patterns)) {
    if (pattern.test(line)) return true;
  }
  return false;
}

const TABLE_HINT_RE = /(\bq[1-4]\b|[|\t])/i;

function dedupe(values: string[], limit: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const normalized = raw.replace(/\s+/g, " ").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Port of the original `build_component_samples` with locale-aware
 * matching. Pure function — no I/O, no state — so unit tests can
 * assert against a known `headings / bodies / miscLines` triple.
 */
export function detectComponentSamples(
  headings: string[],
  bodies: string[],
  miscLines: string[],
): ComponentSamples {
  const buttons: string[] = [];
  const cards: string[] = [];
  const forms: string[] = [];
  const tables: string[] = [];
  const badges: string[] = [];

  for (const rawLine of miscLines) {
    const line = typeof rawLine === "string" ? rawLine.trim() : "";
    if (!line) continue;

    if (matchesAny(line, CTA_PATTERNS)) buttons.push(line);
    if (matchesAny(line, FORM_PATTERNS)) forms.push(line);
    if (matchesAny(line, BADGE_PATTERNS)) badges.push(line);
    if (TABLE_HINT_RE.test(line)) tables.push(line);
    // Card heuristic: a mid-length line that isn't obviously a title or
    // micro-label. Same 8–72 char window the Python version used.
    if (line.length >= 8 && line.length <= 72) cards.push(line);
  }

  return {
    buttons: dedupe(buttons, 6),
    cards: dedupe(cards, 6),
    forms: dedupe(forms, 6),
    tables: dedupe(tables, 6),
    badges: dedupe(badges, 6),
    headings: dedupe(headings, 6),
    body: dedupe(bodies, 6),
  };
}
