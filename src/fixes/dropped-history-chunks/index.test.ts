import { describe, expect, it } from "vitest";
import { encodeLengthDelimited } from "../../test-utils/index.js";
import type { AcpStreamMessage, InboundContext, OutboundContext } from "../../core/types.js";
import {
  decodeStep,
  droppedHistoryChunksFix,
  isInternalProxyPrompt,
  STEP_TYPE_USER,
  STEP_TYPE_AGENT,
} from "./index.js";

describe("dropped-history-chunks unit tests", () => {
  describe("isInternalProxyPrompt", () => {
    it("identifies automated steering prompts", () => {
      const text =
        "[Automated Steering]: You have repeatedly executed 'view_file' (3 times consecutively).";
      expect(isInternalProxyPrompt(text)).toBe(true);
    });

    it("identifies automated continuation prompts", () => {
      const text =
        "[Automated Continuation]: You executed 15 tool calls but stopped without providing a status report.";
      expect(isInternalProxyPrompt(text)).toBe(true);
    });

    it("does not match regular user prompts", () => {
      expect(isInternalProxyPrompt("Please fix the lint error.")).toBe(false);
      expect(isInternalProxyPrompt("How do I automate this process?")).toBe(false);
    });

    it("does not match user mid-turn updates", () => {
      expect(isInternalProxyPrompt("[Mid-turn update]: Stop and check tests")).toBe(false);
    });
  });

  describe("decodeStep", () => {
    function makeUserPayload(text: string): Uint8Array {
      const field2 = encodeLengthDelimited(2, Buffer.from(text, "utf-8"));
      return encodeLengthDelimited(19, field2);
    }

    it("drops automated steering user steps from replayed history", () => {
      const steeringText =
        "[Automated Steering]: You have repeatedly executed 'view_file' without progress.";
      const payload = makeUserPayload(steeringText);
      const decoded = decodeStep(STEP_TYPE_USER, payload, 10);
      expect(decoded).toHaveLength(0);
    });

    it("drops automated continuation user steps from replayed history", () => {
      const continuationText =
        "[Automated Continuation]: You executed 10 tool calls but stopped. Please summarize.";
      const payload = makeUserPayload(continuationText);
      const decoded = decodeStep(STEP_TYPE_USER, payload, 11);
      expect(decoded).toHaveLength(0);
    });

    it("retains genuine user prompts", () => {
      const userText = "Please implement the new feature.";
      const payload = makeUserPayload(userText);
      const decoded = decodeStep(STEP_TYPE_USER, payload, 12, "2026-09-27T10:00:00.000Z");
      expect(decoded).toEqual([
        {
          kind: "user",
          idx: 12,
          text: "Please implement the new feature.",
          timestamp: "2026-09-27T10:00:00.000Z",
        },
      ]);
    });

    it("decodes assistant thoughts, messages, and tool calls", () => {
      const thoughtField = encodeLengthDelimited(3, Buffer.from("Analyzing code", "utf-8"));
      const textField = encodeLengthDelimited(1, Buffer.from("Here is the solution", "utf-8"));
      const callIdField = encodeLengthDelimited(1, Buffer.from("call_123", "utf-8"));
      const callNameField = encodeLengthDelimited(2, Buffer.from("run_command", "utf-8"));
      const callJsonField = encodeLengthDelimited(3, Buffer.from("{}", "utf-8"));
      const toolCallField = encodeLengthDelimited(
        7,
        Buffer.concat([callIdField, callNameField, callJsonField]),
      );

      const agentPayload = encodeLengthDelimited(
        20,
        Buffer.concat([thoughtField, textField, toolCallField]),
      );

      const decoded = decodeStep(STEP_TYPE_AGENT, agentPayload, 20);
      expect(decoded).toHaveLength(3);
      expect(decoded[0]).toMatchObject({ kind: "thought", text: "Analyzing code" });
      expect(decoded[1]).toMatchObject({ kind: "assistant", text: "Here is the solution" });
      expect(decoded[2]).toMatchObject({
        kind: "tool_call",
        callId: "call_123",
        name: "run_command",
      });
    });
  });

  describe("onOutbound", () => {
    it("ignores internal recycle session/load requests", () => {
      const dummyOutContext = {} as unknown as OutboundContext;
      const recycleMsg: AcpStreamMessage = {
        jsonrpc: "2.0",
        id: "__refined_agy_recycle_load",
        method: "session/load",
        params: { sessionId: "s-recycle" },
      } as unknown as AcpStreamMessage;

      const fix = droppedHistoryChunksFix;
      fix.onOutbound?.(recycleMsg, dummyOutContext);

      // Verify that an internal recycle load does not intercept subsequent responses
      const recycleResponse: AcpStreamMessage = {
        jsonrpc: "2.0",
        id: "__refined_agy_recycle_load",
        result: {},
      } as unknown as AcpStreamMessage;

      const dummyInContext = {} as unknown as InboundContext;
      const inbound = fix.onInbound?.(recycleResponse, dummyInContext);
      expect(inbound).toEqual([recycleResponse]);
    });
  });
});
