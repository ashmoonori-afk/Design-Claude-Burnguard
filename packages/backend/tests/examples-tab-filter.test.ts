import { describe, expect, test } from "bun:test";
import { isExampleProject } from "../src/db/seed";

// `isExampleProject` decides which projects appear under the Examples
// tab. Before P4.7c, only `from_template` projects passed, leaving the
// real seeded tutorials and prompt-samples invisible there. The rule
// now also admits any project whose name carries the seeded tutorial
// or prompt-sample prefix.
describe("isExampleProject", () => {
  test("admits the seeded prototype tutorial", () => {
    expect(
      isExampleProject({
        type: "prototype",
        name: "[burnguard:tutorial] Prototype demo",
      }),
    ).toBe(true);
  });

  test("admits the seeded slide-deck tutorial", () => {
    expect(
      isExampleProject({
        type: "slide_deck",
        name: "[burnguard:tutorial] Slide deck demo",
      }),
    ).toBe(true);
  });

  test("admits all four prompt-sample projects regardless of typed surface", () => {
    const samples = [
      { type: "prototype", name: "[burnguard:prompt-sample] ClearInvoice static SaaS" },
      { type: "prototype", name: "[burnguard:prompt-sample] Taskly liquid glass" },
      { type: "prototype", name: "[burnguard:prompt-sample] Mindloop monochrome" },
      { type: "prototype", name: "[burnguard:prompt-sample] Velorah cinematic hero" },
    ];
    for (const sample of samples) {
      expect(isExampleProject(sample)).toBe(true);
    }
  });

  test("admits placeholder template fixtures (from_template)", () => {
    expect(
      isExampleProject({
        type: "from_template",
        name: "Splash Template Landing",
      }),
    ).toBe(true);
  });

  test("rejects regular user projects, even ones with brand-y names", () => {
    expect(
      isExampleProject({ type: "prototype", name: "Series A Investor Landing" }),
    ).toBe(false);
    expect(
      isExampleProject({ type: "slide_deck", name: "Quarterly Review Deck" }),
    ).toBe(false);
    expect(
      isExampleProject({ type: "other", name: "Portfolio Playground" }),
    ).toBe(false);
  });

  test("rejects names that merely contain the tag string mid-sentence", () => {
    // The tag check is a prefix match — pasting the tag into the middle
    // of a name (e.g. a user copy-pasting it) shouldn't elevate it to
    // an example.
    expect(
      isExampleProject({
        type: "prototype",
        name: "My fork of [burnguard:tutorial] Prototype demo",
      }),
    ).toBe(false);
  });
});
