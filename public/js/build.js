/** Bump version + builtAt on every UI/JS ship so users can verify the live build. */
export const APP_BUILD = {
  version: 48,
  builtAt: "2026-07-15 19:51",
  tz: "+07",
};

export function buildLabel() {
  return `v${APP_BUILD.version} · ${APP_BUILD.builtAt} ${APP_BUILD.tz}`;
}
