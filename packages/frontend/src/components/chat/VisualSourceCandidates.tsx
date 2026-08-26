import { useMemo } from "react";
import { FileImage, Globe2 } from "lucide-react";
import type { FileInfo } from "@bg/shared";
import { listExistingVisualSources } from "./visual-source-selection";

export function VisualSourceCandidates({ files }: { readonly files: readonly FileInfo[] }) {
  const sources = useMemo(() => listExistingVisualSources(files), [files]);
  return (
    <>
    <div className="mb-2 rounded border border-border bg-muted/40 px-2.5 py-2 text-[11px] leading-relaxed">
      {sources.length > 0 && (
        <div>
          <p className="mb-1 font-medium text-foreground">프로젝트 안의 시각 파일</p>
          <ul className="max-h-28 space-y-1 overflow-y-auto overscroll-contain pr-1" aria-label="기존 프로젝트 시각 파일">
            {sources.map((source) => (
              <li key={source.rel_path} className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                <FileImage className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate" title={source.rel_path}>{source.rel_path}</span>
                <span className="shrink-0 rounded-full border border-border bg-background px-1.5">기존 파일 · 편집 가능</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-foreground/80 [word-break:keep-all]">기존 파일은 이 화면에서 불변 참조로 바꾸지 않아요. 불변 원본이 필요하면 별도로 업로드하세요.</p>
        </div>
      )}
      <p className="mt-1 flex items-start gap-1.5 text-foreground/80 [word-break:keep-all]">
        <Globe2 className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
        URL·웹·스톡 이미지는 지원하지 않으며 네트워크에서 가져오거나 복사하지 않아요.
      </p>
    </div>
    <p className="mt-1.5 break-words text-center text-[10px] leading-relaxed text-foreground/80 [word-break:keep-all]">
      PDF와 PPTX를 올린 뒤 파일마다 일반 자료 또는 수정하지 않는 시각 참조를 선택하세요. 최대 8개, 파일당 10MB, 전체 25MB까지예요.
    </p>
    </>
  );
}
