import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse } from "node-html-parser";
import { SvgDesignDirectionRenderer } from "../src/services/design-direction-renderer";

const root = await mkdtemp(path.join(tmpdir(), "burnguard-direction-renderer-"));
const segmenter = new Intl.Segmenter("ko", { granularity: "grapheme" });
const layouts = ["editorial", "modular", "narrative"] as const;
const dynamicValues = {
  title: '제목동적 & <안전> "검토" 👨‍👩‍👧‍👦 한글표현을아주길게반복하여오른쪽경계를검증합니다',
  summary: '요약동적 & <안전> "검토" 🧑🏽‍💻 운영책임자에게복잡한현황과핵심의사결정을분명하게전달합니다',
  point0: '첫째동적 & <안전> "검토" 🎯 사용자의핵심문제를충분히길게설명합니다',
  point1: '둘째동적 & <안전> "검토" 🧩 해결방식과근거를충분히길게설명합니다',
  point2: '셋째동적 & <안전> "검토" 🚀 다음행동과성과를충분히길게설명합니다',
} as const;

function graphemeCount(value: string): number {
  return Array.from(segmenter.segment(value)).length;
}

afterAll(async () => { await rm(root, { recursive: true, force: true }); });

describe("SVG design direction renderer", () => {
  test("bounds every dynamic run and separates narrative callouts for long Korean content", async () => {
    const violations: string[] = [];
    for (const layout of layouts) {
      const outputPath = path.join(root, `${layout}.svg`);
      await new SvgDesignDirectionRenderer().render({
        layout,
        title: dynamicValues.title,
        summary: dynamicValues.summary,
        outline: [dynamicValues.point0, dynamicValues.point1, dynamicValues.point2],
        outputPath,
        signal: new AbortController().signal,
      });
      const svg = await readFile(outputPath, "utf8");
      const document = parse(svg);
      const dynamicRuns = document.querySelectorAll("text").filter((node) => Object.values(dynamicValues).some((value) => node.textContent.includes(value.slice(0, 4))));
      if (dynamicRuns.length !== 5) violations.push(`${layout}:dynamic-count=${dynamicRuns.length}`);
      for (const run of dynamicRuns) {
        const source = Object.values(dynamicValues).find((value) => run.textContent.includes(value.slice(0, 4)));
        if (source === undefined) continue;
        if (graphemeCount(run.textContent) >= graphemeCount(source) || !run.textContent.endsWith("…")) violations.push(`${layout}:unbounded=${source.slice(0, 4)}`);
        if ((run.textContent.includes("\u200D") && !run.textContent.includes("👨‍👩‍👧‍👦") && !run.textContent.includes("🧑🏽‍💻")) || (run.textContent.includes("🏽") && !run.textContent.includes("🧑🏽‍💻"))) violations.push(`${layout}:split-grapheme=${source.slice(0, 4)}`);
        const x = Number(run.getAttribute("x"));
        const fontSize = Number(run.getAttribute("font-size"));
        const widthBudget = Number(run.getAttribute("data-width-budget"));
        if (!Number.isFinite(x) || !Number.isFinite(fontSize) || !Number.isFinite(widthBudget) || widthBudget <= 0 || x + widthBudget > 640 || graphemeCount(run.textContent) * fontSize * 0.9 > widthBudget) violations.push(`${layout}:invalid-budget=${source.slice(0, 4)}`);
      }
      if (!svg.includes("&amp;") || !svg.includes("&lt;") || !svg.includes("&gt;") || !svg.includes("&quot;")) violations.push(`${layout}:xml-unescaped`);
      if (layout === "narrative") {
        const callouts = dynamicRuns.filter((node) => node.getAttribute("data-run")?.startsWith("point") === true || ["첫째동적", "둘째동적", "셋째동적"].some((marker) => node.textContent.includes(marker)));
        const baselines = new Set(callouts.map((node) => node.getAttribute("y")));
        if (callouts.length !== 3 || baselines.size !== 3) violations.push("narrative:overlapping-baselines");
        const regions = callouts.map((node) => ({ x: Number(node.getAttribute("x")), width: Number(node.getAttribute("data-width-budget")) })).sort((left, right) => left.x - right.x);
        for (let index = 1; index < regions.length; index += 1) {
          const previous = regions[index - 1];
          const current = regions[index];
          if (previous === undefined || current === undefined || previous.x + previous.width > current.x) violations.push("narrative:overlapping-regions");
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
