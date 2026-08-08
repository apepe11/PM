/**
 * Utility per formattare la data nel formato italiano giorno/mese/anno (GG/MM/AAAA).
 */
export function formatDateIT(dateStr) {
  if (!dateStr) return '';
  const str = String(dateStr).trim();
  
  // Riconosce formato YYYY-MM-DD o YYYY-MM-DD HH:MM:SS
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}:\d{2}(?::\d{2})?))?$/);
  if (match) {
    const [, y, m, d, t] = match;
    return t ? `${d}/${m}/${y} ${t}` : `${d}/${m}/${y}`;
  }
  
  // Se è un oggetto o stringa ISO
  try {
    const dt = new Date(str);
    if (!isNaN(dt.getTime())) {
      const d = String(dt.getDate()).padStart(2, '0');
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const y = dt.getFullYear();
      return `${d}/${m}/${y}`;
    }
  } catch (_) {}

  return str;
}
