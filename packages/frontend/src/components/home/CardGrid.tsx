import type { ReactNode } from "react";

export default function CardGrid({ children }: { children: ReactNode }) {
  return (
    <div
      className="grid gap-4"
      style={{
        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
      }}
    >
      {children}
    </div>
  );
}
