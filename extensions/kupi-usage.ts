import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";

const CREDIT_URL =
  "https://factchat-cloud.mindlogic.ai/v1/gateway/credits/";

const API_KEY_ENV = "KONKUK_AI_API_KEY";

const BAR_WIDTH = 12;

type CreditBalance = {
  object?: string;
  monthly_allocated?: {
    quota: number;
    used: number;
    remaining: number;
    renewal_date?: string;
  };
};

type CreditState = {
  quota: number;
  used: number;
  remaining: number;
  error?: string;
};

export default function (pi: ExtensionAPI) {
  let credits: CreditState | undefined;
  let refreshing = false;

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  function requestRender(ctx: ExtensionContext) {
    if (!ctx.hasUI) return;

    // Trigger a TUI refresh without leaving anything visible.
    ctx.ui.setStatus("kupi-usage-refresh", "");
    ctx.ui.setStatus("kupi-usage-refresh", undefined);
  }

  // ---------------------------------------------------------------------------
  // Credits
  // ---------------------------------------------------------------------------

  async function refreshCredits(ctx: ExtensionContext) {
    if (refreshing) return;

    const apiKey = process.env[API_KEY_ENV];

    if (!apiKey) {
      credits = {
        quota: 0,
        used: 0,
        remaining: 0,
        error: `${API_KEY_ENV} not set`,
      };

      requestRender(ctx);
      return;
    }

    refreshing = true;

    try {
      const response = await fetch(CREDIT_URL, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as CreditBalance;
      const monthly = data.monthly_allocated;

      if (!monthly) {
        throw new Error("monthly_allocated missing");
      }

      credits = {
        quota: monthly.quota,
        used: monthly.used,
        remaining: monthly.remaining,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);

      // Keep the last known good value if refresh temporarily fails.
      if (!credits || credits.error) {
        credits = {
          quota: 0,
          used: 0,
          remaining: 0,
          error: message,
        };
      }
    } finally {
      refreshing = false;
      requestRender(ctx);
    }
  }

  // ---------------------------------------------------------------------------
  // Formatting
  // ---------------------------------------------------------------------------

  function percent(value: number, total: number): number {
    if (
      !Number.isFinite(value) ||
      !Number.isFinite(total) ||
      total <= 0
    ) {
      return 0;
    }

    return Math.max(
      0,
      Math.min(100, (value / total) * 100),
    );
  }

  function progressBar(
      value: number,
      width = BAR_WIDTH,
    ): string {
      const normalized = Math.max(
        0,
        Math.min(100, value),
      );

      const filled = Math.round(
        (normalized / 100) * width,
      );

      return (
        "█".repeat(filled) +
        "░".repeat(width - filled)
      );
    }

  function formatCredits(value: number): string {
    if (value >= 1000) {
      return Math.round(value).toString();
    }

    if (value >= 100) {
      return value.toFixed(0);
    }

    if (value >= 10) {
      return value.toFixed(1);
    }

    return value.toFixed(2);
  }

  function formatTokens(count: number): string {
    if (count < 1000) {
      return count.toString();
    }

    if (count < 10000) {
      return `${(count / 1000).toFixed(1)}k`;
    }

    if (count < 1000000) {
      return `${Math.round(count / 1000)}k`;
    }

    if (count < 10000000) {
      return `${(count / 1000000).toFixed(1)}M`;
    }

    return `${Math.round(count / 1000000)}M`;
  }

  function getSessionUsage(ctx: ExtensionContext): string {
    let totalInput = 0;
    let totalOutput = 0;
    let totalCacheRead = 0;
    let totalCacheWrite = 0;

    for (
      const entry of
        ctx.sessionManager.getEntries()
    ) {
      if (
        entry.type === "message" &&
        entry.message.role === "assistant"
      ) {
        totalInput +=
          entry.message.usage.input;

        totalOutput +=
          entry.message.usage.output;

        totalCacheRead +=
          entry.message.usage.cacheRead;

        totalCacheWrite +=
          entry.message.usage.cacheWrite;
      }
    }

    const parts: string[] = [];

    if (totalInput) {
      parts.push(
        `↑${formatTokens(totalInput)}`,
      );
    }

    if (totalOutput) {
      parts.push(
        `↓${formatTokens(totalOutput)}`,
      );
    }

    if (totalCacheRead) {
      parts.push(
        `R${formatTokens(totalCacheRead)}`,
      );
    }

    if (totalCacheWrite) {
      parts.push(
        `W${formatTokens(totalCacheWrite)}`,
      );
    }

    return parts.join(" ");
  }

  function truncateMiddle(
    value: string,
    maxLength: number,
  ): string {
    if (value.length <= maxLength) {
      return value;
    }

    if (maxLength <= 3) {
      return value.slice(0, maxLength);
    }

    const available = maxLength - 1;
    const left = Math.ceil(available / 2);
    const right = Math.floor(available / 2);

    return (
      value.slice(0, left) +
      "…" +
      value.slice(value.length - right)
    );
  }

  // ---------------------------------------------------------------------------
  // Semantic colors
  // ---------------------------------------------------------------------------

  function usageColor(
    value: number,
  ): "dim" | "warning" | "error" {
    if (value >= 90) {
      return "error";
    }

    if (value >= 70) {
      return "warning";
    }

    return "dim";
  }

  // ---------------------------------------------------------------------------
  // HUD
  // ---------------------------------------------------------------------------

  function getContextParts(ctx: ExtensionContext) {
    const usage = ctx.getContextUsage();
    const contextWindow =
      ctx.model?.contextWindow ?? 0;

    if (!usage || contextWindow <= 0) {
      return {
        prefix: "CTX ",
        value: `${progressBar(0)}   --.-%`,
        percent: 0,
      };
    }

    const usagePercent = percent(
      usage.tokens,
      contextWindow,
    );

    return {
      prefix: "CTX ",
      value:
        `${progressBar(usagePercent)} ` +
        `${usagePercent.toFixed(1).padStart(5)}%`,
      percent: usagePercent,
    };
  }

  function getCreditParts() {
    if (!credits) {
      return {
        prefix: "KU ",
        value:
          `${progressBar(0)}   loading`,
        percent: 0,
        error: false,
      };
    }

    if (credits.error) {
      return {
        prefix: "KU ",
        value:
          `${progressBar(0)}   unavailable`,
        percent: 0,
        error: true,
      };
    }

    const usagePercent = percent(
      credits.used,
      credits.quota,
    );

    return {
      prefix: "KU ",
      value:
        `${progressBar(usagePercent)} ` +
        `${usagePercent.toFixed(1).padStart(5)}%`,
      suffix:
        ` ${formatCredits(credits.used)}/` +
        `${formatCredits(credits.quota)}cr`,
      percent: usagePercent,
      error: false,
    };
  }

  function getModelText(ctx: ExtensionContext): string {
    const provider =
      ctx.model?.provider ?? "unknown";

    const model =
      ctx.model?.id ?? "unknown";

    const thinking =
      pi.getThinkingLevel();

    return (
      `(${provider}) ${model} • ${thinking}`
    );
  }

  // ---------------------------------------------------------------------------
  // Footer
  // ---------------------------------------------------------------------------

  function installFooter(ctx: ExtensionContext) {
    if (!ctx.hasUI) return;

    ctx.ui.setFooter(
      (tui, theme, footerData) => {
        const unsubscribe =
          footerData.onBranchChange(() => {
            tui.requestRender();
          });

        return {
          render(width: number): string[] {
            // ---------------------------------------------------------------
            // Line 1
            // /Users/.../.pi/agent  branch
            // ---------------------------------------------------------------

            const branch =
              footerData.getGitBranch();

            const locationRaw = branch
              ? `${ctx.cwd}  ${branch}`
              : ctx.cwd;

            const usageRaw =
              getSessionUsage(ctx);

            const minimumTopGap = 2;

            let locationVisible =
              locationRaw;

            let usageVisible =
              usageRaw;

            if (usageRaw) {
              const availableLocationWidth =
                width -
                usageRaw.length -
                minimumTopGap;

              if (
                locationRaw.length >
                availableLocationWidth
              ) {
                locationVisible =
                  truncateMiddle(
                    locationRaw,
                    Math.max(
                      8,
                      availableLocationWidth,
                    ),
                  );
              }
            } else if (
              locationRaw.length > width
            ) {
              locationVisible =
                truncateMiddle(
                  locationRaw,
                  width,
                );
            }

            /*
             * If even the token stats themselves
             * cannot fit, keep their right side.
             */
            if (
              usageVisible.length >= width
            ) {
              usageVisible =
                usageVisible.slice(
                  usageVisible.length -
                    width,
                );

              locationVisible = "";
            }

            const topPadding =
              usageVisible
                ? Math.max(
                    minimumTopGap,
                    width -
                      locationVisible.length -
                      usageVisible.length,
                  )
                : 0;

            const locationRendered =
              theme.fg(
                "dim",
                locationVisible,
              );

            const usageRendered =
              theme.fg(
                "dim",
                usageVisible,
              );

            const topLine =
              usageVisible
                ? locationRendered +
                  " ".repeat(topPadding) +
                  usageRendered
                : locationRendered;

            // ---------------------------------------------------------------
            // Line 2
            //
            // CTX █████░░░░░ 50.0%   KU ██░░░░░░░░ 20.0% 600/3000cr
            //                              (provider) model • effort
            // ---------------------------------------------------------------

            const context =
              getContextParts(ctx);

            const credit =
              getCreditParts();

            const contextColor =
              usageColor(context.percent);

            const creditColor =
              credit.error
                ? "error"
                : usageColor(credit.percent);

            /*
             * Build the left side in separately-colored
             * segments.
             */

            const ctxPrefix =
              theme.fg(
                "dim",
                context.prefix,
              );

            const ctxValue =
              theme.fg(
                contextColor,
                context.value,
              );

            const separator =
              theme.fg(
                "dim",
                "   ",
              );

            const kuPrefix =
              theme.fg(
                "dim",
                credit.prefix,
              );

            const kuValue =
              theme.fg(
                creditColor,
                credit.value,
              );

            const kuSuffix =
              theme.fg(
                "dim",
                credit.suffix ?? "",
              );

            const leftRendered =
              ctxPrefix +
              ctxValue +
              separator +
              kuPrefix +
              kuValue +
              kuSuffix;

            /*
             * ANSI escape sequences make .length unusable
             * for alignment, so calculate width using the
             * raw strings.
             */

            const leftRaw =
              context.prefix +
              context.value +
              "   " +
              credit.prefix +
              credit.value +
              (credit.suffix ?? "");

            const modelRaw =
              getModelText(ctx);

            const minimumGap = 1;

            const availableModelWidth =
              width -
              leftRaw.length -
              minimumGap;

            let modelVisible: string;

            if (availableModelWidth >= modelRaw.length) {
              modelVisible = modelRaw;
            } else {
              modelVisible =
                truncateMiddle(
                  modelRaw,
                  Math.max(
                    8,
                    availableModelWidth,
                  ),
                );
            }

            const padding = Math.max(
              minimumGap,
              width -
              leftRaw.length -
              modelVisible.length,
            );

            const modelRendered =
              theme.fg(
                "dim",
                modelVisible,
              );

            const hudLine =
              leftRendered +
              " ".repeat(padding) +
              modelRendered;

            return [
              topLine,
              hudLine,
            ];
          },

          invalidate() {
            tui.requestRender();
          },

          dispose() {
            unsubscribe();
          },
        };
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  pi.on(
    "session_start",
    async (_event, ctx) => {
      installFooter(ctx);
      await refreshCredits(ctx);
    },
  );

  pi.on(
    "model_select",
    async (_event, ctx) => {
      installFooter(ctx);
    },
  );

  pi.on(
    "thinking_level_select",
    async (_event, ctx) => {
      installFooter(ctx);
    },
  );

  // agent_settled 는 최신 pi 에만 있다. 0.73.x 에서는 agent_end 로 같은 갱신을 한다.
  // 두 이벤트가 겹쳐도 refreshing 가드가 중복 요청을 막는다.
  pi.on(
    "agent_settled" as any,
    async (_event: unknown, ctx: ExtensionContext) => {
      await refreshCredits(ctx);
    },
  );

  pi.on(
    "agent_end",
    async (_event, ctx) => {
      await refreshCredits(ctx);
    },
  );

  // ---------------------------------------------------------------------------
  // /credits
  // ---------------------------------------------------------------------------

  pi.registerCommand("credits", {
    description:
      "Refresh Konkuk AI monthly credit usage",

    handler: async (_args, ctx) => {
      await refreshCredits(ctx);

      if (!credits) {
        return;
      }

      if (credits.error) {
        ctx.ui.notify(
          `Konkuk credits: ${credits.error}`,
          "error",
        );
        return;
      }

      const usagePercent =
        percent(
          credits.used,
          credits.quota,
        );

      ctx.ui.notify(
        `Konkuk: ` +
        `${formatCredits(credits.used)}` +
        ` / ` +
        `${formatCredits(credits.quota)}` +
        ` credits ` +
        `(${usagePercent.toFixed(1)}%)`,
        "info",
      );
    },
  });
}
