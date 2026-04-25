import { describe, expect, test } from "bun:test";
import { PDF_PRINT_CSS } from "../src/services/export-pdf";

describe("PDF_PRINT_CSS", () => {
  test("overrides single-slide gate and hides the nav", () => {
    // The slide-deck template hides non-active slides via
    // `body[data-deck-ready] .deck-slide:not([data-active]) { display: none }`.
    // Print CSS must force every [data-slide] visible with !important to win
    // specificity, and hide the runtime nav strip so no artifact prints.
    expect(PDF_PRINT_CSS).toMatch(/\[data-slide\][^{]*{\s*display:\s*block\s*!important/);
    expect(PDF_PRINT_CSS).toContain("[data-deck-nav]");
    expect(PDF_PRINT_CSS).toMatch(/display:\s*none\s*!important/);
  });

  test("breaks a page between slides except after the last", () => {
    expect(PDF_PRINT_CSS).toContain("page-break-after: always");
    expect(PDF_PRINT_CSS).toContain("break-after: page");
    expect(PDF_PRINT_CSS).toContain("[data-slide]:last-of-type");
    expect(PDF_PRINT_CSS).toMatch(/last-of-type[^}]*page-break-after:\s*auto/);
  });

  test("does not declare an @page rule (page size is driven by the paper option)", () => {
    // The @page { size: A4 landscape } rule used to live here. After
    // P4 export audit fix 7, the user picks paper / orientation per
    // export and `page.pdf({ format, width, height, landscape })`
    // drives the dimensions. A stray @page rule would override that
    // choice via preferCSSPageSize behaviour, so this guard prevents
    // a regression that re-pins everyone to A4.
    expect(PDF_PRINT_CSS).not.toMatch(/@page\b/);
  });
});
