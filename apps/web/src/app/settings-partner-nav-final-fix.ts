import { Truck } from 'lucide-react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const iconRoots = new WeakMap<HTMLElement, Root>();

function renderTruckIcon(button: HTMLButtonElement) {
  if (button.dataset.standardTruckIcon === 'true') return;
  button.dataset.standardTruckIcon = 'true';

  const icon = document.createElement('span');
  icon.className = 'review-settings-nav-icon';
  icon.setAttribute('aria-hidden', 'true');
  button.replaceChildren(icon, document.createTextNode('Agencias y motorizados'));

  const root = createRoot(icon);
  iconRoots.set(icon, root);
  root.render(createElement(Truck, { size: 18, strokeWidth: 2 }));
}

function enhanceSettingsPartnerNavigation() {
  if (location.pathname !== '/configuracion') return;
  const main = document.querySelector<HTMLElement>('main.page');
  const nav = main?.querySelector<HTMLElement>('.settings-nav');
  const button = nav?.querySelector<HTMLButtonElement>('[data-final-partners-nav]');
  if (!main || !nav || !button) return;

  renderTruckIcon(button);

  if (nav.dataset.partnerSelectionFix !== 'true') {
    nav.dataset.partnerSelectionFix = 'true';
    nav.addEventListener(
      'click',
      (event) => {
        const clicked = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
        if (!clicked || clicked === button) return;
        button.classList.remove('active');
        main.dataset.finalPartnersActive = 'false';
      },
      true,
    );
  }

  const anotherSectionIsActive = [...nav.querySelectorAll<HTMLButtonElement>('button.active')].some(
    (candidate) => candidate !== button,
  );
  if (anotherSectionIsActive || main.dataset.finalPartnersActive !== 'true') {
    button.classList.remove('active');
  }
}

let scheduled = false;
function scheduleEnhancement() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    enhanceSettingsPartnerNavigation();
  });
}

export function installSettingsPartnerNavFinalFix() {
  if (document.documentElement.dataset.settingsPartnerNavFinalFix === 'true') return;
  document.documentElement.dataset.settingsPartnerNavFinalFix = 'true';
  new MutationObserver(scheduleEnhancement).observe(document.body, {
    childList: true,
    subtree: true,
  });
  window.addEventListener('popstate', scheduleEnhancement);
  scheduleEnhancement();
}
