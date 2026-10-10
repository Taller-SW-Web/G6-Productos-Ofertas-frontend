import type { LocalFileCheckResult } from "../types/bulk";

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
        "El contenido no fue procesado debido a formato no admitido.",
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
    // Strip UTF-8 BOM if present
    const cleanText = text.replace(/^\uFEFF/, "").trim();
    if (!cleanText) {
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

    const { rows: rawLines, error: parseError } = parseCsvSafely(cleanText);

    if (parseError) {
      return {
        valid: false,
        format: "CSV",
        fileName,
        fileSize,
        warnings: [],
        errors: [parseError],
        unverifiedAspects: [],
      };
    }

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

    // Check for empty headers
    if (headers.some((h) => h.length === 0)) {
      return {
        valid: false,
        format: "CSV",
        fileName,
        fileSize,
        warnings: [],
        errors: ["El encabezado contiene columnas con nombre vacío."],
        unverifiedAspects: [],
      };
    }

    // Check for duplicate columns
    const uniqueHeaders = new Set(headers);
    if (uniqueHeaders.size !== headers.length) {
      return {
        valid: false,
        format: "CSV",
        fileName,
        fileSize,
        warnings: [],
        errors: ["El encabezado contiene nombres de columna duplicados."],
        unverifiedAspects: [],
      };
    }

    const dataRows = rawLines.slice(1);
    const dataRowsCount = dataRows.length;

    if (dataRowsCount === 0) {
      return {
        valid: false,
        format: "CSV",
        fileName,
        fileSize,
        detectedRows: 0,
        detectedColumns: headers,
        warnings: [],
        errors: [
          "El archivo CSV contiene únicamente el encabezado y no tiene filas de datos para importar.",
        ],
        unverifiedAspects: [],
      };
    }

    // Check row field counts
    const columnCount = headers.length;
    const malformedRowIndex = dataRows.findIndex((r) => r.length !== columnCount);
    const warnings: string[] = [];

    if (malformedRowIndex !== -1) {
      warnings.push(
        `La fila ${malformedRowIndex + 2} contiene ${dataRows[malformedRowIndex]?.length} campos, mientras que el encabezado define ${columnCount} columnas.`,
      );
    }

    return {
      valid: true,
      format: "CSV",
      fileName,
      fileSize,
      detectedRows: dataRowsCount,
      detectedColumns: headers,
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
 * Robust RFC 4180 CSV parser checking unclosed quotes and structure.
 */
function parseCsvSafely(text: string): { rows: string[][]; error?: string } {
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

  if (insideQuotes) {
    return {
      rows: [],
      error: "El archivo CSV contiene comillas sin cerrar en la estructura de campos.",
    };
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.some((f) => f.trim().length > 0)) {
      rows.push(currentRow);
    }
  }

  return { rows };
}
