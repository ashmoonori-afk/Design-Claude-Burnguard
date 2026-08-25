export class DesignSystemAssetEditError extends Error {
  readonly name = "DesignSystemAssetEditError";
  constructor(
    readonly code:
      | "design_system_not_found"
      | "tokens_file_missing"
      | "invalid_color_token"
      | "invalid_color_value"
      | "invalid_font_upload"
      | "unsafe_managed_path",
    message: string,
  ) {
    super(message);
  }
}
