// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Progress } from "./progress";

afterEach(cleanup);

describe("Progress", () => {
  it("renders an unspecified value as an indeterminate progress indicator", () => {
    const { container } = render(<Progress aria-label="Loading" />);
    const indicator = container.querySelector('[data-slot="progress-indicator"]');

    expect(screen.getByRole("progressbar", { name: "Loading" }).dataset.state).toBe(
      "indeterminate"
    );
    expect(indicator?.className.split(" ")).toContain("harbor-progress-indeterminate");
    expect(indicator?.getAttribute("style")).toBeNull();
  });
});

it("keeps the visible fill consistent with the announced custom maximum", () => {
  const view = render(<Progress aria-label="Download" value={150} max={200} />);
  const bar = screen.getByRole("progressbar", { name: "Download" });
  const indicator = bar.querySelector<HTMLElement>("[data-slot=progress-indicator]")!;
  expect(bar.getAttribute("aria-valuetext")).toBe("75%");
  expect(indicator.style.transform).toBe("translateX(-25%)");

  view.rerender(<Progress aria-label="Download" value={200} max={200} />);
  expect(bar.getAttribute("data-state")).toBe("complete");
  expect(indicator.style.transform).toBe("translateX(-0%)");

  view.rerender(<Progress aria-label="Download" max={200} />);
  expect(bar.hasAttribute("aria-valuenow")).toBe(false);
  expect(indicator.style.transform).toBe("");
  expect(indicator.classList.contains("harbor-progress-indeterminate")).toBe(true);
});
