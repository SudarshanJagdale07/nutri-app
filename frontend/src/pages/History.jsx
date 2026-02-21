// frontend/src/pages/History.jsx
import React, { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

function History() {
  const [activeTab, setActiveTab] = useState("history");

  // Mock data (replace with API later)
  const weeklyData = [
    { day: "Mon", calories: 1800, protein: 70, sugar: 40 },
    { day: "Tue", calories: 2100, protein: 85, sugar: 55 },
    { day: "Wed", calories: 1950, protein: 60, sugar: 30 },
    { day: "Thu", calories: 2200, protein: 90, sugar: 70 },
    { day: "Fri", calories: 2000, protein: 75, sugar: 50 },
    { day: "Sat", calories: 2300, protein: 95, sugar: 80 },
    { day: "Sun", calories: 1750, protein: 65, sugar: 35 },
  ];

  const mealHistory = [
    {
      date: "Feb 10, 2026",
      meals: [
        { name: "Breakfast", items: "2 Rotis, Dal", calories: 450 },
        { name: "Lunch", items: "Rice, Paneer Curry", calories: 650 },
      ],
    },
    {
      date: "Feb 9, 2026",
      meals: [{ name: "Dinner", items: "Chicken Biryani", calories: 800 }],
    },
  ];

  const streakDays = [1, 2, 4, 6]; // days where protein goal met

  return (
    <div className="min-h-screen bg-[#F2F6F2] text-[#1A202C] relative overflow-hidden pb-24 font-sans">
      {/* Background accents */}
      <div className="absolute -top-32 -right-32 w-[600px] h-[600px] bg-[#00A676] opacity-10 blur-[140px] rounded-full" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-[#D9E6DC] opacity-40 blur-[120px] rounded-full" />

      <div className="pt-24 px-8 max-w-6xl mx-auto relative z-10">
        {/* Heading */}
        <h1 className="text-4xl font-serif font-bold mb-10">History & Progress</h1>

        {/* Streak Tracker */}
        <div className="bg-white rounded-3xl p-6 shadow-md border border-gray-100 mb-10 transition transform hover:scale-[1.02] hover:shadow-xl">
          <h2 className="text-lg font-semibold mb-4">Protein Goal Streak</h2>

          <div className="flex gap-3">
            {Array.from({ length: 7 }).map((_, index) => (
              <div
                key={index}
                className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium ${
                  streakDays.includes(index) ? "bg-[#00A676] text-white" : "bg-gray-200 text-gray-500"
                }`}
              >
                {index + 1}
              </div>
            ))}
          </div>

          <p className="text-xs text-gray-400 mt-3">Green dot indicates protein goal achieved.</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-6 border-b border-gray-200 mb-8">
          <Tab label="Meal History" active={activeTab === "history"} onClick={() => setActiveTab("history")} />
          <Tab label="Weekly Trends" active={activeTab === "trends"} onClick={() => setActiveTab("trends")} />
          <Tab label="Risk Insights" active={activeTab === "risk"} onClick={() => setActiveTab("risk")} />
        </div>

        {/* Tab Content */}
        {activeTab === "history" && <MealHistorySection mealHistory={mealHistory} />}
        {activeTab === "trends" && <WeeklyTrendsSection weeklyData={weeklyData} />}
        {activeTab === "risk" && <RiskInsightsSection weeklyData={weeklyData} />}
      </div>
    </div>
  );
}

/* ---------- Meal History Section ---------- */
function MealHistorySection({ mealHistory }) {
  return (
    <div className="space-y-6">
      {mealHistory.map((day, index) => (
        <div key={index} className="bg-white rounded-2xl p-6 shadow-md border border-gray-100 transition transform hover:scale-[1.02] hover:shadow-xl">
          <h3 className="font-semibold text-gray-700 mb-4">{day.date}</h3>

          {day.meals.map((meal, idx) => (
            <div key={idx} className="flex justify-between items-center py-2 border-b last:border-none">
              <div>
                <div className="font-medium">{meal.name}</div>
                <div className="text-sm text-gray-500">{meal.items}</div>
              </div>
              <div className="text-sm font-semibold text-gray-600">{meal.calories} kcal</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ---------- Weekly Trends Section ---------- */
function WeeklyTrendsSection({ weeklyData }) {
  return (
    <div className="bg-white rounded-3xl p-6 shadow-md border border-gray-100 transition transform hover:scale-[1.02] hover:shadow-xl">
      <h2 className="text-lg font-semibold mb-6">Calories (Last 7 Days)</h2>

      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={weeklyData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="calories" stroke="#00A676" strokeWidth={3} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ---------- Risk Insights Section ---------- */
function RiskInsightsSection({ weeklyData }) {
  const avgSugar = weeklyData.reduce((sum, day) => sum + day.sugar, 0) / weeklyData.length;
  const lowProteinDays = weeklyData.filter((day) => day.protein < 70).length;

  return (
    <div className="space-y-6">
      {avgSugar > 50 && (
        <InsightCard
          title="High Sugar Trend Detected"
          description="Your average sugar intake is above recommended levels this week. Consider reducing sugary drinks or desserts."
        />
      )}

      {lowProteinDays > 2 && (
        <InsightCard
          title="Low Protein Intake Pattern"
          description="You missed your protein goal multiple times this week. Try adding dal, paneer, eggs, or legumes."
        />
      )}

      {avgSugar <= 50 && lowProteinDays <= 2 && <div className="text-gray-500">No significant risk patterns detected this week.</div>}
    </div>
  );
}

/* ---------- Small Components ---------- */
function Tab({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`pb-3 font-medium transition ${active ? "text-[#00A676] border-b-2 border-[#00A676]" : "text-gray-500 hover:text-gray-700"}`}
    >
      {label}
    </button>
  );
}

function InsightCard({ title, description }) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-md border border-gray-100 transition transform hover:scale-[1.02] hover:shadow-xl">
      <h3 className="font-semibold text-gray-700 mb-2">{title}</h3>
      <p className="text-sm text-gray-600">{description}</p>
    </div>
  );
}

export default History;