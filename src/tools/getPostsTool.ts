import { getPostsContainer } from "../clients/cosmosClient";
import { components } from "../generated/v2/models";

export async function getPosts(args: {
	brandId: string;
	postPlanId?: string;
	fields?: string[];
	limit?: number;
}): Promise<components["schemas"]["getPostsResponse"]> {
	console.debug("[getPostsTool] called with args:", JSON.stringify(args));
	if (!args.brandId) throw new Error("brandId is required");
	const container = getPostsContainer();
	let query = "SELECT * FROM c WHERE c.brandId = @brandId";
	const parameters: any[] = [{ name: "@brandId", value: args.brandId }];
	if (args.postPlanId) {
		query += " AND c.postPlanId = @postPlanId";
		parameters.push({ name: "@postPlanId", value: args.postPlanId });
	}
	console.debug("[getPostsTool] Cosmos query:", query, parameters);
	const querySpec = { query, parameters };
	const { resources } = await container.items.query(querySpec).fetchAll();
	console.debug(`[getPostsTool] resources fetched:`, JSON.stringify(resources));
	let posts = resources;
	// Helper to get nested value by dot notation
	function getNestedValue(obj: any, path: string): any {
		return path.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), obj);
	}

	if (args.fields && args.fields.length > 0) {
		posts = resources.map((post: any) => {
			const projected: any = {};
			args.fields!.forEach(field => {
				const value = getNestedValue(post, field);
				if (value !== undefined) {
					// Set nested structure in projected result
					const parts = field.split('.');
					let curr = projected;
					parts.forEach((part, idx) => {
						if (idx === parts.length - 1) {
							curr[part] = value;
						} else {
							if (!curr[part]) curr[part] = {};
							curr = curr[part];
						}
					});
				}
			});
			return projected;
		});
		console.debug(`[getPostsTool] projected posts:`, JSON.stringify(posts));
	}
	console.debug(`[getPostsTool] returning posts:`, JSON.stringify(posts));
	return { posts };
}

export const getPostsTool = {
	name: "getPosts",
	description: "Retrieve posts for a brand (and optional postPlanId), projecting only requested fields.",
	parameters: {
		type: "object",
		properties: {
			brandId: { type: "string", description: "Unique identifier for the brand." },
			postPlanId: { type: "string", description: "Optional post plan ID to filter posts." },
			fields: { type: "array", items: { type: "string" }, description: "Fields to return from each post." },
			limit: { type: "number", description: "Max number of posts to return (not used, returns all)." }
		},
		required: ["brandId"]
	},
	execute: async (args: { brandId: string; postPlanId?: string; fields?: string[]; limit?: number }) => {
		return await getPosts(args);
	},
};
