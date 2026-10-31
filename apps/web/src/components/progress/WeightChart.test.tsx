import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { formatDayLabel } from "@/lib/date";
import { WeightChart, weightChartLabel, weightPointText, type WeightPoint } from "./WeightChart";

const points: WeightPoint[] = [
  { localDate: "2026-10-12", kg: 80.2, trendKg: 80.4 },
  { localDate: "2026-10-13", kg: 79.8, trendKg: 80.1 },
  { localDate: "2026-10-14", kg: 79.5, trendKg: 79.9 },
];

function renderChart() {
  return render(<WeightChart points={points} from="2026-10-01" to="2026-10-14" units="metric" />);
}

function chart() {
  return screen.getByRole("group");
}

// jsdom reports a zero box, which would make every pointer land on NaN.
function stubChartBox(svg: HTMLElement) {
  svg.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 760,
      bottom: 260,
      width: 760,
      height: 260,
      toJSON() {
        return {};
      },
    }) as DOMRect;
}

describe("weightPointText", () => {
  it("names the day, the scale weight and the trend in the user's unit", () => {
    const point = { localDate: "2026-10-14", kg: 70, trendKg: 70.2 };
    expect(weightPointText(point, "metric")).toBe(`${formatDayLabel(point.localDate)}, 70.0 kg, trend 70.2 kg`);
    expect(weightPointText(point, "imperial")).toBe(`${formatDayLabel(point.localDate)}, 154 lb, trend 155 lb`);
  });
});

describe("weightChartLabel", () => {
  it("counts one weigh-in in the singular and points at the latest day", () => {
    const only = points[2]!;
    expect(weightChartLabel([only], "metric")).toBe(
      `Weight trend, 1 weigh-in. Latest ${weightPointText(only, "metric")}. Arrow keys read each day.`,
    );
  });

  it("says there is nothing to read when the range is empty", () => {
    expect(weightChartLabel([], "metric")).toBe("Weight trend. No weigh-ins yet.");
  });
});

describe("WeightChart", () => {
  it("names the chart with the latest weigh-in", () => {
    renderChart();
    expect(chart()).toHaveAccessibleName(
      `Weight trend, 3 weigh-ins. Latest ${weightPointText(points[2]!, "metric")}. Arrow keys read each day.`,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the same tip on pointer move and clears it when the pointer leaves", () => {
    renderChart();
    const svg = chart();
    stubChartBox(svg);
    fireEvent.pointerMove(svg, { clientX: 0, clientY: 40 });
    expect(screen.getByText("80.2 kg")).toBeInTheDocument();
    fireEvent.pointerLeave(svg);
    expect(screen.queryByText("80.2 kg")).not.toBeInTheDocument();
  });

  it("reads the latest day on keyboard focus, then steps with the arrow keys", () => {
    renderChart();
    fireEvent.focus(chart());
    expect(screen.getByRole("status")).toHaveTextContent(weightPointText(points[2]!, "metric"));

    fireEvent.keyDown(chart(), { key: "ArrowLeft" });
    expect(screen.getByRole("status")).toHaveTextContent(weightPointText(points[1]!, "metric"));

    fireEvent.keyDown(chart(), { key: "Home" });
    expect(screen.getByRole("status")).toHaveTextContent(weightPointText(points[0]!, "metric"));

    fireEvent.keyDown(chart(), { key: "ArrowLeft" });
    expect(screen.getByRole("status")).toHaveTextContent(weightPointText(points[0]!, "metric"));

    fireEvent.keyDown(chart(), { key: "End" });
    expect(screen.getByRole("status")).toHaveTextContent(weightPointText(points[2]!, "metric"));

    fireEvent.keyDown(chart(), { key: "ArrowRight" });
    expect(screen.getByRole("status")).toHaveTextContent(weightPointText(points[2]!, "metric"));
  });

  it("steps from the hovered day when an arrow key is pressed", () => {
    renderChart();
    const svg = chart();
    stubChartBox(svg);
    fireEvent.pointerMove(svg, { clientX: 0, clientY: 40 });
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(screen.getByRole("status")).toHaveTextContent(weightPointText(points[1]!, "metric"));
  });

  it("does not pin a reading after a click once the pointer leaves", () => {
    renderChart();
    fireEvent.pointerDown(chart());
    fireEvent.focus(chart());
    fireEvent.pointerLeave(chart());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText("79.5 kg")).not.toBeInTheDocument();
  });

  it("clears the keyboard reading when focus leaves", () => {
    renderChart();
    fireEvent.focus(chart());
    fireEvent.blur(chart());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
