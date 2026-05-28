import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  User as UserIcon, Activity, Target, Settings as SettingsIcon,
  Bell, Ruler, Download, Trash2, LogOut, Moon, Sun, Sparkles, Eye, EyeOff, Check,
} from "lucide-react";
import { useQuery, useMutation } from "convex/react";
import { useUser, useClerk } from "@clerk/react";
import { api } from "@convex/_generated/api";
import { Avatar } from "@/components/primitives/Avatar";
import { Card } from "@/components/primitives/Card";
import { Pill } from "@/components/primitives/Pill";
import { StatChip } from "@/components/primitives/StatChip";
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
        </Card>
      )}
      <section className="space-y-3">
        <h3 className="text-h3 text-text">Milestones</h3>
        <MilestoneList logs={logs} />
      </section>
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
  { id: "openai/gpt-5.5", name: "GPT-5.5", lab: "OpenAI" },
  { id: "openai/gpt-oss-120b", name: "GPT-OSS 120B", lab: "OpenAI" },
  { id: "anthropic/claude-sonnet-4.6", name: "Claude Sonnet 4.6", lab: "Anthropic" },
  { id: "anthropic/claude-haiku-4.5", name: "Claude Haiku 4.5", lab: "Anthropic" },
  { id: "deepseek/deepseek-v4-flash", name: "DeepSeek V4 Flash", lab: "DeepSeek" },
  { id: "deepseek/deepseek-v4-pro", name: "DeepSeek V4 Pro", lab: "DeepSeek" },
  { id: "google/gemma-4-31b-it", name: "Gemma 4 31B", lab: "Google" },
  { id: "moonshotai/kimi-k2.6", name: "Kimi K2.6", lab: "Moonshot AI" },
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
  const [revealKey, setRevealKey] = useState(false);
  const [hasSavedKey, setHasSavedKey] = useState(false);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");

  // Initialize from server-side settings once they load
  useEffect(() => {
    if (!settings) return;
    setModel(settings.openRouterModel ?? "openai/gpt-4o-mini");
    if (settings.openRouterKey) {
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
      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] font-semibold uppercase tracking-wider text-text-muted">Model</span>
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen((o) => !o)}
            className="w-full flex items-center justify-between rounded-[16px] border border-border bg-card px-4 py-3 text-left transition-colors hover:border-lavender focus:outline-none focus:border-lavender"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="inline-flex h-6 items-center rounded-full bg-lavender/15 px-2 text-[10px] font-bold uppercase tracking-wider text-lavender">
                {selectedModel?.lab ?? "—"}
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

function SettingsTab() {
  const { theme, toggle } = useTheme();
  const { prefs, update } = usePrefs();
  const { signOut } = useClerk();
  const clearAllData = useMutation(api.users.clearAllData);

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
            const data = JSON.stringify({ exportedAt: new Date().toISOString() }, null, 2);
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
          <h3 className="text-[13px] font-semibold uppercase tracking-wider text-text-muted">Account</h3>
        </div>
        <ListRow icon={<LogOut />} title="Sign out" meta="You'll need to sign in again to use Stry"
          onClick={() => signOut()} />
      </Card>

      <p className="text-center text-[12px] text-text-subtle">Stry · v0.3 · made with care</p>
    </div>
  );
}

export function ProfilePage() {
  const [tab, setTab] = useState<Exclude<TabId, "settings">>("overview");
  const profileTabs = TABS.filter((t) => t.id !== "settings");

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <PageHeader center="Profile" />
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
      <div className="-mx-2 lg:mx-0">
        {tab === "overview" && <OverviewTab />}
        {tab === "activity" && <ActivityTab />}
        {tab === "goals" && <GoalsTab />}
      </div>
    </div>
  );
}

export function SettingsPage() {
  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <PageHeader center="Settings" />
      <div className="-mx-2 lg:mx-0">
        <SettingsTab />
      </div>
    </div>
  );
}
