export interface LogEntry {
	ts: string;
	toolName: string;
	verdict: "forbid" | "ask-allowed" | "ask-denied" | "allow";
	ruleId?: string;
	description?: string;
	input: string;
	userChoice?: "yes" | "no" | "timeout";
	uiAvailable?: boolean;
}

interface PiAppend {
	appendEntry: (name: string, data: unknown) => void;
}

export class SessionLog {
	private buffer: LogEntry[] = [];

	constructor(
		private pi: PiAppend,
		private max = 500,
	) {}

	record(e: Omit<LogEntry, "ts">): void {
		const entry: LogEntry = { ts: new Date().toISOString(), ...e };
		this.buffer.push(entry);
		if (this.buffer.length > this.max) this.buffer.shift();
		try {
			this.pi.appendEntry("security-harness", entry);
		} catch {
			// non-fatal
		}
	}

	recent(n: number): LogEntry[] {
		return this.buffer.slice(-n);
	}
}
