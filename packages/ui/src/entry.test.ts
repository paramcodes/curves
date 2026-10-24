import { describe, expect, it } from "vitest";
import { booted, packageName } from "./entry";

describe("@curves/ui entry", () => {
  it("exports the workspace package name and boots", () => {
    expect(packageName).toBe("@curves/ui");
    expect(booted).toBe(true);
  });
});
