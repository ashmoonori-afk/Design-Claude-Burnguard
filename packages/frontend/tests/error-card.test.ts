import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ErrorCard from "../src/components/chat/blocks/ErrorCard";

test("Given a sanitized parent-path turn failure When modeled for UI Then no host path renders and retry/report remain available", () => {
  const raw = "/private/Users/alice/project/.attachments/source.pdf";
  const html = renderToStaticMarkup(createElement(ErrorCard, {
    message: "프로젝트 파일에 안전하게 접근할 수 없어요. 다시 시도해 주세요.",
    recoverable: true,
  }));
  expect(html).not.toContain(raw);
  expect(html).not.toContain("/private/");
  expect(html.match(/<button/g)?.length).toBe(2);
});
