import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { OrchestratorAgent } from "../agent/orchestratorAgent";

export async function postContentAgentOrchestrator(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`[postContentAgentOrchestrator] Request received for url: ${request.url}`);
    let body: any = undefined;
    try {
        body = await request.json();
        context.log("[postContentAgentOrchestrator] Request body:", JSON.stringify(body));
        // Log agent initialization
        const modelDeploymentName = process.env["MODEL_DEPLOYMENT_NAME"] || "gpt-4.1";
        context.log(`[postContentAgentOrchestrator] Initializing OrchestratorAgent with model: ${modelDeploymentName}`);
        const agent = new OrchestratorAgent(modelDeploymentName);

        // Log before orchestration
        context.log(`[postContentAgentOrchestrator] Invoking agent.runOrchestration with full request body`);
        const result = await agent.run(body); // Forward the entire request object
        context.log("[postContentAgentOrchestrator] Orchestration result:", JSON.stringify(result));

        // Log response
        context.log("[postContentAgentOrchestrator] Returning response");
        return {
            status: 200,
            body: JSON.stringify(result)
        };
    } catch (error: any) {
        context.error("[postContentAgentOrchestrator] Error:", error && error.stack ? error.stack : error);
        if (body) {
            context.error("[postContentAgentOrchestrator] Failed request body:", JSON.stringify(body));
        }
        return {
            status: 500,
            body: JSON.stringify({
                error: "Internal Server Error",
                details: error && error.message ? error.message : error,
            })
        };
    }
}

app.http('postContentAgentOrchestrator', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: postContentAgentOrchestrator
});
