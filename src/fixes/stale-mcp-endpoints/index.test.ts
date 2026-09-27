import { describe, expect, it } from "vitest";
import { staleMcpEndpointsFix } from "./index.js";
import { createSessionCache } from "../../core/session-cache.js";
import type { AcpStreamMessage, OutboundContext } from "../../core/types.js";

describe("stale-mcp-endpoints unit tests", () => {
  it("defaults mcpServers to empty array if omitted in session/load", async () => {
    const sessionCache = createSessionCache();
    const context = {
      sessionCache,
    } as unknown as OutboundContext;

    const loadMsg: AcpStreamMessage = {
      jsonrpc: "2.0",
      id: 1,
      method: "session/load",
      params: { sessionId: "s-test", cwd: "/tmp" },
    } as unknown as AcpStreamMessage;

    const res = await staleMcpEndpointsFix.onOutbound!(loadMsg, context);
    expect(res).toBe(loadMsg);
    expect((res as { params?: { mcpServers?: unknown[] } }).params?.mcpServers).toEqual([]);
  });
});
