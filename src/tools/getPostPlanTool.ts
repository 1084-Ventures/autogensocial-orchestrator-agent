import { getPostPlansContainer } from "../clients/cosmosClient";
import { components } from "../generated/v2/models";

/**
 * Get a post plan document by postPlanId from CosmosDB.
 */
export async function getPostPlan(args: { postPlanId: string }): Promise<components["schemas"]["GetPostPlanByIdResponse"]> {
    console.log('[getPostPlanTool] getPostPlan function INVOKED with args:', args);
    const container = getPostPlansContainer();
    try {
        console.log(`[getPostPlanTool] Fetching post plan with postPlanId: ${args.postPlanId}`);
        // Query by 'id' field for best practice
        const querySpec = {
            query: "SELECT * FROM c WHERE c.id = @id",
            parameters: [{ name: "@id", value: args.postPlanId }]
        };
        console.log(`[getPostPlanTool] QuerySpec:`, JSON.stringify(querySpec));
        const { resources } = await container.items.query(querySpec).fetchAll();
        console.log(`[getPostPlanTool] Query result resources:`, JSON.stringify(resources));
        if (!resources || resources.length === 0) {
            console.error(`[getPostPlanTool] Post plan not found for postPlanId: ${args.postPlanId}`);
            console.log('[getPostPlanTool] Returning: { postPlan: null }');
            return { postPlan: null };
        }
        console.log(`[getPostPlanTool] Returning post plan:`, JSON.stringify(resources[0]));
        console.log('[getPostPlanTool] Returning:', { postPlan: resources[0] });
        return { postPlan: resources[0] };
    } catch (err: any) {
        console.error(`[getPostPlanTool] Error fetching post plan:`, err);
        console.log('[getPostPlanTool] Returning: { postPlan: null } due to error');
        return { postPlan: null };
    }
}

// Tool definition for agent registration
export const getPostPlanTool = {
    name: "getPostPlan",
    description: "Retrieve a post plan document by postPlanId.",
    parameters: {
        type: "object",
        properties: {
            brandId: { type: "string", description: "Unique identifier for the brand." }
        },
        required: ["brandId"]
    },
    execute: async (args: { postPlanId: string }) => {
        console.log('[getPostPlanTool] execute INVOKED with args:', args);
        return await getPostPlan(args);
    },
};