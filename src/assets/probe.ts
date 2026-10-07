/**
 * Descarga un archivo opcional y verifica su firma. Vite (y muchos servidores estáticos) responden
 * 200 con index.html para rutas inexistentes, así que no alcanza con mirar el status HTTP.
 * Devuelve null si no existe o la firma no coincide.
 */
export async function probeFile(url: string, magic: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const head = new TextDecoder().decode(new Uint8Array(buf, 0, Math.min(buf.byteLength, magic.length)));
    return head === magic ? buf : null;
  } catch {
    return null;
  }
}
