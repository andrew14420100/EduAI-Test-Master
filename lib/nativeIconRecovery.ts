import type { NativeAppIconId } from './nativeAppIcon';

export type IconSelectionSnapshot = {
  iconId: NativeAppIconId;
  ownedItemId?: string;
};

export type IconRollbackResult =
  | { ok: true }
  | { ok: false; error: unknown };

type IconRollbackDependencies = {
  restoreServerSelection: () => Promise<void>;
  applyNativeIcon: (iconId: NativeAppIconId) => Promise<void>;
  refresh: () => Promise<void>;
  onNativeIconRestored?: (iconId: NativeAppIconId) => void;
  onNativeIconRestoreFailed?: () => void;
};

/**
 * Restores the server selection and native icon after a bridge rejection.
 * Each phase runs independently so a failed server/native refresh is reported
 * without hiding a later phase that may still restore the user's state.
 */
export async function restoreNativeIconSelection(
  previous: IconSelectionSnapshot,
  dependencies: IconRollbackDependencies,
): Promise<IconRollbackResult> {
  let rollbackError: unknown = null;

  try {
    await dependencies.restoreServerSelection();
  } catch (error) {
    rollbackError = error;
  }

  try {
    await dependencies.applyNativeIcon(previous.iconId);
    dependencies.onNativeIconRestored?.(previous.iconId);
  } catch (error) {
    rollbackError ??= error;
    dependencies.onNativeIconRestoreFailed?.();
  }

  try {
    await dependencies.refresh();
  } catch (error) {
    rollbackError ??= error;
  }

  return rollbackError ? { ok: false, error: rollbackError } : { ok: true };
}

export function nativeIconErrorMessage(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === 'E_ALTERNATE_ICONS_UNAVAILABLE') {
    return 'Questo dispositivo non supporta le icone personalizzate.';
  }
  if (code === 'E_INVALID_ICON') {
    return 'Questa icona non è disponibile in questa versione dell’app.';
  }
  return 'Il sistema operativo non ha accettato il cambio icona.';
}

export function nativeIconRecoveryMessage(
  operation: 'acquisto' | 'equipaggiamento' | 'ripristino',
  requestedIcon: NativeAppIconId,
  nativeError: unknown,
  rollback: IconRollbackResult,
): string {
  const operationMessage = operation === 'acquisto'
    ? 'L’acquisto è stato conservato nella tua collezione e non devi pagarlo di nuovo.'
    : operation === 'equipaggiamento'
      ? 'L’oggetto resta nella tua collezione e l’equipaggiamento precedente è stato mantenuto.'
      : 'L’icona personalizzata precedente è stata mantenuta.';
  const rollbackMessage = rollback.ok
    ? operationMessage
    : `${operationMessage} Il ripristino automatico non è riuscito del tutto: aggiorna il negozio e usa “Icona standard originale”, quindi riprova.`;
  const iconLabel = requestedIcon === 'standard' ? 'l’icona standard' : 'l’icona selezionata';
  return `Non è stato possibile applicare ${iconLabel}. ${nativeIconErrorMessage(nativeError)} ${rollbackMessage} Puoi riprovare quando vuoi.`;
}