// BaseAgent: Abstract class for common agent logic
// Provides agentId management, instruction handling, and logging utilities

export abstract class BaseAgent {
  protected agentId: string;
  protected instructions: string;

  constructor(agentId: string, instructions: string) {
    this.agentId = agentId;
    this.instructions = instructions;
  }

  getAgentId(): string {
    return this.agentId;
  }

  setAgentId(newId: string): void {
    this.agentId = newId;
    this.logInfo(`Agent ID updated to: ${newId}`);
  }

  getInstructions(): string {
    return this.instructions;
  }

  updateInstructions(newInstructions: string): void {
    this.instructions = newInstructions;
    this.logInfo('Agent instructions updated.');
  }

  logInfo(message: string): void {
    // Replace with a more robust logger if needed
    console.info(`[INFO] [${this.agentId}] ${message}`);
  }

  logWarn(message: string): void {
    console.warn(`[WARN] [${this.agentId}] ${message}`);
  }

  logError(message: string, error?: unknown): void {
    console.error(`[ERROR] [${this.agentId}] ${message}`);
    if (error) {
      console.error(error);
    }
  }
}
