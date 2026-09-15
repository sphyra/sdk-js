// Map label language — S-1.0.0-11-021. Mirrors the API's styleLanguage helper so
// `setLanguage` can rewrite text-field at runtime without a style re-fetch.

export const STYLE_LANGUAGE_DEFAULT = "local";

export function textFieldForLanguage(language: string | undefined): unknown {
  const lang =
    language === undefined || language === "" ? STYLE_LANGUAGE_DEFAULT : language;
  if (lang === STYLE_LANGUAGE_DEFAULT) return ["get", "name"];
  return ["coalesce", ["get", `name:${lang}`], ["get", "name"]];
}

type MapLike = {
  getStyle?: () => {
    layers?: Array<{ id: string; type?: string; layout?: Record<string, unknown> }>;
  };
  setLayoutProperty: (layerId: string, name: string, value: unknown) => void;
};

export function applyLanguageToMap(map: MapLike, language: string | undefined): void {
  const field = textFieldForLanguage(language);
  const layers = map.getStyle?.()?.layers ?? [];
  for (const layer of layers) {
    if (layer.type !== "symbol") continue;
    const textField = layer.layout?.["text-field"];
    if (textField === undefined || typeof textField === "string") continue;
    map.setLayoutProperty(layer.id, "text-field", field);
  }
}

export function languagesFromStyle(style: { metadata?: unknown }): string[] {
  const metadata =
    style.metadata && typeof style.metadata === "object"
      ? (style.metadata as Record<string, unknown>)
      : {};
  const listed = metadata["sphyra:languages"];
  if (!Array.isArray(listed)) return [STYLE_LANGUAGE_DEFAULT];
  const codes = listed
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (entry && typeof entry === "object" && "code" in entry) {
        const code = (entry as { code?: unknown }).code;
        return typeof code === "string" ? code : null;
      }
      return null;
    })
    .filter((code): code is string => code !== null && code.length > 0);
  if (!codes.includes(STYLE_LANGUAGE_DEFAULT)) codes.unshift(STYLE_LANGUAGE_DEFAULT);
  return codes;
}
