import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { cardActivationProps } from "./cardActivation";

function Card({ onOpen, onAct }: { onOpen?: () => void; onAct?: () => void }) {
  return (
    <div {...cardActivationProps(onOpen)} data-testid="card">
      <span>Buyer name</span>
      <button onClick={(e) => { e.stopPropagation(); onAct?.(); }}>Reveal Contact</button>
    </div>
  );
}

describe("cardActivationProps", () => {
  it("returns no interactive props when no handler is given", () => {
    render(<Card />);
    const card = screen.getByTestId("card");
    expect(card).not.toHaveAttribute("role", "button");
    expect(card).not.toHaveAttribute("tabindex");
  });

  it("marks the card as a keyboard-reachable button when a handler is given", () => {
    render(<Card onOpen={() => {}} />);
    const card = screen.getByTestId("card");
    expect(card).toHaveAttribute("role", "button");
    expect(card).toHaveAttribute("tabindex", "0");
  });

  it("opens on click of the card itself", () => {
    const onOpen = vi.fn();
    render(<Card onOpen={onOpen} />);
    fireEvent.click(screen.getByTestId("card"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("opens on Enter and Space when the card itself is focused", () => {
    const onOpen = vi.fn();
    render(<Card onOpen={onOpen} />);
    const card = screen.getByTestId("card");
    fireEvent.keyDown(card, { key: "Enter" });
    fireEvent.keyDown(card, { key: " " });
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("ignores other keys", () => {
    const onOpen = vi.fn();
    render(<Card onOpen={onOpen} />);
    fireEvent.keyDown(screen.getByTestId("card"), { key: "a" });
    expect(onOpen).not.toHaveBeenCalled();
  });

  // --- regression guards: nested controls must not also open the card -------

  it("does not open when the nested button is clicked", () => {
    const onOpen = vi.fn();
    const onAct = vi.fn();
    render(<Card onOpen={onOpen} onAct={onAct} />);
    fireEvent.click(screen.getByRole("button", { name: "Reveal Contact" }));
    expect(onAct).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("does not open when Enter is pressed on the nested button", () => {
    const onOpen = vi.fn();
    render(<Card onOpen={onOpen} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Reveal Contact" }), { key: "Enter" });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("does not swallow Space on the nested button", () => {
    // A bubbled preventDefault() here would cancel the button's own activation,
    // making "Reveal Contact" unusable by keyboard.
    const onOpen = vi.fn();
    render(<Card onOpen={onOpen} />);
    const notCancelled = fireEvent.keyDown(
      screen.getByRole("button", { name: "Reveal Contact" }),
      { key: " ", cancelable: true },
    );
    expect(onOpen).not.toHaveBeenCalled();
    expect(notCancelled).toBe(true);
  });
});
