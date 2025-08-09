import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { OrchestratorAgent } from "../agent/OrchestratorAgent";

export async function postContentAgentOrchestrator(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Http function processed request for url "${request.url}"`);

    const body = await request.json() as { brandId?: string };
    const brandId = body.brandId;
    if (!brandId) {
        return { status: 400, body: "Missing brandId in request body" };
    }

    // You may want to load these from env/config
    const projectEndpoint = process.env["PROJECT_ENDPOINT"] || "<your-project-endpoint>";
    const modelDeploymentName = process.env["MODEL_DEPLOYMENT_NAME"] || "gpt-4o";
    const agent = new OrchestratorAgent(projectEndpoint, modelDeploymentName);
    const result = await agent.runOrchestration(brandId);

    return {
        status: 200,
        body: JSON.stringify(result)
    };
}

app.http('postContentAgentOrchestrator', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: postContentAgentOrchestrator
});
