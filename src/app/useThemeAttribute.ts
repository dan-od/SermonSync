import { useLayoutEffect } from "react";

export function useThemeAttribute(theme: string) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.add("theme-switching");
    root.dataset.theme = theme;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => root.classList.remove("theme-switching"));
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      root.classList.remove("theme-switching");
    };
  }, [theme]);
}
