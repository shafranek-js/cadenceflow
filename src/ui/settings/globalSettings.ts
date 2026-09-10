export interface GlobalSettingsVisibility {
  readonly showProjectTabs: boolean;
  readonly showThemeControl: boolean;
  readonly showExpertiseControl: boolean;
  readonly showHistoryControls: boolean;
  readonly showRecommendationContext: boolean;
  readonly showPreviewHarmony: boolean;
}

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettingsVisibility = {
  showProjectTabs: true,
  showThemeControl: true,
  showExpertiseControl: true,
  showHistoryControls: false,
  showRecommendationContext: false,
  showPreviewHarmony: false,
};

export const GLOBAL_SETTINGS_STORAGE_KEY = "cadenceflow.global-settings";

export function readGlobalSettingsVisibility(): GlobalSettingsVisibility {
  if (typeof window === "undefined") return DEFAULT_GLOBAL_SETTINGS;

  try {
    const raw = window.localStorage.getItem(GLOBAL_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_GLOBAL_SETTINGS;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return DEFAULT_GLOBAL_SETTINGS;

    const saved = parsed as Partial<GlobalSettingsVisibility>;
    return {
      showProjectTabs:
        typeof saved.showProjectTabs === "boolean"
          ? saved.showProjectTabs
          : DEFAULT_GLOBAL_SETTINGS.showProjectTabs,
      showThemeControl:
        typeof saved.showThemeControl === "boolean"
          ? saved.showThemeControl
          : DEFAULT_GLOBAL_SETTINGS.showThemeControl,
      showExpertiseControl:
        typeof saved.showExpertiseControl === "boolean"
          ? saved.showExpertiseControl
          : DEFAULT_GLOBAL_SETTINGS.showExpertiseControl,
      showHistoryControls:
        typeof saved.showHistoryControls === "boolean"
          ? saved.showHistoryControls
          : DEFAULT_GLOBAL_SETTINGS.showHistoryControls,
      showRecommendationContext:
        typeof saved.showRecommendationContext === "boolean"
          ? saved.showRecommendationContext
          : DEFAULT_GLOBAL_SETTINGS.showRecommendationContext,
      showPreviewHarmony:
        typeof saved.showPreviewHarmony === "boolean"
          ? saved.showPreviewHarmony
          : DEFAULT_GLOBAL_SETTINGS.showPreviewHarmony,
    };
  } catch {
    return DEFAULT_GLOBAL_SETTINGS;
  }
}
