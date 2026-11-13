import { appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const DOCUMENTACION = "solo_documentacion";
const COMPLETO = "verificaciones_completas";

export function clasificarRutas(rutas) {
  return rutas.length > 0 && rutas.every((ruta) =>
    /^docs\/.+\.(?:md|mdx|rst)$/i.test(ruta.replaceAll("\\", "/")),
  )
    ? DOCUMENTACION
    : COMPLETO;
}

export function clasificarCambios(cambios) {
  const documental = cambios.length > 0 && cambios.every(({ ruta, modoAnterior, modoNuevo, estado }) => {
    const modosPresentes = [modoAnterior, modoNuevo].filter((modo) => modo !== "000000");
    return ["A", "D", "M"].includes(estado)
      && modosPresentes.length > 0
      && modosPresentes.every((modo) => modo === "100644")
      && clasificarRutas([ruta]) === DOCUMENTACION;
  });
  return documental ? DOCUMENTACION : COMPLETO;
}

async function main() {
  const base = process.env.BASE_SHA;
  const destino = process.env.TARGET_SHA;
  let clasificacion = COMPLETO;
  let detalle = "No fue posible demostrar que los cambios fueran exclusivamente documentales; se ejecutarán todas las verificaciones.";

  if (base && destino) {
    const diff = spawnSync("git", ["diff", "--raw", "-z", "--no-renames", `${base}...${destino}`], {
      encoding: "utf8",
      windowsHide: true,
    });
    if (!diff.error && diff.status === 0) {
      const campos = diff.stdout.split("\0").filter(Boolean);
      const cambios = [];
      let estructuraValida = campos.length > 0 && campos.length % 2 === 0;
      for (let indice = 0; estructuraValida && indice < campos.length; indice += 2) {
        const encabezado = campos[indice].match(/^:(\d{6}) (\d{6}) [a-f0-9]+ [a-f0-9]+ ([A-Z])$/);
        if (!encabezado || !campos[indice + 1]) {
          estructuraValida = false;
          break;
        }
        cambios.push({
          modoAnterior: encabezado[1],
          modoNuevo: encabezado[2],
          estado: encabezado[3],
          ruta: campos[indice + 1],
        });
      }
      clasificacion = estructuraValida ? clasificarCambios(cambios) : COMPLETO;
      detalle = clasificacion === DOCUMENTACION
        ? `Los ${cambios.length} archivos modificados son Markdown regular bajo docs/. Se omitirán únicamente las pruebas E2E completas.`
        : "Hay cambios fuera del conjunto documental permitido o el diff está vacío; se ejecutarán todas las verificaciones.";
    }
  }

  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `clasificacion=${clasificacion}\n`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `### Clasificación de cambios\n\n${detalle}\n`);
  }
  console.log(`${detalle} Clasificación: ${clasificacion}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(async () => {
    if (process.env.GITHUB_OUTPUT) {
      await appendFile(process.env.GITHUB_OUTPUT, `clasificacion=${COMPLETO}\n`);
    }
    console.log(`La clasificación no pudo completarse; se ejecutarán todas las verificaciones. Clasificación: ${COMPLETO}.`);
  });
}
