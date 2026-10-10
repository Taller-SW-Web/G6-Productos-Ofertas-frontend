import type { LocalFileCheckResult } from "../types/bulk";

export const EXPECTED_CSV_COLUMNS = [
  "sku",
  "nombre",
  "precio_regular",
  "moneda",
];

export async function checkLocalFile(file: File): Promise<LocalFileCheckResult> {
  const fileName = file.name.trim();
  const fileSize = file.size;
  const lowerName = fileName.toLowerCase();

  const isCsv = lowerName.endsWith(".csv");
  const isXlsx = lowerName.endsWith(".xlsx");

  if (!isCsv && !isXlsx) {
    return {
      valid: false,
      format: "UNKNOWN",
      fileName,
      fileSize,
      warnings: [],
      errors: [
        `Formato no admitido. Se requiere un archivo con extensión .csv o .xlsx (recibido: ${fileName})`,
      ],
      unverifiedAspects: [
        "El contenido no fue procesado debido a extensión inválida.",
      ],
    };
  }

  if (fileSize === 0) {
    return {
      valid: false,
      format: isCsv ? "CSV" : "XLSX",
      fileName,
      fileSize,
      warnings: [],
      errors: ["El archivo seleccionado está vacío (0 bytes)."],
      unverifiedAspects: [],
    };
  }

  if (isXlsx) {
    return {
      valid: true,
      format: "XLSX",
      fileName,
      fileSize,
      warnings: [
        "Revisión preliminar de contenedor XLSX: las celdas, hojas y tipos serán validados por el servicio durante el procesamiento del lote.",
      ],
      errors: [],
      unverifiedAspects: [
        "Estructura interna de celdas y filas XLSX no verificada en cliente.",
        "Consistencia de tipos de datos, precios y stock será validada de forma asíncrona.",
      ],
    };
  }

  // Parse CSV client-side safely
  try {
    const text = await file.text();
    const trimmed = text.trim();
    if (!trimmed) {
      return {
        valid: false,
        format: "CSV",
        fileName,
        fileSize,
        warnings: [],
        errors: ["El archivo CSV no contiene texto ni datos legibles."],
        unverifiedAspects: [],
      };
    }

    // Split rows respecting basic quotes
    const rawLines = parseCsvLines(trimmed);
    if (rawLines.length === 0) {
      return {
        valid: false,
        format: "CSV",
        fileName,
        fileSize,
        warnings: [],
        errors: ["No se encontraron líneas válidas en el archivo CSV."],
        unverifiedAspects: [],
      };
    }

    const headerLine = rawLines[0] ?? [];
    const headers = headerLine.map((h) => h.trim().toLowerCase());
    const dataRowsCount = rawLines.length - 1;

    const missingColumns = EXPECTED_CSV_COLUMNS.filter(
      (col) => !headers.includes(col),
    );

    const warnings: string[] = [];
    if (missingColumns.length > 0) {
      warnings.push(
        `Faltan columnas recomendadas en el encabezado: ${missingColumns.join(", ")}. Si no están presentes, los valores tomarán los valores predeterminados o podrían ser observados.`,
      );
    }

    if (dataRowsCount === 0) {
      return {
        valid: false,
        format: "CSV",
        fileName,
        fileSize,
        detectedRows: 0,
        detectedColumns: headers,
        missingColumns,
        warnings,
        errors: [
          "El archivo CSV contiene únicamente el encabezado y no tiene filas de datos para importar.",
        ],
        unverifiedAspects: [],
      };
    }

    return {
      valid: true,
      format: "CSV",
      fileName,
      fileSize,
      detectedRows: dataRowsCount,
      detectedColumns: headers,
      missingColumns,
      warnings,
      errors: [],
      unverifiedAspects: [
        "Unicidad de SKU y existencia previa en catálogo no verificable localmente.",
        "Validación de stock y reglas de canales de precios se evalúan en el procesamiento asíncrono.",
      ],
    };
  } catch {
    return {
      valid: false,
      format: "CSV",
      fileName,
      fileSize,
      warnings: [],
      errors: [
        "No se pudo leer el contenido del archivo CSV. Verifique que la codificación sea UTF-8 válida.",
      ],
      unverifiedAspects: [],
    };
  }
}

/**
 * Basic CSV tokenizer that respects quoted fields containing commas or linebreaks.
 */
function parseCsvLines(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentField += '"';
        i++; // skip escaped quote
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === "," && !insideQuotes) {
      currentRow.push(currentField);
      currentField = "";
    } else if ((char === "\r" || char === "\n") && !insideQuotes) {
      if (char === "\r" && nextChar === "\n") {
        i++;
      }
      currentRow.push(currentField);
      currentField = "";
      if (currentRow.some((f) => f.trim().length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
    } else {
      currentField += char;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.some((f) => f.trim().length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}
