import { getPostsContainer } from "../clients/cosmosClient";
import { components } from "../generated/v2/models";

// Tool definition strictly following OpenAPI contract
export async function createPost(args: {
  brandId: string;
  postCopy: components["schemas"]["postCopy"];
}): Promise<components["schemas"]["postResponse"]> {
  // Validate required fields
  if (!args.brandId || typeof args.brandId !== "string") {
    throw new Error("Missing or invalid required field: brandId");
  }
  if (!args.postCopy || typeof args.postCopy !== "object") {
    throw new Error("Missing or invalid required field: postCopy");
  }
  // Validate postCopy fields according to spec
    const { content, comment, hashtags } = args.postCopy;
    if (typeof content !== "string" || !content) {
      throw new Error("postCopy.content is required and must be a non-empty string");
    }
    if (typeof comment !== "string" || !comment) {
      throw new Error("postCopy.comment is required and must be a non-empty string");
    }
    if (!Array.isArray(hashtags) || hashtags.length === 0) {
      throw new Error("postCopy.hashtags is required and must be a non-empty array of strings");
    }
    for (const tag of hashtags) {
      if (typeof tag !== "string" || !tag) {
        throw new Error("Each hashtag in postCopy.hashtags must be a non-empty string");
      }
  }
  const container = getPostsContainer();
  const postDoc: Partial<components["schemas"]["postResponse"]> = {
    brandId: args.brandId,
    postCopy: args.postCopy,
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
      postCopy: { type: "object", description: "Generated post copy object." },
    },
    required: ["brandId", "postCopy"],
  },
  execute: createPost,
};
