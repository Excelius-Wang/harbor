// @vitest-environment jsdom

import { useRef, useState } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

beforeAll(() => {
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
  HTMLElement.prototype.scrollIntoView = () => {};
});

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(cleanup);

function ControlledOverlay({
  kind,
  customReturn = false,
}: {
  kind: "dialog" | "sheet" | "alert";
  customReturn?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const destination = useRef<HTMLButtonElement>(null);
  const Root = kind === "sheet" ? Sheet : kind === "alert" ? AlertDialog : Dialog;
  const Content =
    kind === "sheet" ? SheetContent : kind === "alert" ? AlertDialogContent : DialogContent;
  const Title = kind === "sheet" ? SheetTitle : kind === "alert" ? AlertDialogTitle : DialogTitle;
  const Description =
    kind === "sheet"
      ? SheetDescription
      : kind === "alert"
        ? AlertDialogDescription
        : DialogDescription;
  return (
    <>
      <button onClick={() => setOpen(true)}>Open editor</button>
      <button ref={destination}>Next action</button>
      <Root open={open} onOpenChange={setOpen}>
        <Content
          onCloseAutoFocus={
            customReturn
              ? (event) => {
                  event.preventDefault();
                  destination.current?.focus();
                }
              : undefined
          }
        >
          <Title>Editor</Title>
          <Description>Review the current item.</Description>
          <input aria-label="Title" />
          {kind === "alert" ? (
            <AlertDialogCancel>Cancel</AlertDialogCancel>
          ) : (
            <button onClick={() => setOpen(false)}>Cancel</button>
          )}
        </Content>
      </Root>
    </>
  );
}

function MenuOverlay() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger>Manage branches</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => setOpen(true)}>Create branch</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Create branch</DialogTitle>
          <DialogDescription>Choose a source branch.</DialogDescription>
          <input aria-label="Branch name" />
        </DialogContent>
      </Dialog>
    </>
  );
}

describe("shared overlay focus return", () => {
  it.each(["dialog", "sheet", "alert"] as const)(
    "restores a controlled %s opener after Escape",
    async (kind) => {
      const user = userEvent.setup();
      render(<ControlledOverlay kind={kind} />);
      const opener = screen.getByRole("button", { name: "Open editor" });
      await user.click(opener);
      await user.click(screen.getByRole("textbox", { name: "Title" }));
      await user.keyboard("{Escape}");
      await waitFor(() => expect(document.activeElement).toBe(opener));
    }
  );
  it("respects a caller's custom close focus", async () => {
    const user = userEvent.setup();
    render(<ControlledOverlay kind="dialog" customReturn />);
    await user.click(screen.getByRole("button", { name: "Open editor" }));
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Next action" }))
    );
  });
  it("preserves the normal Radix Trigger return", async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger>Open editor</DialogTrigger>
        <DialogContent>
          <DialogTitle>Editor</DialogTitle>
          <DialogDescription>Review the current item.</DialogDescription>
        </DialogContent>
      </Dialog>
    );
    const trigger = screen.getByRole("button", { name: "Open editor" });
    await user.click(trigger);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
  it("returns to a menu trigger after its opening menu item unmounts", async () => {
    const user = userEvent.setup();
    render(<MenuOverlay />);
    const trigger = screen.getByRole("button", { name: "Manage branches" });
    await user.click(trigger);
    await user.click(await screen.findByRole("menuitem", { name: "Create branch" }));
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
