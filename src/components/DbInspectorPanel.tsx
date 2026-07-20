import { useMemo, useState } from "react";

import type { DbTable } from "./desktop/uiTypes";
import { ScrollArea } from "./ui/ScrollArea";

interface DbInspectorPanelProps {
  tables: DbTable[];
}

export function DbInspectorPanel({ tables }: DbInspectorPanelProps) {
  const [activeTable, setActiveTable] = useState(tables[0]?.name ?? "");
  const [searchTerm, setSearchTerm] = useState("");
  const [sqlCommand, setSqlCommand] = useState("SELECT * FROM suggestions WHERE status = 'pending'");
  const [sqlError, setSqlError] = useState<string | null>(null);
  const [sqlResult, setSqlResult] = useState<Array<Record<string, string | number | boolean | null>> | null>(null);

  const table = useMemo(() => tables.find((entry) => entry.name === activeTable) ?? tables[0], [activeTable, tables]);

  const filteredRows = useMemo(() => {
    if (!table) {
      return [];
    }
    const normalized = searchTerm.trim().toLowerCase();
    if (!normalized) {
      return table.rows;
    }
    return table.rows.filter((row) => Object.values(row).some((value) => String(value).toLowerCase().includes(normalized)));
  }, [searchTerm, table]);

  return (
    <div style={{ height: "100%", minHeight: 0, display: "grid", gridTemplateColumns: "220px 1fr", gap: "var(--space-4)" }}>
      <ScrollArea
        style={{
          minHeight: 0,
        }}
        contentStyle={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-2)",
          paddingBottom: "var(--space-2)",
        }}
      >
        {tables.map((entry) => (
          <button
            key={entry.name}
            type="button"
            onClick={() => {
              setActiveTable(entry.name);
              setSqlResult(null);
              setSqlError(null);
            }}
            style={{
              textAlign: "left",
              background: activeTable === entry.name ? "var(--color-primary-muted)" : "var(--bg-surface)",
              border: `1px solid ${activeTable === entry.name ? "var(--color-primary)" : "var(--border-base)"}`,
              color: "var(--fg-base)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-3)",
              cursor: "pointer",
            }}
          >
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>{entry.name}</div>
            <div style={{ color: "var(--fg-subtle)", fontSize: "var(--text-xs)", marginTop: "4px" }}>{entry.description}</div>
          </button>
        ))}
      </ScrollArea>

      <section
        style={{
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-3)",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-base)",
          borderRadius: "var(--radius-lg)",
          padding: "var(--space-4)",
        }}
      >
        <div>
          <div style={{ color: "var(--color-primary)", fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", letterSpacing: "0.08em" }}>
            SQLITE ENGINE CONSOLE
          </div>
          <div style={{ color: "var(--fg-subtle)", fontSize: "var(--text-sm)" }}>Read-only diagnostics for the rebuilt desktop interface</div>
        </div>

        <input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder={`Search ${activeTable}`}
          style={{
            background: "var(--bg-base)",
            color: "var(--fg-base)",
            border: "1px solid var(--border-base)",
            borderRadius: "var(--radius-md)",
            padding: "10px 12px",
            fontSize: "var(--text-sm)",
          }}
        />

        <ScrollArea
          orientation="both"
          style={{
            flex: 1,
            minHeight: 0,
            border: "1px solid var(--border-base)",
            borderRadius: "var(--radius-md)",
          }}
        >
          {table ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-xs)" }}>
              <thead>
                <tr style={{ background: "var(--bg-base)" }}>
                  {table.columns.map((column) => (
                    <th key={column} style={{ padding: "10px", textAlign: "left", color: "var(--fg-muted)", borderBottom: "1px solid var(--border-base)" }}>
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(sqlResult ?? filteredRows).map((row, index) => (
                  <tr key={`${activeTable}-${index}`}>
                    {table.columns.map((column) => (
                      <td key={column} style={{ padding: "10px", color: "var(--fg-base)", borderBottom: "1px solid var(--border-base)", verticalAlign: "top" }}>
                        {String(row[column] ?? "NULL")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </ScrollArea>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            const normalized = sqlCommand.trim().toLowerCase();
            setSqlError(null);
            setSqlResult(null);

            if (!normalized.startsWith("select ")) {
              setSqlError("Only SELECT statements are permitted in the safety console.");
              return;
            }

            const match = normalized.match(/from\s+([a-z_]+)/);
            if (!match) {
              setSqlError("Missing FROM clause.");
              return;
            }

            const target = tables.find((entry) => entry.name.toLowerCase() === match[1]);
            if (!target) {
              setSqlError(`Unknown table: ${match[1]}`);
              return;
            }

            const whereMatch = normalized.match(/where\s+([a-z_]+)\s*=\s*'([^']+)'/);
            if (!whereMatch) {
              setSqlResult(target.rows);
              return;
            }

            const [, field, value] = whereMatch;
            const result = target.rows.filter((row) => String(row[field] ?? "").toLowerCase() === value);
            setSqlResult(result);
          }}
          style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}
        >
          <textarea
            value={sqlCommand}
            onChange={(event) => setSqlCommand(event.target.value)}
            style={{
              minHeight: "84px",
              resize: "vertical",
              background: "var(--bg-base)",
              color: "var(--fg-base)",
              border: "1px solid var(--border-base)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-3)",
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-xs)",
            }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-2)", alignItems: "center" }}>
            <div style={{ color: sqlError ? "var(--color-error)" : "var(--fg-subtle)", fontSize: "var(--text-xs)" }}>
              {sqlError ?? "Read-only simulated query workspace"}
            </div>
            <button
              type="submit"
              style={{
                border: "1px solid var(--color-primary)",
                background: "var(--color-primary)",
                color: "white",
                borderRadius: "var(--radius-md)",
                padding: "10px 12px",
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-xs)",
                cursor: "pointer",
              }}
            >
              RUN QUERY
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
