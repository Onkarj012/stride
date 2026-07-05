import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Link, useNavigate } from "react-router-dom";
import {
  User as UserIcon, Activity, Target, Settings as SettingsIcon,
  Bell, Ruler, Download, Trash2, LogOut, Moon, Sun, Sparkles, Eye, EyeOff, Check, RotateCcw, KeyRound, Loader2, X,
} from "lucide-react";
import { useQuery, useMutation } from "convex/react";
import { useUser, useClerk } from "@clerk/react";
import { api } from "@convex/_generated/api";
import { NavTrigger } from "@/components/layout/NavTrigger";
import { PageContainer } from "@/components/layout/PageContainer";
import { OverlayHeader } from "@/components/mobile/MobileKit";
import { Avatar } from "@/components/primitives/Avatar";
import { Card } from "@/components/primitives/Card";
import { Pill } from "@/components/primitives/Pill";
import { StatChip } from "@/components/ui-kit/StatChip";
import { ListRow, ListDivider } from "@/components/primitives/ListRow";
import { PageHeader } from "@/components/layout/PageHeader";
import { MilestoneList } from "@/components/insights/MilestoneList";
import { coachingPersonalities } from "@/data/mock";
import { useTheme } from "@/context/ThemeContext";
import { usePrefs } from "@/hooks/usePrefs";
import { useLogs } from "@/hooks/useLogs";
import { useToast } from "@/context/ToastContext";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "overview", label: "Overview", icon: UserIcon },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "goals", label: "Goals", icon: Target },
  { id: "settings", label: "Settings", icon: SettingsIcon },
] as const;
type TabId = (typeof TABS)[number]["id"];

const SPRING = { type: "spring", stiffness: 300, damping: 30 } as const;

function AccountField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-ink/8 dark:border-white/8 last:border-0">
      <span className="text-[14px] font-medium text-ink/55 dark:text-white/55">{label}</span>
      <span className="text-[14px] font-extrabold text-ink dark:text-surface text-right">{value}</span>
    </div>
  );
}

function AccountToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="w-full flex items-center justify-between py-3 border-b border-ink/8 dark:border-white/8 last:border-0">
      <span className="text-[14px] font-medium text-ink/70 dark:text-white/70">{label}</span>
      <span className={cn("w-11 h-6 rounded-full p-0.5 transition-colors", checked ? "bg-lavender" : "bg-ink/15 dark:bg-white/15")}>
        <motion.span layout className="block w-5 h-5 rounded-full bg-white shadow" style={{ marginLeft: checked ? 20 : 0 }} />
      </span>
    </button>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn("relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus-visible:outline-none", checked ? "bg-ink" : "bg-border-strong")}>
      <motion.span animate={{ x: checked ? 22 : 4 }} transition={SPRING} className="inline-block h-4 w-4 rounded-full bg-white shadow-sm" />
    </button>
  );
}

function ProfileHeaderCard() {
  const { user } = useUser();
  const profile = useQuery(api.profile.getProfile);
  const name = user?.fullName ?? user?.username ?? "User";
  const email = user?.primaryEmailAddress?.emailAddress ?? "";

  return (
    <Card tone="card" radius="xl" padding="lg" className="flex items-center gap-4">
      <Avatar name={name} size={64} />
      <div className="flex-1 min-w-0">
        <h2 className="text-h2 text-text truncate">{name}</h2>
        <p className="text-caption text-text-muted truncate">{email}</p>
        {profile?.goal && (
          <p className="text-[12px] text-text-muted mt-0.5 capitalize">Goal: {profile.goal}</p>
        )}
      </div>
      <Pill tone="muted" size="sm">Member</Pill>
    </Card>
  );
}

function OverviewTab() {
  const profile = useQuery(api.profile.getProfile);

  const stats = [
    { label: "Weight", value: profile?.weight ? String(profile.weight) : "—", unit: "kg", tone: "mint" as const },
    { label: "Calorie target", value: profile?.calorieTarget ? String(profile.calorieTarget) : "—", unit: "kcal", tone: "peach" as const },
    { label: "Protein target", value: profile?.proteinTarget ? String(profile.proteinTarget) : "—", unit: "g", tone: "sky" as const },
  ];

  return (
    <div className="space-y-5">
      <ProfileHeaderCard />
      <div className="grid grid-cols-3 gap-2.5">
        {stats.map((s) => <StatChip key={s.label} label={s.label} value={s.value} unit={s.unit} tone={s.tone} />)}
      </div>
      <Card tone="card" radius="lg" padding="lg" className="space-y-3">
        <h3 className="text-h3 text-text">About</h3>
        <p className="text-[14.5px] leading-relaxed text-text-muted">
          Stry is your adaptive wellness companion. The more you use it, the better
          it understands what you respond to. There's no streak shaming, no perfect
          score — just gentle, useful guidance.
        </p>
      </Card>
    </div>
  );
}

function ActivityTab() {
  const { logs } = useLogs();
  const last7Days = logs.filter((l) => l.createdAt > Date.now() - 7 * 86_400_000);
  const byCategory: Record<string, number> = {};
  for (const l of last7Days) byCategory[l.category] = (byCategory[l.category] || 0) + 1;

  return (
    <div className="space-y-5">
      <ProfileHeaderCard />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <StatChip label="This week" value={String(last7Days.length)} unit="entries" tone="lavender" />
        <StatChip label="Total" value={String(logs.length)} unit="entries" tone="sky" />
        <StatChip label="Active days" value={String(new Set(last7Days.map((l) => new Date(l.createdAt).toDateString())).size)} unit="of 7" tone="mint" />
      </div>
      <Card tone="card" radius="lg" padding="lg" className="space-y-3">
        <h3 className="text-h3 text-text">By category</h3>
        {Object.keys(byCategory).length === 0
          ? <p className="text-text-muted text-[14px]">No activity in the last 7 days.</p>
          : (
            <ul className="space-y-2">
              {Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([id, count]) => (
                <li key={id} className="flex items-center gap-3">
                  <span className="flex-1 text-[14px] font-semibold text-text capitalize">{id}</span>
                  <span className="text-[13px] text-text-muted">{count}</span>
                </li>
              ))}
            </ul>
          )}
      </Card>
    </div>
  );
}

function ProfileDetailsCard() {
  const profile = useQuery(api.profile.getProfile);
  const upsert = useMutation(api.profile.upsertProfile);
  const toast = useToast();
  const [form, setForm] = useState({ dislikedFoods: "", cuisines: "", equipment: "", scheduleNote: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setForm({
      dislikedFoods: profile.dislikedFoods ?? "",
      cuisines: profile.cuisines ?? "",
      equipment: profile.equipment ?? "",
      scheduleNote: profile.scheduleNote ?? "",
    });
  }, [profile]);

  const FIELDS = [
    { key: "dislikedFoods", label: "Disliked foods", placeholder: "mushrooms, olives" },
    { key: "cuisines", label: "Favorite cuisines", placeholder: "indian, thai" },
    { key: "equipment", label: "Available equipment", placeholder: "dumbbells, bands" },
    { key: "scheduleNote", label: "Schedule note", placeholder: "trains at 6am, busy weekdays" },
  ] as const;

  async function save() {
    setSaving(true);
    try {
      await upsert(form);
      toast.success("Preferences saved");
    } catch (e) {
      toast.error("Couldn't save", e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card tone="card" radius="lg" padding="lg" className="space-y-4">
      <div>
        <h3 className="text-h3 text-text">Personalization</h3>
        <p className="text-[13px] text-text-muted mt-0.5">Helps Stry tailor food and workout suggestions.</p>
      </div>
      {FIELDS.map((f) => (
        <label key={f.key} className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold uppercase tracking-wider text-text-muted">{f.label}</span>
          <input
            value={form[f.key]} placeholder={f.placeholder}
            onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
            className="bg-input border border-border rounded-lg px-3 py-2.5 text-[14px] text-text focus:outline-none focus:border-lavender"
          />
        </label>
      ))}
      <button type="button" onClick={save} disabled={saving}
        className="inline-flex items-center justify-center rounded-lg bg-ink text-text-on-ink px-4 py-2.5 text-[14px] font-bold disabled:opacity-60">
        {saving ? "Saving…" : "Save preferences"}
      </button>
    </Card>
  );
}

function GoalsTab() {
  const { logs } = useLogs();
  const profile = useQuery(api.profile.getProfile);

  const goals = [
    { label: "Calorie target", value: profile?.calorieTarget, unit: "kcal" },
    { label: "Protein target", value: profile?.proteinTarget, unit: "g" },
    { label: "Training days", value: profile?.trainingDays, unit: "days/week" },
  ].filter((g) => g.value != null);

  return (
    <div className="space-y-5">
      <ProfileHeaderCard />
      {goals.length > 0 && (
        <Card tone="card" radius="lg" padding="lg" className="space-y-4">
          <h3 className="text-h3 text-text">Targets</h3>
          <ul className="space-y-2">
            {goals.map((g) => (
              <li key={g.label} className="flex items-baseline justify-between">
                <span className="text-[14px] text-text">{g.label}</span>
                <span className="text-[14px] font-semibold text-text">{g.value} <span className="text-text-muted font-normal">{g.unit}</span></span>
              </li>
            ))}
          </ul>
          <Link to="/onboarding"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-2 text-[13px] font-semibold text-text hover:border-lavender">
            Recalculate plan
          </Link>
        </Card>
      )}
      <section className="space-y-3">
        <h3 className="text-h3 text-text">Milestones</h3>
        <MilestoneList logs={logs} />
      </section>
      <ProfileDetailsCard />
    </div>
  );
}

/**
 * Bring-your-own-key OpenRouter setup card.
 *
 * Lets the user pick which OpenRouter model Stry uses and (optionally)
 * override the deployment-wide API key with their own. Both fields are
 * persisted server-side via api.profile.upsertSettings; the saved key is
 * never echoed back to the client by api.profile.getSettings.
 *
 * Curated model list — common OpenRouter ids spanning vision-capable and
 * text-only models. The full catalogue is at https://openrouter.ai/models.
 */
const OPENROUTER_MODELS = [
  { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", lab: "OpenAI" },
  { id: "openai/gpt-5-mini", name: "GPT-5 Mini", lab: "OpenAI" },
  { id: "openai/gpt-5.5", name: "GPT-5.5", lab: "OpenAI" },
  { id: "openai/gpt-oss-120b", name: "GPT-OSS 120B", lab: "OpenAI" },
  { id: "anthropic/claude-sonnet-4.6", name: "Claude Sonnet 4.6", lab: "Anthropic" },
  { id: "anthropic/claude-haiku-4.5", name: "Claude Haiku 4.5", lab: "Anthropic" },
  { id: "deepseek/deepseek-v4-flash", name: "DeepSeek V4 Flash", lab: "DeepSeek" },
  { id: "deepseek/deepseek-v4-pro", name: "DeepSeek V4 Pro", lab: "DeepSeek" },
  { id: "google/gemini-3.5-flash", name: "Gemini 3.5 Flash", lab: "Google" },
  { id: "google/gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite", lab: "Google" },
  { id: "google/gemini-2.5-flash-lite-preview-09-2025", name: "Gemini 2.5 Flash Lite Preview", lab: "Google" },
  { id: "google/gemma-4-31b-it", name: "Gemma 4 31B", lab: "Google" },
  { id: "moonshotai/kimi-k2-thinking", name: "Kimi K2 Thinking", lab: "Moonshot AI" },
  { id: "moonshotai/kimi-k2.6", name: "Kimi K2.6", lab: "Moonshot AI" },
  { id: "x-ai/grok-build-0.1", name: "Grok Build 0.1", lab: "xAI" },
  { id: "qwen/qwen3.6-plus", name: "Qwen 3.6 Plus", lab: "Qwen" },
  { id: "z-ai/glm-5.1", name: "GLM 5.1", lab: "Z.AI" },
  { id: "minimax/minimax-m2.5", name: "MiniMax M2.5", lab: "MiniMax" },
];

function AIProviderCard() {
  const settings = useQuery(api.profile.getSettings);
  const upsertSettings = useMutation(api.profile.upsertSettings);
  const toast = useToast();

  const [model, setModel] = useState<string>("openai/gpt-4o-mini");
  const [apiKey, setApiKey] = useState<string>("");
  const [customModel, setCustomModel] = useState<string>("");
  const [revealKey, setRevealKey] = useState(false);
  const [hasSavedKey, setHasSavedKey] = useState(false);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");

  // Initialize from server-side settings once they load
  useEffect(() => {
    if (!settings) return;
    setModel(settings.openRouterModel ?? "openai/gpt-4o-mini");
    if (settings.openRouterModel && !OPENROUTER_MODELS.some((m) => m.id === settings.openRouterModel)) {
      setCustomModel(settings.openRouterModel);
    }
    if (settings.hasOpenRouterKey) {
      setHasSavedKey(true);
    }
  }, [settings]);

  async function handleSave(nextModel?: string, nextKey?: string) {
    setSaving("saving");
    try {
      await upsertSettings({
        openRouterModel: nextModel ?? model,
        openRouterKey: nextKey !== undefined ? nextKey : (apiKey || undefined),
      });
      setSaving("saved");
      setHasSavedKey(!!(nextKey ?? apiKey));
      setTimeout(() => setSaving("idle"), 1200);
    } catch (err) {
      setSaving("idle");
      toast.error("Couldn't save", err instanceof Error ? err.message : "Try again");
    }
  }

  async function handleClearKey() {
    setApiKey("");
    setHasSavedKey(false);
    await handleSave(model, "");
    toast.success("API key cleared");
  }

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const selectedModel = OPENROUTER_MODELS.find((m) => m.id === model);
  const isCustomModel = !selectedModel;
  const customModelValue = customModel.trim();

  // Click-outside handler for dropdown
  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  // Escape key to close dropdown
  useEffect(() => {
    if (!dropdownOpen) return;
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setDropdownOpen(false);
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [dropdownOpen]);

  return (
    <Card tone="card" radius="lg" padding="lg" className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-lavender/20">
          <Sparkles className="h-4.5 w-4.5 text-lavender" strokeWidth={2} />
        </div>
        <div className="flex-1">
          <h3 className="text-h3 text-text">AI provider</h3>
          <p className="text-[13px] text-text-muted mt-0.5">
            Bring your own OpenRouter key and pick any model.
          </p>
        </div>
      </div>

      {/* Model selector — custom dropdown */}
      <div className="flex flex-col gap-2.5">
        <span className="text-[12px] font-semibold uppercase tracking-wider text-text-muted">Model</span>
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen((o) => !o)}
            className="w-full flex items-center justify-between rounded-[16px] border border-border bg-card px-4 py-3 text-left transition-colors hover:border-lavender focus:outline-none focus:border-lavender"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="inline-flex h-6 items-center rounded-full bg-lavender/15 px-2 text-[10px] font-bold uppercase tracking-wider text-lavender">
                {selectedModel?.lab ?? "Custom"}
              </span>
              <span className="text-[14px] font-semibold text-text truncate">
                {selectedModel?.name ?? model}
              </span>
            </div>
            <svg className={cn("h-4 w-4 text-text-muted transition-transform", dropdownOpen && "rotate-180")} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6l4 4 4-4" />
            </svg>
          </button>

          {/* Dropdown panel — grouped by lab */}
          {dropdownOpen && (
            <div className="absolute z-30 mt-2 w-full max-h-[320px] overflow-y-auto rounded-[20px] border border-border bg-card shadow-[0_8px_24px_rgba(13,16,27,0.12)] py-2">
              {Object.entries(
                OPENROUTER_MODELS.reduce<Record<string, typeof OPENROUTER_MODELS>>((acc, m) => {
                  (acc[m.lab] = acc[m.lab] || []).push(m);
                  return acc;
                }, {}),
              ).map(([lab, models]) => (
                <div key={lab}>
                  <div className="px-4 pt-3 pb-1.5 flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{lab}</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                  {models.map((m) => {
                    const active = m.id === model;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setModel(m.id);
                          handleSave(m.id);
                          setDropdownOpen(false);
                        }}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-4 py-2 text-left transition-colors",
                          active ? "bg-lavender/10" : "hover:bg-card-elev",
                        )}
                      >
                        <span className={cn("text-[13px] font-medium flex-1 truncate", active && "font-semibold text-text")}>
                          {m.name}
                        </span>
                        {active && (
                          <svg className="h-4 w-4 text-lavender shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M3 8.5l3.5 3.5 6.5-7" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className={cn(
          "rounded-[16px] border p-3 transition-colors",
          isCustomModel ? "border-lavender bg-lavender/10" : "border-border bg-card-elev/60",
        )}>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="custom-model" className="text-[12px] font-semibold uppercase tracking-wider text-text-muted">
              Custom model code
            </label>
            {isCustomModel && (
              <span className="rounded-full bg-lavender/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-lavender">
                Active
              </span>
            )}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input
              id="custom-model"
              type="text"
              value={customModel}
              onChange={(e) => setCustomModel(e.target.value)}
              placeholder="provider/model-code"
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 bg-input border border-border rounded-lg px-3 py-2.5 text-[13px] text-text font-mono focus:outline-none focus:border-lavender"
            />
            <button
              type="button"
              onClick={() => {
                if (!customModelValue) {
                  toast.error("Add a model code", "Example: openai/gpt-5-mini");
                  return;
                }
                setModel(customModelValue);
                handleSave(customModelValue);
              }}
              className="shrink-0 rounded-lg bg-ink px-3 py-2.5 text-[12px] font-bold text-text-on-ink"
            >
              Use
            </button>
          </div>
          <p className="mt-1.5 text-[11.5px] text-text-subtle">
            Paste any OpenRouter model id. Presets above are just shortcuts.
          </p>
        </div>
      </div>

      {/* API key */}
      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] font-semibold uppercase tracking-wider text-text-muted">OpenRouter API key</span>
        <div className="flex items-center gap-1.5">
          <input
            type={revealKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={hasSavedKey ? "•••••••••••• (saved)" : "sk-or-v1-..."}
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-input border border-border rounded-lg px-3 py-2.5 text-[14px] text-text font-mono focus:outline-none focus:border-lavender"
          />
          <button
            type="button"
            onClick={() => setRevealKey((r) => !r)}
            aria-label={revealKey ? "Hide key" : "Show key"}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border text-text-muted hover:text-text"
          >
            {revealKey ? <EyeOff className="h-4 w-4" strokeWidth={1.75} /> : <Eye className="h-4 w-4" strokeWidth={1.75} />}
          </button>
          <button
            type="button"
            onClick={() => handleSave()}
            disabled={saving === "saving"}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 h-10 text-[13px] font-bold transition-colors",
              saving === "saved" ? "bg-mint text-ink" : "bg-ink text-text-on-ink",
              saving === "saving" && "opacity-60",
            )}
          >
            {saving === "saved" ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : null}
            {saving === "saving" ? "Saving…" : saving === "saved" ? "Saved" : "Save"}
          </button>
        </div>
        <div className="flex items-center justify-between">
          <a
            href="https://openrouter.ai/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11.5px] text-text-subtle hover:text-text underline-offset-2 hover:underline"
          >
            Get a key at openrouter.ai →
          </a>
          {hasSavedKey && (
            <button
              type="button"
              onClick={handleClearKey}
              className="text-[11.5px] text-text-subtle hover:text-bubblegum"
            >
              Clear saved key
            </button>
          )}
        </div>
      </label>
    </Card>
  );
}

function ChangePasswordRow() {
  const { user } = useUser();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      await (user as any).updatePassword({ currentPassword: current, newPassword: next });
      toast.success("Password updated", "Sign in with your new password next time.");
      setOpen(false);
      setCurrent(""); setNext("");
    } catch (err: any) {
      toast.error("Couldn't update password", err?.errors?.[0]?.message ?? err?.message ?? "Try again");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <ListRow icon={<KeyRound />} title="Change password" meta="Update your account password"
        onClick={() => setOpen(true)} />
      {open && (
        <div className="px-4 pb-4 pt-2 border-t border-border space-y-3">
          <form onSubmit={handleSubmit} className="space-y-3">
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Current password</span>
              <div className="flex items-center gap-2 rounded-xl bg-input border border-border focus-within:border-lavender transition-colors px-3 py-2.5">
                <input type={showCurrent ? "text" : "password"} required value={current}
                  onChange={(e) => setCurrent(e.target.value)} placeholder="••••••••"
                  className="min-w-0 flex-1 bg-transparent text-[13px] text-text placeholder:text-text-subtle focus:outline-none" />
                <button type="button" onClick={() => setShowCurrent((s) => !s)} className="text-text-muted hover:text-text shrink-0">
                  {showCurrent ? <EyeOff className="h-3.5 w-3.5" strokeWidth={1.75} /> : <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />}
                </button>
              </div>
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">New password</span>
              <div className="flex items-center gap-2 rounded-xl bg-input border border-border focus-within:border-lavender transition-colors px-3 py-2.5">
                <input type={showNext ? "text" : "password"} required minLength={8} value={next}
                  onChange={(e) => setNext(e.target.value)} placeholder="At least 8 characters"
                  className="min-w-0 flex-1 bg-transparent text-[13px] text-text placeholder:text-text-subtle focus:outline-none" />
                <button type="button" onClick={() => setShowNext((s) => !s)} className="text-text-muted hover:text-text shrink-0">
                  {showNext ? <EyeOff className="h-3.5 w-3.5" strokeWidth={1.75} /> : <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />}
                </button>
              </div>
            </label>
            <div className="flex gap-2">
              <button type="submit" disabled={saving || !current || next.length < 8}
                className={cn("flex-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-ink text-text-on-ink py-2 text-[13px] font-semibold transition-opacity", (saving || !current || next.length < 8) && "opacity-50")}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Update password"}
              </button>
              <button type="button" onClick={() => { setOpen(false); setCurrent(""); setNext(""); }}
                className="inline-flex items-center justify-center h-9 w-9 rounded-full border border-border text-text-muted hover:text-text transition-colors">
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function SettingsTab() {
  const { theme, toggle } = useTheme();
  const { prefs, update } = usePrefs();
  const { signOut } = useClerk();
  const navigate = useNavigate();
  const clearAllData = useMutation(api.users.clearAllData);
  const exportData = useQuery(api.users.exportAllData);
  const upsertProfile = useMutation(api.profile.upsertProfile);

  return (
    <div className="space-y-5">
      <ProfileHeaderCard />

      <AIProviderCard />

      <Card tone="card" radius="lg" padding="lg" className="space-y-4">
        <div>
          <h3 className="text-[13px] font-semibold uppercase tracking-wider text-text-muted">Coaching style</h3>
          <p className="text-[13px] text-text-muted mt-1">How Stry talks to you.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {coachingPersonalities.map((p) => {
            const active = prefs.coachingStyle === p.id;
            return (
              <button key={p.id} type="button" onClick={() => update({ coachingStyle: p.id })} aria-pressed={active}
                className={cn("text-left rounded-[16px] border p-4 transition-colors duration-150 focus-visible:outline-none",
                  active ? "bg-lavender/15 border-lavender" : "bg-card border-border hover:border-border-strong")}>
                <div className="flex items-center justify-between">
                  <span className="text-[14px] font-bold text-text">{p.label}</span>
                  {active && (
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-lavender">
                      <svg className="h-3 w-3 text-ink" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-text-muted mt-1">{p.description}</p>
              </button>
            );
          })}
        </div>
      </Card>

      <Card tone="card" radius="lg" padding="none" className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-[13px] font-semibold uppercase tracking-wider text-text-muted">Appearance</h3>
        </div>
        <ListRow icon={theme === "dark" ? <Moon /> : <Sun />} title="Theme" meta={theme === "dark" ? "Dark" : "Light"}
          trailing={<Switch checked={theme === "dark"} onChange={toggle} label="Toggle dark mode" />} showChevron={false} />
      </Card>

      <Card tone="card" radius="lg" padding="none" className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-[13px] font-semibold uppercase tracking-wider text-text-muted">Preferences</h3>
        </div>
        <ListRow icon={<Ruler />} title="Units" meta={prefs.units === "metric" ? "Metric (kg, km)" : "Imperial (lb, mi)"}
          trailing={
            <div className="flex rounded-full border border-border bg-card-elev p-0.5">
              {(["metric", "imperial"] as const).map((u) => (
                <button key={u} type="button" onClick={() => update({ units: u })}
                  className={cn("px-3 py-1 text-[12px] font-semibold rounded-full transition-colors duration-150",
                    prefs.units === u ? "bg-ink text-text-on-ink" : "text-text-muted hover:text-text")}>
                  {u === "metric" ? "Metric" : "Imperial"}
                </button>
              ))}
            </div>
          } showChevron={false} />
        <ListDivider />
        <ListRow icon={<Bell />} title="Notifications" meta={prefs.notifications ? "On" : "Off"}
          trailing={<Switch checked={prefs.notifications} onChange={(v) => update({ notifications: v })} label="Toggle notifications" />}
          showChevron={false} />
      </Card>

      <Card tone="card" radius="lg" padding="none" className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-[13px] font-semibold uppercase tracking-wider text-text-muted">Data</h3>
        </div>
        <ListRow icon={<Download />} title="Export your data" meta="Download a JSON copy of your logs"
          onClick={() => {
            if (!exportData) return;
            const data = JSON.stringify(exportData, null, 2);
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([data], { type: "application/json" }));
            a.download = `stride-export-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
          }} />
        <ListDivider />
        <ListRow icon={<Trash2 />} title="Clear all entries" meta="Permanently remove every log"
          onClick={() => { if (confirm("Delete all your data? This cannot be undone.")) clearAllData(); }} />
      </Card>

      <Card tone="card" radius="lg" padding="none" className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-[13px] font-semibold uppercase tracking-wider text-text-muted">Onboarding</h3>
        </div>
        <ListRow icon={<RotateCcw />} title="Replay onboarding" meta="Redo your profile setup and recalculate your plan"
          onClick={async () => {
            await upsertProfile({ onboardingComplete: false });
            navigate("/onboarding");
          }} />
      </Card>

      <Card tone="card" radius="lg" padding="none" className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-[13px] font-semibold uppercase tracking-wider text-text-muted">Account</h3>
        </div>
        <ChangePasswordRow />
        <ListDivider />
        <ListRow icon={<LogOut />} title="Sign out" meta="You'll need to sign in again to use Stry"
          onClick={() => signOut()} />
      </Card>

      <p className="text-center text-[12px] text-text-subtle">Stry · v0.3 · made with care</p>
    </div>
  );
}

function MobileAccountLayout({ title }: { title: string }) {
  const navigate = useNavigate();
  const { user } = useUser();
  const profile = useQuery(api.profile.getProfile);
  const { theme, toggle } = useTheme();
  const { prefs, update } = usePrefs();
  const name = user?.fullName ?? user?.username ?? "User";
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const initial = [user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join("").toUpperCase() || user?.username?.[0]?.toUpperCase() || "?";

  return (
    <PageContainer className="lg:hidden pt-2 pb-6">
      <OverlayHeader
        title={title}
        back={() => navigate(-1)}
        right={
          <button onClick={toggle} aria-label="Toggle theme" className="w-10 h-10 rounded-full bg-white dark:bg-[#1a1e2e] shadow-[0_6px_18px_rgba(13,16,27,0.08)] flex items-center justify-center text-ink/60 dark:text-white/60 active:scale-90 transition-transform">
            {theme === "dark" ? <Sun className="h-4.5 w-4.5" strokeWidth={2} /> : <Moon className="h-4.5 w-4.5" strokeWidth={2} />}
          </button>
        }
      />

      <div className="flex items-center gap-4 mb-6 bg-white dark:bg-[#1a1e2e] rounded-[20px] p-5 shadow-[0_10px_30px_rgba(13,16,27,0.07)]">
        <div className="w-14 h-14 rounded-full bg-lavender flex items-center justify-center text-[22px] font-extrabold text-ink shrink-0">{initial}</div>
        <div className="min-w-0">
          <h3 className="text-[18px] font-extrabold text-ink dark:text-surface truncate">{name}</h3>
          <p className="text-[13px] font-medium text-ink/45 dark:text-white/45 truncate">{email}</p>
        </div>
      </div>

      <p className="text-[11px] font-extrabold tracking-[2px] uppercase text-ink/35 dark:text-white/35 mb-3">Goals</p>
      <div className="bg-white dark:bg-[#1a1e2e] rounded-[20px] px-5 py-1 shadow-[0_10px_30px_rgba(13,16,27,0.07)] mb-6">
        <AccountField label="Primary goal" value={profile?.goal ? profile.goal.replace(/-/g, " ") : "Not set"} />
        <AccountField label="Current weight" value={profile?.weight ? `${profile.weight} kg` : "Not set"} />
        <AccountField label="Goal weight" value={profile?.goalWeightKg ? `${profile.goalWeightKg} kg` : "Not set"} />
        <AccountField label="Daily calories" value={profile?.calorieTarget ? `${profile.calorieTarget} kcal` : "Not set"} />
        <AccountField label="Protein target" value={profile?.proteinTarget ? `${profile.proteinTarget} g` : "Not set"} />
        <AccountField label="Activity level" value={profile?.trainingDays ? `${profile.trainingDays} days/wk` : "Not set"} />
      </div>

      <p className="text-[11px] font-extrabold tracking-[2px] uppercase text-ink/35 dark:text-white/35 mb-3">Settings</p>
      <div className="bg-white dark:bg-[#1a1e2e] rounded-[20px] px-5 py-1 shadow-[0_10px_30px_rgba(13,16,27,0.07)]">
        <AccountToggle label="Daily morning insight" checked={prefs.notifications} onChange={(v) => update({ notifications: v })} />
        <AccountToggle label="Reduced motion" checked={prefs.reduceMotion} onChange={(v) => update({ reduceMotion: v })} />
        <AccountToggle label="Analytical coaching" checked={prefs.coachingStyle === "analytical"} onChange={(v) => update({ coachingStyle: v ? "analytical" : "gentle" })} />
        <AccountToggle label="Metric units" checked={prefs.units === "metric"} onChange={(v) => update({ units: v ? "metric" : "imperial" })} />
      </div>
    </PageContainer>
  );
}

export function ProfilePage() {
  const [tab, setTab] = useState<Exclude<TabId, "settings">>("overview");
  const profileTabs = TABS.filter((t) => t.id !== "settings");

  return (
    <>
    <MobileAccountLayout title="Profile" />
    <PageContainer className="hidden lg:block space-y-6">
      <PageHeader center="Profile" right={<NavTrigger className="lg:hidden" />} />
      <div role="tablist" className="flex gap-1 rounded-full bg-card-elev border border-border p-1 self-start max-w-full overflow-x-auto no-scrollbar">
        {profileTabs.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          return (
            <button key={t.id} role="tab" aria-selected={isActive}
              onClick={() => setTab(t.id as Exclude<TabId, "settings">)}
              className={cn("relative inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold whitespace-nowrap transition-colors duration-150 focus-visible:outline-none",
                isActive ? "text-text" : "text-text-muted hover:text-text")}>
              {isActive && (
                <motion.div layoutId="profile-tab-indicator"
                  className="absolute inset-0 rounded-full bg-card border border-border-strong" transition={SPRING} />
              )}
              <Icon className="relative h-3.5 w-3.5" strokeWidth={2} />
              <span className="relative">{t.label}</span>
            </button>
          );
        })}
      </div>
      <div>
        {tab === "overview" && <OverviewTab />}
        {tab === "activity" && <ActivityTab />}
        {tab === "goals" && <GoalsTab />}
      </div>
    </PageContainer>
    </>
  );
}

export function SettingsPage() {
  return (
    <>
    <MobileAccountLayout title="Account" />
    <PageContainer className="hidden lg:block space-y-6">
      <PageHeader center="Settings" right={<NavTrigger className="lg:hidden" />} />
      <div>
        <SettingsTab />
      </div>
    </PageContainer>
    </>
  );
}
