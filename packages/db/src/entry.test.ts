import { describe, expect, it } from "vitest";
import { booted, packageName } from "./entry";

describe("@curves/db entry", () => {
  it("exports the workspace package name and boots", () => {
    expect(packageName).toBe("@curves/db");
    expect(booted).toBe(true);
  });
});
