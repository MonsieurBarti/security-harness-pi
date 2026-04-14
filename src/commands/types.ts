export type NotifyLevel = "info" | "warning" | "error";

export interface UiCtx {
	ui: {
		notify: (msg: string, level?: NotifyLevel) => void;
	};
}

export interface Command {
	description: string;
	handler: (args: string[], ctx: UiCtx) => Promise<void>;
}
