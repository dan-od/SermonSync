export const shellReset = `
  html, body, #root {
    height: 100%;
    margin: 0;
    background: var(--bg-base);
  }

  body {
    background: var(--bg-base);
    color: var(--fg-base);
    font-family: var(--font-sans);
    -webkit-user-select: none;
    user-select: none;
  }

  #root {
    width: 100%;
    -webkit-user-select: none;
    user-select: none;
  }

  button, input, select, textarea {
    font: inherit;
  }

  input, textarea, [contenteditable="true"] {
    -webkit-user-select: text;
    user-select: text;
  }
`;
