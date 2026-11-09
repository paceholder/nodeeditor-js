/// <reference types="@vitest/browser-playwright" />
import { describe, expect, it } from "vitest";
import { screenSvg } from "./svg-safety.js";

const svg = (inner: string, attrs = 'viewBox="0 0 40 20"'): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ${attrs}>${inner}</svg>`;

describe("svg safety", () => {
  it("accepts a plain symbol and gives it an explicit size", () => {
    const r = screenSvg(
      svg(
        '<defs><linearGradient id="g"/></defs><circle cx="10" cy="10" r="8" fill="url(#g)" stroke="#fff"/><use href="#g"/>',
      ),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.width).toBe(40);
      expect(r.value.height).toBe(20);
      expect(r.value.text).toContain('width="40"');
    }
  });

  it("width and height attributes win over the viewBox", () => {
    const r = screenSvg(
      svg("<rect/>", 'width="80" height="60" viewBox="0 0 8 6"'),
    );
    expect(r.ok && [r.value.width, r.value.height]).toEqual([80, 60]);
  });

  it.each([
    ["script element", svg("<script>alert(1)</script>")],
    ["event attribute", svg('<circle r="5" onclick="x()"/>')],
    ["load handler", svg("<rect/>", 'viewBox="0 0 1 1" onload="x()"')],
    ["foreignObject", svg("<foreignObject><div/></foreignObject>")],
    ["external image href", svg('<image href="http://example.com/a.png"/>')],
    [
      "external xlink:href",
      svg('<image xlink:href="https://example.com/a.png"/>'),
    ],
    ["javascript href", svg('<a href="javascript:alert(1)"><rect/></a>')],
    ["external use", svg('<use href="other.svg#a"/>')],
    [
      "external url() attribute",
      svg('<rect fill="url(http://example.com/x)"/>'),
    ],
    [
      "external url() in style attribute",
      svg('<rect style="fill:url(https://e.com/x)"/>'),
    ],
    [
      "external url() in style element",
      svg("<style>rect{fill:url('//e.com/x')}</style>"),
    ],
    ["css import", svg("<style>@import 'x.css';</style>")],
    [
      "entity declaration",
      '<!DOCTYPE svg [<!ENTITY a "b">]><svg xmlns="http://www.w3.org/2000/svg"/>',
    ],
    ["not well-formed", "<svg"],
    ["not an svg", "<html/>"],
  ])("rejects %s", (_name, text) => {
    expect(screenSvg(text).ok).toBe(false);
  });

  it("accepts inline data images and fragment references only", () => {
    expect(
      screenSvg(
        svg('<image href="data:image/png;base64,AAAA" width="2" height="2"/>'),
      ).ok,
    ).toBe(true);
    expect(screenSvg(svg('<image href="data:text/html,x"/>')).ok).toBe(false);
  });

  it("oversized text is rejected", () => {
    expect(screenSvg(svg("<rect/>"), 10).ok).toBe(false);
  });
});

describe("bounded SVG intrinsic size", () => {
  it("a huge declared size is scaled down to the maximum side, keeping the aspect", () => {
    const square = screenSvg(svg("<rect/>", 'width="30000" height="30000"'));
    expect(square.ok && [square.value.width, square.value.height]).toEqual([
      4096, 4096,
    ]);
    const wide = screenSvg(svg("<rect/>", 'viewBox="0 0 20000 5000"'));
    expect(wide.ok && [wide.value.width, wide.value.height]).toEqual([
      4096, 1024,
    ]);
    // The serialized markup carries the clamped size that is decoded.
    expect(square.ok && square.value.text).toContain('width="4096"');
  });
});
