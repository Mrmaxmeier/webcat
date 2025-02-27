// validateCSP.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

import { validateCSP } from "../../src/webcat/validators";

// We already have mocks set up in your project as follows:
vi.mock("../../src/webcat/logger", () => ({
  logger: {
    addLog: vi.fn(),
  },
}));

vi.mock("../../src/webcat/db", () => ({
  getFQDNPolicy: vi.fn(async (fqdn: string) => {
    if (fqdn === "trusted.com") {
      return new Uint8Array([0, 1, 2, 3]);
    } else {
      return new Uint8Array();
    }
  }),
  getCount: vi.fn(async (storeName: string) => {
    if (storeName === "list") {
      return 42;
    }
    return 0;
  }),
}));

describe("validateCSP", () => {
  let originState: OriginState;
  const tabId = 1;
  const trustedFQDN = "trusted.com";

  beforeEach(() => {
    originState = new OriginState("example.com");
  });

  // Test 1: Pass when default-src is 'none' (other directives are not required)
  it("should pass when default-src is 'none' even if no other directives are provided", async () => {
    const csp = "default-src 'none'";
    await expect(
      validateCSP(csp, trustedFQDN, tabId, originState),
    ).resolves.toBeUndefined();
  });

  // Test 2: Pass with default-src 'self' and all required directives valid
  it("should pass with default-src 'self' and valid script-src, style-src, object-src, child-src/frame-src, and worker-src", async () => {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'wasm-unsafe-eval'",
      "style-src 'self' 'sha256-def'",
      "object-src 'none'",
      "child-src 'self'",
      "frame-src 'self'",
      "worker-src 'self'",
    ].join("; ");
    await expect(
      validateCSP(csp, trustedFQDN, tabId, originState),
    ).resolves.toBeUndefined();
  });

  // Test 3: Missing object-src when default-src is not 'none'
  it("should throw an error if object-src is missing when default-src is not 'none'", async () => {
    const csp = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      // object-src missing
      "child-src 'self'",
      "frame-src 'self'",
      "worker-src 'self'",
    ].join("; ");
    await expect(
      validateCSP(csp, trustedFQDN, tabId, originState),
    ).rejects.toThrow(
      "default-src is not none, and object-src is not defined.",
    );
  });

  // Test 4: object-src is defined but not 'none'
  it("should throw an error if object-src is not 'none'", async () => {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'sha256-abc'",
      "style-src 'self'",
      "object-src 'self'",
      "child-src 'self'",
      "frame-src 'self'",
      "worker-src 'self'",
    ].join("; ");
    await expect(
      validateCSP(csp, trustedFQDN, tabId, originState),
    ).rejects.toThrow("Non-allowed object-src directive 'self'");
  });

  // Test 5: Missing script-src when default-src is not 'none'
  it("should throw an error if script-src is missing", async () => {
    const csp = [
      "default-src 'self'",
      // script-src missing
      "style-src 'self'",
      "object-src 'none'",
      "child-src 'self'",
      "frame-src 'self'",
      "worker-src 'self'",
    ].join("; ");
    await expect(
      validateCSP(csp, trustedFQDN, tabId, originState),
    ).rejects.toThrow(
      "default-src is not none, and script-src is not defined.",
    );
  });

  // Test 6: Missing style-src when default-src is not 'none'
  it("should throw an error if style-src is missing", async () => {
    const csp = [
      "default-src 'self'",
      "script-src 'self'",
      // style-src missing
      "object-src 'none'",
      "child-src 'self'",
      "frame-src 'self'",
      "worker-src 'self'",
    ].join("; ");
    await expect(
      validateCSP(csp, trustedFQDN, tabId, originState),
    ).rejects.toThrow("default-src is not none, and style-src is not defined.");
  });

  // Test 7: Missing worker-src when default-src is not 'none'
  it("should throw an error if worker-src is missing", async () => {
    const csp = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "object-src 'none'",
      "child-src 'self'",
      "frame-src 'self'",
      // worker-src missing
    ].join("; ");
    await expect(
      validateCSP(csp, trustedFQDN, tabId, originState),
    ).rejects.toThrow(
      "default-src is not none, and worker-src is not defined.",
    );
  });

  // Test 8: Missing both child-src and frame-src when default-src is not 'none'
  it("should throw an error if both child-src and frame-src are missing", async () => {
    const csp = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "object-src 'none'",
      "worker-src 'self'",
      // child-src and frame-src missing
    ].join("; ");
    await expect(
      validateCSP(csp, trustedFQDN, tabId, originState),
    ).rejects.toThrow(
      "default-src is not none, and neither frame-src or child-src are defined.",
    );
  });

  // Test 9: Invalid frame-src source (unallowed host without enrollment)
  it("should throw an error for an invalid script-src source", async () => {
    const csp = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "object-src 'none'",
      "child-src 'self'",
      "frame-src evil.com",
      "worker-src 'self'",
    ].join("; ");
    await expect(
      validateCSP(csp, trustedFQDN, tabId, originState),
    ).rejects.toThrow(
      "frame-src value evil.com, parsed as FQDN: evil.com is not enrolled and thus not allowed.",
    );
  });

  // Test 11: Invalid style-src source (non-enrolled and not a valid keyword/hash)
  // No super strong feelings against external css, we already have unsafe inline anyway
  /*it("should throw an error for an invalid style-src source", async () => {
    const csp = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src evil.com", // invalid
      "object-src 'none'",
      "child-src 'self'",
      "frame-src 'self'",
      "worker-src 'self'",
    ].join("; ");
    await expect(
      validateCSP(csp, trustedFQDN, tabId, originState),
    ).rejects.toThrow(
      "style-src value evil.com, parsed as FQDN: evil.com is not enrolled and thus not allowed",
    );
  });

  // Test 12: Valid style-src with an enrolled origin
  it("should pass for style-src with an enrolled origin", async () => {
    const csp = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src trusted.com", // allowed via enrollment
      "object-src 'none'",
      "child-src 'self'",
      "frame-src 'self'",
      "worker-src 'self'",
    ].join("; ");
    await expect(
      validateCSP(csp, trustedFQDN, tabId, originState),
    ).resolves.toBeUndefined();
  });*/

  // Test 13: Invalid child-src with an http: scheme (if your logic forbids http:)
  it("should throw an error for child-src containing an http: source", async () => {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'wasm-unsafe-eval'",
      "style-src 'self' 'sha256-abc'",
      "object-src 'none'",
      "child-src http://evil.com",
      "frame-src 'self'",
      "worker-src 'self'",
    ].join("; ");
    await expect(
      validateCSP(csp, trustedFQDN, tabId, originState),
    ).rejects.toThrow(
      "child-src value http://evil.com, parsed as FQDN: evil.com is not enrolled and thus not allowed.",
    );
  });

  // Test 14: Valid child-src with a blob: source
  it("should pass for child-src with a blob: source", async () => {
    const csp = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "object-src 'none'",
      "child-src blob:myblob",
      "frame-src 'self'",
      "worker-src 'self'",
    ].join("; ");
    await expect(
      validateCSP(csp, trustedFQDN, tabId, originState),
    ).resolves.toBeUndefined();
  });

  // Test 15: Invalid frame-src with a wildcard "*"
  it("should throw an error for frame-src containing a wildcard", async () => {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'wasm-unsafe-eval'",
      "style-src 'self'",
      "object-src 'none'",
      "child-src 'self'",
      "frame-src *",
      "worker-src 'self'",
    ].join("; ");
    await expect(
      validateCSP(csp, trustedFQDN, tabId, originState),
    ).rejects.toThrow("frame-src cannot contain * which is unsupported.");
  });

  // Test 16: Invalid script-src containing 'unsafe-inline'
  it("should throw an error for script-src containing 'unsafe-inline'", async () => {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
      "style-src 'self'",
      "object-src 'none'",
      "child-src 'self'",
      "frame-src 'self'",
      "worker-src 'self'",
    ].join("; ");
    await expect(
      validateCSP(csp, trustedFQDN, tabId, originState),
    ).rejects.toThrow(
      "script-src cannot contain 'unsafe-inline' which is unsupported.",
    );
  });

  // Test 17: Valid style-src containing 'unsafe-inline' (if your logic allows it)
  it("should pass for style-src containing 'unsafe-inline'", async () => {
    const csp = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "object-src 'none'",
      "child-src 'self'",
      "frame-src 'self'",
      "worker-src 'self'",
    ].join("; ");
    await expect(
      validateCSP(csp, trustedFQDN, tabId, originState),
    ).resolves.toBeUndefined();
  });

  // Test 18: Valid script-src containing 'wasm-unsafe-eval'
  it("should pass for script-src containing 'wasm-unsafe-eval'", async () => {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'wasm-unsafe-eval'",
      "style-src 'self'",
      "object-src 'none'",
      "child-src 'self'",
      "frame-src 'self'",
      "worker-src 'self'",
    ].join("; ");
    await expect(
      validateCSP(csp, trustedFQDN, tabId, originState),
    ).resolves.toBeUndefined();
  });

  // Test 19: Valid script-src with a valid hash source
  it("should pass for style-src containing a valid hash", async () => {
    const csp = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'sha256-validhash'",
      "object-src 'none'",
      "child-src 'self'",
      "frame-src 'self'",
      "worker-src 'self'",
    ].join("; ");
    await expect(
      validateCSP(csp, trustedFQDN, tabId, originState),
    ).resolves.toBeUndefined();
  });

  // Test 20: Non-enrolled child-src should throw (simulate non-enrollment)
  it("should throw an error for child-src with a non-enrolled origin", async () => {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'wasm-unsafe-eval'",
      "style-src 'self'",
      "object-src 'none'",
      "child-src evil.com",
      "frame-src 'self'",
      "worker-src 'self'",
    ].join("; ");
    await expect(
      validateCSP(csp, trustedFQDN, tabId, originState),
    ).rejects.toThrow(
      "child-src value evil.com, parsed as FQDN: evil.com is not enrolled and thus not allowed.",
    );
  });

  // Test 21: Blob in script-src
  it("should throw an error for a blob: in script-src", async () => {
    const csp = [
      "default-src 'self'",
      "script-src blob:",
      "style-src 'self'",
      "object-src 'none'",
      "child-src 'self'",
      "frame-src 'self'",
      "worker-src 'self'",
    ].join("; ");
    await expect(
      validateCSP(csp, trustedFQDN, tabId, originState),
    ).rejects.toThrow("script-src cannot contain blob: which is unsupported.");
  });
});
