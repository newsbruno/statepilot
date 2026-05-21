import type { Page } from "playwright";
import type { ElementRole, RawBrowserState } from "@statepilot/browser-state";

export async function readPlaywrightState(page: Page): Promise<RawBrowserState> {
  const [title, visibleText, snapshot] = await Promise.all([
    page.title(),
    page.locator("body").innerText().catch(() => ""),
    page.evaluate(() => document.body?.innerHTML ?? "")
  ]);

  const interactiveElements = await page.evaluate(() => {
    const nodes = Array.from(
      document.querySelectorAll("a,button,input,textarea,select,table,[role='button'],[role='link']")
    );

    return nodes.slice(0, 200).map((node, index) => {
      const element = node as HTMLElement;
      const input = element instanceof HTMLInputElement ? element : null;
      const rect = element.getBoundingClientRect();
      const role = inferRole(element);
      const selector = buildSelector(element, index);
      const visible = isVisible(element, rect);

      return {
        role,
        text: normalize(element.innerText || element.textContent || ""),
        ariaLabel: element.getAttribute("aria-label") ?? undefined,
        placeholder: input?.placeholder || undefined,
        name: input?.name || element.getAttribute("name") || undefined,
        selector,
        stableSelector: element.id ? `#${CSS.escape(element.id)}` : selector,
        bbox: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height
        },
        visible,
        enabled: !("disabled" in element && Boolean((element as HTMLButtonElement).disabled))
      };
    });

    function inferRole(element: HTMLElement): ElementRole {
      const explicitRole = element.getAttribute("role");
      if (explicitRole === "button" || explicitRole === "link") {
        return explicitRole;
      }

      const tagName = element.tagName.toLowerCase();
      if (tagName === "button") {
        return "button";
      }

      if (tagName === "a") {
        return "link";
      }

      if (tagName === "textarea") {
        return "textarea";
      }

      if (tagName === "select") {
        return "select";
      }

      if (tagName === "table") {
        return "table";
      }

      if (element instanceof HTMLInputElement) {
        if (element.type === "checkbox") {
          return "checkbox";
        }

        if (element.type === "radio") {
          return "radio";
        }

        if (element.type === "file") {
          return "file";
        }

        return "input";
      }

      return "unknown";
    }

    function buildSelector(element: HTMLElement, index: number): string {
      if (element.id) {
        return `#${CSS.escape(element.id)}`;
      }

      const dataTestId = element.getAttribute("data-testid");
      if (dataTestId) {
        return `[data-testid="${CSS.escape(dataTestId)}"]`;
      }

      const name = element.getAttribute("name");
      if (name) {
        return `${element.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
      }

      return `${element.tagName.toLowerCase()}:nth-of-type(${index + 1})`;
    }

    function normalize(value: string): string {
      return value.replace(/\s+/g, " ").trim();
    }

    function isVisible(element: HTMLElement, rect: DOMRect): boolean {
      const style = window.getComputedStyle(element);
      const right = rect.x + rect.width;
      const bottom = rect.y + rect.height;
      const inViewport = right > 0 && bottom > 0 && rect.x < window.innerWidth && rect.y < window.innerHeight;
      const nativeVisible =
        typeof element.checkVisibility === "function"
          ? element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
          : true;
      const clipped = (style.clip && style.clip !== "auto") || (style.clipPath && style.clipPath !== "none");
      const screenReaderOnly = ["screen-reader-text", "sr-only", "visually-hidden"].some((className) =>
        element.classList.contains(className)
      );

      return (
        nativeVisible &&
        !screenReaderOnly &&
        !clipped &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity) > 0 &&
        rect.width > 0 &&
        rect.height > 0 &&
        inViewport
      );
    }
  });

  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };

  return {
    url: page.url(),
    title,
    domSnapshot: snapshot,
    visibleText,
    interactiveElements,
    viewport
  };
}
