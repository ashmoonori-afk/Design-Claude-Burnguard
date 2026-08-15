export const bundledDesignSystems = [
  { slug: "light", name: "Light Built-in Theme" },
  { slug: "dark", name: "Dark Built-in Theme" },
  { slug: "cupcake", name: "Cupcake Built-in Theme" },
  { slug: "retro", name: "Retro Built-in Theme" },
  { slug: "cyberpunk", name: "Cyberpunk Built-in Theme" },
  { slug: "synthwave", name: "Synthwave Built-in Theme" },
  { slug: "luxury", name: "Luxury Built-in Theme" },
  { slug: "dracula", name: "Dracula Built-in Theme" },
  { slug: "nord", name: "Nord Built-in Theme" },
  { slug: "business", name: "Business Built-in Theme" },
] as const;

export function bundledDesignSystemId(slug: string): string {
  return `builtin-theme-${slug}`;
}
