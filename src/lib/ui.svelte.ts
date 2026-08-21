/** Whether the app is filling the screen for a lesson. The header hides when it is. */
export const ui = $state({ teaching: false });

/**
 * Best-effort real fullscreen on top of the overlay. Browsers refuse it outside a user
 * gesture and some refuse it entirely, so nothing depends on it working.
 */
export async function enterTeaching() {
  ui.teaching = true;
  try {
    await document.documentElement.requestFullscreen?.();
  } catch {
    // The overlay alone is enough.
  }
}

export async function leaveTeaching() {
  ui.teaching = false;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
  } catch {
    // Already out, or never in.
  }
}
