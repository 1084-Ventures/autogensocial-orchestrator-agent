import { getPostsContainer } from "../shared/cosmosClient";
import { components } from "../generated/v2/models";
import util from "util";

// Tool definition strictly following OpenAPI contract
export async function createPost(args: {
  brandId: string;
  postCopy: components["schemas"]["postCopy"];
}): Promise<components["schemas"]["postResponse"]> {
  // Basic required field check
  if (!args.brandId) {
    console.error("[createPostTool] Missing brandId");
    throw new Error("Missing required field: brandId");
  }
  if (!args.postCopy) {
    console.error("[createPostTool] Missing postCopy");
    throw new Error("Missing required field: postCopy");
  }
  // Logging input
  console.log("[createPostTool] Creating post with args:", util.inspect(args, { depth: 4 }));
  const container = getPostsContainer();
  const postDoc: Partial<components["schemas"]["postResponse"]> = {
    brandId: args.brandId,
    postCopy: args.postCopy,
    status: "draft",
  };
  try {
    const { resource } = await container.items.create(postDoc);
    if (!resource) {
      console.error("[createPostTool] Failed to create post document");
      throw new Error("Failed to create post document");
    }
    console.log("[createPostTool] Post created successfully:", util.inspect(resource, { depth: 4 }));
    return resource as components["schemas"]["postResponse"];
  } catch (err) {
    console.error("[createPostTool] Error creating post:", err);
    throw err;
  }
}

export const createPostTool = {
  name: "createPost",
  description: "Create a new post document in the database after generating postCopy.",
  parameters: {
    type: "object",
    properties: {
      brandId: { type: "string", description: "Unique identifier for the brand." },
      postCopy: { type: "object", description: "Generated post copy object." },
    },
    required: ["brandId", "postCopy"],
  },
  execute: createPost,
};
