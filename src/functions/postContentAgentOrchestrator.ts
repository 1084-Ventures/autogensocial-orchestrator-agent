import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { OrchestratorAgent } from "../agent/orchestratorAgent";

export async function postContentAgentOrchestrator(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`[postContentAgentOrchestrator] Request received for url: ${request.url}`);
    let body: any = undefined;
    try {
        body = await request.json();
        context.log("[postContentAgentOrchestrator] Request body:", JSON.stringify(body));
        const brandId = body.brandId;
        if (!brandId) {
            context.error("[postContentAgentOrchestrator] Missing brandId in request body");
            return { status: 400, body: "Missing brandId in request body" };
        }

        // Log agent initialization
        const projectEndpoint = process.env["PROJECT_ENDPOINT"] || "<your-project-endpoint>";
        const modelDeploymentName = process.env["MODEL_DEPLOYMENT_NAME"] || "gpt-4o";
        context.log(`[postContentAgentOrchestrator] Initializing OrchestratorAgent with endpoint: ${projectEndpoint}, model: ${modelDeploymentName}`);
        const agent = new OrchestratorAgent(projectEndpoint, modelDeploymentName);

        // Log before orchestration
        context.log(`[postContentAgentOrchestrator] Invoking agent.runOrchestration for brandId: ${brandId}`);
    const initialMessage = `Create a branded post for brandId: ${brandId}`;
    const result = await agent.run(initialMessage);
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
