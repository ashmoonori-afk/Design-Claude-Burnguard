import { describe, expect, test } from "bun:test";
import type { CardViewModel } from "../src/components/home/mappers";
import { filterHomeCards } from "../src/components/home/mappers";

const cards: readonly CardViewModel[] = [
  {
    id: "quarterly-report",
    name: "분기 보고서",
    subtitle: "슬라이드 덱 · 오늘",
    href: "/projects/quarterly-report",
    tintClass: "bg-slate-100",
  },
  {
    id: "launch-poster",
    name: "Launch Poster",
    subtitle: "프로토타입 · 어제",
    href: "/projects/launch-poster",
    tintClass: "bg-rose-100",
  },
];

describe("filterHomeCards", () => {
  test("Given a normalized title query When filtering Then only matching titles remain", () => {
    expect(filterHomeCards(cards, "  분기   보고서  ")).toEqual([
      cards[0],
    ]);
  });

  test("Given a case-insensitive title query When filtering Then subtitle text does not create a match", () => {
    expect(filterHomeCards(cards, "launch")).toEqual([cards[1]]);
    expect(filterHomeCards(cards, "슬라이드")).toEqual([]);
  });

  test("Given an empty query When filtering Then every card remains available", () => {
    expect(filterHomeCards(cards, " \n\t ")).toEqual(cards);
  });
});
