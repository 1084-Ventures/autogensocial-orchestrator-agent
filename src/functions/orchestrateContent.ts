import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getBrand } from "../tools/getBrandTool";
import { getPostPlan } from "../tools/getPostPlanTool";
import { getPosts } from "../tools/getPostsTool";
import { createPost } from "../tools/createPostTool";
import { CopywriterAgent } from "../agent/copywriterAgent";
import { getAgentRunsContainer } from "../shared/cosmosClient";
import crypto from "crypto";
import { TraceManager } from "../shared/traceUtils";
import { errorResponse, makeHandleError } from "../shared/errorUtils";
import { components } from "../generated/v2/models";

type BrandDocument = components["schemas"]["BrandDocument"];
type PostPlanDocument = components["schemas"]["PostPlanDocument"];
type CopywriterAgentRequest = components["schemas"]["CopywriterAgentRequest"];
type CopywriterAgentResponse = components["schemas"]["CopywriterAgentResponse"];
type Step = components["schemas"]["Step"];
type Message = components["schemas"]["Message"];
type AgentRunsDocument = components["schemas"]["agentRunsDocument"];
type AgentRunTrace = components["schemas"]["AgentRunTrace"];
type TraceEvent = components["schemas"]["TraceEvent"];

    export async function orchestrateContent(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
        const handleError = makeHandleError(context);
        context.log(`[orchestrateContent] Request received for url: ${request.url}`);

        // --- Traceability setup ---
        const traceRunId = crypto.randomUUID();
        const traceManager = new TraceManager(traceRunId, "orchestrator");
        traceManager.addEvent({
            eventType: "start",
            metadata: { url: request.url },
            agentName: "orchestrator"
        });

        let body: unknown;
        try {
            body = await request.json();
            context.log("[orchestrateContent] Request body:", JSON.stringify(body));
        } catch (err) {
            return handleError({
                status: 400,
                message: "Invalid JSON in request body",
                error: err,
                agentName: "orchestrator",
                traceManager
            });
        }

        function isContentOrchestratorRequest(obj: any): obj is components["schemas"]["ContentOrchestratorRequest"] {
            return obj && typeof obj === 'object' && typeof obj.brandId === 'string' && typeof obj.postPlanId === 'string';
        }

        if (!isContentOrchestratorRequest(body)) {
            return handleError({
                status: 400,
                message: "Missing or invalid postPlanId or brandId in request body",
                agentName: "orchestrator",
                traceManager
            });
        }
        // body is now typed
        const { postPlanId, brandId } = body as components["schemas"]["ContentOrchestratorRequest"];
        // Only use input if present on the request type
        const input = ("input" in (body as object) && (body as any).input) ? (body as any).input : {};

        // --- Fetch postPlan ---
        let postPlan: PostPlanDocument | undefined;
        try {
            traceManager.addEvent({
                eventType: "tool-invoke",
                agentName: "orchestrator",
                toolName: "getPostPlan",
                input: { postPlanId }
            });
            const postPlanResult = await getPostPlan({ postPlanId });
            postPlan = postPlanResult?.postPlan;
            traceManager.addEvent({
                eventType: "tool-result",
                agentName: "orchestrator",
                toolName: "getPostPlan",
                output: { postPlan }
            });
            if (!postPlan) {
                return handleError({
                    status: 404,
                    message: "postPlan not found",
                    error: { postPlanId },
                    toolName: "getPostPlan",
                    agentName: "orchestrator",
                    traceManager
                });
            }
        } catch (err) {
            return handleError({
                status: 500,
                message: "Error fetching postPlan",
                error: { details: err, postPlanId },
                toolName: "getPostPlan",
                agentName: "orchestrator",
                traceManager
            });
        }

        // --- Fetch brand ---
        let brand: BrandDocument | undefined;
        try {
            traceManager.addEvent({
                eventType: "tool-invoke",
                agentName: "orchestrator",
                toolName: "getBrand",
                input: { brandId }
            });
            const brandResult = await getBrand({ brandId });
            brand = brandResult?.brand;
            traceManager.addEvent({
                eventType: "tool-result",
                agentName: "orchestrator",
                toolName: "getBrand",
                output: { brand }
            });
            if (!brand) {
                return handleError({
                    status: 404,
                    message: "brand not found",
                    error: { brandId },
                    toolName: "getBrand",
                    agentName: "orchestrator",
                    traceManager
                });
            }
        } catch (err) {
            return handleError({
                status: 500,
                message: "Error fetching brand",
                error: { details: err, brandId },
                toolName: "getBrand",
                agentName: "orchestrator",
                traceManager
            });
        }

        // --- Prepare request for copywriter agent ---
        const copywriterRequest: CopywriterAgentRequest = {
            brandDocument: brand,
            postPlanDocument: postPlan,
            additionalContext: {
                ...input
            }
        };

        // --- Copywriter agent ---
        const modelDeploymentName = process.env.MODEL_DEPLOYMENT_NAME || "gpt-4.1";
        const copywriterAgent = new CopywriterAgent(modelDeploymentName);
        try {
            traceManager.addEvent({
                eventType: "tool-invoke",
                agentName: "copywriter",
                toolName: "generateCopy",
                input: { brand, postPlan }
            });
            await copywriterAgent.init();
        } catch (err) {
            return handleError({
                status: 500,
                message: "Failed to initialize CopywriterAgent",
                error: err,
                toolName: "init",
                agentName: "copywriter",
                traceManager
            });
        }

        let agentResponse: CopywriterAgentResponse | undefined;
        let traceEvents: TraceEvent[] = [];
        let stepError: string | undefined = undefined;
        let stepStartedAt = new Date().toISOString();
        let stepCompletedAt: string | undefined = undefined;
        try {
            context.log("[orchestrateContent] Calling CopywriterAgent.generateCopy with:", JSON.stringify({ brand, postPlan }));
            const result = await copywriterAgent.generateCopy(brand, postPlan, []);
            context.log("[orchestrateContent] Raw agent result:", JSON.stringify(result));
            agentResponse = result?.response;
            if (!agentResponse) {
                context.error("[orchestrateContent] Agent returned null or undefined response:", JSON.stringify(result));
            }
            traceEvents = agentResponse?.traceEvents || [];
            stepCompletedAt = new Date().toISOString();
            traceManager.addEvent({
                eventType: "tool-result",
                agentName: "copywriter",
                toolName: "generateCopy",
                output: { agentResponse, traceEvents },
                timestamp: stepCompletedAt
            });
        } catch (err) {
            stepError = (err as Error)?.message || String(err);
            context.error("[orchestrateContent] Exception thrown by CopywriterAgent.generateCopy:", stepError, err && (err as Error).stack);
            stepCompletedAt = new Date().toISOString();
            traceManager.addEvent({
                eventType: "error",
                agentName: "copywriter",
                toolName: "generateCopy",
                error: { message: stepError, stack: err && (err as Error).stack },
                timestamp: stepCompletedAt
            });
        }

        const step: Step = {
            stepNumber: 1,
            agentType: "copywriter",
            input: copywriterRequest,
            output: agentResponse,
            status: agentResponse?.status === "success" ? "completed" : "failed",
            startedAt: stepStartedAt,
            completedAt: stepCompletedAt,
            error: stepError
        };

        // --- Create post ---
        let postCopy: any = undefined;
        if (agentResponse && typeof agentResponse === 'object') {
            postCopy = agentResponse.postCopy;
        }
        if (!postCopy) {
            context.error("[orchestrateContent] No postCopy returned from agent. agentResponse:", JSON.stringify(agentResponse));
            return handleError({
                status: 500,
                message: "No postCopy returned from agent",
                error: agentResponse?.error || agentResponse,
                toolName: "createPost",
                agentName: "orchestrator",
                traceManager
            });
        }

        let postResponse;
        try {
            traceManager.addEvent({
                eventType: "tool-invoke",
                agentName: "orchestrator",
                toolName: "createPost",
                input: { brandId, postCopy }
            });
            postResponse = await createPost({ brandId, postCopy });
            traceManager.addEvent({
                eventType: "tool-result",
                agentName: "orchestrator",
                toolName: "createPost",
                output: { postResponse }
            });
        } catch (err) {
            return handleError({
                status: 500,
                message: "Failed to create post",
                error: err,
                toolName: "createPost",
                agentName: "orchestrator",
                traceManager
            });
        }

        // --- Build AgentRunTrace ---
        if (step.status === "completed") {
          traceManager.succeed();
        } else {
          traceManager.status = "failed";
          traceManager.end();
        }

        // --- Build agentRunsDocument ---
        const agentRun = traceManager.buildAgentRun();

        // --- Store run trace in agentRuns container ---
        try {
            const agentRunsContainer = getAgentRunsContainer();
            await agentRunsContainer.items.create(agentRun);
            context.log(`[orchestrateContent] Run trace stored in agentRuns container: ${traceRunId}`);
        } catch (err) {
            context.error(`[orchestrateContent] Failed to store run trace: ${traceRunId}` , err);
        }

        // --- Return orchestrator response ---
        const orchestratorResponse: components["schemas"]["ContentOrchestratorResponse"] & { traceEvents?: TraceEvent[] } = {
            runId: traceRunId,
            status: step.status === "completed" ? "completed" : "failed",
            result: {
                postCopy,
                post: postResponse
            },
            error: step.status === "failed" && agentResponse?.error ? { message: agentResponse.error } : undefined,
            traceEvents
        };
        return {
            status: 200,
            jsonBody: orchestratorResponse
        };
        }

// Register the function with Azure Functions v4 programming model
app.http("orchestrateContent", {
    methods: ["POST"],
    authLevel: "function",
    handler: orchestrateContent,
});