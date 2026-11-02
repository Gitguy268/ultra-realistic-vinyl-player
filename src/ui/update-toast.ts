import { registerSW } from 'virtual:pwa-register';
import { byId } from './dom';

/**
 * Registers the service worker. When a new version is waiting, shows a toast;
 * nothing is reloaded or activated unless the user presses Reload.
 */
export function bindUpdateToast(): void {
  const toast = byId<HTMLElement>('update-toast');
  const update = registerSW({
    onNeedRefresh() {
      toast.hidden = false;
    },
  });
  byId('update-reload').addEventListener('click', () => void update(true));
  byId('update-dismiss').addEventListener('click', () => {
    toast.hidden = true;
  });
}
