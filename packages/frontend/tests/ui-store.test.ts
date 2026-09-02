import { describe, expect, test } from "bun:test";
import { toastDurationMs } from "../src/state/uiStore";

describe("toastDurationMs", () => {
  test("Given an info toast When computing duration Then it auto-dismisses at 3s", () => {
    expect(toastDurationMs("info")).toBe(3000);
  });

  test("Given a success toast When computing duration Then it auto-dismisses at 3s", () => {
    expect(toastDurationMs("success")).toBe(3000);
  });

  test("Given a warn toast When computing duration Then it persists until dismissed", () => {
    expect(toastDurationMs("warn")).toBeNull();
  });

  test("Given an error toast When computing duration Then it persists until dismissed", () => {
    expect(toastDurationMs("error")).toBeNull();
  });
});
