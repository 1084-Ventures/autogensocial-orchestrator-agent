import { AgentsClient, ToolUtility } from "@azure/ai-agents";
import { DefaultAzureCredential } from "@azure/identity";
import { getBrandTool } from "../tools/getBrandTool";
import { createPostTool } from "../tools/createPostTool";
import { components } from "../generated/v2/models";
type postCopy = components["schemas"]["postCopy"];

export class OrchestratorAgent {
  private client: AgentsClient;
  private agent: any;
  private modelDeploymentName: string;

  constructor(endpoint: string, modelDeploymentName: string) {
    this.client = new AgentsClient(endpoint, new DefaultAzureCredential());
    this.modelDeploymentName = modelDeploymentName;
  }

  async init() {
    this.agent = await this.client.createAgent(this.modelDeploymentName, {
      name: "content-orchestrator-agent",
      instructions: `
        You are an expert social media agent.
        Always follow the OpenAPI model specification for all tool calls.
        Call the getBrand tool to retrieve brand details before generating a post.
        The post should be in the format of the postCopy schema.
        When you call createPost, you must provide both brandId and postCopy, matching the required fields in the OpenAPI mode for postRequest.
        Validate your payloads before calling any tool.
        Reason and plan your actions step by step.
      `,
      tools: [
        ToolUtility.createFunctionTool(getBrandTool).definition,
        ToolUtility.createFunctionTool(createPostTool).definition,
      ],
    });
  }

  async run(initialMessage: string | object) {
    if (!this.agent) await this.init();
    const thread = await this.client.threads.create();
    const userMessage = typeof initialMessage === "string" ? initialMessage : JSON.stringify(initialMessage);
    await this.client.messages.create(thread.id, "user", userMessage);
    let run = await this.client.runs.create(thread.id, this.agent.id);
    while (run.status !== "completed" && run.status !== "failed" && run.status !== "cancelled") {
      if (run.requiredAction && run.requiredAction.type === "submit_tool_outputs") {
        // Debug log to inspect requiredAction structure
        console.debug("[OrchestratorAgent] requiredAction:", JSON.stringify(run.requiredAction));
        const toolCalls = (run.requiredAction as any).submitToolOutputs?.toolCalls;
        if (!toolCalls) throw new Error("Tool calls not found in requiredAction.submitToolOutputs");
        const outputs = await Promise.all(
          toolCalls.map(async (toolCall: any) => {
            const params = typeof toolCall.function.arguments === "string"
              ? JSON.parse(toolCall.function.arguments)
              : toolCall.function.arguments;
            let result;
            if (toolCall.function.name === "getBrand") {
              result = await getBrandTool.execute(params);
            } else if (toolCall.function.name === "createPost") {
              // Type-safe payload construction for createPost
              const postPayload: components["schemas"]["postRequest"] = {
                brandId: params.brandId,
                postCopy: params.postCopy,
              };
              result = await createPostTool.execute({
                brandId: postPayload.brandId,
                postCopy: postPayload.postCopy,
              });
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
    const messages = [];
    for await (const m of this.client.messages.list(thread.id)) {
      messages.push(m);
    }
    return messages;
  }
}