import { getPostsContainer } from "../clients/cosmosClient";
import { components } from "../generated/v2/models";

// Tool definition strictly following OpenAPI contract
export async function createPost(args: {
  brandId: string;
  contentCopy: components["schemas"]["postCopy"];
}): Promise<components["schemas"]["postResponse"]> {
  const container = getPostsContainer();
  const postDoc: Partial<components["schemas"]["postResponse"]> = {
    brandId: args.brandId,
    contentCopy: args.contentCopy,
    status: "draft",
  };
  const { resource } = await container.items.create(postDoc);
  if (!resource) throw new Error("Failed to create post document");
  return resource as components["schemas"]["postResponse"];
}

export const createPostTool = {
  name: "createPost",
  description: "Create a new post document in the database after generating postCopy.",
  parameters: {
    type: "object",
    properties: {
      brandId: { type: "string", description: "Unique identifier for the brand." },
      contentCopy: { type: "object", description: "Generated post copy object." },
    },
    required: ["brandId", "contentCopy"],
  },
  execute: createPost,
};
