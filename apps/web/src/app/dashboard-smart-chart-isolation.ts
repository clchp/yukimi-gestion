function isolateDashboardChart() {
  if (location.pathname !== '/') return;
  document.querySelectorAll<HTMLElement>('.dashboard-real-chart').forEach((chart) => {
    chart.classList.remove('dashboard-real-chart');
    chart.classList.add('dashboard-native-chart');
  });
}

export function installDashboardSmartChartIsolation() {
  if (document.documentElement.dataset.dashboardSmartChartIsolation === 'true') return;
  document.documentElement.dataset.dashboardSmartChartIsolation = 'true';

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      isolateDashboardChart();
    });
  };

  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', schedule);
  schedule();
}
