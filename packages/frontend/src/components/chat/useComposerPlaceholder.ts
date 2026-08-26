import { useEffect, useState } from "react";

const IDLE_PLACEHOLDER = "뭘 만들고 싶나요? 로컬 CLI라 응답은 조금 느려요...";
const WAITING_PLACEHOLDERS = [
  "로컬 CLI 워밍업 중...",
  "Claude가 키보드를 두드리는 중...",
  "토큰을 한 장 한 장 세는 중...",
  "GPU가 기어를 올리는 소리가 들려요...",
  "덱에 잉크를 바르는 중...",
  "프롬프트를 천천히 음미하는 중...",
  "로컬이라 좀 느립니다. 딴짓해도 돼요.",
  "당신의 문장을 조립 중...",
  "Claude가 스크롤을 읽는 중...",
  "그림의 남은 한 조각을 찾는 중...",
] as const;
const WAITING_INTERVAL_MS = 2_400;

export function useComposerPlaceholder(disabled: boolean): string {
  const [waitingIndex, setWaitingIndex] = useState(0);

  useEffect(() => {
    if (!disabled) {
      return;
    }
    setWaitingIndex(Math.floor(Math.random() * WAITING_PLACEHOLDERS.length));
    const intervalId = window.setInterval(() => {
      setWaitingIndex(
        (current) => (current + 1) % WAITING_PLACEHOLDERS.length,
      );
    }, WAITING_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [disabled]);

  return disabled
    ? (WAITING_PLACEHOLDERS[waitingIndex] ?? IDLE_PLACEHOLDER)
    : IDLE_PLACEHOLDER;
}
