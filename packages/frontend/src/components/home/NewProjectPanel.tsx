import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type {
  BackendId,
  CreateProjectRequest,
  CreateProjectResponse,
  DesignSystemSummary,
  ProjectType,
} from "@bg/shared";
import { createProject } from "@/api/home";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ProjectBriefFields, {
  ToggleRow,
} from "@/components/home/ProjectBriefFields";
import {
  INITIAL_BRIEF_FORM,
  PROBLEM_MESSAGE,
  PROJECT_CONTROL_CLASS,
  PROJECT_LABEL_CLASS,
  buildCreateProjectRequest,
  keepSelectedDesignSystemId,
  selectableDesignSystems,
  type BriefForm,
} from "@/lib/project-creation";
import { useUIStore } from "@/state/uiStore";

export type { ProjectType };

const TYPE_LABEL: Record<ProjectType, string> = {
  prototype: "새 프로토타입",
  slide_deck: "새 슬라이드 덱",
  from_template: "템플릿으로 시작",
  other: "새 프로젝트",
};

export default function NewProjectPanel({
  type,
  designSystems,
  defaultBackend,
  onCreated,
}: {
  type: ProjectType;
  designSystems: DesignSystemSummary[];
  defaultBackend: BackendId;
  onCreated: (project: CreateProjectResponse) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pushToast = useUIStore((s) => s.pushToast);
  const [form, setForm] = useState<BriefForm>(INITIAL_BRIEF_FORM);
  const [pickedSystemId, setPickedSystemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Derived on every render instead of synced by an effect: a late
  // design-system fetch or a project-type switch can never silently
  // promote a draft system into the user's explicit choice.
  const selectable = selectableDesignSystems(designSystems, type);
  const designSystemId = keepSelectedDesignSystemId(
    pickedSystemId,
    selectable,
  );
  const isTemplate = type === "from_template";

  const createMutation = useMutation({
    mutationFn: (request: CreateProjectRequest) => createProject(request),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      onCreated(created);
      navigate(`/projects/${created.id}`);
      setForm(INITIAL_BRIEF_FORM);
      setPickedSystemId(null);
      setError(null);
    },
    onError: (err) => {
      const message =
        err instanceof Error ? err.message : "프로젝트를 만들지 못했어요.";
      setError(message);
      pushToast({
        title: "프로젝트를 만들지 못했어요",
        body: message,
        tone: "error",
      });
    },
  });

  const built = buildCreateProjectRequest(
    { ...form, type, backendId: defaultBackend, designSystemId },
    designSystems,
  );
  const disabled = createMutation.isPending;

  function update<K extends keyof BriefForm>(key: K, value: BriefForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="p-6">
      <h2 className="mb-4 text-base font-semibold">{TYPE_LABEL[type]}</h2>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="project-name" className={PROJECT_LABEL_CLASS}>
            프로젝트 이름
          </label>
          <Input
            id="project-name"
            placeholder="제목 없음"
            value={form.name}
            disabled={disabled}
            onChange={(e) => update("name", e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="design-system" className={PROJECT_LABEL_CLASS}>
            {isTemplate ? "사용할 템플릿" : "디자인 시스템"}
          </label>
          <select
            id="design-system"
            value={designSystemId ?? ""}
            disabled={disabled || selectable.length === 0}
            onChange={(e) => setPickedSystemId(e.target.value || null)}
            className={PROJECT_CONTROL_CLASS}
          >
            <option value="">
              {selectable.length === 0
                ? isTemplate
                  ? "사용할 수 있는 템플릿이 없어요"
                  : "사용할 수 있는 디자인 시스템이 없어요"
                : isTemplate
                  ? "템플릿을 선택하세요"
                  : "디자인 시스템 없이 시작"}
            </option>
            {selectable.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <p className="text-[11px] leading-relaxed text-foreground/80">
          {isTemplate
            ? "게시된 디자인 시스템을 템플릿으로 사용할 수 있어요."
            : "게시된 디자인 시스템만 목록에 나와요. 없이도 시작할 수 있어요."}
        </p>

        <ProjectBriefFields
          form={form}
          disabled={disabled}
          onChange={update}
        />

        {type === "slide_deck" && (
          <ToggleRow
            title="발표자 노트 사용"
            hint="슬라이드 위 글자를 줄여요"
            checked={form.useSpeakerNotes}
            disabled={disabled}
            onChange={(v) => update("useSpeakerNotes", v)}
          />
        )}

        {isTemplate && (
          <ToggleRow
            title="템플릿을 그대로 복사"
            hint="구조는 유지하고 내용만 바꿔요"
            checked={form.copyAsIs}
            disabled={disabled}
            onChange={(v) => update("copyAsIs", v)}
          />
        )}
      </div>

      <Button
        className="mt-6 w-full"
        variant="cta"
        disabled={!built.ok || disabled}
        onClick={() => {
          if (!built.ok || disabled) return;
          setError(null);
          createMutation.mutate(built.request);
        }}
      >
        <Plus className="h-4 w-4" />{" "}
        {createMutation.isPending ? "만드는 중..." : "만들기"}
      </Button>

      {error ? (
        <p className="mt-3 text-center text-[11px] text-destructive">{error}</p>
      ) : (
        <p className="mt-3 text-center text-[11px] leading-relaxed text-foreground/80">
          {built.ok
            ? "이 프로젝트는 기본적으로 나만 볼 수 있어요."
            : PROBLEM_MESSAGE[built.problem]}
        </p>
      )}
    </div>
  );
}
