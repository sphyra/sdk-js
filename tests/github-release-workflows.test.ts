import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const workflows = join(root, ".github/workflows");

function readWorkflow(name: string): string {
  return readFileSync(join(workflows, name), "utf8");
}

describe("GitHub Actions publish surface (Atlex-style)", () => {
  describe("Test workflow", () => {
    it("runs typecheck, test, and build on push and pull_request", () => {
      const yaml = readWorkflow("test.yml");
      expect(yaml).toMatch(/^name:\s*Test\b/m);
      expect(yaml).toMatch(/on:/);
      expect(yaml).toMatch(/pull_request/);
      expect(yaml).toContain("pnpm typecheck");
      expect(yaml).toContain("pnpm test");
      expect(yaml).toContain("pnpm build");
      expect(yaml).not.toContain("pnpm publish");
    });
  });

  describe("Release workflow", () => {
    it("is a manual workflow_dispatch action, not a tag push", () => {
      const yaml = readWorkflow("release.yml");
      expect(yaml).toMatch(/^name:\s*Release\b/m);
      expect(yaml).toContain("workflow_dispatch");
      expect(yaml).not.toMatch(/tags:\s*\n\s*-\s*'v\*/);
    });

    it("runs tests before publishing", () => {
      const yaml = readWorkflow("release.yml");
      expect(yaml).toContain("pnpm typecheck");
      expect(yaml).toContain("pnpm test");
      expect(yaml).toContain("pnpm build");
    });

    it("publishes to the public npmjs registry with NPM_TOKEN", () => {
      const yaml = readWorkflow("release.yml");
      expect(yaml).toContain("registry.npmjs.org");
      expect(yaml).toContain("pnpm publish");
      expect(yaml).toContain("secrets.NPM_TOKEN");
      expect(yaml).toMatch(/packages:\s*write/);
      expect(yaml).toMatch(/contents:\s*write/);
    });

    it("creates a GitHub Release from package.json version", () => {
      const yaml = readWorkflow("release.yml");
      expect(yaml).toContain("gh release create");
    });

    it("publishes the same version to GitHub Packages", () => {
      const yaml = readWorkflow("release.yml");
      expect(yaml).toContain("npm.pkg.github.com");
    });
  });

  describe("invariants", () => {
    it("does not keep the tag-gated publish.yml", () => {
      expect(existsSync(join(workflows, "publish.yml"))).toBe(false);
    });

    it("does not keep the no-ai-trailers CI workflow", () => {
      expect(existsSync(join(workflows, "no-ai-trailers.yml"))).toBe(false);
    });

    it("keeps the local commit-msg hook that rejects AI co-author trailers", () => {
      const hook = readFileSync(join(root, ".githooks/commit-msg"), "utf8");
      expect(hook).toMatch(/co-authored-by:.*cursor/i);
    });
  });
});
