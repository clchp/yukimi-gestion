const actionLabelByState: Record<string, string> = {
  Registrada: 'Confirmar llegada al almacén internacional',
  'En almacén internacional': 'Confirmar salida del almacén internacional',
  'Despacho confirmado': 'Confirmar embarque hacia Perú',
  Embarcada: 'Marcar envío en tránsito',
  'En tránsito': 'Confirmar llegada física a Perú',
  'Recibida en Perú': 'Revisar cantidades e ingresar a stock',
};

let lockedButton: HTMLButtonElement | null = null;
let unlockTimer: number | null = null;

function releaseLockedButton() {
  if (unlockTimer !== null) {
    window.clearTimeout(unlockTimer);
    unlockTimer = null;
  }
  if (lockedButton?.isConnected) {
    lockedButton.disabled = false;
    lockedButton.removeAttribute('aria-busy');
    lockedButton.dataset.importBoxActionBusy = 'false';
    const label = lockedButton.dataset.importBoxActionLabel;
    if (label) lockedButton.textContent = label;
  }
  lockedButton = null;
}

function lockButton(button: HTMLButtonElement) {
  if (lockedButton === button) return;
  releaseLockedButton();
  lockedButton = button;
  button.dataset.importBoxActionBusy = 'true';
  button.dataset.importBoxActionLabel = button.textContent?.trim() ?? '';
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  unlockTimer = window.setTimeout(releaseLockedButton, 20_000);
}

function stateLabelForCard(card: HTMLElement) {
  return card.querySelector<HTMLElement>('header .status-badge')?.textContent?.trim() ?? '';
}

function applyBoxActionLabels() {
  document.querySelectorAll<HTMLElement>('.import-box-card').forEach((card) => {
    const stateLabel = stateLabelForCard(card);
    const desiredLabel = actionLabelByState[stateLabel];
    if (!desiredLabel) return;

    const footer = card.querySelector<HTMLElement>('.import-box-actions');
    if (!footer) return;

    if (stateLabel === 'Recibida en Perú') {
      const receiveButton = [...footer.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
        button.textContent?.includes('ingresar') || button.textContent?.includes('Recibir'),
      );
      if (receiveButton && receiveButton.textContent?.trim() !== desiredLabel) {
        receiveButton.textContent = desiredLabel;
      }
      return;
    }

    const advanceButton = footer.querySelector<HTMLButtonElement>('button.button-secondary');
    if (!advanceButton || advanceButton.dataset.importBoxActionBusy === 'true') return;
    advanceButton.dataset.importBoxActionLabel = desiredLabel;
    advanceButton.title = desiredLabel;
    if (advanceButton.textContent?.trim() !== desiredLabel) {
      advanceButton.textContent = desiredLabel;
    }
  });
}

function handleBoxActionClick(event: MouseEvent) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest<HTMLButtonElement>('.import-box-actions button.button-secondary');
  if (!button || button.disabled) return;
  window.setTimeout(() => lockButton(button), 0);
}

function handleDialogInteraction(event: MouseEvent) {
  if (!lockedButton) return;
  const target = event.target;
  if (!(target instanceof Element)) return;

  const backdrop = target.closest<HTMLElement>('.app-modal-backdrop');
  if (!backdrop) return;

  const button = target.closest<HTMLButtonElement>('button');
  const text = button?.textContent?.trim() ?? '';
  const isClose = button?.getAttribute('aria-label') === 'Cerrar';
  const isCancel = text === 'Cancelar' || text === 'No, volver';
  const clickedBackdrop = target === backdrop;

  if (isClose || isCancel || clickedBackdrop) {
    window.setTimeout(releaseLockedButton, 80);
    return;
  }

  if (text.startsWith('Sí, avanzar')) {
    lockedButton.textContent = 'Procesando…';
  }
}

function handleMutations(records: MutationRecord[]) {
  applyBoxActionLabels();
  if (lockedButton && !lockedButton.isConnected) {
    releaseLockedButton();
    return;
  }

  const hasFailureOrCancellation = records.some((record) =>
    [...record.addedNodes].some((addedNode) => {
      const text = addedNode.textContent ?? '';
      return text.includes('No se pudo actualizar la caja') || text.includes('Acción cancelada');
    }),
  );
  if (hasFailureOrCancellation) releaseLockedButton();
}

export function installImportBoxActionClarity() {
  if (document.documentElement.dataset.importBoxActionClarity === 'true') return;
  document.documentElement.dataset.importBoxActionClarity = 'true';

  document.addEventListener('click', handleBoxActionClick);
  document.addEventListener('mousedown', handleDialogInteraction, true);
  new MutationObserver(handleMutations).observe(document.body, {
    childList: true,
    subtree: true,
  });
  applyBoxActionLabels();
}
