export type ExtractionRecoverySnapshot = {
  readonly id: string;
  readonly hasReceipt: boolean;
  readonly destinationExists: boolean;
  readonly receiptStatus: "prepared" | "recovering" | "committed" | "failed" | null;
  readonly markerExists: boolean;
};

export type ExtractionRecoveryAction =
  | { readonly kind: "remove_orphan_row"; readonly id: string }
  | { readonly kind: "finalize_committed"; readonly id: string };

export function classifyExtractionRecovery(rows: readonly ExtractionRecoverySnapshot[]): readonly ExtractionRecoveryAction[] {
  return rows.flatMap((row): readonly ExtractionRecoveryAction[] => {
    if (!row.hasReceipt && !row.destinationExists) return [{ kind: "remove_orphan_row", id: row.id }];
    if (row.receiptStatus === "committed" && row.destinationExists && row.markerExists) return [{ kind: "finalize_committed", id: row.id }];
    return [];
  });
}
