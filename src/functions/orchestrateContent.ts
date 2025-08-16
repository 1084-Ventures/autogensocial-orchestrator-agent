import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { getBrand } from "../tools/getBrandTool";
import { getPostPlan } from "../tools/getPostPlanTool";
import { getPosts } from "../tools/getPostsTool";
import { createPost } from "../tools/createPostTool";
import fs from "fs";
import path from "path";
import { CopywriterAgent } from "../agent/copywriterAgent";
import { components } from "../generated/v2/models";

// Helper to dispatch tool calls by name
async function callToolByName(toolName: string, parameters: any) {
    switch (toolName) {
        case "getBrand":
            return await getBrand(parameters);
        case "getPostPlan":
            return await getPostPlan(parameters);
        case "getPosts":
            return await getPosts(parameters);
        default:
            throw new Error(`Unknown tool: ${toolName}`);
    }
}

/**
 * Helper to create a structured error response and log the error.
 */
function errorResponse(context: InvocationContext, status: number, message: string, details?: any, extra?: Record<string, any>) {
    context.error(`[orchestrateContent] ERROR: ${message}`, details);
    return {
        status,
        jsonBody: {
            success: false,
            message,
            error: details?.message || details || message,
            ...extra
        }
    };
}

/**
 * Helper to create a structured success response.
 */
function successResponse(message: string, data: Record<string, any> = {}) {
    return {
        status: 200,
        jsonBody: {
            success: true,
            message,
            ...data
        }
    };
}

export async function orchestrateContent(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`[orchestrateContent] Request received for url: ${request.url}`);
    let body: any = undefined;
    try {
        body = await request.json();
        context.log("[orchestrateContent] Request body:", JSON.stringify(body));
    } catch (err) {
        return errorResponse(context, 400, "Invalid JSON in request body", err);
    }

    const { postPlanId, brandId } = body || {};
    if (!postPlanId || !brandId) {
        return errorResponse(context, 400, "Missing postPlanId or brandId in request body");
    }

    // Fetch postPlan and brand using tools
    let postPlan, brand;
    try {
        const postPlanResult = await getPostPlan({ postPlanId });
        postPlan = postPlanResult?.postPlan;
        if (!postPlan) {
            return errorResponse(context, 404, "postPlan not found", undefined, { postPlanId });
        }
        context.log("[orchestrateContent] postPlan fetched");
    } catch (err) {
        return errorResponse(context, 500, "Error fetching postPlan", err, { postPlanId });
    }

    try {
        const brandResult = await getBrand({ brandId });
        brand = brandResult?.brand;
        if (!brand) {
            return errorResponse(context, 404, "brand not found", undefined, { brandId });
        }
        context.log("[orchestrateContent] brand fetched");
    } catch (err) {
        return errorResponse(context, 500, "Error fetching brand", err, { brandId });
    }

    // Fetch previous post comments for this brand (optional, can be used as context)
    let previousPosts: any[] = [];
    try {
        const prev = await getPosts({ brandId, fields: ["postCopy.comment"] });
        previousPosts = prev?.posts || [];
        context.log(`[orchestrateContent] Found ${previousPosts.length} previous post comments for brandId ${brandId}`);
    } catch (err) {
        context.error(`[orchestrateContent] Failed to fetch previous posts for brandId ${brandId}`, err);
    }

    // Use local CopywriterAgent class to orchestrate agent creation/update and run
    const modelDeploymentName = process.env.MODEL_DEPLOYMENT_NAME || "gpt-4.1";
    const copywriterAgent = new CopywriterAgent(modelDeploymentName);
    try {
        await copywriterAgent.init();
    } catch (err) {
        return errorResponse(context, 500, "Failed to initialize CopywriterAgent", err);
    }

    // Run the agent to generate post copy
    let agentOutput;
    try {
        agentOutput = await copywriterAgent.generateCopy(brand, postPlan);
    } catch (err) {
        return errorResponse(context, 500, "Error running copywriter agent", err);
    }

    // Extract postCopy from agent output
    let postCopy: components["schemas"]["postCopy"] | undefined;
    let outputMessages = agentOutput;
    let output = null;
    if (Array.isArray(agentOutput)) {
        // If agentOutput is a list of messages, find the last assistant message
        const lastAssistantMsg = [...agentOutput].reverse().find(m => m.role === "assistant");
        output = lastAssistantMsg?.content?.[0]?.text?.value || lastAssistantMsg?.content || null;
    } else if (typeof agentOutput === "string" || typeof agentOutput === "object") {
        output = agentOutput;
    }
    if (output) {
        context.log("[orchestrateContent] Raw agent output:", output);
        try {
            const parsed = typeof output === "string" ? JSON.parse(output) : output;
            // Extract postCopy from output.payload.postCopy if present
            postCopy = parsed?.payload?.postCopy ?? parsed?.postCopy ?? parsed;
        } catch (err) {
            context.error("[orchestrateContent] Failed to parse agent output as postCopy", err);
            // Fallback: try to extract first JSON object from output string
            if (typeof output === "string") {
                const jsonMatch = output.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    try {
                        const parsed = JSON.parse(jsonMatch[0]);
                        postCopy = parsed?.payload?.postCopy ?? parsed?.postCopy ?? parsed;
                        context.log("[orchestrateContent] Fallback JSON extraction succeeded.");
                    } catch (fallbackErr) {
                        context.error("[orchestrateContent] Fallback JSON extraction failed", fallbackErr);
                    }
                }
            }
        }
    }
    if (!postCopy) {
        return errorResponse(context, 500, "No postCopy returned from agent");
    }

    // Call createPost tool with only the postCopy object
    let postResponse;
    try {
        postResponse = await createPost({ brandId, postCopy });
        context.log("[orchestrateContent] Post created successfully", postResponse);
    } catch (err) {
        return errorResponse(context, 500, "Failed to create post", err);
    }

    // Return both agent output and post creation result
    return successResponse("Agent run completed and post created.", {
        output,
        post: postResponse,
        allMessages: outputMessages,
        previousPostsCount: previousPosts.length
    });
}

app.http('orchestrateContent', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: orchestrateContent
});
