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

    .ss-menubar-trigger {
      height: 24px;
      padding: 0 8px;
      border: 0;
      border-radius: 3px;
      background: transparent;
      color: var(--fg-base);
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
    }
    .ss-menubar-trigger:hover,
    .ss-menubar-trigger[aria-expanded="true"] {
      background: var(--bg-elevated);
    }
    .ss-menubar-popup {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      z-index: 2000;
      min-width: 218px;
      max-height: min(420px, calc(100vh - 48px));
      overflow: auto;
      padding: 4px;
      border: none;
      border-radius: 5px;
      background: var(--bg-surface);
      box-shadow: var(--shadow-md);
    }
    .ss-menubar-item {
      display: flex;
      align-items: center;
      gap: 16px;
      width: 100%;
      height: 25px;
      box-sizing: border-box;
      padding: 0 8px;
      border: 0;
      border-radius: 3px;
      background: transparent;
      color: var(--fg-base);
      text-align: left;
      font-size: 11px;
      cursor: pointer;
    }
    .ss-menubar-item:hover,
    .ss-menubar-item:focus-visible {
      outline: none;
      background: var(--color-primary-muted);
    }
    .ss-menubar-check {
      width: 12px;
      flex: 0 0 12px;
      color: var(--fg-muted);
      text-align: center;
    }
    .ss-menubar-shortcut {
      margin-left: auto;
      color: var(--fg-subtle);
      font-size: 10px;
    }
    .ss-menubar-separator {
      height: 1px;
      margin: 4px 4px;
      background: var(--border-base);
    }
  `;
