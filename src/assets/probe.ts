/**
 * Descarga un archivo opcional y verifica su firma. Vite (y muchos servidores estáticos) responden
 * 200 con index.html para rutas inexistentes, así que no alcanza con mirar el status HTTP.
 * `magic` es texto ('glTF', '#?') o bytes ([0xff, 0xd8, 0xff] para JPEG).
 * Devuelve null si no existe o la firma no coincide.
 */
export async function probeFile(url: string, magic: string | number[]): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const bytes = typeof magic === 'string' ? [...magic].map((c) => c.charCodeAt(0)) : magic;
    if (buf.byteLength < bytes.length) return null;
    const head = new Uint8Array(buf, 0, bytes.length);
    return bytes.every((b, i) => head[i] === b) ? buf : null;
  } catch {
    return null;
  }
}
