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
