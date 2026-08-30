import { describe, expect, test } from "bun:test";
import { nextCommentDraft } from "../src/components/modes/CommentPanel";

describe("nextCommentDraft", () => {
  test("Given another panel saved newer text When this textarea is idle Then it synchronizes", () => {
    expect(nextCommentDraft("stale body", "new body", false)).toBe("new body");
  });

  test("Given another panel saved newer text When this textarea is actively editing Then its draft is preserved", () => {
    expect(nextCommentDraft("local edit", "new body", true)).toBe("local edit");
  });
});
