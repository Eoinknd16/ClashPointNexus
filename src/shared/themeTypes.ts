/** A theme is just a bag of CSS custom property values, applied to :root — see applyTheme.ts. */
export interface ThemeDefinition {
  id: string
  name: string
  vars: Record<string, string>
}
