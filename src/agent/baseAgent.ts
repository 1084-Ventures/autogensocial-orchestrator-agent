// BaseAgent: Abstract class for common agent logic
// Provides agentId management, instruction handling, and logging utilities
import { AgentsClient } from "@azure/ai-agents";
import { DefaultAzureCredential } from "@azure/identity";
import * as path from "path";
import * as fs from "fs";

export abstract class BaseAgent {
  protected agentId: string;
  protected instructions: string;
  protected functions: Record<string, Function> = {};
  protected agent: any;
  protected client: AgentsClient;
  protected modelDeploymentName: string;
  protected endpoint: string;
  protected agentIdFile: string;
  protected instructionsFile: string;

  /**
   * @param agentId Agent ID (must be provided by SDK/Foundry)
   * @param instructions Initial agent instructions.
   */
  constructor(modelDeploymentName: string, agentIdFile: string, instructionsFile: string, endpointEnvVar: string = "PROJECT_ENDPOINT") {
    const endpoint = process.env[endpointEnvVar];
    if (!endpoint) throw new Error(`Missing ${endpointEnvVar} environment variable`);
    this.endpoint = endpoint;
    this.client = new AgentsClient(endpoint, new DefaultAzureCredential());
    this.modelDeploymentName = modelDeploymentName;
    this.agentIdFile = agentIdFile;
    this.instructionsFile = instructionsFile;
    // Load agentId and instructions from file (or fallback)
    let agentId = "";
    if (fs.existsSync(this.agentIdFile)) {
      try {
        agentId = fs.readFileSync(this.agentIdFile, "utf8").trim();
      } catch (err) {
        // fallback to empty string
      }
    }
    let instructions = "";
    try {
      instructions = fs.readFileSync(this.instructionsFile, "utf8").trim();
    } catch (err) {
      instructions = "You are an expert social media agent.";
    }
    if (!this.isValidAgentId(agentId)) {
      this.agentId = "";
    } else {
      this.agentId = agentId;
    }
    this.instructions = instructions;
    this.logInfo(`Initialized agent with ID: ${this.agentId}`);
  }

  /**
   * Loads or creates the agent, updates instructions if needed, and persists agentId.
   * Accepts agentConfig for agent-specific config (e.g., name, tools).
   */
  async initAgent(agentConfig: { name: string; tools: any[] }): Promise<void> {
    // Try to load existing agent
    if (this.agentId) {
      try {
        this.agent = await this.client.getAgent(this.agentId);
        if (this.agent) {
          // Update instructions if changed
          if (this.agent.instructions !== this.instructions) {
            await this.client.updateAgent(this.agent.id, {
              instructions: this.instructions,
              tools: agentConfig.tools
            });
            this.agent = await this.client.getAgent(this.agentId);
            this.logInfo("Agent instructions updated.");
          }
          return;
        }
      } catch (err) {
        this.logWarn("Could not load existing agent by ID, will create new agent.", { error: err });
      }
    }
    // Create new agent and persist its ID
    this.agent = await this.client.createAgent(this.modelDeploymentName, {
      name: agentConfig.name,
      instructions: this.instructions,
      tools: agentConfig.tools
    });
    if (this.agent && this.agent.id) {
      try {
        fs.writeFileSync(this.agentIdFile, this.agent.id, "utf8");
        this.setAgentId(this.agent.id);
      } catch (err) {
        this.logWarn("Could not write agent ID file:", { error: err });
      }
    }
  }

  /**
   * Returns the current agent ID.
   */
  getAgentId(): string {
    return this.agentId;
  }

  /**
   * Sets a new agent ID if valid.
   */
  setAgentId(newId: string): void {
    if (this.isValidAgentId(newId)) {
      this.agentId = newId;
      this.logInfo(`Agent ID updated to: ${newId}`);
    } else {
      this.logWarn(`Attempted to set invalid agent ID: ${newId}`);
    }
  }

  /**
   * Checks if the agent ID is valid (override for custom validation).
   */
  protected isValidAgentId(id: string): boolean {
    // Default: check for non-empty string, can be overridden
    return typeof id === "string" && id.length > 0;
  }


  /**
   * Returns the current agent instructions.
   */
  getInstructions(): string {
    return this.instructions;
  }

  /**
   * Returns the current function definitions.
   */
  getFunctions(): Record<string, Function> {
    return this.functions;
  }

  /**
   * Updates the agent's function definitions if new or changed functions are provided.
   * Only updates and logs if there are new or changed functions.
   */
  updateFunctions(newFunctions: Record<string, Function>): void {
    const currentKeys = Object.keys(this.functions);
    const newKeys = Object.keys(newFunctions);
    const added = newKeys.filter(k => !currentKeys.includes(k));
    const changed = newKeys.filter(k => currentKeys.includes(k) && this.functions[k] !== newFunctions[k]);
    if (added.length > 0 || changed.length > 0) {
      this.functions = { ...this.functions, ...newFunctions };
      this.logInfo(`Agent functions updated. Added: [${added.join(", ")}], Changed: [${changed.join(", ")}]`);
    } else {
      this.logInfo('Agent functions unchanged; no update performed.');
    }
  }

  /**
   * Updates the agent instructions only if they have changed.
   */
  updateInstructions(newInstructions: string): void {
    if (this.instructions !== newInstructions) {
      this.instructions = newInstructions;
      this.logInfo('Agent instructions updated.');
    } else {
      this.logInfo('Agent instructions unchanged; no update performed.');
    }
  }

  /**
   * Enhanced logging utilities with timestamp and structured output.
   */
  protected logInfo(message: string, meta?: Record<string, unknown>): void {
    this.logWithLevel('INFO', message, meta);
  }

  protected logWarn(message: string, meta?: Record<string, unknown>): void {
    this.logWithLevel('WARN', message, meta);
  }

  protected logError(message: string, error?: unknown, meta?: Record<string, unknown>): void {
    this.logWithLevel('ERROR', message, meta);
    if (error) {
      // Print error stack or object
      if (error instanceof Error) {
        console.error(error.stack);
      } else {
        console.error(error);
      }
    }
  }

  /**
   * Internal log formatter for all log levels.
   */
  private logWithLevel(level: 'INFO' | 'WARN' | 'ERROR', message: string, meta?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    const base = `[${timestamp}] [${level}] [${this.agentId}] ${message}`;
    if (meta && Object.keys(meta).length > 0) {
      console[level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'info'](base, meta);
    } else {
      console[level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'info'](base);
    }
  }

  /**
   * Logs a tool call with its name, parameters, and result (if available).
   */
  protected logToolCall(toolName: string, params: any, result?: any, error?: any): void {
    const meta: Record<string, unknown> = { params };
    if (result !== undefined) meta.result = result;
    if (error !== undefined) meta.error = error;
    this.logInfo(`[TOOL CALL] ${toolName}`, meta);
  }

  /**
   * Logs the latest assistant message (agent reasoning/thoughts) from a thread.
   * Call this after each run step or after submitting tool outputs.
   */
  protected async logAgentReasoning(threadId: string): Promise<void> {
    try {
      const messages = [];
      for await (const m of this.client.messages.list(threadId)) {
        messages.push(m);
      }
      // Find the latest assistant message
      const lastAssistantMsg = messages.reverse().find(m => m.role === "assistant");
      if (lastAssistantMsg) {
        const text = lastAssistantMsg.content?.[0]?.text?.value || JSON.stringify(lastAssistantMsg.content);
        this.logInfo(`[Agent Reasoning] ${text}`);
      }
    } catch (err) {
      this.logWarn("Failed to log agent reasoning", { error: err });
    }
  }
  /**
   * Runs the agent autonomously: handles tool calls and submits outputs until the run is complete.
   * Returns the last assistant message content.
   * Usage: await this.runAgentAutonomously(threadId, this.agent.id, agentToolMap)
   */
  protected async runAgentAutonomously(threadId: string, agentId: string, toolMap: Record<string, { execute: Function }>): Promise<any> {
    let run;
    try {
      this.logInfo("[runAgentAutonomously] Creating agent run", { threadId, agentId });
      run = await this.client.runs.create(threadId, agentId);
    } catch (err) {
      this.logError("[runAgentAutonomously] Error creating agent run:", { error: err });
      throw err;
    }
    this.logInfo("[runAgentAutonomously] Initial run status:", { status: run.status, run });
    while (run.status !== "completed" && run.status !== "failed" && run.status !== "cancelled") {
      if (
        run.requiredAction &&
        run.requiredAction.type === "submit_tool_outputs" &&
        "submitToolOutputs" in run.requiredAction
      ) {
        const toolCalls = (run.requiredAction as any).submitToolOutputs.toolCalls;
        if (!toolCalls) throw new Error("Tool calls not found in requiredAction.submitToolOutputs");
        this.logInfo(`[runAgentAutonomously] Tool calls required: ${toolCalls.length}`);
        const outputs = await Promise.all(
          toolCalls.map(async (toolCall: any) => {
            const params = typeof toolCall.function.arguments === "string"
              ? JSON.parse(toolCall.function.arguments)
              : toolCall.function.arguments;
            const toolObj = toolMap[toolCall.function.name];
            let result;
            try {
              this.logInfo(`[runAgentAutonomously] Executing tool: ${toolCall.function.name}`, { params });
              result = await toolObj.execute(params);
              this.logInfo(`[runAgentAutonomously] Tool result: ${toolCall.function.name}`, { result });
            } catch (error) {
              this.logError(`[runAgentAutonomously] Tool error: ${toolCall.function.name}`, error, { params });
              result = { error: error instanceof Error ? error.message : String(error) };
            }
            this.logInfo(`Planned action: ${toolCall.function.name}, Params: ${JSON.stringify(params)}`);
            return { toolCallId: toolCall.id, output: JSON.stringify(result) };
          })
        );
        this.logInfo(`[runAgentAutonomously] Submitting tool outputs`, { outputs });
        await this.client.runs.submitToolOutputs(threadId, run.id, outputs);
      }
      try {
        run = await this.client.runs.get(threadId, run.id);
      } catch (err) {
        this.logError("[runAgentAutonomously] Error getting agent run status:", { error: err });
        throw err;
      }
      this.logInfo("[runAgentAutonomously] Polled run status:", { status: run.status, run });
    }
    if (run.status === "failed" || run.status === "cancelled") {
      this.logError("[runAgentAutonomously] Agent run failed or was cancelled:", { status: run.status, run });
    }
    // Extract the agent's response
    const messages = [];
    for await (const m of this.client.messages.list(threadId)) {
      this.logInfo(`[runAgentAutonomously] Thread message`, { id: m.id, role: m.role, content: m.content });
      messages.push(m);
    }
    // Log all assistant messages and their content for debugging
    const assistantMessages = messages.filter(m => m.role === "assistant");
    this.logInfo("[runAgentAutonomously] All assistant messages:", { assistantMessages: assistantMessages.map(m => ({ id: m.id, content: m.content })) });
    // Return the last assistant message as the result
    return messages.reverse().find(m => m.role === "assistant")?.content;
  }
}