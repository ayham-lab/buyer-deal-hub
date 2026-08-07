import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BuyerMatchDetailsDialog, type BuyerMatchDetails } from "./BuyerMatchDetailsDialog";

const base: BuyerMatchDetails = {
  id: "b1",
  name: "Jane Investor",
  email: "jane@example.com",
  phone: "(555) 123-4567",
  markets: ["Atlanta, GA", "Macon, GA", "Savannah, GA", "Augusta, GA"],
  property_types: ["SFH", "MFH 2-4"],
  price_min: 100000,
  price_max: 250000,
  source: "3 tenant(s)",
  score: 94.6,
  reason: "Direct city match",
  profile_complete: true,
  profile_completeness: 100,
};

describe("BuyerMatchDetailsDialog", () => {
  it("renders nothing when no match is selected", () => {
    const { container } = render(
      <BuyerMatchDetailsDialog match={null} displayName="" onClose={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows every market, not just the first two the card displays", () => {
    render(
      <BuyerMatchDetailsDialog
        match={{ ...base, revealed: true }}
        displayName="Jane Investor"
        onClose={() => {}}
      />,
    );
    for (const m of base.markets!) {
      expect(screen.getByText(m)).toBeInTheDocument();
    }
    expect(screen.getByText("SFH")).toBeInTheDocument();
    expect(screen.getByText("MFH 2-4")).toBeInTheDocument();
    expect(screen.getByText("$100,000 – $250,000")).toBeInTheDocument();
    expect(screen.getByText("Direct city match")).toBeInTheDocument();
    expect(screen.getByText("Match score 95")).toBeInTheDocument();
  });

  it("keeps contact and source hidden until the buyer is revealed", () => {
    render(
      <BuyerMatchDetailsDialog
        match={{ ...base, revealed: false, email: null, phone: null, source: null }}
        displayName="Jane I•••••••"
        revealCost={3}
        onReveal={() => {}}
        onAdd={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByText("jane@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText("(555) 123-4567")).not.toBeInTheDocument();
    expect(screen.getByText("Hidden")).toBeInTheDocument();
    expect(screen.getByText("Jane I•••••••")).toBeInTheDocument();
    // locked => reveal CTA only, no add-to-rolodex
    expect(screen.getByRole("button", { name: /Reveal Contact \(3 credits\)/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add to Rolodex/ })).not.toBeInTheDocument();
  });

  it("shows contact and the add action once revealed", () => {
    render(
      <BuyerMatchDetailsDialog
        match={{ ...base, revealed: true }}
        displayName="Jane Investor"
        revealCost={3}
        onReveal={() => {}}
        onAdd={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("jane@example.com")).toBeInTheDocument();
    expect(screen.getByText("(555) 123-4567")).toBeInTheDocument();
    expect(screen.getByText("3 tenant(s)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add to Rolodex/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Reveal Contact/ })).not.toBeInTheDocument();
  });

  it("fires the reveal and add callbacks", () => {
    const onReveal = vi.fn();
    const { rerender } = render(
      <BuyerMatchDetailsDialog
        match={{ ...base, revealed: false, email: null, phone: null }}
        displayName="Jane I•••••••"
        revealCost={3}
        onReveal={onReveal}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Reveal Contact/ }));
    expect(onReveal).toHaveBeenCalledTimes(1);

    const onAdd = vi.fn();
    rerender(
      <BuyerMatchDetailsDialog
        match={{ ...base, revealed: true }}
        displayName="Jane Investor"
        onAdd={onAdd}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Add to Rolodex/ }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("omits the action bar entirely when no actions are supplied", () => {
    render(
      <BuyerMatchDetailsDialog
        match={{ ...base, revealed: true }}
        displayName="Jane Investor"
        onClose={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: /Add to Rolodex/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Reveal Contact/ })).not.toBeInTheDocument();
  });

  it("handles a match with no markets or price without crashing", () => {
    render(
      <BuyerMatchDetailsDialog
        match={{ id: "x", name: "Sparse", score: 10, reason: "", revealed: true, markets: [], property_types: [] }}
        displayName="Sparse"
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("Sparse")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});
