import { AgentsClient } from "@azure/ai-agents";
import { DefaultAzureCredential } from "@azure/identity";
import { components } from "../generated/v2/models";
import { agentToolDefinitions, agentToolMap } from "./definitions";

export class CopywriterAgent {
  private client: AgentsClient;
  private agent: any;
  private modelDeploymentName: string;
  private static AGENT_ID_FILE = require("path").resolve(process.cwd(), ".copywriter-agent-id");
  private static INSTRUCTIONS_FILE = require("path").resolve(process.cwd(), ".copywriter-agent-instructions.txt");

  constructor(endpoint: string, modelDeploymentName: string) {
    this.client = new AgentsClient(endpoint, new DefaultAzureCredential());
    this.modelDeploymentName = modelDeploymentName;
  }

  async init() {
    const fs = require("fs");
    let agentId;
    let instructions = "";
    // Read instructions from file
    if (fs.existsSync(CopywriterAgent.INSTRUCTIONS_FILE)) {
      try {
        instructions = fs.readFileSync(CopywriterAgent.INSTRUCTIONS_FILE, "utf8");
      } catch (err) {
        console.warn("Could not read copywriter agent instructions file:", err);
      }
    }
    if (!instructions) {
      instructions = `You are an expert social media copywriter agent. Instructions file not found.`;
    }
    if (fs.existsSync(CopywriterAgent.AGENT_ID_FILE)) {
      try {
        agentId = fs.readFileSync(CopywriterAgent.AGENT_ID_FILE, "utf8").trim();
      } catch (err) {
        console.warn("Could not read copywriter agent ID file:", err);
      }
    }
    let agentNeedsUpdate = false;
    if (agentId) {
      try {
        this.agent = await this.client.getAgent(agentId);
        // Check if instructions have changed
        if (this.agent && this.agent.instructions !== instructions) {
          agentNeedsUpdate = true;
        } else if (this.agent) {
          return;
        }
      } catch (err) {
        console.warn("Could not load existing copywriter agent by ID, will create new agent.", err);
      }
    }
    // Create or update agent and persist its ID
    if (!this.agent || agentNeedsUpdate) {
      if (this.agent && agentNeedsUpdate) {
        // Update agent instructions online
        try {
          this.agent = await this.client.updateAgent(this.agent.id, { instructions });
        } catch (err) {
          console.warn("Could not update copywriter agent instructions online:", err);
        }
      } else {
        this.agent = await this.client.createAgent(this.modelDeploymentName, {
          name: "copywriter-agent",
          instructions,
          tools: agentToolDefinitions,
        });
        if (this.agent && this.agent.id) {
          try {
            fs.writeFileSync(CopywriterAgent.AGENT_ID_FILE, this.agent.id, "utf8");
          } catch (err) {
            console.warn("Could not write copywriter agent ID file:", err);
          }
        }
      }
    }
  }

  async generateCopy(brandDocument: components["schemas"]["BrandDocument"], postPlanDocument: components["schemas"]["PostPlanDocument"]) {
    if (!this.agent) await this.init();
    const thread = await this.client.threads.create();
    const userMessage = JSON.stringify({ brandDocument, postPlanDocument });
    await this.client.messages.create(thread.id, "user", userMessage);
    let run = await this.client.runs.create(thread.id, this.agent.id);
    while (run.status !== "completed" && run.status !== "failed" && run.status !== "cancelled") {
      if (run.requiredAction && run.requiredAction.type === "submit_tool_outputs") {
        const toolCalls = (run.requiredAction as any).submitToolOutputs?.toolCalls;
        if (!toolCalls) throw new Error("Tool calls not found in requiredAction.submitToolOutputs");
        const outputs = await Promise.all(
          toolCalls.map(async (toolCall: any) => {
            const params = typeof toolCall.function.arguments === "string"
              ? JSON.parse(toolCall.function.arguments)
              : toolCall.function.arguments;
            // Use the agentToolMap to find and execute the correct tool
            const toolFn = agentToolMap[toolCall.function.name];
            let result;
            if (toolFn) {
              try {
                result = await toolFn.execute(params);
              } catch (error) {
                result = { error: error instanceof Error ? error.message : String(error) };
              }
            } else {
              result = { error: "Unknown tool" };
            }
            return { toolCallId: toolCall.id, output: JSON.stringify(result) };
          })
        );
        await this.client.runs.submitToolOutputs(thread.id, run.id, outputs);
      }
      run = await this.client.runs.get(thread.id, run.id);
    }
    // Extract the agent's response
    const messages = [];
    for await (const m of this.client.messages.list(thread.id)) {
      messages.push(m);
    }
    // Return the last message as the generated copy
    return messages[messages.length - 1]?.content;
  }
}
