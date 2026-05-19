import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUser } from "@clerk/react";
import {
  User,
  Key,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Scale,
  Footprints,
  Dumbbell,
  Target,
  BrainCircuit,
  RotateCcw,
  Sparkles,
} from "lucide-react";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../backend/convex/_generated/api";
import { Card } from "../components/ui/Card";
import CustomSelect from "../components/ui/CustomSelect";

const TABS = [
  { id: "profile", label: "Profile", icon: User },
  { id: "body", label: "Body Metrics", icon: Scale },
  { id: "activity", label: "Activity", icon: Footprints },
  { id: "training", label: "Training", icon: Dumbbell },
  { id: "goals", label: "Goals", icon: Target },
  { id: "ai", label: "AI Settings", icon: BrainCircuit },
];

const SEX_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];

const GOAL_OPTIONS = [
  { value: "cut", label: "Cut", description: "Fat loss — moderate deficit" },
  { value: "bulk", label: "Bulk", description: "Lean gain — small surplus" },
  { value: "maintain", label: "Maintain", description: "Keep current weight" },
  { value: "recomp", label: "Recomp", description: "Body recomposition" },
];

const JOB_OPTIONS = [
  { value: "desk", label: "Desk", description: "Sedentary — little movement" },
  { value: "mixed", label: "Mixed", description: "Some walking during day" },
  { value: "standing", label: "Standing", description: "On feet most of the day" },
  { value: "physical", label: "Physical", description: "Heavy labor / active work" },
];

const STYLE_OPTIONS = [
  { value: "resistance", label: "Resistance", description: "Weightlifting focused" },
  { value: "mixed", label: "Mixed", description: "Weights + cardio blend" },
  { value: "endurance", label: "Endurance", description: "Running, cycling, etc." },
];

const OPENROUTER_MODELS = [
  { value: "openai/gpt-4o-mini", label: "GPT-4o Mini", description: "Fast & affordable — default" },
  { value: "openai/gpt-4o", label: "GPT-4o", description: "Best overall quality" },
  { value: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet", description: "Excellent reasoning" },
  { value: "anthropic/claude-3-haiku", label: "Claude 3 Haiku", description: "Fast & efficient" },
  { value: "google/gemini-flash-1.5", label: "Gemini Flash 1.5", description: "Google's best value" },
  { value: "meta-llama/llama-3.1-8b-instruct", label: "Llama 3.1 8B", description: "Open source local feel" },
];

export default function SettingsPage() {
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState("profile");

  const profile = useQuery(api.profile.getProfile) ?? null;
  const settings = useQuery(api.profile.getSettings) ?? { openRouterKey: null, openRouterModel: "openai/gpt-4o-mini" };

  const upsertProfileMutation = useMutation(api.profile.upsertProfile);
  const upsertSettingsMutation = useMutation(api.profile.upsertSettings);

  const [form, setForm] = useState({
    weight: "", height: "", age: "", sex: "male",
    activityLevel: "moderate",
    bodyFat: "", leanMass: "",
    dailySteps: "", trainingDays: "", cardioMinutes: "",
    jobType: "desk", goal: "maintain", trainingStyle: "resistance",
    calorieTarget: "", proteinTarget: "", carbTarget: "", fatTarget: "",
  });

  const [settingsForm, setSettingsForm] = useState({
    openRouterKey: "",
    openRouterModel: "openai/gpt-4o-mini",
  });

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [resettingOnboarding, setResettingOnboarding] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        weight: profile.weight ? String(profile.weight) : '',
        height: profile.height ? String(profile.height) : '',
        age: profile.age ? String(profile.age) : '',
        sex: profile.sex || 'male',
        activityLevel: profile.activityLevel || 'moderate',
        bodyFat: profile.bodyFat ? String(profile.bodyFat) : '',
        leanMass: profile.leanMass ? String(profile.leanMass) : '',
        dailySteps: profile.dailySteps ? String(profile.dailySteps) : '',
        trainingDays: profile.trainingDays ? String(profile.trainingDays) : '',
        cardioMinutes: profile.cardioMinutes ? String(profile.cardioMinutes) : '',
        jobType: profile.jobType || 'desk',
        goal: profile.goal || 'maintain',
        trainingStyle: profile.trainingStyle || 'resistance',
        calorieTarget: profile.calorieTarget ? String(profile.calorieTarget) : '',
        proteinTarget: profile.proteinTarget ? String(profile.proteinTarget) : '',
        carbTarget: profile.carbTarget ? String(profile.carbTarget) : '',
        fatTarget: profile.fatTarget ? String(profile.fatTarget) : '',
      });
    }
  }, [profile]);

  useEffect(() => {
    if (settings) {
      setSettingsForm({
        openRouterKey: settings.openRouterKey || '',
        openRouterModel: settings.openRouterModel || 'openai/gpt-4o-mini',
      });
    }
  }, [settings]);

  const updateForm = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      await upsertProfileMutation({
        weight: form.weight ? Number(form.weight) : undefined,
        height: form.height ? Number(form.height) : undefined,
        age: form.age ? Number(form.age) : undefined,
        sex: form.sex || undefined,
        activityLevel: form.activityLevel || undefined,
        bodyFat: form.bodyFat ? Number(form.bodyFat) : undefined,
        leanMass: form.leanMass ? Number(form.leanMass) : undefined,
        dailySteps: form.dailySteps ? Number(form.dailySteps) : undefined,
        trainingDays: form.trainingDays ? Number(form.trainingDays) : undefined,
        cardioMinutes: form.cardioMinutes ? Number(form.cardioMinutes) : undefined,
        jobType: form.jobType || undefined,
        goal: form.goal || undefined,
        trainingStyle: form.trainingStyle || undefined,
        calorieTarget: form.calorieTarget ? Number(form.calorieTarget) : undefined,
        proteinTarget: form.proteinTarget ? Number(form.proteinTarget) : undefined,
        carbTarget: form.carbTarget ? Number(form.carbTarget) : undefined,
        fatTarget: form.fatTarget ? Number(form.fatTarget) : undefined,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setSaveError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      await upsertSettingsMutation({
        openRouterKey: settingsForm.openRouterKey || undefined,
        openRouterModel: settingsForm.openRouterModel || undefined,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setSaveError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleResetOnboarding = async () => {
    setResettingOnboarding(true);
    setSaveError(null);
    try {
      await upsertProfileMutation({ onboardingComplete: false });
      setResetSuccess(true);
      setTimeout(() => setResetSuccess(false), 3000);
    } catch (err: any) {
      setSaveError(err.message || 'Failed to reset onboarding');
    } finally {
      setResettingOnboarding(false);
    }
  };

  const inputClass = "w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent transition-colors";
  const labelClass = "block text-xs font-mono uppercase text-[var(--text-muted)] mb-2 tracking-wider";

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-7xl mx-auto w-full p-5 lg:p-8 min-h-full">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <div>
            <h1 className="font-heading text-2xl uppercase tracking-normal">Settings</h1>
            <p className="text-xs font-mono text-[var(--text-muted)] tracking-wide">Manage your profile, targets, and preferences</p>
          </div>
        </div>

        {saveError && (
          <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-mono tracking-wide flex items-center gap-2">
            <AlertCircle size={14} /> {saveError}
          </div>
        )}
        {saveSuccess && (
          <div className="mb-6 p-3 bg-green-500/10 border border-green-500/30 text-green-400 text-xs font-mono tracking-wide flex items-center gap-2">
            <CheckCircle2 size={14} /> Saved successfully.
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar */}
          <div className="lg:w-56 shrink-0">
            <div className="sticky top-4 space-y-1">
              {TABS.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left font-mono text-xs uppercase tracking-wider transition-all border ${
                      isActive
                        ? "bg-accent text-[var(--theme-primary-text)] border-accent"
                        : "text-[var(--text-secondary)] border-transparent hover:border-[var(--border-default)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    <tab.icon size={15} strokeWidth={2.5} />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <AnimatePresence mode="wait" initial={false}>
              {activeTab === "profile" && (
                <motion.div
                  key="profile"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  className="will-change-transform"
                >
                  <Card className="p-6 space-y-6">
                    <div className="flex items-center gap-3 mb-2 pb-2 border-b border-[var(--border-default)]">
                      <User size={18} className="text-accent" />
                      <h3 className="font-heading text-lg uppercase tracking-normal">User Information</h3>
                    </div>
                    <div className="flex items-center gap-5">
                      {user?.imageUrl ? (
                        <img src={user.imageUrl} alt="Profile" className="w-20 h-20 object-cover border-2 border-accent" />
                      ) : (
                        <div className="w-20 h-20 bg-accent flex items-center justify-center">
                          <User size={32} className="text-[var(--theme-primary-text)]" />
                        </div>
                      )}
                      <div>
                        <h3 className="font-heading text-xl uppercase tracking-normal">{user?.fullName || "Athlete"}</h3>
                        <p className="text-sm font-mono text-[var(--text-muted)] tracking-wide">{user?.emailAddresses?.[0]?.emailAddress}</p>
                      </div>
                    </div>
                    <div className="pt-4 border-t border-[var(--border-default)] flex flex-wrap items-center gap-3">
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-6 py-2.5 bg-accent text-[var(--theme-primary-text)] font-mono text-xs uppercase tracking-wider font-bold disabled:opacity-50 flex items-center gap-2"
                      >
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        Save Profile
                      </button>
                      <button
                        onClick={handleResetOnboarding}
                        disabled={resettingOnboarding}
                        className="px-6 py-2.5 border border-[var(--border-default)] font-mono text-xs uppercase tracking-wider hover:border-accent transition-colors disabled:opacity-50 flex items-center gap-2"
                      >
                        {resettingOnboarding ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                        Replay Onboarding
                      </button>
                      {resetSuccess && (
                        <span className="text-xs font-mono text-green-400 tracking-wide flex items-center gap-1">
                          <CheckCircle2 size={12} /> Reset. Go to Dashboard to see it.
                        </span>
                      )}
                    </div>
                  </Card>
                </motion.div>
              )}

              {activeTab === "body" && (
                <motion.div
                  key="body"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  className="space-y-4 will-change-transform"
                >
                  <Card className="p-6 space-y-6">
                    <div className="flex items-center gap-3 mb-2 pb-2 border-b border-[var(--border-default)]">
                      <Scale size={18} className="text-accent" />
                      <h3 className="font-heading text-lg uppercase tracking-normal">Body Metrics</h3>
                    </div>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <label className={labelClass}>Weight (kg)</label>
                        <input type="number" value={form.weight} onChange={(e) => updateForm("weight", e.target.value)} placeholder="75" className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>Height (cm)</label>
                        <input type="number" value={form.height} onChange={(e) => updateForm("height", e.target.value)} placeholder="175" className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>Age</label>
                        <input type="number" value={form.age} onChange={(e) => updateForm("age", e.target.value)} placeholder="28" className={inputClass} />
                      </div>
                      <CustomSelect
                        label="Sex"
                        value={form.sex}
                        onChange={(val) => updateForm("sex", val)}
                        options={SEX_OPTIONS}
                      />
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>Body Fat % (optional)</label>
                        <input type="number" step="0.1" value={form.bodyFat} onChange={(e) => updateForm("bodyFat", e.target.value)} placeholder="15" className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>Lean Mass kg (optional)</label>
                        <input type="number" step="0.1" value={form.leanMass} onChange={(e) => updateForm("leanMass", e.target.value)} placeholder="65" className={inputClass} />
                      </div>
                    </div>
                    <div className="pt-4 border-t border-[var(--border-default)]">
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-6 py-2.5 bg-accent text-[var(--theme-primary-text)] font-mono text-xs uppercase tracking-wider font-bold disabled:opacity-50 flex items-center gap-2"
                      >
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        Save Body Metrics
                      </button>
                    </div>
                  </Card>
                </motion.div>
              )}

              {activeTab === "activity" && (
                <motion.div
                  key="activity"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  className="space-y-4 will-change-transform"
                >
                  <Card className="p-6 space-y-6">
                    <div className="flex items-center gap-3 mb-2 pb-2 border-b border-[var(--border-default)]">
                      <Footprints size={18} className="text-accent" />
                      <h3 className="font-heading text-lg uppercase tracking-normal">Activity & Lifestyle</h3>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>Daily Steps</label>
                        <input type="number" value={form.dailySteps} onChange={(e) => updateForm("dailySteps", e.target.value)} placeholder="8000" className={inputClass} />
                      </div>
                      <CustomSelect
                        label="Job Type"
                        value={form.jobType}
                        onChange={(val) => updateForm("jobType", val)}
                        options={JOB_OPTIONS}
                      />
                    </div>
                    <div className="pt-4 border-t border-[var(--border-default)]">
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-6 py-2.5 bg-accent text-[var(--theme-primary-text)] font-mono text-xs uppercase tracking-wider font-bold disabled:opacity-50 flex items-center gap-2"
                      >
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        Save Activity
                      </button>
                    </div>
                  </Card>
                </motion.div>
              )}

              {activeTab === "training" && (
                <motion.div
                  key="training"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  className="space-y-4 will-change-transform"
                >
                  <Card className="p-6 space-y-6">
                    <div className="flex items-center gap-3 mb-2 pb-2 border-b border-[var(--border-default)]">
                      <Dumbbell size={18} className="text-accent" />
                      <h3 className="font-heading text-lg uppercase tracking-normal">Training Profile</h3>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>Training Days / Week</label>
                        <input type="number" value={form.trainingDays} onChange={(e) => updateForm("trainingDays", e.target.value)} placeholder="4" className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>Cardio Minutes / Week</label>
                        <input type="number" value={form.cardioMinutes} onChange={(e) => updateForm("cardioMinutes", e.target.value)} placeholder="60" className={inputClass} />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Training Style</label>
                      <div className="grid grid-cols-3 gap-2">
                        {STYLE_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => updateForm("trainingStyle", opt.value)}
                            className={`p-3 border text-center transition-all ${
                              form.trainingStyle === opt.value
                                ? "border-accent bg-accent/10"
                                : "border-[var(--border-default)] hover:border-[var(--text-secondary)]"
                            }`}
                          >
                            <div className="text-xs font-mono uppercase tracking-wider">{opt.label}</div>
                            <div className="text-[10px] font-mono text-[var(--text-muted)] tracking-wide mt-1">{opt.description}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="pt-4 border-t border-[var(--border-default)]">
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-6 py-2.5 bg-accent text-[var(--theme-primary-text)] font-mono text-xs uppercase tracking-wider font-bold disabled:opacity-50 flex items-center gap-2"
                      >
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        Save Training
                      </button>
                    </div>
                  </Card>
                </motion.div>
              )}

              {activeTab === "goals" && (
                <motion.div
                  key="goals"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  className="space-y-4 will-change-transform"
                >
                  <Card className="p-6 space-y-6">
                    <div className="flex items-center gap-3 mb-2 pb-2 border-b border-[var(--border-default)]">
                      <Target size={18} className="text-accent" />
                      <h3 className="font-heading text-lg uppercase tracking-normal">Goals & Targets</h3>
                    </div>
                    <div>
                      <CustomSelect
                        label="Primary Goal"
                        value={form.goal}
                        onChange={(val) => updateForm("goal", val)}
                        options={GOAL_OPTIONS}
                      />
                    </div>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <label className={labelClass}>Calories (kcal)</label>
                        <input type="number" value={form.calorieTarget} onChange={(e) => updateForm("calorieTarget", e.target.value)} placeholder="2400" className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>Protein (g)</label>
                        <input type="number" value={form.proteinTarget} onChange={(e) => updateForm("proteinTarget", e.target.value)} placeholder="180" className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>Carbs (g)</label>
                        <input type="number" value={form.carbTarget} onChange={(e) => updateForm("carbTarget", e.target.value)} placeholder="280" className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>Fat (g)</label>
                        <input type="number" value={form.fatTarget} onChange={(e) => updateForm("fatTarget", e.target.value)} placeholder="80" className={inputClass} />
                      </div>
                    </div>
                    <div className="pt-4 border-t border-[var(--border-default)]">
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-6 py-2.5 bg-accent text-[var(--theme-primary-text)] font-mono text-xs uppercase tracking-wider font-bold disabled:opacity-50 flex items-center gap-2"
                      >
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        Save Goals
                      </button>
                    </div>
                  </Card>
                </motion.div>
              )}

              {activeTab === "ai" && (
                <motion.div
                  key="ai"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  className="space-y-4 will-change-transform"
                >
                  <Card className="p-6 space-y-6">
                    <div className="flex items-center gap-3 mb-2 pb-2 border-b border-[var(--border-default)]">
                      <BrainCircuit size={18} className="text-accent" />
                      <h3 className="font-heading text-lg uppercase tracking-normal">AI Coach Settings</h3>
                    </div>
                    <div>
                      <label className={labelClass}>OpenRouter API Key</label>
                      <div className="relative">
                        <input
                          type="password"
                          value={settingsForm.openRouterKey}
                          onChange={(e) => setSettingsForm((prev) => ({ ...prev, openRouterKey: e.target.value }))}
                          placeholder="sk-or-v1-... (optional)"
                          className={`${inputClass} pr-12`}
                        />
                        <Key size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                      </div>
                      <p className="mt-2 text-[10px] font-mono text-[var(--text-muted)] tracking-wide leading-relaxed">
                        Your key is stored securely and used for AI coach, meal parsing, and workout analysis.
                        Leave blank to use the server's default key.
                      </p>
                    </div>
                    <CustomSelect
                      label="Model"
                      value={settingsForm.openRouterModel}
                      onChange={(val) => setSettingsForm((prev) => ({ ...prev, openRouterModel: val }))}
                      options={OPENROUTER_MODELS}
                    />
                    <div className="pt-4 border-t border-[var(--border-default)]">
                      <button
                        onClick={handleSaveSettings}
                        disabled={saving}
                        className="px-6 py-2.5 bg-accent text-[var(--theme-primary-text)] font-mono text-xs uppercase tracking-wider font-bold disabled:opacity-50 flex items-center gap-2"
                      >
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        Save AI Settings
                      </button>
                    </div>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
