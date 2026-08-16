/**
 * Utility per riconoscere gli ordini appartenenti al circuito Gruppo Sole 365.
 */
export function isSoleOrder(ordine) {
  if (!ordine) return false;
  const mittente = String(ordine.mittente || '').toLowerCase();
  const note = String(ordine.note_ordine || '').toLowerCase();
  const testo = String(ordine.testo_originale || '').toLowerCase();
  const combined = `${mittente} ${note} ${testo}`;

  if (combined.includes('sole') || combined.includes('365')) {
    return true;
  }

  const numeriSole = ['3284344912', '181208998756424', '199325305045099', '177188993269891', '393284344912'];
  if (numeriSole.some(num => mittente.includes(num))) {
    return true;
  }

  return false;
}
