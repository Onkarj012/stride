import { Card } from "./ui/Card";
import { ProgressBar } from "./ui/ProgressBar";

export function RemainingBudget({
  totalCals,
  totalProtein,
  totalCarbs,
  totalFat,
  goals,
}: {
  totalCals: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  goals: {
    calorieGoal: number;
    proteinGoal: number;
    carbGoal: number;
    fatGoal: number;
  };
}) {
  const remaining = {
    calories: Math.max(0, goals.calorieGoal - totalCals),
    protein: Math.max(0, goals.proteinGoal - totalProtein),
    carbs: Math.max(0, goals.carbGoal - totalCarbs),
    fat: Math.max(0, goals.fatGoal - totalFat),
  };

  return (
    <Card className="p-4 mb-4">
      <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] mb-3 tracking-wider">
        TODAY'S REMAINING BUDGET
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <BudgetItem
          label="KCAL"
          used={totalCals}
          remaining={remaining.calories}
          goal={goals.calorieGoal}
        />
        <BudgetItem
          label="PRO"
          used={totalProtein}
          remaining={remaining.protein}
          goal={goals.proteinGoal}
          unit="g"
        />
        <BudgetItem
          label="CARB"
          used={totalCarbs}
          remaining={remaining.carbs}
          goal={goals.carbGoal}
          unit="g"
        />
        <BudgetItem
          label="FAT"
          used={totalFat}
          remaining={remaining.fat}
          goal={goals.fatGoal}
          unit="g"
        />
      </div>
    </Card>
  );
}

function BudgetItem({
  label,
  used,
  remaining,
  goal,
  unit = "",
}: {
  label: string;
  used: number;
  remaining: number;
  goal: number;
  unit?: string;
}) {
  const pct = goal > 0 ? Math.min(100, (used / goal) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs font-mono mb-1 tracking-wide">
        <span className="text-[var(--text-muted)]">{label}</span>
        <span className="text-accent font-bold">
          {remaining}
          {unit}
        </span>
      </div>
      <div className="h-2 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
        <div
          className="h-full bg-accent transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-[10px] font-mono text-[var(--text-muted)] mt-0.5 tracking-wide">
        {used}/{goal}
        {unit}
      </div>
    </div>
  );
}
