import { describe, expect, it } from "vitest";
import { booted, packageName } from "./entry";

describe("@curves/api entry", () => {
  it("exports the workspace package name and boots", () => {
    expect(packageName).toBe("@curves/api");
    expect(booted).toBe(true);
  });
});
