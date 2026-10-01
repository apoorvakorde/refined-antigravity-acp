import { afterEach, describe, expect, it } from "vitest";
import { spawnRawAgy, spawnWrapped, type AcpTestClient } from "../../test-utils/index.js";

describe("ask_question unhandled collision e2e", () => {
  const activeClients: AcpTestClient[] = [];

  afterEach(async () => {
    while (activeClients.length > 0) {
      const client = activeClients.pop();
      if (client) {
        await client.close().catch(() => {});
      }
    }
  });

  it("problem: raw agy halts on ask_question and rejects subsequent chat prompts with foreground turn active", async () => {
    const client = await spawnRawAgy();
    activeClients.push(client);
    await client.initialize();
    const { sessionId } = await client.newSession({ modeId: "yolo" });

    // Model is prompted to ask a question
    await client.prompt(
      sessionId,
      "Please call the ask_question tool immediately to ask what color I prefer (Red or Blue). Do not generate any other text before calling the tool.",
    );

    // Wait until the question permission request is emitted
    const questionMsg = await client.nextMatching(
      (m) =>
        "method" in m &&
        (m.method === "session/request_permission" || m.method === "session/requestPermission"),
      30000,
    );

    expect(questionMsg).toBeDefined();

    // Now user types a response into chat rather than selecting a button
    const p2 = await client.prompt(
      sessionId,
      "I prefer Green actually, please proceed with Green.",
    );

    // In raw agy, this second prompt either hangs indefinitely or is rejected with foreground turn active
    const res2 = await client.waitForResponse(p2.id, 5000).catch((err: Error) => err);
    if (res2 instanceof Error) {
      expect(res2.message).toContain("Timeout waiting for matching message");
    } else {
      expect("error" in res2 && res2.error).toBeTruthy();
    }
  }, 45000);

  it("solution: wrapped agy auto-cancels pending question and executes user prompt cleanly", async () => {
    const client = await spawnWrapped();
    activeClients.push(client);
    await client.initialize();
    const { sessionId } = await client.newSession({ modeId: "yolo" });

    // Model is prompted to ask a question
    await client.prompt(
      sessionId,
      "Please call the ask_question tool immediately to ask what color I prefer (Red or Blue). Do not generate any other text before calling the tool.",
    );

    // Wait until the question permission request is emitted
    const questionMsg = await client.nextMatching(
      (m) =>
        "method" in m &&
        (m.method === "session/request_permission" || m.method === "session/requestPermission"),
      30000,
    );

    expect(questionMsg).toBeDefined();

    // Now user types a response into chat rather than selecting a button
    const p2 = await client.prompt(
      sessionId,
      "I prefer Green actually, please proceed with Green.",
    );

    // With the fix, p2 resolves successfully
    const res2 = await client.waitForResponse(p2.id, 45000);
    expect("result" in res2 && res2.result).toBeTruthy();
  }, 90000);
});
