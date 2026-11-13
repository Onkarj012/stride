import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { targetsFor } from "@/lib/log";
import { dayBarLabel, kcalHeroLabel, macroLabel } from "@/lib/speech";
import { TotalsCard } from "./TotalsCard";

const over = { kcal: 2234, protein: 42.6, carbs: 180.2, fat: 70.4 };
const targets = targetsFor(2000);
const meals = [
  { slot: "breakfast" as const, kcal: 400.4 },
  { slot: "lunch" as const, kcal: 1833.6 },
];

describe("TotalsCard", () => {
  it("reads an over day as sentences, not a bare number", () => {
    render(<TotalsCard nutrients={over} targets={targets} meals={meals} isToday />);

    expect(screen.getByRole("region", { name: "Day totals" })).toHaveTextContent(kcalHeroLabel(targets.kcal, over.kcal));
    expect(screen.queryByLabelText("234")).not.toBeInTheDocument();
    expect(screen.getByText("Over").closest("[aria-hidden='true']")).not.toBeNull();

    const protein = macroLabel("Protein", over.protein, targets.proteinG);
    expect(screen.getByText(protein).closest("[aria-hidden='true']")).toBeNull();
    expect(screen.getByText(macroLabel("Carbs", over.carbs, targets.carbsG))).toBeInTheDocument();
    expect(screen.getByText(macroLabel("Fat", over.fat, targets.fatG))).toBeInTheDocument();
    expect(screen.getByText("Protein").closest("[aria-hidden='true']")).not.toBeNull();

    const bar = dayBarLabel([
      { name: "Breakfast", kcal: 400.4 },
      { name: "Lunch", kcal: 1833.6 },
    ]);
    expect(screen.getByText(bar).closest("[aria-hidden='true']")).toBeNull();
    expect(screen.getByText("Breakfast · Lunch").closest("[aria-hidden='true']")).not.toBeNull();
  });

  it("says left on a past day under target, and keeps an empty meal bar readable", () => {
    render(
      <TotalsCard
        nutrients={{ kcal: 766.4, protein: 20, carbs: 80, fat: 15 }}
        targets={targetsFor(2000)}
        meals={[]}
        isToday={false}
      />,
    );

    expect(screen.getByText("1,234 kcal left of 2,000. 766 eaten.").closest("[aria-hidden='true']")).toBeNull();
    expect(screen.getByText("Left").closest("[aria-hidden='true']")).not.toBeNull();
    expect(screen.queryByText("Left today")).not.toBeInTheDocument();
    expect(screen.getByText("No meals yet").closest("[aria-hidden='true']")).toBeNull();
  });
});
