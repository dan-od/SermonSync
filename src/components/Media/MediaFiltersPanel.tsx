import type { MediaFilters } from "../../lib/mediaFilters";
import { fieldLabelStyle, twoColumnGrid } from "./studioStyles";

interface FilterField {
  key: keyof MediaFilters;
  label: string;
  min: number;
  max: number;
  step?: number;
  unit?: string;
}

const FILTER_FIELDS: FilterField[] = [
  { key: "brightness", label: "Brightness", min: 0, max: 200, unit: "%" },
  { key: "contrast", label: "Contrast", min: 0, max: 200, unit: "%" },
  { key: "saturate", label: "Saturate", min: 0, max: 200, unit: "%" },
  { key: "grayscale", label: "Grayscale", min: 0, max: 100, unit: "%" },
  { key: "sepia", label: "Sepia", min: 0, max: 100, unit: "%" },
  { key: "invert", label: "Invert", min: 0, max: 100, unit: "%" },
  { key: "hueRotate", label: "Hue rotate", min: 0, max: 360, unit: "°" },
  { key: "blur", label: "Blur", min: 0, max: 20, step: 0.5, unit: "px" },
];

export function MediaFiltersPanel({ filters, onChange }: { filters: MediaFilters; onChange: (filters: MediaFilters) => void }) {
  return (
    <div style={twoColumnGrid}>
      {FILTER_FIELDS.map((field) => (
        <label key={field.key} style={fieldLabelStyle}>
          {field.label} ({filters[field.key]}{field.unit ?? ""})
          <input
            type="range"
            min={field.min}
            max={field.max}
            step={field.step ?? 1}
            value={filters[field.key]}
            onChange={(event) => onChange({ ...filters, [field.key]: Number(event.target.value) })}
          />
        </label>
      ))}
    </div>
  );
}
