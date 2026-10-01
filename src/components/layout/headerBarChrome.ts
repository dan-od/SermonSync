/** Scoped stylesheet for the header bar's hover/active chrome. */
export const headerChrome = `
    .ss-header-win {
      display: grid;
      place-items: center;
      width: 22px;
      height: 22px;
      border: none;
      background: transparent;
      color: var(--fg-muted);
      cursor: pointer;
      line-height: 1;
      transition: background-color 0.15s ease, color 0.15s ease;
    }
    .ss-header-win:hover {
      background: var(--color-primary-muted);
      color: var(--fg-base);
    }
    .ss-header-win--danger:hover {
      background: var(--color-error);
      color: var(--fg-on-accent);
    }

    .ss-header-override {
      display: flex;
      align-items: center;
      gap: 4px;
      border: none;
      background: transparent;
      color: var(--fg-muted);
      padding: 4px 8px;
      border-radius: var(--radius-full);
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.02em;
      cursor: pointer;
      transition: background-color 0.15s ease, color 0.15s ease;
    }
    .ss-header-override:hover {
      color: var(--fg-base);
      background: var(--color-primary-muted);
    }
    .ss-header-override.active {
      color: var(--fg-base);
      background: var(--color-primary-muted);
    }

    .ss-header-settings {
      display: grid;
      place-items: center;
      width: 24px;
      height: 24px;
      border: none;
      border-radius: 4px;
      background: transparent;
      color: var(--fg-muted);
      cursor: pointer;
      transition: background-color 0.3s ease, color 0.3s ease, transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    .ss-header-settings svg {
      width: 13px;
      height: 13px;
    }
    .ss-header-settings:hover {
      background: var(--color-primary-muted);
      color: var(--fg-base);
      transform: rotate(75deg);
    }

    .ss-header-theme {
      display: flex;
      align-items: center;
      border: none;
      background: transparent;
      padding: 0;
      cursor: default;
    }
    .ss-header-theme-track {
      display: flex;
      align-items: center;
      background: var(--bg-elevated);
      border: none;
      border-radius: 4px;
      overflow: hidden;
      gap: 0;
    }
    .ss-header-theme-opt {
      border: none;
      background: transparent;
      color: var(--fg-muted);
      padding: 3px 8px;
      font-size: 9px;
      font-family: var(--font-mono);
      font-weight: 600;
      letter-spacing: 0.05em;
      cursor: pointer;
      transition: background-color 0.15s ease, color 0.15s ease;
      line-height: 1;
    }
    .ss-header-theme-opt:hover {
      color: var(--fg-base);
    }
    .ss-header-theme-opt.active {
      background: var(--color-primary-muted);
      color: var(--fg-base);
    }

    .ss-header-session {
      border: none;
      border-radius: 4px;
      background: var(--bg-elevated);
      color: var(--fg-base);
      padding: 4px 8px;
      font-family: var(--font-mono);
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.05em;
      cursor: pointer;
      transition: background-color 0.15s ease, color 0.15s ease;
    }
    .ss-header-session.active {
      color: var(--color-error);
    }
    .ss-header-session:hover {
      background: var(--color-primary-muted);
      color: var(--fg-base);
    }
  `;
