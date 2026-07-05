import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Recipe } from '../app/data'
import type { MacroData } from './MacroCard'

// ─── Macro chips ───────────────────────────────────────────────────────────────

function MacroChips({ macros }: { macros: MacroData }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <span className="bg-peach rounded-full px-2.5 py-1 text-[12px] font-bold text-ink tabular-nums">{macros.kcal} kcal</span>
      <span className="bg-mint rounded-full px-2.5 py-1 text-[12px] font-bold text-ink tabular-nums">{macros.protein}g P</span>
      <span className="bg-sky rounded-full px-2.5 py-1 text-[12px] font-bold text-ink tabular-nums">{macros.carbs}g C</span>
      <span className="bg-bubblegum rounded-full px-2.5 py-1 text-[12px] font-bold text-ink tabular-nums">{macros.fat}g F</span>
    </div>
  )
}

// ─── Card (grid item) ──────────────────────────────────────────────────────────

export function RecipeCard({ recipe, onOpen }: { recipe: Recipe; onOpen: () => void }) {
  return (
    <motion.button
      onClick={onOpen}
      whileHover={{ y: -2 }}
      className="text-left bg-white dark:bg-[#1a1e2e] rounded-[20px] p-5 shadow-[0_10px_30px_rgba(13,16,27,0.07)] cursor-pointer"
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[16px] font-extrabold text-ink dark:text-surface">{recipe.name}</h3>
        <span className="text-[10px] font-extrabold uppercase tracking-wide bg-lavender/20 text-ink dark:text-lavender rounded-full px-2.5 py-1">{recipe.tag}</span>
      </div>
      <p className="text-[12px] font-medium text-ink/45 dark:text-white/45 mb-3 line-clamp-2">{recipe.blurb}</p>
      <div className="flex items-center gap-3 mb-3 text-[11px] font-bold text-ink/40 dark:text-white/40">
        <span>{recipe.prepMin} min</span>
        <span className="w-1 h-1 rounded-full bg-ink/20 dark:bg-white/20" />
        <span>{recipe.servings} serving{recipe.servings > 1 ? 's' : ''}</span>
      </div>
      <MacroChips macros={recipe.macros} />
    </motion.button>
  )
}

// ─── Modal shell ───────────────────────────────────────────────────────────────

function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 bg-ink/40 dark:bg-black/60 backdrop-blur-sm"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, y: 40, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 280, damping: 28 }}
        className="w-full sm:max-w-[560px] max-h-[88vh] overflow-y-auto bg-surface dark:bg-[#11141f] rounded-t-[24px] sm:rounded-[24px] shadow-[0_30px_80px_rgba(13,16,27,0.3)]"
      >
        {children}
      </motion.div>
    </motion.div>
  )
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full bg-ink/5 dark:bg-white/10 hover:bg-ink/10 dark:hover:bg-white/20 flex items-center justify-center text-ink/55 dark:text-white/55 cursor-pointer shrink-0">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
    </button>
  )
}

// ─── Detail view + easy logging ──────────────────────────────────────────────────

export function RecipeDetailModal({ recipe, onClose, onLog }: { recipe: Recipe; onClose: () => void; onLog: (r: Recipe) => void }) {
  const [logged, setLogged] = useState(false)

  function handleLog() {
    setLogged(true)
    onLog(recipe)
    setTimeout(onClose, 850)
  }

  return (
    <Modal onClose={onClose}>
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wide bg-lavender/20 text-ink dark:text-lavender rounded-full px-2.5 py-1">{recipe.tag}</span>
            <h2 className="text-[24px] font-extrabold text-ink dark:text-surface tracking-[-0.5px] mt-2.5">{recipe.name}</h2>
            <p className="text-[14px] font-medium text-ink/50 dark:text-white/50 mt-1">{recipe.blurb}</p>
          </div>
          <CloseButton onClose={onClose} />
        </div>

        <div className="flex items-center gap-3 mb-5 text-[12px] font-bold text-ink/45 dark:text-white/45">
          <span>{recipe.prepMin} min prep</span>
          <span className="w-1 h-1 rounded-full bg-ink/20 dark:bg-white/20" />
          <span>{recipe.servings} serving{recipe.servings > 1 ? 's' : ''}</span>
        </div>

        <div className="bg-white dark:bg-[#1a1e2e] rounded-[14px] p-4 mb-5">
          <p className="text-[11px] font-extrabold tracking-[2px] uppercase text-ink/35 dark:text-white/35 mb-2.5">Per serving</p>
          <MacroChips macros={recipe.macros} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">
          <div>
            <p className="text-[11px] font-extrabold tracking-[2px] uppercase text-ink/35 dark:text-white/35 mb-2.5">Ingredients</p>
            <ul className="space-y-1.5">
              {recipe.ingredients.map((ing, i) => (
                <li key={i} className="flex items-start gap-2 text-[14px] font-medium text-ink/75 dark:text-white/75">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-lavender shrink-0" />
                  {ing}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[11px] font-extrabold tracking-[2px] uppercase text-ink/35 dark:text-white/35 mb-2.5">Method</p>
            <ol className="space-y-2.5">
              {recipe.steps.map((step, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[14px] font-medium text-ink/75 dark:text-white/75">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-ink/8 dark:bg-white/10 text-ink/55 dark:text-white/55 text-[11px] font-extrabold flex items-center justify-center">{i + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </div>

        <button
          onClick={handleLog}
          disabled={logged}
          className={`w-full rounded-[14px] py-3.5 text-[15px] font-extrabold transition-all cursor-pointer ${
            logged ? 'bg-mint text-ink' : 'bg-ink dark:bg-lavender text-white dark:text-ink hover:scale-[1.01] active:scale-[0.99]'
          }`}
        >
          {logged ? '✓ Logged to today' : 'Log this meal'}
        </button>
      </div>
    </Modal>
  )
}

// ─── Recipe creation ────────────────────────────────────────────────────────────

const EMPTY: Recipe = { name: '', tag: 'Breakfast', macros: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, prepMin: 10, servings: 1, blurb: '', ingredients: [''], steps: [''] }
const TAGS = ['Breakfast', 'Lunch', 'Dinner', 'Snack']

function fieldCls() {
  return 'w-full bg-white dark:bg-[#1a1e2e] rounded-[12px] px-3.5 py-2.5 text-[14px] font-medium text-ink dark:text-surface placeholder:text-ink/30 dark:placeholder:text-white/30 outline-none border border-ink/8 dark:border-white/10 focus:border-lavender'
}

export function RecipeCreateModal({ onClose, onCreate }: { onClose: () => void; onCreate: (r: Recipe) => void }) {
  const [r, setR] = useState<Recipe>(EMPTY)
  const set = <K extends keyof Recipe>(k: K, v: Recipe[K]) => setR(p => ({ ...p, [k]: v }))
  const setMacro = (k: keyof MacroData, v: number) => setR(p => ({ ...p, macros: { ...p.macros, [k]: v } }))
  const setList = (key: 'ingredients' | 'steps', i: number, v: string) =>
    setR(p => ({ ...p, [key]: p[key].map((x, j) => (j === i ? v : x)) }))
  const addRow = (key: 'ingredients' | 'steps') => setR(p => ({ ...p, [key]: [...p[key], ''] }))

  function handleCreate() {
    const clean: Recipe = {
      ...r,
      name: r.name.trim() || 'Untitled recipe',
      ingredients: r.ingredients.map(s => s.trim()).filter(Boolean),
      steps: r.steps.map(s => s.trim()).filter(Boolean),
    }
    onCreate(clean)
    onClose()
  }

  return (
    <Modal onClose={onClose}>
      <div className="p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[22px] font-extrabold text-ink dark:text-surface tracking-[-0.5px]">New recipe</h2>
          <CloseButton onClose={onClose} />
        </div>

        <div className="space-y-4">
          <input className={fieldCls()} placeholder="Recipe name" value={r.name} onChange={e => set('name', e.target.value)} />
          <textarea className={`${fieldCls()} resize-none h-16`} placeholder="Short description" value={r.blurb} onChange={e => set('blurb', e.target.value)} />

          <div className="flex flex-wrap gap-1.5">
            {TAGS.map(t => (
              <button
                key={t}
                onClick={() => set('tag', t)}
                className={`px-3 py-1.5 rounded-full text-[12px] font-bold transition-colors cursor-pointer border ${
                  r.tag === t ? 'bg-ink dark:bg-lavender text-white dark:text-ink border-ink dark:border-lavender' : 'bg-white dark:bg-[#1a1e2e] text-ink/55 dark:text-white/55 border-ink/12 dark:border-white/12'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <NumField label="Prep (min)" value={r.prepMin} onChange={v => set('prepMin', v)} />
            <NumField label="Servings" value={r.servings} onChange={v => set('servings', v)} />
          </div>

          <div>
            <p className="text-[11px] font-extrabold tracking-[2px] uppercase text-ink/35 dark:text-white/35 mb-2">Macros (per serving)</p>
            <div className="grid grid-cols-4 gap-2">
              <NumField label="kcal" value={r.macros.kcal} onChange={v => setMacro('kcal', v)} />
              <NumField label="P (g)" value={r.macros.protein} onChange={v => setMacro('protein', v)} />
              <NumField label="C (g)" value={r.macros.carbs} onChange={v => setMacro('carbs', v)} />
              <NumField label="F (g)" value={r.macros.fat} onChange={v => setMacro('fat', v)} />
            </div>
          </div>

          <ListEditor label="Ingredients" items={r.ingredients} placeholder="e.g. 60g oats" onChange={(i, v) => setList('ingredients', i, v)} onAdd={() => addRow('ingredients')} />
          <ListEditor label="Method" items={r.steps} placeholder="e.g. Mix and rest 5 min" onChange={(i, v) => setList('steps', i, v)} onAdd={() => addRow('steps')} />

          <button onClick={handleCreate} className="w-full rounded-[14px] py-3.5 text-[15px] font-extrabold bg-ink dark:bg-lavender text-white dark:text-ink hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer">
            Save recipe
          </button>
        </div>
      </div>
    </Modal>
  )
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold text-ink/45 dark:text-white/45 mb-1 block">{label}</span>
      <input
        type="number" min={0} value={value}
        onChange={e => onChange(Number(e.target.value) || 0)}
        className={`${fieldCls()} tabular-nums`}
      />
    </label>
  )
}

function ListEditor({ label, items, placeholder, onChange, onAdd }: {
  label: string; items: string[]; placeholder: string; onChange: (i: number, v: string) => void; onAdd: () => void
}) {
  return (
    <div>
      <p className="text-[11px] font-extrabold tracking-[2px] uppercase text-ink/35 dark:text-white/35 mb-2">{label}</p>
      <div className="space-y-2">
        {items.map((v, i) => (
          <input key={i} className={fieldCls()} placeholder={placeholder} value={v} onChange={e => onChange(i, e.target.value)} />
        ))}
      </div>
      <button onClick={onAdd} className="mt-2 text-[13px] font-bold text-lavender hover:opacity-80 cursor-pointer flex items-center gap-1">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        Add {label === 'Method' ? 'step' : 'ingredient'}
      </button>
    </div>
  )
}
