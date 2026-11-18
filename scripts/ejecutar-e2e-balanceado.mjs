import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const cli = resolve("node_modules/playwright/cli.js");
const salidaLista = "^\\s+(.+?):\\d+:\\d+\\s+›";

export function extraerArchivosDeLista(salida) {
  return new Set(
    [...salida.matchAll(new RegExp(salidaLista, "gm"))].map((coincidencia) =>
      coincidencia[1].replaceAll("\\", "/"),
    ),
  );
}

export function validarManifiestos(archivosActuales, manifiestos) {
  const ocurrencias = new Map();
  for (const archivo of manifiestos.flat()) {
    ocurrencias.set(archivo, (ocurrencias.get(archivo) ?? 0) + 1);
  }

  const archivosEsperados = new Set(archivosActuales);
  const archivosConfigurados = new Set(ocurrencias.keys());
  const faltantes = [...archivosEsperados].filter((archivo) => !archivosConfigurados.has(archivo));
  const adicionales = [...archivosConfigurados].filter((archivo) => !archivosEsperados.has(archivo));
  const duplicados = [...ocurrencias].filter(([, cantidad]) => cantidad !== 1).map(([archivo]) => archivo);

  return {
    valido: faltantes.length === 0 && adicionales.length === 0 && duplicados.length === 0,
    faltantes,
    adicionales,
    duplicados,
  };
}

function ejecutar(argumentos, opciones = {}) {
  return spawnSync(process.execPath, [cli, "test", ...argumentos], {
    encoding: "utf8",
    stdio: opciones.silencioso ? "pipe" : "inherit",
  });
}

function terminar(resultado) {
  if (resultado.error) throw resultado.error;
  process.exit(resultado.status ?? 1);
}

async function main() {
  const [parteTexto, totalTexto = "4"] = process.argv.slice(2);
  const parte = Number(parteTexto);
  const total = Number(totalTexto);
  if (!Number.isInteger(parte) || !Number.isInteger(total) || total !== 4 || parte < 1 || parte > total) {
    console.error("::error::El número de fragmento E2E no es válido; se esperaba una parte entre 1 y 4.");
    process.exit(2);
  }

  const listado = ejecutar(["--list"], { silencioso: true });
  if (listado.status !== 0) {
    console.error("::error::No se pudo enumerar la suite E2E; no se puede confirmar la cobertura del fragmento.");
    process.exit(listado.status ?? 1);
  }

  const manifiestos = [];
  try {
    for (let indice = 1; indice <= total; indice += 1) {
      const contenido = await readFile(resolve(`scripts/e2e-fragmentos/parte-${indice}.txt`), "utf8");
      manifiestos.push(contenido.split(/\r?\n/).map((archivo) => archivo.trim()).filter(Boolean));
    }
  } catch {
    console.error("Falta un manifiesto E2E; se ejecutará el fragmento automático completo.");
    terminar(ejecutar([`--shard=${parte}/${total}`, "--workers=1", "--reporter=blob"]));
  }

  const verificacion = validarManifiestos(extraerArchivosDeLista(listado.stdout), manifiestos);
  if (!verificacion.valido) {
    console.warn(
      `La lista E2E cambió (faltantes: ${verificacion.faltantes.length}, adicionales: ${verificacion.adicionales.length}, duplicados: ${verificacion.duplicados.length}); se usará la distribución automática completa.`,
    );
    terminar(ejecutar([`--shard=${parte}/${total}`, "--workers=1", "--reporter=blob"]));
  }

  console.log(`Se ejecutará el fragmento E2E equilibrado ${parte} de ${total}, con cobertura completa verificada.`);
  terminar(
    ejecutar([
      "--test-list",
      `scripts/e2e-fragmentos/parte-${parte}.txt`,
      "--workers=1",
      "--reporter=blob",
    ]),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
