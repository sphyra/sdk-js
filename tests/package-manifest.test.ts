import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

type PackageManifest = {
  name: string;
  version: string;
  private?: boolean;
  license?: string;
  main?: string;
  module?: string;
  types?: string;
  files?: string[];
  scripts?: Record<string, string>;
  publishConfig?: { access?: string };
  repository?: { type?: string; url?: string } | string;
  exports?: {
    "."?: {
      types?: string;
      import?: string;
      require?: string;
    };
  };
};

const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "../package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as PackageManifest;

describe("package.json publish manifest", () => {
  describe("1.2.0 public-publish surface", () => {
    it("is scoped @sphyra/js at version 1.2.0 and is not private", () => {
      expect(pkg.name).toBe("@sphyra/js");
      expect(pkg.version).toBe("1.2.0");
      expect(pkg.private).toBe(false);
    });

    it("publishes publicly with GitHub repository metadata", () => {
      expect(pkg.publishConfig).toBeTypeOf("object");
      expect(pkg.publishConfig?.access).toBe("public");
      expect(pkg.repository).toBeTypeOf("object");
      expect(String((pkg.repository as { url?: string }).url)).toContain(
        "github.com/sphyra/sdk-js",
      );
    });

    it("keeps the dual-package dist exports unchanged", () => {
      expect(Array.isArray(pkg.files)).toBe(true);
      expect(pkg.files).toContain("dist");
      expect(pkg.main).toBe("./dist/index.cjs");
      expect(pkg.module).toBe("./dist/index.js");
      expect(pkg.types).toBe("./dist/index.d.ts");
      expect(pkg.exports?.["."]?.types).toBe("./dist/index.d.ts");
      expect(pkg.exports?.["."]?.import).toBe("./dist/index.js");
      expect(pkg.exports?.["."]?.require).toBe("./dist/index.cjs");
    });
  });

  describe("invariants this publish must not break", () => {
    it("never ships an unscoped or wrong-scope name", () => {
      expect(pkg.name).toBe("@sphyra/js");
      expect(pkg.name).not.toBe("sphyra-js");
      expect(pkg.name).not.toBe("@sphyra/client");
    });

    it("keeps build, test, and typecheck scripts", () => {
      expect(pkg.scripts).toHaveProperty("build");
      expect(pkg.scripts).toHaveProperty("test");
      expect(pkg.scripts).toHaveProperty("typecheck");
    });

    it("leaves the license UNLICENSED", () => {
      expect(pkg.license).toBe("UNLICENSED");
    });
  });
});
