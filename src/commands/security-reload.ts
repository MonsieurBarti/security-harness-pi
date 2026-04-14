interface UiCtx {
	ui: { notify: (msg: string, level?: string) => void };
}

type Reload = () => Promise<{ warnings: string[] }>;

export interface Command {
	description: string;
	handler: (args: string[], ctx: UiCtx) => Promise<void>;
}

export function makeReloadCommand(reload: Reload): Command {
	return {
		description: "Reload security-harness configuration",
		handler: async (_args, ctx) => {
			try {
				const { warnings } = await reload();
				if (warnings.length) {
					ctx.ui.notify(
						`security-harness reloaded with warnings:\n${warnings.map((w) => `  - ${w}`).join("\n")}`,
						"warning",
					);
				} else {
					ctx.ui.notify("security-harness reloaded.", "info");
				}
			} catch (e) {
				ctx.ui.notify(
					`security-harness reload failed: ${(e as Error).message}. Prior config kept.`,
					"error",
				);
			}
		},
	};
}
