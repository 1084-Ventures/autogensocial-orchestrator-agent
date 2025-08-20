import { components } from "../generated/v2/models";

type TraceEvent = components["schemas"]["TraceEvent"];
type AgentRunTrace = components["schemas"]["AgentRunTrace"];
type AgentRunsDocument = components["schemas"]["agentRunsDocument"];

export type TraceStatus = AgentRunTrace["status"];

export class TraceManager {
	public events: TraceEvent[] = [];
	public runId: string;
	public agentName: string;
	public status: TraceStatus = "running";
	public startedAt: string;
	public endedAt?: string;

	constructor(runId: string, agentName: string) {
		this.runId = runId;
		this.agentName = agentName;
		this.startedAt = new Date().toISOString();
		this.addEvent({
			eventType: "start",
			metadata: {},
			agentName: this.agentName,
		});
	}

	addEvent({
		eventType,
		toolName = null,
		input = null,
		output = null,
		error = null,
		metadata = null,
		timestamp = undefined,
		agentName = undefined
	}: {
		eventType: TraceEvent["eventType"];
		toolName?: string | null;
		input?: Record<string, unknown> | null;
		output?: Record<string, unknown> | null;
		error?: Record<string, unknown> | null;
		metadata?: Record<string, unknown> | null;
		timestamp?: string;
		agentName?: string;
	}) {
		const event: TraceEvent = {
			runId: this.runId,
			timestamp: timestamp || new Date().toISOString(),
			eventType,
			agentName: agentName || this.agentName,
			toolName: toolName ?? null,
			input: input ?? null,
			output: output ?? null,
			error: error ?? null,
			metadata: metadata ?? null
		};
		this.events.push(event);
	}

	fail(errorEvent: Partial<TraceEvent> & { error: any }) {
		this.status = "failed";
		this.endedAt = new Date().toISOString();
		this.addEvent({
			eventType: "error",
			error: typeof errorEvent.error === "object" ? errorEvent.error : { message: String(errorEvent.error) },
			toolName: errorEvent.toolName,
			agentName: errorEvent.agentName,
			metadata: errorEvent.metadata
		});
		this.end();
	}

	succeed(metadata?: Record<string, unknown>) {
		this.status = "succeeded";
		this.endedAt = new Date().toISOString();
		this.end(metadata);
	}

	end(metadata?: Record<string, unknown>) {
		this.endedAt = this.endedAt || new Date().toISOString();
		this.addEvent({
			eventType: "end",
			metadata: { ...metadata, status: this.status },
			agentName: this.agentName,
			timestamp: this.endedAt
		});
	}

	buildAgentRun(brandInfoOnly = false): AgentRunsDocument | AgentRunTrace {
		const now = new Date().toISOString();
		const base = {
			runId: this.runId,
			agentName: this.agentName,
			events: this.events,
			startedAt: this.startedAt,
			endedAt: this.endedAt,
			status: this.status
		};
		if (brandInfoOnly) {
			return base;
		}
		return {
			id: this.runId,
			metadata: {
				createdDate: now,
				updatedDate: now,
				isActive: true
			},
			brandInfo: base
		};
	}
}

// For compatibility: createTraceEvent for legacy code
export function createTraceEvent({
	runId,
	timestamp = new Date().toISOString(),
	eventType,
	agentName,
	toolName = null,
	input = null,
	output = null,
	error = null,
	metadata = null
}: {
	runId: string;
	timestamp?: string;
	eventType: TraceEvent["eventType"];
	agentName: string;
	toolName?: string | null;
	input?: Record<string, unknown> | null;
	output?: Record<string, unknown> | null;
	error?: Record<string, unknown> | null;
	metadata?: Record<string, unknown> | null;
}): TraceEvent {
	return {
		runId,
		timestamp,
		eventType,
		agentName,
		toolName: toolName ?? null,
		input: input ?? null,
		output: output ?? null,
		error: error ?? null,
		metadata: metadata ?? null
	};
}
