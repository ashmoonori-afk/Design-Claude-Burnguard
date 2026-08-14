import { describe, expect, test } from "bun:test";
import { DECK_SKILL_MD } from "../src/harness/skills/deck-skill";

const MAX_SKILL_CHARS = 4000;

describe("deck projection type scale", () => {
  test("declares type and spacing token families", () => {
    expect(DECK_SKILL_MD).toContain("--deck-type-");
    expect(DECK_SKILL_MD).toContain("--deck-pad-");
  });

  test("sets the projected text floor", () => {
    expect(DECK_SKILL_MD).toContain("24px");
  });

  test("stays within the injected skill budget", () => {
    expect(DECK_SKILL_MD.length).toBeLessThanOrEqual(MAX_SKILL_CHARS);
  });
});
