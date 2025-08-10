import { getBrandTool } from "../tools/getBrandTool";
import { createPostTool } from "../tools/createPostTool"
import { getPostPlanTool } from "../tools/getPostPlanTool";

export const agentTools = [
  getBrandTool,
  getPostPlanTool,
  createPostTool
];
