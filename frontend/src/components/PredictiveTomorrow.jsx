// frontend/src/components/PredictiveTomorrow.jsx
import { useEffect, useState } from "react";
import { getPredictiveTomorrow, getInsights, getRiskAnalysis } from "../apiManager/predictiveApi";

export default function PredictiveTomorrow({ userId }) {
  const [prediction, setPrediction] = useState(null);
  const [insights, setInsights]     = useState(null);
  const [risk, setRisk]             = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [activeTab, setActiveTab]   = useState("tomorrow");

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    Promise.all([
      getPredictiveTomorrow(userId),
      getInsights(userId),
      getRiskAnalysis(userId)
    ])
      .then(([pred, ins, rsk]) => {
        setPrediction(pred);
        setInsights(ins);
        setRisk(rsk);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) return (
    <div style={styles.card}>
      <div style={styles.loading}>⏳ Analyzing your nutrition patterns...</div>
    </div>
  );

  if (error) return (
    <div style={styles.card}>
      <div style={{ color: "#ef4444", padding: "1rem" }}>Error: {error}</div>
    </div>
  );

  const riskColors = { green: "#22c55e", yellow: "#f59e0b", red: "#ef4444", unknown: "#94a3b8" };
  const insightBg  = { warning: "#fff7ed", success: "#f0fdf4", info: "#eff6ff" };
  const insightBorder = { warning: "#f97316", success: "#22c55e", info: "#3b82f6" };

  return (
    <div style={styles.card}>
      <h2 style={styles.title}>🔮 AI Nutrition Intelligence</h2>

      {/* Tab Bar */}
      <div style={styles.tabBar}>
        {["tomorrow", "insights", "risk"].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{ ...styles.tab, ...(activeTab === tab ? styles.activeTab : {}) }}
          >
            {tab === "tomorrow" ? "📅 Tomorrow" : tab === "insights" ? "💡 Insights" : "⚠️ Risk"}
          </button>
        ))}
      </div>

      {/* TOMORROW VIEW */}
      {activeTab === "tomorrow" && prediction && (
        <div>
          {!prediction.hasPrediction ? (
            <div style={styles.emptyState}>{prediction.message}</div>
          ) : (
            <>
              <div style={styles.summaryBox}>
                <p style={styles.summaryText}>{prediction.assessment.summary}</p>
                <span style={{
                  ...styles.badge,
                  background: prediction.assessment.calorieRisk === "on_track" ? "#dcfce7" :
                              prediction.assessment.calorieRisk === "surplus"  ? "#fef9c3" : "#fee2e2",
                  color:      prediction.assessment.calorieRisk === "on_track" ? "#166534" :
                              prediction.assessment.calorieRisk === "surplus"  ? "#854d0e" : "#991b1b",
                }}>
                  {prediction.assessment.calorieRisk === "on_track" ? "✅ On Track" :
                   prediction.assessment.calorieRisk === "surplus"  ? "⚠️ Surplus"  : "📉 Deficit"}
                </span>
              </div>

              {/* Predicted Macros Grid */}
              <div style={styles.macroGrid}>
                {[
                  { label: "Calories",  value: prediction.predicted.calories, unit: "kcal", target: prediction.targets.calorieTarget, color: "#f97316" },
                  { label: "Protein",   value: prediction.predicted.protein,  unit: "g",    target: prediction.targets.proteinTarget,  color: "#3b82f6" },
                  { label: "Carbs",     value: prediction.predicted.carbs,    unit: "g",    target: prediction.targets.carbsTarget,    color: "#a855f7" },
                  { label: "Fats",      value: prediction.predicted.fats,     unit: "g",    target: prediction.targets.fatsTarget,     color: "#f59e0b" },
                  { label: "Fiber",     value: prediction.predicted.fiber,    unit: "g",    target: prediction.targets.fiberTarget,    color: "#22c55e" },
                ].map(m => (
                  <div key={m.label} style={styles.macroCard}>
                    <div style={{ ...styles.macroValue, color: m.color }}>{m.value}{m.unit}</div>
                    <div style={styles.macroLabel}>{m.label}</div>
                    <div style={styles.macroTarget}>Target: {m.target}{m.unit}</div>
                    <div style={styles.progressBar}>
                      <div style={{
                        ...styles.progressFill,
                        width: `${Math.min(100, (m.value / m.target) * 100)}%`,
                        background: m.color
                      }} />
                    </div>
                  </div>
                ))}
              </div>

              <div style={styles.messageBox}>💪 {prediction.assessment.calorieMessage}</div>
              <div style={styles.messageBox}>🥩 {prediction.assessment.proteinMessage}</div>
              <div style={styles.methodNote}>
                Based on {prediction.daysAvailable} days of data •{" "}
                {prediction.predictionMethod === "linear_regression" ? "Linear regression" : "7-day average"}
              </div>
            </>
          )}
        </div>
      )}

      {/* INSIGHTS VIEW */}
      {activeTab === "insights" && insights && (
        <div>
          {!insights.hasInsights ? (
            <div style={styles.emptyState}>{insights.message}</div>
          ) : (
            <>
              <p style={styles.subText}>Based on your last {insights.daysAnalyzed} days</p>
              {insights.insights.map((ins, i) => (
                <div key={i} style={{
                  ...styles.insightCard,
                  background: insightBg[ins.type] || "#f9fafb",
                  borderLeft: `4px solid ${insightBorder[ins.type] || "#94a3b8"}`
                }}>
                  <div style={styles.insightTitle}>{ins.icon} {ins.title}</div>
                  <div style={styles.insightMsg}>{ins.message}</div>
                  <div style={styles.insightSuggestion}>💡 {ins.suggestion}</div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* RISK VIEW */}
      {activeTab === "risk" && risk && (
        <div>
          {risk.riskLevel === "unknown" ? (
            <div style={styles.emptyState}>{risk.message}</div>
          ) : (
            <>
              {/* Risk Level Badge */}
              <div style={{ textAlign: "center", margin: "1rem 0" }}>
                <div style={{
                  display: "inline-block",
                  padding: "0.5rem 2rem",
                  borderRadius: "999px",
                  background: riskColors[risk.riskColor] + "22",
                  border: `2px solid ${riskColors[risk.riskColor]}`,
                  color: riskColors[risk.riskColor],
                  fontSize: "1.2rem",
                  fontWeight: "700"
                }}>
                  {risk.riskLevel}
                </div>
                <p style={{ marginTop: "0.5rem", color: "#64748b", fontSize: "0.9rem" }}>
                  Risk Score: {risk.riskScore} / {risk.maxScore}
                </p>
              </div>

              {/* Score Bar */}
              <div style={styles.progressBar}>
                <div style={{
                  ...styles.progressFill,
                  width: `${(risk.riskScore / risk.maxScore) * 100}%`,
                  background: riskColors[risk.riskColor]
                }} />
              </div>

              <p style={{ ...styles.subText, margin: "1rem 0" }}>{risk.riskMessage}</p>

              {/* Risk Factors */}
              {risk.factors.length > 0 && (
                <>
                  <h3 style={styles.sectionTitle}>Risk Factors</h3>
                  {risk.factors.map((f, i) => (
                    <div key={i} style={styles.riskFactor}>
                      <span style={styles.riskIcon}>{f.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={styles.riskFactorTitle}>{f.factor}</div>
                        <div style={styles.riskFactorDesc}>{f.description}</div>
                      </div>
                      <span style={styles.riskPoints}>+{f.impact} pts</span>
                    </div>
                  ))}
                </>
              )}

              {risk.factors.length === 0 && (
                <div style={{ ...styles.insightCard, background: "#f0fdf4", borderLeft: "4px solid #22c55e" }}>
                  <div style={styles.insightTitle}>🎉 No Risk Factors Detected</div>
                  <div style={styles.insightMsg}>Your nutrition looks great! Keep it up.</div>
                </div>
              )}

              <p style={styles.methodNote}>Analyzed over {risk.daysAnalyzed} days</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------
// Styles
// ---------------------------
const styles = {
  card: {
    background: "#ffffff",
    borderRadius: "16px",
    padding: "1.5rem",
    boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
    margin: "1rem 0",
    fontFamily: "Inter, sans-serif"
  },
  title: { fontSize: "1.25rem", fontWeight: "700", color: "#1e293b", marginBottom: "1rem" },
  tabBar: { display: "flex", gap: "0.5rem", marginBottom: "1.25rem", borderBottom: "2px solid #f1f5f9", paddingBottom: "0.5rem" },
  tab: { padding: "0.4rem 1rem", borderRadius: "8px", border: "none", background: "transparent", cursor: "pointer", fontSize: "0.9rem", color: "#64748b", fontWeight: "500" },
  activeTab: { background: "#eff6ff", color: "#2563eb", fontWeight: "700" },
  loading: { textAlign: "center", color: "#94a3b8", padding: "2rem" },
  emptyState: { textAlign: "center", color: "#94a3b8", padding: "2rem", fontSize: "0.95rem" },
  summaryBox: { background: "#f8fafc", borderRadius: "12px", padding: "1rem", marginBottom: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" },
  summaryText: { margin: 0, color: "#334155", fontSize: "0.95rem", flex: 1 },
  badge: { padding: "0.3rem 0.8rem", borderRadius: "999px", fontSize: "0.8rem", fontWeight: "600", whiteSpace: "nowrap" },
  macroGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "0.75rem", marginBottom: "1rem" },
  macroCard: { background: "#f8fafc", borderRadius: "12px", padding: "0.75rem", textAlign: "center" },
  macroValue: { fontSize: "1.2rem", fontWeight: "700" },
  macroLabel: { fontSize: "0.75rem", color: "#64748b", marginTop: "0.25rem" },
  macroTarget: { fontSize: "0.7rem", color: "#94a3b8", marginTop: "0.1rem" },
  progressBar: { height: "6px", background: "#e2e8f0", borderRadius: "999px", marginTop: "0.4rem", overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: "999px", transition: "width 0.5s ease" },
  messageBox: { background: "#f0f9ff", borderRadius: "8px", padding: "0.6rem 0.9rem", marginBottom: "0.5rem", color: "#0369a1", fontSize: "0.875rem" },
  methodNote: { fontSize: "0.75rem", color: "#94a3b8", marginTop: "0.75rem", textAlign: "right" },
  subText: { color: "#64748b", fontSize: "0.875rem", marginBottom: "0.75rem" },
  insightCard: { borderRadius: "10px", padding: "0.9rem 1rem", marginBottom: "0.75rem" },
  insightTitle: { fontWeight: "700", color: "#1e293b", marginBottom: "0.3rem" },
  insightMsg: { color: "#475569", fontSize: "0.875rem", marginBottom: "0.3rem" },
  insightSuggestion: { color: "#0369a1", fontSize: "0.85rem", fontStyle: "italic" },
  sectionTitle: { fontWeight: "600", color: "#334155", marginBottom: "0.5rem", fontSize: "0.95rem" },
  riskFactor: { display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem", background: "#f8fafc", borderRadius: "10px", marginBottom: "0.5rem" },
  riskIcon: { fontSize: "1.5rem" },
  riskFactorTitle: { fontWeight: "600", color: "#1e293b", fontSize: "0.9rem" },
  riskFactorDesc: { color: "#64748b", fontSize: "0.8rem", marginTop: "0.15rem" },
  riskPoints: { background: "#fee2e2", color: "#991b1b", padding: "0.2rem 0.5rem", borderRadius: "6px", fontSize: "0.8rem", fontWeight: "600" },
};