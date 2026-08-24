type CloseBrowser = () => Promise<void>;
const active = new Map<symbol, CloseBrowser>();

export type ExportBrowserOwner = { readonly release: () => void };

export function registerExportBrowser(close: CloseBrowser): ExportBrowserOwner {
  const id = Symbol("export-browser"); active.set(id, close); return { release: () => { active.delete(id); } };
}

export async function closeActiveExportBrowsers(): Promise<void> {
  const owners = [...active.entries()]; for (const [id] of owners) active.delete(id);
  const failures: unknown[] = [];
  await Promise.all(owners.map(async ([, close]) => { try { await close(); } catch (error) { failures.push(error); } }));
  if (failures.length > 0) throw new AggregateError(failures, "Failed to close active export browsers");
}
