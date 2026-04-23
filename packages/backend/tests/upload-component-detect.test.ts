import { describe, expect, test } from "bun:test";
import { detectComponentSamples } from "../src/services/upload-component-detect";

describe("detectComponentSamples — English", () => {
  test("detects CTA buttons from misc lines", () => {
    const result = detectComponentSamples(
      ["Product intro"],
      ["Lead paragraph."],
      ["Get started", "Learn more", "Random filler"],
    );
    expect(result.buttons).toEqual(["Get started", "Learn more"]);
  });

  test("detects form labels", () => {
    const result = detectComponentSamples(
      [],
      [],
      ["Email address", "Your name", "Password"],
    );
    expect(result.forms).toEqual(["Email address", "Your name", "Password"]);
  });

  test("detects status badges", () => {
    const result = detectComponentSamples(
      [],
      [],
      ["Status: Published", "Draft version 2", "Beta program"],
    );
    expect(result.badges.length).toBe(3);
  });
});

describe("detectComponentSamples — Korean", () => {
  test("matches Korean CTA verbs", () => {
    const result = detectComponentSamples(
      [],
      [],
      ["시작하기", "자세히 보기", "문의하기", "가입"],
    );
    // "시작하기" / "자세히 보기" / "문의하기" / "가입" all match the ko CTA regex.
    expect(result.buttons.length).toBeGreaterThanOrEqual(3);
    expect(result.buttons).toContain("시작하기");
  });

  test("matches Korean form labels", () => {
    const result = detectComponentSamples(
      [],
      [],
      ["이메일", "이름", "비밀번호", "회사명"],
    );
    expect(result.forms).toEqual(["이메일", "이름", "비밀번호", "회사명"]);
  });

  test("matches Korean status words", () => {
    const result = detectComponentSamples(
      [],
      [],
      ["상태: 초안", "베타 공개", "발행 완료"],
    );
    expect(result.badges.length).toBe(3);
  });
});

describe("detectComponentSamples — shape guarantees", () => {
  test("dedupes + caps each bucket at 6", () => {
    const many = Array.from({ length: 20 }, (_, i) => `Get item ${i}`);
    const result = detectComponentSamples([], [], many);
    expect(result.buttons.length).toBe(6);
    // All 6 should be unique entries.
    expect(new Set(result.buttons).size).toBe(6);
  });

  test("empty input returns empty buckets", () => {
    const result = detectComponentSamples([], [], []);
    expect(result).toEqual({
      buttons: [],
      cards: [],
      forms: [],
      tables: [],
      badges: [],
      headings: [],
      body: [],
    });
  });

  test("table hint picks up tab-delimited + quarter tags", () => {
    const result = detectComponentSamples(
      [],
      [],
      ["Q1 revenue 10,000", "Column A | Column B"],
    );
    expect(result.tables.length).toBe(2);
  });
});
