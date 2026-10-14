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
    // A standard ZIP / OOXML spreadsheet contains at least Local File Header (30B) + EOCD (22B) = 52 bytes minimum
    if (fileSize < 52) {
      return {
        valid: false,
        format: "XLSX",
        fileName,
        fileSize,
        warnings: [],
        errors: [
          "El archivo XLSX tiene un tamaño insuficiente para ser un contenedor de hoja de cálculo válido.",
        ],
        unverifiedAspects: [],
      };
    }

    try {
      // 1. Read first 30 bytes to check standard ZIP Local File Header (0x50, 0x4B, 0x03, 0x04)
      const headerSlice = await file.slice(0, 30).arrayBuffer();
      const headerBytes = new Uint8Array(headerSlice);
      const hasLocalHeaderSignature =
        headerBytes[0] === 0x50 &&
        headerBytes[1] === 0x4b &&
        headerBytes[2] === 0x03 &&
        headerBytes[3] === 0x04;

      if (!hasLocalHeaderSignature) {
        return {
          valid: false,
          format: "XLSX",
          fileName,
          fileSize,
          warnings: [],
          errors: [
            "El archivo XLSX está corrupto o no tiene una estructura de contenedor válida (firma ZIP/PK local header no detectada).",
          ],
          unverifiedAspects: [],
        };
      }

      // 2. Read the tail of the file (up to 1024 bytes) to verify presence of ZIP End of Central Directory record (0x50, 0x4B, 0x05, 0x06)
      const tailSize = Math.min(fileSize, 1024);
      const tailSlice = await file.slice(fileSize - tailSize, fileSize).arrayBuffer();
      const tailBytes = new Uint8Array(tailSlice);
      let hasEocd = false;

      for (let i = 0; i < tailBytes.length - 3; i++) {
        if (
          tailBytes[i] === 0x50 &&
          tailBytes[i + 1] === 0x4b &&
          tailBytes[i + 2] === 0x05 &&
          tailBytes[i + 3] === 0x06
        ) {
          hasEocd = true;
          break;
        }
      }

      if (!hasEocd) {
        return {
          valid: false,
          format: "XLSX",
          fileName,
          fileSize,
          warnings: [],
          errors: [
            "El archivo XLSX está incompleto o truncado (registro de fin de directorio central ZIP no encontrado).",
          ],
          unverifiedAspects: [],
        };
      }
    } catch {
      return {
        valid: false,
        format: "XLSX",
        fileName,
        fileSize,
        warnings: [],
        errors: [
          "No se pudo leer la estructura del archivo XLSX.",
        ],
        unverifiedAspects: [],
      };
    }

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
    // Strip UTF-8 BOM if present without trimming whole payload
    const cleanText = text.replace(/^\uFEFF/, "");
    if (cleanText.trim().length === 0) {
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

    if (malformedRowIndex !== -1) {
      return {
        valid: false,
        format: "CSV",
        fileName,
        fileSize,
        detectedRows: dataRowsCount,
        detectedColumns: headers,
        warnings: [],
        errors: [
          `La fila ${malformedRowIndex + 2} contiene ${dataRows[malformedRowIndex]?.length} campos, mientras que el encabezado define ${columnCount} columnas.`,
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
      warnings: [],
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
 * Robust RFC 4180 CSV parser checking unclosed quotes, escaped quotes and structure.
 */
export function parseCsvSafely(text: string): { rows: string[][]; error?: string } {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let insideQuotes = false;
  let fieldHasQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuotes) {
        if (nextChar === '"') {
          currentField += '"';
          i++; // skip escaped quote
        } else {
          insideQuotes = false;
        }
      } else {
        if (currentField.length === 0) {
          insideQuotes = true;
          fieldHasQuotes = true;
        } else {
          return {
            rows: [],
            error: "El archivo CSV contiene comillas en posiciones inválidas dentro de un campo no delimitado.",
          };
        }
      }
    } else if (char === "," && !insideQuotes) {
      currentRow.push(currentField);
      currentField = "";
      fieldHasQuotes = false;
    } else if ((char === "\r" || char === "\n") && !insideQuotes) {
      if (char === "\r" && nextChar === "\n") {
        i++;
      }
      currentRow.push(currentField);
      currentField = "";
      fieldHasQuotes = false;
      if (currentRow.some((f) => f.trim().length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
    } else {
      if (!insideQuotes && fieldHasQuotes) {
        // Character found after closing quote before delimiter
        if (char !== " " && char !== "\t") {
          return {
            rows: [],
            error: "El archivo CSV contiene caracteres después de cerrar comillas sin un delimitador de columna.",
          };
        }
      }
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
