import { InvocationContext } from "@azure/functions";
import { TraceManager } from "./traceUtils";

// Standard error response utility
export function errorResponse(
	context: InvocationContext,
	status: number,
	message: string,
	error?: unknown,
	details?: Record<string, unknown>
): { status: number; jsonBody: any } {
	context.error(`[orchestrateContent] Error: ${message}`, error);
	return {
		status,
		jsonBody: {
			error: {
				message,
				details,
				raw: error ? (typeof error === 'object' ? error : { error }) : undefined
			}
		}
	};
}

// Centralized error handler for trace + response
export function makeHandleError(context: InvocationContext) {
	return function handleError({
		status,
		message,
		error,
		toolName,
		agentName = "orchestrator",
		traceManager
	}: {
		status: number;
		message: string;
		error?: unknown;
		toolName?: string;
		agentName?: string;
		traceManager: TraceManager;
	}) {
		traceManager.fail({
			error: { message, details: error },
			toolName,
			agentName
		});
		return errorResponse(context, status, message, error);
	};
}
