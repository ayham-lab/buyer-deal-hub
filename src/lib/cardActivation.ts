import type { KeyboardEvent, MouseEvent } from "react";

/**
 * Props that turn a container into a keyboard-accessible "open details" target.
 *
 * The card contains its own buttons (Reveal Contact / Add to Rolodex), so both
 * handlers must ignore events that originate inside those controls:
 *
 *  - click  : the buttons call stopPropagation themselves, but we also guard
 *             here so a future nested control can't accidentally open the card.
 *  - keydown: Enter/Space on a nested <button> bubbles up. Without the target
 *             check, Enter would fire the button *and* open the card, while
 *             Space would be preventDefault()-ed here and never activate the
 *             button at all.
 *
 * Returns an empty object when no handler is supplied, so the container stays
 * non-interactive (no role, no tab stop).
 */
export function cardActivationProps(onActivate?: () => void) {
  if (!onActivate) return {};
  return {
    role: "button" as const,
    tabIndex: 0,
    onClick: (e: MouseEvent<HTMLElement>) => {
      if (e.target !== e.currentTarget && (e.target as HTMLElement).closest("button,a,input,select,textarea")) return;
      onActivate();
    },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate();
      }
    },
  };
}
