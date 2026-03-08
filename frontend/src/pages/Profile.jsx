// frontend/src/pages/Profile.jsx
import React, { useEffect, useState } from "react";
import { fetchProfile, saveProfile } from "../apiManager/profileApi";
import useUserStore from "../store/user";
import toast from "react-hot-toast";
import nutritionEngine from "../utils/nutritionEngine";

/* ---------- Profile Page ----------
   - Added strict validation for age/height/weight
   - Live BMI calculation and classification
   - Computed targets preview using Option A engine (kept internal)
   - Safety confirmation modal when calorie floor or adjustments applied
   - Removed hypertension checkbox
   - Replaced computed targets block with small Fat/Carbs/Sugar blocks in Health Metrics
   - Added BMI level block styled like sugar limit block and placed above it
   - Medical flags show small inline messages in Health Metrics
   - Pregnancy checkbox disabled when gender is male
   - Medical flags in Health Metrics only shown if selected
*/

function Profile() {
  const { user, updateProfile } = useUserStore();
  const [form, setForm] = useState({});
  const [originalForm, setOriginalForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);

  // validation state
  const [errors, setErrors] = useState({});
  const [computed, setComputed] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (user?._id) {
      fetchProfile(user._id)
        .then((res) => {
          // ensure medicalFlags exists to avoid undefined checks later
          const profile = res.data || {};
          profile.medicalFlags = profile.medicalFlags || { diabetes: false, pregnancy: false };
          setForm(profile);
          setOriginalForm(profile);
          setLoading(false);
        })
        .catch((err) => {
          toast.error(err.message || "Failed to load profile");
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, [user]);

  // Validate inputs and compute targets whenever relevant fields change
  useEffect(() => {
    validateForm();
    computeTargetsPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.age, form.gender, form.heightCm, form.weightKg, form.goal, form.activityLevel, form.medicalFlags]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (type === "checkbox") {
      setForm((prev) => ({
        ...prev,
        medicalFlags: { ...(prev.medicalFlags || { diabetes: false, pregnancy: false }), [name]: checked },
      }));
    } else {
      setForm({ ...form, [name]: value });
    }
  };

  const validateForm = () => {
    const errs = {};
    const age = Number(form.age);
    const height = Number(form.heightCm);
    const weight = Number(form.weightKg);

    if (!Number.isInteger(age) || age < 10 || age > 120) {
      errs.age = "Age must be an integer between 10 and 120.";
    }

    if (!height || height < 50 || height > 272) {
      errs.heightCm = "Height must be between 50 and 272 cm.";
    }

    if (!weight || weight < 10 || weight > 635) {
      errs.weightKg = "Weight must be between 10 and 635 kg.";
    }

    if (!form.goal) errs.goal = "Please select a goal.";
    if (!form.activityLevel) errs.activityLevel = "Please select an activity level.";
    if (!form.gender) errs.gender = "Please select gender.";

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const computeTargetsPreview = () => {
    // Build input for engine
    const input = {
      age: Number(form.age),
      gender: form.gender,
      heightCm: Number(form.heightCm),
      weightKg: Number(form.weightKg),
      goal: form.goal,
      activityLevel: form.activityLevel,
      dietPreference: form.dietPreference,
      medicalFlags: form.medicalFlags || { diabetes: false, pregnancy: false },
    };

    const result = nutritionEngine.computeProfileTargets(input);
    setComputed(result);
  };

  const handleSave = async () => {
    // Validate before save
    const ok = validateForm();
    if (!ok) {
      toast.error("Please fix validation errors before saving.");
      return;
    }

    // If computed indicates adjustments (notes) or calorie floor applied, require confirmation
    if (computed?.notes?.length > 0 && !showConfirm) {
      setShowConfirm(true);
      return;
    }

    try {
      setSaving(true);

      // Prepare payload: include computed fields for canonical storage (standardized names)
      const payload = {
        userId: user._id,
        age: Number(form.age),
        gender: form.gender,
        heightCm: Number(form.heightCm),
        weightKg: Number(form.weightKg),
        activityLevel: form.activityLevel,
        dietPreference: form.dietPreference,
        goal: form.goal,
        medicalFlags: form.medicalFlags || { diabetes: false, pregnancy: false },
        // computed fields (standardized)
        bmi: computed?.bmi,
        bmr: computed?.bmr,
        maintenanceCalories: computed?.maintenanceCalories,
        dailyCalorieTarget: computed?.dailyCalorieTarget,
        dailyProteinTarget: computed?.dailyProteinTarget,
        dailyFatTarget: computed?.dailyFatTarget,
        dailyCarbsTarget: computed?.dailyCarbsTarget,
        dailySugarLimit: computed?.dailySugarLimit,
        dailySugarUpper: computed?.dailySugarUpper,
        // fiber field (standardized)
        dailyFiberTarget: computed?.dailyFiberTarget,
        nutritionEngineVersion: computed?.nutritionEngineVersion,
        computedAt: computed?.computedAt,
      };

      const res = await saveProfile(payload);

      // res is { data }
      const saved = res.data || {};
      // ensure medicalFlags exists
      saved.medicalFlags = saved.medicalFlags || { diabetes: false, pregnancy: false };

      // Update local form and store
      setForm(saved);
      setOriginalForm(saved);
      setEditMode(false);
      setShowConfirm(false);
      toast.success("Profile updated successfully!");

      // update global user profile if store supports it
      if (updateProfile) {
        updateProfile(saved);
      }

      setSaving(false);
    } catch (err) {
      toast.error(err.message || "Failed to save profile");
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setForm(originalForm || {});
    setEditMode(false);
    setShowConfirm(false);
  };

  if (loading) return <div className="pt-24 px-8 text-gray-500">Loading...</div>;

  /* ---------- BMI classification helper ---------- */
  const bmiClass = (bmi) => {
    if (bmi === null || bmi === undefined) return null;
    if (bmi < 18.5) return { label: "Underweight", advice: "Consider increasing calorie intake with nutrient-dense foods." };
    if (bmi < 25) return { label: "Normal", advice: "Maintain balanced nutrition and activity." };
    if (bmi < 30) return { label: "Overweight", advice: "Mild calorie deficit and higher protein may help." };
    return { label: "Obese", advice: "Consult professional; structured deficit recommended." };
  };

  const bmiValue = computed?.bmi ?? form.bmi ?? null;
  const bmiInfo = bmiClass(bmiValue);

  // Helper: check if any medical flag selected
  const anyMedicalFlagSelected = !!(
    (form.medicalFlags && form.medicalFlags.diabetes) ||
    (form.medicalFlags && form.medicalFlags.pregnancy)
  );

  return (
    <div className="pt-24 px-8 max-w-6xl">
      {/* Heading - same style as previous */}
      <h1 className="text-4xl font-serif font-bold mb-10">Your Profile</h1>

      <div className="grid lg:grid-cols-2 gap-12">
        {/* Editable Section */}
        <div className="bg-white rounded-3xl p-10 shadow-md border border-gray-100">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-700">Personal Details</h2>

            {!editMode ? (
              <button
                onClick={() => setEditMode(true)}
                className="px-5 py-2 bg-[#00A676] text-white rounded-xl text-sm font-medium hover:opacity-90 transition"
              >
                Edit
              </button>
            ) : (
              <div className="flex gap-3">
                <button
                  onClick={handleCancel}
                  className="px-5 py-2 border border-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || Object.keys(errors).length > 0}
                  className="px-5 py-2 bg-[#00A676] text-white rounded-xl text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            )}
          </div>

          <div className="space-y-5">
            <Input label="Age" name="age" type="number" value={form.age} onChange={handleChange} disabled={!editMode} error={errors.age} />
            <Select label="Gender" name="gender" value={form.gender} onChange={handleChange} disabled={!editMode} error={errors.gender}
              options={[
                { value: "male", label: "Male" },
                { value: "female", label: "Female" },
              ]}
            />

            <Input label="Height (cm)" name="heightCm" type="number" value={form.heightCm} onChange={handleChange} disabled={!editMode} error={errors.heightCm} />
            <Input label="Weight (kg)" name="weightKg" type="number" value={form.weightKg} onChange={handleChange} disabled={!editMode} error={errors.weightKg} />

            <Select label="Activity Level" name="activityLevel" value={form.activityLevel} onChange={handleChange} disabled={!editMode} error={errors.activityLevel}
              options={[
                { value: "sedentary", label: "Sedentary (desk job, little exercise)" },
                { value: "light", label: "Light (1–3 days light activity)" },
                { value: "moderate", label: "Moderate (3–5 workouts/week)" },
                { value: "active", label: "Active (daily training)" },
                { value: "very_active", label: "Very active (athlete/manual labor)" },
              ]}
            />

            <Select label="Diet Preference" name="dietPreference" value={form.dietPreference} onChange={handleChange} disabled={!editMode}
              options={[
                { value: "veg", label: "Vegetarian" },
                { value: "non-veg", label: "Non-Vegetarian" },
                { value: "vegan", label: "Vegan" },
                { value: "pescatarian", label: "Pescatarian" },
              ]}
            />

            <Select label="Goal" name="goal" value={form.goal} onChange={handleChange} disabled={!editMode} error={errors.goal}
              options={[
                { value: "weight_loss", label: "Weight Loss" },
                { value: "muscle_gain", label: "Muscle Gain" },
                { value: "maintain", label: "Maintain" },
              ]}
            />

            {/* Medical flags (hypertension removed) */}
            <div className="pt-2">
              <label className="block text-sm text-gray-500 mb-2">Medical Flags</label>
              <div className="flex gap-4">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="diabetes"
                    checked={form.medicalFlags?.diabetes || false}
                    onChange={handleChange}
                    disabled={!editMode}
                  />
                  <span className="text-sm">Diabetes</span>
                </label>

                {/* Hide pregnancy checkbox completely when gender is male */}
                {form.gender !== "male" && (
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="pregnancy"
                      checked={form.medicalFlags?.pregnancy || false}
                      onChange={handleChange}
                      disabled={!editMode}
                    />
                    <span className="text-sm">Pregnancy</span>
                  </label>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Metrics Section */}
         <div className="bg-white rounded-3xl p-10 shadow-md border border-gray-100">
            <h2 className="text-xl font-semibold text-gray-700 mb-6">Health Metrics</h2>

            <div className="grid grid-cols-2 gap-6">
              {/* BMI card with classification */}
              <MetricCard title="BMI" value={computed?.bmi || form.bmi} />

              <MetricCard title="BMR" value={computed?.bmr || form.bmr} suffix="kcal" />

              <MetricCard title="Daily Calories" value={computed?.dailyCalorieTarget || form.dailyCalorieTarget} suffix="kcal" />
              <MetricCard title="Daily Protein" value={computed?.dailyProteinTarget || form.dailyProteinTarget} suffix="g" />

              {/* New small blocks for Fat and Carbs */}
              <MetricCard title="Daily Fat" value={computed?.dailyFatTarget || form.dailyFatTarget} suffix="g" />
              <MetricCard title="Daily Carbs" value={computed?.dailyCarbsTarget || form.dailyCarbsTarget} suffix="g" />

              {/* Daily Fiber metric added */}
              <MetricCard title="Daily Fiber" value={computed?.dailyFiberTarget || form.dailyFiberTarget} suffix="g" />
            </div>

            {/* BMI level block styled like sugar limit block (placed above sugar block)
                Now uses the same value and subtitle from the MetricCard above */}
            <div className="mt-6">
              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 flex items-center justify-between">
                <div>
                  <div className="text-sm text-gray-500">BMI Level</div>
                  {/* Subtitle classification label */}
                  <div className="text-sm font-semibold text-black-600 mt-1">{bmiInfo?.label || "-"}</div>
                  {/* Advice text */}
                  <div className="text-xs text-gray-400 mt-1">{bmiInfo?.advice || ""}</div>
                </div>
                <div className="text-xs text-gray-400 self-end">Based on BMI</div>
              </div>
            </div>

          {/* Sugar limit small rectangular block */}
          <div className="mt-4">
            <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-500">Sugar limit (recommended)</div>
                <div className="text-lg font-semibold text-gray-800">{computed?.dailySugarLimit ?? form.dailySugarLimit ?? "-"} g</div>
              </div>
              <div className="text-xs text-gray-400">WHO-based</div>
            </div>
          </div>

          {/* Medical flags display only if any selected */}
          {anyMedicalFlagSelected && (
            <div className="mt-6">
              <div className="text-sm text-gray-500 mb-2">Medical Flags</div>
              <div className="flex gap-3 items-center flex-wrap">
                {form.medicalFlags?.diabetes && (
                  <div className="px-3 py-2 bg-red-50 text-red-700 rounded-xl text-sm border border-red-100 flex items-center gap-3">
                    <span>Diabetes</span>
                    <span className="text-xs text-red-600 bg-red-100 px-2 py-1 rounded">Sugar limits tightened</span>
                  </div>
                )}

                {form.medicalFlags?.pregnancy && (
                  <div className="px-3 py-2 bg-yellow-50 text-yellow-700 rounded-xl text-sm border border-yellow-100 flex items-center gap-3">
                    <span>Pregnancy</span>
                    <span className="text-xs text-yellow-700 bg-yellow-100 px-2 py-1 rounded">Calorie deficit disabled</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <p className="text-xs text-gray-400 mt-6">
            These values are calculated automatically from your inputs.
          </p>
        </div>
      </div>

      {/* Confirmation modal (simple inline) */}
      {showConfirm && computed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full">
            <h4 className="text-lg font-semibold mb-3">Confirm profile changes</h4>
            <p className="text-sm text-gray-600 mb-4">
              The computed targets include adjustments: <strong>{computed.notes?.length} note(s)</strong>.
              {computed.notes && computed.notes.map((n, i) => <div key={i} className="text-xs text-gray-500 mt-1">• {n}</div>)}
            </p>

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowConfirm(false)} className="px-4 py-2 border rounded-lg">Review</button>
              <button onClick={handleSave} className="px-4 py-2 bg-[#00A676] text-white rounded-lg">Confirm & Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Reusable Components ---------- */

function Input({ label, name, value, onChange, type = "text", disabled, error }) {
  return (
    <div>
      <label className="block text-sm text-gray-500 mb-1">{label}</label>
      <input
        type={type}
        name={name}
        value={value ?? ""}
        onChange={onChange}
        disabled={disabled}
        className={`w-full px-4 py-3 rounded-xl border transition
          ${
            disabled
              ? "bg-gray-100 border-gray-200 text-gray-500"
              : "bg-white border-gray-200 focus:ring-2 focus:ring-[#00A676]/30 focus:border-[#00A676]"
          }`}
      />
      {error && <div className="text-xs text-red-500 mt-1">{error}</div>}
    </div>
  );
}

function Select({ label, name, value, onChange, options, disabled, error }) {
  return (
    <div>
      <label className="block text-sm text-gray-500 mb-1">{label}</label>
      <select
        name={name}
        value={value ?? ""}
        onChange={onChange}
        disabled={disabled}
        className={`w-full px-4 py-3 rounded-xl border transition
          ${
            disabled
              ? "bg-gray-100 border-gray-200 text-gray-500"
              : "bg-white border-gray-200 focus:ring-2 focus:ring-[#00A676]/30 focus:border-[#00A676]"
          }`}
      >
        <option value="">Select</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <div className="text-xs text-red-500 mt-1">{error}</div>}
    </div>
  );
}

function MetricCard({ title, value, suffix, subtitle, subtext }) {
  return (
    <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100 flex flex-col justify-between">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="mt-3 text-2xl font-semibold text-gray-800 break-words overflow-hidden">
        {value !== null && value !== undefined ? `${value} ${suffix || ""}` : "-"}
      </div>
      {subtitle && <div className="mt-2 text-sm font-medium text-gray-700">{subtitle}</div>}
      {subtext && <div className="mt-1 text-xs text-gray-400">{subtext}</div>}
    </div>
  );
}

export default Profile;