
import { components } from "../generated/v2/models";
import { agentToolDefinitions, agentToolMap } from "./definitions";
import { BaseAgent } from "./baseAgent";


export class CopywriterAgent extends BaseAgent {
  constructor(modelDeploymentName: string) {
    super(
      modelDeploymentName,
      require('path').resolve(process.cwd(), '.copywriter-agent-id'),
      require('path').resolve(process.cwd(), '.copywriter-agent-instructions.txt')
    );
  }

  async init(): Promise<void> {
    await this.initAgent({
      name: "copywriter-agent",
      tools: agentToolDefinitions
    });
  }

  /**
   * Generates copy using the agent, given brand and post plan documents.
   * @param brandDocument BrandDocument (OpenAPI type)
   * @param postPlanDocument PostPlanDocument (OpenAPI type)
   * @param postDocument Previous posts to consider when generating new copy.
   */
  async generateCopy(
    brandDocument: components["schemas"]["BrandDocument"],
    postPlanDocument: components["schemas"]["PostPlanDocument"],
    postDocuments: components["schemas"]["PostDocument"][] = []
  ): Promise<{ response: components["schemas"]["CopywriterAgentResponse"] }> {
    if (!this.agent) await this.init();

    // Construct Task input contract
    const taskInput = {
      payload: {
        brandDocument,
        postPlanDocument,
        postDocuments
      }
    };

    // Always call getPostsTool before generating copy
    const traceEvents: components["schemas"]["TraceEvent"][] = [];
    const getPostsInput = { brandId: brandDocument.id, fields: ["postCopy.comment"] };
    traceEvents.push({
      runId: "copywriter-agent-pre-gen", // will be replaced with thread.id later
      timestamp: new Date().toISOString(),
      eventType: "tool-invoke",
      agentName: "copywriter-agent",
      toolName: "getPostsTool",
      input: getPostsInput,
      metadata: { step: "fetch previous posts" }
    });
    let previousPosts = null;
    try {
      previousPosts = await agentToolMap.getPosts.execute(getPostsInput);
      traceEvents.push({
        runId: "copywriter-agent-pre-gen",
        timestamp: new Date().toISOString(),
        eventType: "tool-result",
        agentName: "copywriter-agent",
        toolName: "getPostsTool",
        output: previousPosts,
        metadata: { step: "fetch previous posts" }
      });
    } catch (err) {
      traceEvents.push({
        runId: "copywriter-agent-pre-gen",
        timestamp: new Date().toISOString(),
        eventType: "error",
        agentName: "copywriter-agent",
        toolName: "getPostsTool",
        error: { message: err?.message || err },
        metadata: { step: "fetch previous posts" }
      });
    }
    // ...existing code continues...

    // Provide all context to the agent and let it plan tool usage
    const thread = await this.client.threads.create();
    const userMessage = JSON.stringify({ ...taskInput, previousPosts });
    await this.client.messages.create(thread.id, "user", userMessage);

    // Use the autonomous agent loop from BaseAgent
    const agentOutput = await this.runAgentAutonomously(thread.id, this.agent.id, agentToolMap);

    // Gather all thread messages for step-by-step trace
    let allMessages = [];
    try {
      for await (const m of this.client.messages.list(thread.id)) {
        allMessages.push(m);
      }
    } catch (err) {
      this.logWarn("[CopywriterAgent] Failed to log thread messages", { err });
    }

    // Build traceEvents array for detailed trace (align with TraceEvent schema)
    // Continue traceEvents with agent thread messages
    const agentTraceEvents = allMessages.map((m, idx) => {
      const eventType = m.eventType || (m.role === "assistant" ? "end" : m.role === "user" ? "start" : "custom");
      let contentSummary = undefined;
      if (typeof m.content === "string") {
        contentSummary = m.content.slice(0, 120);
      } else if (Array.isArray(m.content) && m.content[0]?.text?.value) {
        contentSummary = m.content[0].text.value.slice(0, 120);
      }
      let metadata = m.metadata;
      const isEmptyObject = metadata && Object.keys(metadata).length === 0 && metadata.constructor === Object;
      if (!metadata || isEmptyObject) {
        metadata = {
          stepNumber: idx + 1,
          eventType,
          role: m.role,
          toolName: m.toolName || undefined,
          contentSummary
        };
      }
      return {
        runId: thread.id,
        timestamp: m.createdAt || m.timestamp || new Date().toISOString(),
        eventType,
        agentName: "copywriter-agent",
        toolName: m.toolName || undefined,
        input: m.input || undefined,
        output: m.output || undefined,
        error: m.error || undefined,
        metadata
      };
    });
    // Replace runId in pre-gen events with actual thread.id
    traceEvents.forEach(e => { e.runId = thread.id; });
    traceEvents.push(...agentTraceEvents);

    // Parse and validate output: must be a Task object with payload.postCopy
    let output = null;
    // Try to find the last assistant message (legacy format)
    const lastAssistantMsg = allMessages.slice().reverse().find((m: any) => m.role === "assistant");
    this.logInfo("[CopywriterAgent] Last assistant message:", { lastAssistantMsg });
    if (lastAssistantMsg) {
      let content = lastAssistantMsg?.content;
      if (Array.isArray(content) && content[0]?.text?.value) {
        output = content[0].text.value;
      } else if (typeof content === "string") {
        output = content;
      } else {
        output = content;
      }
    }

    this.logInfo("[CopywriterAgent] Output to be parsed:", { output });

    let parsed: any = null;
    if (output) {
      try {
        parsed = typeof output === "string" ? JSON.parse(output) : output;
      } catch (err) {
        this.logWarn("[CopywriterAgent] Failed to parse output as JSON", { output, err });
        // Fallback: try to extract first JSON object from output string
        if (typeof output === "string") {
          const jsonMatch = output.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              parsed = JSON.parse(jsonMatch[0]);
            } catch (fallbackErr) {
              this.logWarn("[CopywriterAgent] Fallback JSON extraction failed", { jsonMatch, fallbackErr });
            }
          }
        }
      }
    }

    this.logInfo("[CopywriterAgent] Parsed output:", { parsed });

    // Validate output contract and build CopywriterAgentResponse
    let response: components["schemas"]["CopywriterAgentResponse"] = {
      postCopy: null,
      status: "error",
      error: undefined,
      traceEvents
    };
    if (
      parsed &&
      typeof parsed === "object" &&
      parsed.payload &&
      parsed.payload.postCopy &&
      typeof parsed.payload.postCopy === "object"
    ) {
      this.logInfo("[CopywriterAgent] Generated new postCopy and returning Task payload.", { postCopy: parsed.payload.postCopy });
      response = {
        postCopy: parsed.payload.postCopy,
        status: "success",
        traceEvents
      };
    } else {
      this.logWarn("[CopywriterAgent] Agent did not return valid Task with payload.postCopy. Returning null postCopy.", { output, parsed });
      response = {
        postCopy: null,
        status: "error",
        error: "Agent did not return valid postCopy",
        traceEvents
      };
    }
    // Return the response with traceEvents
    return { response };
  }
}
