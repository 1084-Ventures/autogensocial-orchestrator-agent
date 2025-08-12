import { ToolUtility } from "@azure/ai-agents";
import { getBrandTool } from "../tools/getBrandTool";
import { createPostTool } from "../tools/createPostTool";
import { getPostPlanTool } from "../tools/getPostPlanTool";
import { updatePostTool } from "../tools/updatePostTool";

export const agentToolDefinitions = [
  ToolUtility.createFunctionTool(getBrandTool).definition,
  ToolUtility.createFunctionTool(getPostPlanTool).definition,
  ToolUtility.createFunctionTool(createPostTool).definition,
  ToolUtility.createFunctionTool(updatePostTool).definition,
];

export const agentToolMap = {
  getBrand: getBrandTool,
  getPostPlan: getPostPlanTool,
  createPost: createPostTool,
  updatePost: updatePostTool,
};