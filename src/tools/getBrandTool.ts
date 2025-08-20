import { getBrandsContainer } from "../shared/cosmosClient";
import { components } from "../generated/v2/models";

/**
 * Get a brand document by brandId from CosmosDB, including accounts and style guide.
 */
export async function getBrand(args: { brandId: string }): Promise<components["schemas"]["GetBrandByIdResponse"]> {
	console.log('[getBrandTool] getBrand function INVOKED with args:', args);
	const container = getBrandsContainer();
	try {
		console.log(`[getBrandTool] Fetching brand with brandId: ${args.brandId}`);
		// Query by 'id' field for best practice
		const querySpec = {
			query: "SELECT * FROM c WHERE c.id = @id",
			parameters: [{ name: "@id", value: args.brandId }]
		};
		console.log(`[getBrandTool] QuerySpec:`, JSON.stringify(querySpec));
		const { resources } = await container.items.query(querySpec).fetchAll();
		console.log(`[getBrandTool] Query result resources:`, JSON.stringify(resources));
		if (!resources || resources.length === 0) {
			console.error(`[getBrandTool] Brand not found for brandId: ${args.brandId}`);
			console.log('[getBrandTool] Returning: { brand: null }');
			return { brand: null };
		}
		console.log(`[getBrandTool] Returning brand:`, JSON.stringify(resources[0]));
		console.log('[getBrandTool] Returning:', { brand: resources[0] });
		return { brand: resources[0] };
	} catch (err: any) {
		console.error(`[getBrandTool] Error fetching brand:`, err);
		console.log('[getBrandTool] Returning: { brand: null } due to error');
		return { brand: null };
	}
}

// Tool definition for agent registration
export const getBrandTool = {
	name: "getBrand",
	description: "Retrieve a brand document by brandId, including accounts and style guide.",
	parameters: {
		type: "object",
		properties: {
			brandId: { type: "string", description: "Unique identifier for the brand." }
		},
		required: ["brandId"]
	},
	execute: async (args: { brandId: string }) => {
		console.log('[getBrandTool] execute INVOKED with args:', args);
		return await getBrand(args);
	},
};
