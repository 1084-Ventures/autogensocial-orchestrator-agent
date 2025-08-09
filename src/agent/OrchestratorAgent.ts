import { AgentsClient } from "@azure/ai-agents";
import { DefaultAzureCredential } from "@azure/identity";
import { ToolUtility } from "@azure/ai-agents";
import { getBrandTool } from "../tools/getBrandTool";
import { createPostTool } from "../tools/createPostTool";

// OrchestratorAgent: orchestrates brand content creation using reasoning/planning and real AI model
export class OrchestratorAgent {
  private client: AgentsClient;
  private agent: any;
  private modelDeploymentName: string;

  constructor(projectEndpoint: string, modelDeploymentName: string) {
    this.client = new AgentsClient(projectEndpoint, new DefaultAzureCredential());
    this.modelDeploymentName = modelDeploymentName;
  }

  // Initialize agent with reasoning/planning and registered tools
  async init() {
    // Register function tools
    const functionTools = [
      ToolUtility.createFunctionTool(getBrandTool).definition,
      ToolUtility.createFunctionTool(createPostTool).definition,
    ];

    // Create agent with instructions for reasoning/planning
    this.agent = await this.client.createAgent(this.modelDeploymentName, {
      name: "content-orchestrator-agent",
      instructions:
        "You are a social content orchestrator. Plan and reason through each step to create and post branded content. Use the available tools to fetch brand info and create posts.",
      tools: functionTools,
    });
  }

  // Orchestrate workflow: receive brandId, fetch brand, generate post copy, create post
  async runOrchestration(brandId: string) {
    if (!this.agent) {
      await this.init();
    }
    // Create thread for this orchestration
    const thread = await this.client.threads.create();
    // Send initial message with brandId
    await this.client.messages.create(thread.id, "user", `Create a branded post for brandId: ${brandId}`);

    // Start run and handle tool calls
    const run = await this.client.runs.createAndPoll(thread.id, this.agent.id, {
      pollingOptions: { intervalInMs: 2000 },
      onResponse: async (response: any) => {
        if (response.parsedBody.status === "requires_action" && response.parsedBody.required_action) {
          const toolCall = response.parsedBody.required_action;
          let toolResult;
          switch (toolCall.function.name) {
            case "getBrand":
              toolResult = await getBrandTool.execute(toolCall.function.parameters);
              break;
            case "createPost":
              toolResult = await createPostTool.execute(toolCall.function.parameters);
              break;
            default:
              toolResult = { error: "Unknown tool" };
          }
          // Return tool output to agent
          return {
            toolCallId: toolCall.id,
            output: JSON.stringify(toolResult),
          };
        }
      },
    });
    // Collect and return agent output
    const messagesIterator = this.client.messages.list(thread.id);
    const allMessages = [];
    for await (const m of messagesIterator) {
      allMessages.push(m);
    }
    return allMessages;
  }
}
