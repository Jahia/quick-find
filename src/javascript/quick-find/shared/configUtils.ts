/**
 * Accessors for QuickFind's runtime configuration.
 * Values are populated server-side by quickFind.jsp into window.contextJsParameters.quickFind
 * and fall back to sensible defaults when absent.
 */

type QuickFindConfig = NonNullable<typeof window.contextJsParameters.quickFind>;
type QuickFindKey = keyof QuickFindConfig;

const cfg = () => window.contextJsParameters.quickFind;

export function getMinSearchChars(): number {
  return cfg()?.minSearchChars ?? 3;
}

export function getDebounceDelay(): number {
  return cfg()?.jcrFindDelayInTypingToLaunchSearch ?? 300;
}

export function getDefaultDisplayedResults(): number {
  return cfg()?.defaultDisplayedResults ?? 5;
}

export function getShowMoreIncrement(): number {
  // Separate from provider max results: controls rows revealed per click.
  return cfg()?.showMoreIncrement ?? 10;
}

export function getResultTitleMaxLength(): number {
  return cfg()?.resultTitleMaxLength ?? 80;
}

export function isProviderEnabled(key: QuickFindKey): boolean {
  return cfg()?.[key] !== false;
}

export function getProviderMaxResults(key: QuickFindKey, fallback: number): number {
  return (cfg()?.[key] as number | undefined) ?? fallback;
}
