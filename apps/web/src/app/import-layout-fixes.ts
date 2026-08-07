function markImportsTable() {
  if (location.pathname !== '/importaciones') return;
  document
    .querySelector<HTMLTableElement>(
      'main.page > .table-panel > .responsive-table-wrap > table.data-table',
    )
    ?.classList.add('imports-list-table');
}

export function installImportLayoutFixes() {
  if (document.documentElement.dataset.importLayoutFixes === 'true') return;
  document.documentElement.dataset.importLayoutFixes = 'true';

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      markImportsTable();
    });
  };

  new MutationObserver(schedule).observe(document.body, {
    childList: true,
    subtree: true,
  });
  window.addEventListener('popstate', schedule);
  schedule();
}
