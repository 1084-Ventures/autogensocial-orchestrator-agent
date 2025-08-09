import { getBrandsContainer } from "../clients/cosmosClient";
import { components } from "../generated/v2/models";

/**
 * Get a brand document by brandId from CosmosDB, including accounts and style guide.
 */
export async function getBrand(args: { brandId: string }): Promise<components["schemas"]["GetBrandByIdResponse"]> {
	const container = getBrandsContainer();
	try {
		const { resource } = await container.item(args.brandId, args.brandId).read<components["schemas"]["BrandDocument"]>();
		if (!resource) {
			throw new Error("Brand not found");
		}
		return { brand: resource };
	} catch (err: any) {
		throw new Error(`Failed to fetch brand: ${err.message}`);
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
	execute: getBrand
};
