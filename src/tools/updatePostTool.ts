import { getPostsContainer } from "../clients/cosmosClient";
import { components } from "../generated/v2/models";

// Tool definition strictly following OpenAPI contract
export async function updatePost(args: {
  postId: string;
  updateFields: Partial<components["schemas"]["postResponse"]>;
}): Promise<components["schemas"]["postResponse"]> {
  // Validate required fields
  if (!args.postId || typeof args.postId !== "string") {
    throw new Error("Missing or invalid required field: postId");
  }
  if (!args.updateFields || typeof args.updateFields !== "object") {
    throw new Error("Missing or invalid required field: updateFields");
  }
  // Optionally validate updateFields according to your OpenAPI spec
  // For example, if updating postCopy, validate its fields
  if (args.updateFields.postCopy) {
    const { content, comment, hashtags } = args.updateFields.postCopy;
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
  }
  const container = getPostsContainer();
  // Patch the document with the provided fields
  const { resource } = await container.item(args.postId, args.postId).replace(args.updateFields);
  if (!resource) throw new Error("Failed to update post document");
  return resource as components["schemas"]["postResponse"];
}

export const updatePostTool = {
  name: "updatePost",
  description: "Update an existing post document in the database.",
  parameters: {
    type: "object",
    properties: {
      postId: { type: "string", description: "Unique identifier for the post document." },
      updateFields: { type: "object", description: "Fields to update in the post document." },
    },
    required: ["postId", "updateFields"],
  },
  execute: updatePost,
};
