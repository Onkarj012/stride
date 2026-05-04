import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useDashboard } from "./context/DashboardContext";

export default function HistoryPage() {
  const {
    today,
    calendarYear,
    calendarMonth,
    calendarData,
    selectedDate,
    setSelectedDate,
    historyDayData,
    calendarPanelPct,
    resizeRef,
    historyContainerRef,
    handlePrevMonth,
    handleNextMonth,
    fetchHistoryDay,
    MONTH_NAMES,
    getDaysInMonth,
    getFirstDayOfMonth,
  } = useDashboard();

  return (
    <motion.div
      ref={historyContainerRef}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col flex-1 min-h-0"
    >
      <div className="flex gap-0 border-2 border-black dark:border-gray-700 overflow-hidden flex-1 min-h-0">
        {/* LEFT PANEL: Calendar */}
        <div
          style={{ width: `${calendarPanelPct}%` }}
          className="shrink-0 overflow-hidden"
        >
          <div className="h-full border-r-2 border-black dark:border-gray-700 p-4 flex flex-col overflow-y-auto">
            <div className="flex items-center justify-between mb-4 shrink-0">
              <button
                onClick={handlePrevMonth}
                className="p-1.5 border-2 border-black dark:border-gray-700 hover:bg-black hover:text-white transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <h2 className="text-base font-black">
                {MONTH_NAMES[calendarMonth - 1]} {calendarYear}
              </h2>
              <button
                onClick={handleNextMonth}
                className="p-1.5 border-2 border-black dark:border-gray-700 hover:bg-black hover:text-white transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-0.5 mb-1 shrink-0">
              {["S", "M", "T", "W", "T", "F", "S"].map((d) => (
                <div
                  key={d}
                  className="text-center text-[10px] font-bold text-neutral-500 dark:text-gray-400 py-0.5"
                >
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0.5 shrink-0">
              {Array.from({
                length: getFirstDayOfMonth(calendarYear, calendarMonth),
              }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}
              {Array.from({
                length: getDaysInMonth(calendarYear, calendarMonth),
              }).map((_, i) => {
                const day = i + 1;
                const dateStr = `${calendarYear}-${String(calendarMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const dayData = calendarData[dateStr];
                const isToday = dateStr === today;
                const isSelected = dateStr === selectedDate;
                return (
                  <button
                    key={day}
                    onClick={() => {
                      setSelectedDate(dateStr);
                      fetchHistoryDay(dateStr);
                    }}
                    className={`aspect-square p-0.5 border-2 transition-colors text-[11px] font-bold flex flex-col items-center justify-center gap-0
                      ${
                        isSelected
                          ? "bg-black dark:bg-gray-100 text-white dark:text-gray-950 border-black dark:border-gray-100"
                          : isToday
                            ? "border-red-600 text-red-600"
                            : "border-black dark:border-gray-700 hover:bg-neutral-100 dark:hover:bg-gray-800"
                      }`}
                  >
                    <span className="leading-none">{day}</span>
                    {dayData && (
                      <div className="flex gap-0.5 mt-px">
                        {dayData.meals > 0 && (
                          <span className="w-1 h-1 rounded-full bg-red-600" />
                        )}
                        {dayData.workouts > 0 && (
                          <span className="w-1 h-1 rounded-full bg-black dark:bg-gray-300" />
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex gap-3 mt-3 text-[10px] font-bold text-neutral-500 dark:text-gray-400 shrink-0">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-600" />{" "}
                MEALS
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-black dark:bg-gray-300" />{" "}
                WORKOUTS
              </span>
            </div>
          </div>
        </div>

        {/* RESIZE HANDLE */}
        <div
          className="w-2 shrink-0 cursor-col-resize hover:bg-red-600 active:bg-red-600 transition-colors bg-neutral-200 dark:bg-gray-700 flex items-center justify-center"
          onMouseDown={(e) => {
            resizeRef.current = {
              startX: e.clientX,
              startPct: calendarPanelPct,
            };
            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";
          }}
        >
          <div className="w-0.5 h-8 rounded-full bg-neutral-400 dark:bg-gray-500" />
        </div>

        {/* RIGHT PANEL: Day detail */}
        <div className="flex-1 min-w-0 overflow-y-auto p-4">
          {selectedDate && historyDayData ? (
            <>
              <h3 className="text-lg font-black mb-4">
                {new Date(
                  selectedDate + "T12:00:00",
                ).toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </h3>

              {historyDayData.meals.length > 0 && (
                <div className="mb-6">
                  <div className="text-xs font-bold text-neutral-500 dark:text-gray-400 mb-3">
                    MEALS
                  </div>
                  <div className="space-y-2">
                    {historyDayData.meals.map((m: any) => (
                      <div
                        key={m._id}
                        className="flex items-center justify-between border-2 border-black dark:border-gray-700 p-4"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold bg-black dark:bg-gray-100 text-white dark:text-gray-950 px-2 py-0.5">
                            {m.time}
                          </span>
                          {m.mealType &&
                            m.mealType !== "unspecified" && (
                              <span className="text-xs font-bold border border-black dark:border-gray-700 px-1.5 py-0.5">
                                {m.mealType.toUpperCase()}
                              </span>
                            )}
                          <span className="text-sm font-bold">
                            {m.name}
                          </span>
                        </div>
                        <span className="text-sm font-bold text-red-600">
                          {m.calories} kcal
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="text-xs font-bold text-neutral-500 dark:text-gray-400 mt-2">
                    TOTAL:{" "}
                    {historyDayData.meals.reduce(
                      (s: number, m: any) => s + m.calories,
                      0,
                    )}{" "}
                    kcal · P:{" "}
                    {historyDayData.meals.reduce(
                      (s: number, m: any) => s + m.protein,
                      0,
                    )}
                    g · C:{" "}
                    {historyDayData.meals.reduce(
                      (s: number, m: any) => s + m.carbs,
                      0,
                    )}
                    g · F:{" "}
                    {historyDayData.meals.reduce(
                      (s: number, m: any) => s + m.fat,
                      0,
                    )}
                    g
                  </div>
                </div>
              )}

              {historyDayData.workouts.length > 0 && (
                <div>
                  <div className="text-xs font-bold text-neutral-500 dark:text-gray-400 mb-3">
                    WORKOUTS
                  </div>
                  <div className="space-y-2">
                    {historyDayData.workouts.map((w: any) => (
                      <div
                        key={w._id}
                        className="border-2 border-black dark:border-gray-700 p-4"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs font-bold px-2 py-0.5 ${w.intensity === "MAX" ? "bg-red-600 text-white" : w.intensity === "HIGH" ? "bg-black dark:bg-gray-100 text-white dark:text-gray-950" : "border border-black dark:border-gray-700"}`}
                          >
                            {w.intensity}
                          </span>
                          <span className="text-sm font-bold">
                            {w.name}
                          </span>
                          {w.duration && (
                            <span className="text-xs text-neutral-500 dark:text-gray-400">
                              {w.duration}
                            </span>
                          )}
                        </div>
                        {w.exercises && w.exercises.length > 0 && (
                          <div className="mt-2 text-xs text-neutral-500 dark:text-gray-400">
                            {w.exercises
                              .map((ex: any) => ex.name)
                              .join(" · ")}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {historyDayData.meals.length === 0 &&
                historyDayData.workouts.length === 0 && (
                  <div className="text-sm font-bold text-neutral-500 dark:text-gray-400">
                    No data logged for this day.
                  </div>
                )}
            </>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-sm font-bold text-neutral-500 dark:text-gray-400 text-center">
                {selectedDate
                  ? "LOADING..."
                  : "SELECT A DATE FROM THE CALENDAR TO VIEW DETAILS."}
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
