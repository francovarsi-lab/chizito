import { Construction } from './construction';

const KEY = 'chizito-save-v1';

export function autosave(c: Construction) {
  try { localStorage.setItem(KEY, JSON.stringify(c.serialize())); } catch { /* storage puede fallar, no es crítico */ }
}

export function loadAutosave(): any | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function exportJSON(c: Construction) {
  const blob = new Blob([JSON.stringify(c.serialize(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'chizito.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

export function setupDragDropImport(onImport: (json: any) => void) {
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      onImport(json);
    } catch { /* archivo inválido, se ignora */ }
  });
}
