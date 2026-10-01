import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useState } from "react";

import { isTauriRuntime } from "../libraryUtils";
import type { BibleImportResult } from "../types";

/** "Add Bible source" modal state and the local XML import flow. */
export function useBibleImport(loadCatalog: (preferredVersion?: string) => Promise<void>) {
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const importBibleFile = useCallback(
    async () => {
      setIsImporting(true);
      setImportError(null);

      try {
        if (!isTauriRuntime()) {
          throw new Error("Open SermonSync in Tauri to import local XML files.");
        }

        const selected = await open({
          multiple: false,
          filters: [{ name: "Bible XML", extensions: ["xml"] }],
        });

        if (!selected) {
          return;
        }

        const path = Array.isArray(selected) ? selected[0] : selected;
        if (!path) {
          return;
        }

        const result = await invoke<BibleImportResult>("import_bible_file", { path });
        await loadCatalog(result.version.abbreviation);
        setAddModalOpen(false);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : "Bible import failed.";
        setImportError(message);
      } finally {
        setIsImporting(false);
      }
    },
    [loadCatalog],
  );

  return { addModalOpen, setAddModalOpen, isImporting, importError, importBibleFile };
}
