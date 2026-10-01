import { afterEach, describe, expect, it } from "vitest";
import { spawnRawAgy, spawnWrapped, type AcpTestClient } from "../../test-utils/index.js";
import type { AcpStreamMessage, SessionUpdateParams } from "../../core/types.js";

describe("missing-usage-metrics e2e", () => {
  const activeClients: AcpTestClient[] = [];

  afterEach(async () => {
    while (activeClients.length > 0) {
      const c = activeClients.pop();
      await c?.close().catch(() => {});
    }
  });

  it("verified: raw agy binary natively emits usage_update in ACP >= 1.3.0", async () => {
    const rawClient = await spawnRawAgy();
    activeClients.push(rawClient);

    await rawClient.initialize();
    const { sessionId } = await rawClient.newSession();
    const promptRes = await rawClient.prompt(sessionId, "Respond with OK");
    await rawClient.waitForResponse(promptRes.id, 45000);

    const usageUpdates = rawClient
      .allMessages()
      .filter(
        (m: AcpStreamMessage) =>
          "method" in m &&
          m.method === "session/update" &&
          (m.params as SessionUpdateParams | undefined)?.update?.sessionUpdate === "usage_update",
      );

    // Upstream 1.3.0 natively emits ACP usage_update
    expect(usageUpdates.length).toBeGreaterThan(0);
    const update = (usageUpdates[0] as unknown as { params?: SessionUpdateParams }).params
      ?.update as {
      used?: unknown;
      size?: unknown;
    };
    expect(typeof update.used).toBe("number");
    expect(Number(update.used)).toBeGreaterThan(0);
    expect(typeof update.size).toBe("number");
    expect(Number(update.size)).toBeGreaterThanOrEqual(1000000);
  });

  it("solution: wrapped connector cleanly passes through native usage_update without duplication", async () => {
    const wrappedClient = await spawnWrapped();
    activeClients.push(wrappedClient);

    await wrappedClient.initialize();
    const { sessionId } = await wrappedClient.newSession();
    const promptRes = await wrappedClient.prompt(sessionId, "Respond with OK");
    await wrappedClient.waitForResponse(promptRes.id, 45000);

    const usageUpdates = wrappedClient
      .allMessages()
      .filter(
        (m: AcpStreamMessage) =>
          "method" in m &&
          m.method === "session/update" &&
          (m.params as SessionUpdateParams | undefined)?.update?.sessionUpdate === "usage_update",
      );

    // Since the patch is retired from default fixes, exactly 1 native usage_update passes through
    expect(usageUpdates).toHaveLength(1);
    const update = (usageUpdates[0] as unknown as { params?: SessionUpdateParams }).params
      ?.update as {
      used?: unknown;
      size?: unknown;
    };
    expect(typeof update.used).toBe("number");
    expect(Number(update.used)).toBeGreaterThan(0);
    expect(typeof update.size).toBe("number");
    expect(Number(update.size)).toBeGreaterThanOrEqual(1000000);
  });
});
