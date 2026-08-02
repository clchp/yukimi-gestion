import { downloadXlsx } from './file-export';

export function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function downloadCsv(filename: string, rows: unknown[][]): void {
  if (/^yukimi-productos-/i.test(filename)) {
    const titleRows: unknown[][] = [
      ['YUKIMI GESTIÓN — CATÁLOGO DE PRODUCTOS'],
      ['Generado', new Intl.DateTimeFormat('es-PE', { dateStyle: 'long' }).format(new Date())],
      [],
      ...rows,
    ];
    downloadXlsx(filename.replace(/\.csv$/i, '.xlsx'), [
      {
        name: 'Productos',
        rows: titleRows,
        freezeRows: 4,
        autoFilterRow: 4,
        columnWidths: [16, 28, 18, 20, 18, 20, 17, 20, 13, 13, 13, 13, 14, 11, 15],
      },
    ]);
    return;
  }

  const content = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
