import { describe, expect, test } from "bun:test";
import {
  parsePypdfVersion,
  parsePythonVersion,
} from "../src/services/python-health";

describe("parsePythonVersion", () => {
  test("extracts the first non-empty line verbatim", () => {
    expect(parsePythonVersion("Python 3.13.5\n")).toBe("Python 3.13.5");
    expect(parsePythonVersion("\n  Python 3.11.2  \n")).toBe("Python 3.11.2");
  });

  test("returns null on an empty probe", () => {
    expect(parsePythonVersion("")).toBeNull();
    expect(parsePythonVersion("   \n\n")).toBeNull();
  });

  test("falls back to the raw first line even for unusual output", () => {
    expect(parsePythonVersion("Conda Python wrapper\n")).toBe(
      "Conda Python wrapper",
    );
  });
});

describe("parsePypdfVersion", () => {
  test("accepts standard dotted versions", () => {
    expect(parsePypdfVersion("4.3.1\n")).toBe("4.3.1");
    expect(parsePypdfVersion("5.0.0+local\n")).toBe("5.0.0+local");
  });

  test("rejects non-version output", () => {
    expect(parsePypdfVersion("ImportError: no module named pypdf")).toBeNull();
    expect(parsePypdfVersion("")).toBeNull();
  });
});
