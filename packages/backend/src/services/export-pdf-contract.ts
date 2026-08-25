import type { PdfPaper } from "@bg/shared";

export const PDF_RASTER_SCALE = 2;
export const PDF_MAX_PAGE_PIXELS = 16_000_000;
export const PDF_MAX_EXPECTED_PIXELS = 64_000_000;
export const PDF_POINT_TOLERANCE = 1;
export const PDF_EDGE_TOLERANCE_PIXELS = 1;
export const PDF_CLIPPED_PAINT_RATIO = 0.25;
export const PDF_PAPER_POINTS: Readonly<Record<PdfPaper, { readonly width: number; readonly height: number }>> = {
  a4: { width: 841.89, height: 595.28 },
  letter: { width: 792, height: 612 },
  "widescreen-16x9": { width: 959.976, height: 540 },
};

export const PDF_PRINT_CSS = `
html, body { margin: 0 !important; padding: 0 !important; background: #ffffff !important; }
[data-deck-nav], [data-deck-nav-style] { display: none !important; }
[data-slide] { display: block !important; width: 100vw !important; height: 100vh !important; min-height: 0 !important; max-height: 100vh !important; overflow: hidden !important; box-sizing: border-box !important; page-break-after: always; break-after: page; page-break-inside: avoid; break-inside: avoid; }
[data-slide]:last-of-type { page-break-after: auto; break-after: auto; }
`;
export type PdfPageDimensions = { readonly format?: "A4" | "Letter"; readonly width?: string; readonly height?: string };
export function pdfDimensionsForPaper(paper: PdfPaper): PdfPageDimensions {
  switch (paper) { case "letter": return { format: "Letter" }; case "widescreen-16x9": return { width: "13.333in", height: "7.5in" }; case "a4": return { format: "A4" }; }
}
export function pdfPointsForPaper(paper: PdfPaper): { readonly width: number; readonly height: number } { return PDF_PAPER_POINTS[paper]; }
export function pdfRasterDimensions(widthPoints: number, heightPoints: number): { readonly width: number; readonly height: number } { return { width: Math.ceil(widthPoints * PDF_RASTER_SCALE), height: Math.ceil(heightPoints * PDF_RASTER_SCALE) }; }
export function pdfRasterBudgetFits(widthPoints: number, heightPoints: number, pages: number): boolean {
  const { width, height } = pdfRasterDimensions(widthPoints, heightPoints); const pixels = width * height; const total = pixels * pages;
  return Number.isSafeInteger(pixels) && Number.isSafeInteger(total) && width > 0 && height > 0 && pages > 0 && pixels <= PDF_MAX_PAGE_PIXELS && total <= PDF_MAX_EXPECTED_PIXELS;
}
export function pdfPointsMatchPaper(paper: PdfPaper, width: number, height: number): boolean { const expected = pdfPointsForPaper(paper); return Math.abs(width - expected.width) <= PDF_POINT_TOLERANCE && Math.abs(height - expected.height) <= PDF_POINT_TOLERANCE; }
export function isPdfSingleEdgeClipped(bounds: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number }, width: number, height: number, painted: number, pixels: number): boolean {
  const near = PDF_EDGE_TOLERANCE_PIXELS; const edges = [bounds.left <= near, bounds.top <= near, bounds.right >= width - near - 1, bounds.bottom >= height - near - 1];
  return edges.filter(Boolean).length === 1 && painted / pixels < PDF_CLIPPED_PAINT_RATIO;
}
