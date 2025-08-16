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
   */
  async generateCopy(
    brandDocument: components["schemas"]["BrandDocument"],
    postPlanDocument: components["schemas"]["PostPlanDocument"]
  ): Promise<any> {
    if (!this.agent) await this.init();

    // Construct Task input contract
    const taskInput = {
      payload: {
        brandDocument,
        postPlanDocument
      }
    };

    // Provide all context to the agent and let it plan tool usage
    const thread = await this.client.threads.create();
    const userMessage = JSON.stringify(taskInput);
    await this.client.messages.create(thread.id, "user", userMessage);

    // Use the autonomous agent loop from BaseAgent
    const agentOutput = await this.runAgentAutonomously(thread.id, this.agent.id, agentToolMap);


    // Log the raw agent output for debugging
    this.logInfo("[CopywriterAgent] Raw agent output before parsing:", { agentOutput });

    // Additional: Log each message in agentOutput array, including text content, for debugging
    if (Array.isArray(agentOutput)) {
      agentOutput.forEach((msg, idx) => {
        this.logInfo(`[CopywriterAgent] agentOutput[${idx}]:`, msg);
        if (msg && typeof msg === "object" && msg.text !== undefined) {
          this.logInfo(`[CopywriterAgent] agentOutput[${idx}].text:`, msg.text);
        }
      });
    }

    // Parse and validate output: must be a Task object with payload.postCopy

    let output = null;
    if (Array.isArray(agentOutput)) {
      // Try to find the last assistant message (legacy format)
      const lastAssistantMsg = agentOutput.slice().reverse().find((m: any) => m.role === "assistant");
      this.logInfo("[CopywriterAgent] Last assistant message:", { lastAssistantMsg });
      if (lastAssistantMsg) {
        output = lastAssistantMsg?.content?.[0]?.text?.value || lastAssistantMsg?.content || null;
      } else if (agentOutput[0]?.text?.value) {
        // Newer format: use the first message's text.value if present
        output = agentOutput[0].text.value;
      } else {
        output = null;
      }
    } else if (typeof agentOutput === "string" || typeof agentOutput === "object") {
      output = agentOutput;
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

    // Validate output contract
    if (
      parsed &&
      typeof parsed === "object" &&
      parsed.payload &&
      parsed.payload.postCopy &&
      typeof parsed.payload.postCopy === "object"
    ) {
      this.logInfo("[CopywriterAgent] Generated new postCopy and returning Task payload.", { postCopy: parsed.payload.postCopy });
      return parsed;
    } else {
      this.logWarn("[CopywriterAgent] Agent did not return valid Task with payload.postCopy. Returning null postCopy.", { output, parsed });
      return { payload: { postCopy: null } };
    }
  }
}
