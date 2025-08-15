import { AgentsClient, ToolUtility } from "@azure/ai-agents";
import { DefaultAzureCredential } from "@azure/identity";
import { components } from "../generated/v2/models";
import { agentToolDefinitions, agentToolMap } from "./definitions";
import { CopywriterAgent } from "./copywriterAgent";

export class OrchestratorAgent {
  private client: AgentsClient;
  private agent: any;
  private modelDeploymentName: string;
  private copywriterAgent: CopywriterAgent | undefined;
  private endpoint: string;
  private static AGENT_ID_FILE = require("path").resolve(process.cwd(), ".orchestration-agent-id");
  private static INSTRUCTIONS_FILE = require("path").resolve(process.cwd(), ".orchestrator-agent-instructions.txt");

  constructor(modelDeploymentName: string) {
    const endpoint = process.env.PROJECT_ENDPOINT;
    if (!endpoint) throw new Error("Missing PROJECT_ENDPOINT environment variable");
    this.client = new AgentsClient(endpoint, new DefaultAzureCredential());
    this.modelDeploymentName = modelDeploymentName;
    this.endpoint = endpoint;
  }

  async init() {
    const fs = require("fs");
    let agentId;
    // Try to read agent ID from file
    if (fs.existsSync(OrchestratorAgent.AGENT_ID_FILE)) {
      try {
        agentId = fs.readFileSync(OrchestratorAgent.AGENT_ID_FILE, "utf8").trim();
      } catch (err) {
        console.warn("Could not read agent ID file:", err);
      }
    }
    // Load instructions from file
    let instructions = "";
    try {
      instructions = fs.readFileSync(OrchestratorAgent.INSTRUCTIONS_FILE, "utf8").trim();
    } catch (err) {
      console.warn("Could not read agent instructions file:", err);
      instructions = "You are an expert social media agent."; // fallback
    }

  // Instantiate and initialize CopywriterAgent (agent ID logic handled inside CopywriterAgent)
  this.copywriterAgent = new CopywriterAgent(this.endpoint, this.modelDeploymentName);
  await this.copywriterAgent.init();
    if (agentId) {
      try {
        this.agent = await this.client.getAgent(agentId);
        if (this.agent) {
          // Check if instructions have changed
          if (this.agent.instructions !== instructions) {
            // Update agent instructions without re-creating
            await this.client.updateAgent(this.agent.id, {
              instructions,
              tools: agentToolDefinitions
            });
            // Reload agent after update
            this.agent = await this.client.getAgent(agentId);
            console.log("Agent instructions updated.");
          }
          return;
        }
      } catch (err) {
        console.warn("Could not load existing agent by ID, will create new agent.", err);
      }
    }
    // Create new agent and persist its ID
    this.agent = await this.client.createAgent(this.modelDeploymentName, {
      name: "content-orchestrator-agent",
      instructions,
      tools: agentToolDefinitions
    });
    if (this.agent && this.agent.id) {
      try {
        fs.writeFileSync(OrchestratorAgent.AGENT_ID_FILE, this.agent.id, "utf8");
      } catch (err) {
        console.warn("Could not write agent ID file:", err);
      }
    }
  }

  async run(initialMessage: string | object) {
    if (!this.agent) await this.init();
    const thread = await this.client.threads.create();
    const userMessage = typeof initialMessage === "string" ? initialMessage : JSON.stringify(initialMessage);
    await this.client.messages.create(thread.id, "user", userMessage);
    let run = await this.client.runs.create(thread.id, this.agent.id);

    // Guardrail state
    let retryCount = {};
    const MAX_RETRIES = 3;

    // Helper: Validate required output for each tool
    function validateToolOutput(toolName: string, params: any, result: any) {
      if (toolName === "createPost") {
        if (!params.postCopy) return "Missing required postCopy for createPost.";
      }
      return null;
    }

    // Helper: Auto-select topic if missing
    function autoSelectTopic(postPlan: any) {
      if (postPlan && postPlan.content && Array.isArray(postPlan.content.topics) && postPlan.content.topics.length > 0) {
        return postPlan.content.topics[0]; // Pick first topic for simplicity
      }
      return "general";
    }

    let lastPostPlan = null;
    let lastBrand = null;

    let lastPostCopy = null;
    while (run.status !== "completed" && run.status !== "failed" && run.status !== "cancelled") {
      if (
        run.requiredAction &&
        run.requiredAction.type === "submit_tool_outputs" &&
        "submitToolOutputs" in run.requiredAction
      ) {
        let toolCalls = (run.requiredAction as any).submitToolOutputs.toolCalls;
        if (!toolCalls) throw new Error("Tool calls not found in requiredAction.submitToolOutputs");

        // Check if the last tool call was copywriterAgent and auto-inject createPost if needed
        const hasCopywriterCall = toolCalls.some((tc: any) => tc.function.name === "copywriterAgent");
        if (hasCopywriterCall) {
          // Find the copywriterAgent tool call and extract postCopy
          const copyCall = toolCalls.find((tc: any) => tc.function.name === "copywriterAgent");
          let params = typeof copyCall.function.arguments === "string"
            ? JSON.parse(copyCall.function.arguments)
            : copyCall.function.arguments;
          // Simulate execution to get postCopy (or use result if available)
          const toolObj = agentToolMap[copyCall.function.name];
          let result;
          try {
            result = await toolObj.execute(params);
            lastPostCopy = result;
          } catch (error) {
            lastPostCopy = null;
          }
          // Inject createPost tool call if postCopy is valid
          if (lastPostCopy && lastPostCopy.postCopy) {
            toolCalls = [
              ...toolCalls,
              {
                id: "autogenerated-createPost",
                function: {
                  name: "createPost",
                  arguments: JSON.stringify({
                    brandId: lastBrand?.brandId || params.brandId,
                    postPlanId: lastPostPlan?.postPlanId || params.postPlanId,
                    postCopy: lastPostCopy.postCopy
                  })
                }
              }
            ];
          }
        }

        const outputs = await Promise.all(
          toolCalls.map(async (toolCall: any) => {
            const params = typeof toolCall.function.arguments === "string"
              ? JSON.parse(toolCall.function.arguments)
              : toolCall.function.arguments;
            let result;
            const toolObj = agentToolMap[toolCall.function.name];
            let validationError = null;
            // Track last brand and post plan for auto topic selection
            if (toolCall.function.name === "getBrand") {
              lastBrand = params;
            }
            if (toolCall.function.name === "getPostPlan") {
              lastPostPlan = params;
            }
            // Auto-select topic for postCopy if missing
            if (toolCall.function.name === "copywriterAgent" && (!params.topic || params.topic === "")) {
              params.topic = autoSelectTopic(lastPostPlan);
              console.log(`[OrchestratorAgent] Auto-selected topic: ${params.topic}`);
            }
            try {
              result = await toolObj.execute(params);
              validationError = validateToolOutput(toolCall.function.name, params, result);
            } catch (error) {
              result = { error: error instanceof Error ? error.message : String(error) };
              validationError = validateToolOutput(toolCall.function.name, params, result);
            }
            if (validationError) {
              const key = toolCall.function.name + JSON.stringify(params);
              retryCount[key] = (retryCount[key] || 0) + 1;
              console.error(`[OrchestratorAgent] Validation failed for ${toolCall.function.name}: ${validationError}`);
              if (retryCount[key] < MAX_RETRIES) {
                return { toolCallId: toolCall.id, output: JSON.stringify({ error: validationError, retry: retryCount[key] }) };
              } else {
                return { toolCallId: toolCall.id, output: JSON.stringify({ error: validationError, retries: MAX_RETRIES, status: "failed" }) };
              }
            }
            console.log(`[OrchestratorAgent] Planned action: ${toolCall.function.name}, Params:`, params);
            return { toolCallId: toolCall.id, output: JSON.stringify(result) };
          })
        );
        await this.client.runs.submitToolOutputs(thread.id, run.id, outputs);
      }
      run = await this.client.runs.get(thread.id, run.id);
    }
    const messages = [];
    for await (const m of this.client.messages.list(thread.id)) {
      messages.push(m);
    }
    return messages;
  }
}