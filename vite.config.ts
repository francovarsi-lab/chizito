import { defineConfig } from 'vite';

// GitHub Pages sirve el juego en /chizito/ (ver .github/workflows/deploy.yml). En desarrollo se queda en
// la raíz, para que `npm run dev` siga en http://localhost:5173/. Los archivos opcionales (modelos, Draco,
// sonidos, HDRI) se piden con import.meta.env.BASE_URL, así funcionan en los dos casos.
export default defineConfig(({ command }) => ({
  // Vercel (VERCEL=1 en su build) sirve en la raíz, no en /chizito/.
  base: command === 'build' && !process.env.VERCEL ? '/chizito/' : '/',
}));
