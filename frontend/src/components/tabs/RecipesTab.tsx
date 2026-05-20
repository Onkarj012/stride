import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  X,
  Trash2,
  Pencil,
  Save,
  Sparkles,
  Loader2,
  Utensils,
  ChefHat,
  ChevronDown,
  ArrowLeft,
  CheckCircle2,
} from "lucide-react";
import type { Id } from "../../../backend/convex/_generated/dataModel";
import { Card } from "../ui/Card";
import { PageHeader } from "../ui/PageHeader";
import { ConfirmLogCard } from "../ConfirmLogCard";
import { springs } from "../../lib/animations";

function RecipeModal({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="recipe-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-y-auto"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="bg-[var(--bg-card)] border border-[var(--border-default)] w-full max-w-2xl max-h-[90vh] flex flex-col min-h-0 my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

interface RecipesTabProps {
  today: string;
  userId?: string;
  commitMeal: (data: any) => Promise<void>;
  chatAction: (args: { message: string; sessionId?: Id<"chat_sessions">; coachType?: string }) => Promise<any>;
  activeSessionId: Id<"chat_sessions"> | null;
}

const RECIPES_STORAGE_KEY = (userId?: string) => userId ? `user-recipes:${userId}` : 'user-recipes';

export default function RecipesTab({ today, userId, commitMeal, chatAction, activeSessionId }: RecipesTabProps) {
  const [recipes, setRecipes] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem(RECIPES_STORAGE_KEY(userId));
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(RECIPES_STORAGE_KEY(userId), JSON.stringify(recipes));
  }, [recipes, userId]);

  const [showRecipeForm, setShowRecipeForm] = useState(false);
  const [recipeForm, setRecipeForm] = useState({
    name: '', servings: '1', prepTime: '', cookTime: '', ingredients: '', instructions: '', notes: '',
  });

  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [recipeDetailTab, setRecipeDetailTab] = useState<'details' | 'log'>('details');

  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [editRecipeForm, setEditRecipeForm] = useState<any>(null);

  const [recipeAiNote, setRecipeAiNote] = useState<string | null>(null);
  const [recipeAiLoading, setRecipeAiLoading] = useState(false);

  const [recipeLogConfirm, setRecipeLogConfirm] = useState<any | null>(null);
  const [recipeLogForm, setRecipeLogForm] = useState<{ recipeId: string; quantity: string; extras: string; time: string } | null>(null);

  const handleSaveRecipe = () => {
    if (!recipeForm.name.trim()) return;
    const newRecipe = { id: Date.now().toString(), ...recipeForm, createdAt: new Date().toISOString() };
    setRecipes(prev => [newRecipe, ...prev]);
    setRecipeForm({ name: '', servings: '1', prepTime: '', cookTime: '', ingredients: '', instructions: '', notes: '' });
    setShowRecipeForm(false);
  };

  const handleDeleteRecipe = (id: string) => {
    setRecipes(prev => prev.filter(r => r.id !== id));
    if (selectedRecipeId === id) {
      setSelectedRecipeId(null);
      setRecipeLogConfirm(null);
      setRecipeLogForm(null);
      setRecipeAiNote(null);
    }
  };

  const handleSaveEditRecipe = () => {
    if (!editRecipeForm || !editRecipeForm.name.trim()) return;
    setRecipes(prev => prev.map(r => r.id === editingRecipeId ? { ...r, ...editRecipeForm } : r));
    setEditingRecipeId(null);
    setEditRecipeForm(null);
  };

  const handleGenerateRecipeNote = async (recipe: any) => {
    setRecipeAiLoading(true);
    setRecipeAiNote(null);
    try {
      const prompt = `Analyze this recipe from a nutrition and fitness perspective and give a brief, actionable note (max 2 sentences):\n\nName: ${recipe.name}\nServings: ${recipe.servings}\nIngredients: ${recipe.ingredients}\nNotes: ${recipe.notes || 'None'}\n\nReturn ONLY the note text, no quotes or markdown.`;
      const data = await chatAction({ message: prompt, sessionId: activeSessionId ?? undefined, coachType: 'diet' });
      setRecipeAiNote(data.reply || 'No note generated.');
    } catch {
      setRecipeAiNote('Unable to generate AI note.');
    }
    setRecipeAiLoading(false);
  };

  const handleSelectRecipe = (id: string) => {
    setSelectedRecipeId(id);
    setRecipeDetailTab('details');
    setEditingRecipeId(null);
    setRecipeAiNote(null);
    setRecipeLogConfirm(null);
    setRecipeLogForm(null);
  };

  return (
    <motion.div
      key="recipes-tab"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="space-y-6 will-change-transform"
      data-testid="recipes-tab"
    >
      <div className="flex items-center justify-between">
        <PageHeader title="My Recipes" />
        <button
          data-testid="add-recipe-btn"
          onClick={() => setShowRecipeForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-accent text-[var(--theme-primary-text)] font-mono text-xs uppercase tracking-wider font-bold"
        >
          <Plus size={14} strokeWidth={3} /> New Recipe
        </button>
      </div>

      <RecipeModal open={showRecipeForm} onClose={() => setShowRecipeForm(false)}>
        <div className="p-4 border-b border-[var(--border-default)] flex items-center justify-between shrink-0">
          <h2 className="font-heading text-2xl uppercase tracking-normal">Add Recipe</h2>
          <button onClick={() => setShowRecipeForm(false)} className="p-2 hover:bg-[var(--bg-elevated)]"><X size={20} /></button>
        </div>
        <div className="p-4 space-y-3 flex-1 min-h-0 overflow-y-auto">
          <div>
            <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-2 tracking-wide">Recipe Name *</label>
            <input
              data-testid="recipe-name"
              value={recipeForm.name}
              onChange={(e) => setRecipeForm({ ...recipeForm, name: e.target.value })}
              className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent"
              placeholder="e.g. High Protein Breakfast Bowl"
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-2 tracking-wide">Servings</label>
              <input data-testid="recipe-servings" value={recipeForm.servings} onChange={(e) => setRecipeForm({ ...recipeForm, servings: e.target.value })} className="w-full px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-2 tracking-wide">Prep Time</label>
              <input data-testid="recipe-prep-time" value={recipeForm.prepTime} onChange={(e) => setRecipeForm({ ...recipeForm, prepTime: e.target.value })} placeholder="10 min" className="w-full px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-2 tracking-wide">Cook Time</label>
              <input data-testid="recipe-cook-time" value={recipeForm.cookTime} onChange={(e) => setRecipeForm({ ...recipeForm, cookTime: e.target.value })} placeholder="15 min" className="w-full px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-2 tracking-wide">Ingredients</label>
            <textarea data-testid="recipe-ingredients" value={recipeForm.ingredients} onChange={(e) => setRecipeForm({ ...recipeForm, ingredients: e.target.value })} rows={3} placeholder="List ingredients with portions (one per line)" className="w-full px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent resize-none leading-relaxed" />
          </div>
          <div>
            <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-2 tracking-wide">Instructions</label>
            <textarea data-testid="recipe-instructions" value={recipeForm.instructions} onChange={(e) => setRecipeForm({ ...recipeForm, instructions: e.target.value })} rows={3} placeholder="Step-by-step cooking method..." className="w-full px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent resize-none leading-relaxed" />
          </div>
          <div>
            <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-2 tracking-wide">Notes (For AI Coach)</label>
            <textarea data-testid="recipe-notes" value={recipeForm.notes} onChange={(e) => setRecipeForm({ ...recipeForm, notes: e.target.value })} rows={2} placeholder="Any notes for the AI coach..." className="w-full px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent resize-none leading-relaxed" />
          </div>
          <button data-testid="save-recipe-btn" onClick={handleSaveRecipe} disabled={!recipeForm.name.trim()} className="w-full py-3 bg-accent text-[var(--theme-primary-text)] font-mono uppercase tracking-wider font-bold disabled:opacity-50">
            Save Recipe
          </button>
        </div>
      </RecipeModal>

      {recipes.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <ChefHat size={48} className="mx-auto mb-4 text-[var(--text-muted)]" />
          <h3 className="font-heading text-xl uppercase mb-2 tracking-normal">No Recipes Yet</h3>
          <p className="text-sm font-mono text-[var(--text-muted)] mb-4 tracking-wide">Add your favorite healthy recipes for the AI coach to analyze.</p>
          <button onClick={() => setShowRecipeForm(true)} className="px-6 py-3 bg-accent text-[var(--theme-primary-text)] font-mono text-sm uppercase tracking-wide">
            Add First Recipe
          </button>
        </Card>
      ) : selectedRecipeId ? (
        <div className="flex flex-col lg:flex-row gap-0 border border-[var(--border-default)] overflow-hidden min-h-[500px]">
          {/* Left Panel — Recipe List */}
          <div className="w-full lg:w-80 shrink-0 border-b lg:border-b-0 lg:border-r border-[var(--border-default)] overflow-y-auto bg-[var(--bg-card)] max-h-[40vh] lg:max-h-none">
            <div className="p-3 border-b border-[var(--border-default)] flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-[var(--text-muted)]">{recipes.length} RECIPES</span>
              <button onClick={() => { setSelectedRecipeId(null); setRecipeAiNote(null); }} className="p-1.5 hover:text-accent transition-colors" title="Close panel">
                <ArrowLeft size={14} />
              </button>
            </div>
            {recipes.map((recipe) => (
              <button
                key={recipe.id}
                onClick={() => handleSelectRecipe(recipe.id)}
                className={`w-full text-left px-4 py-3 border-b border-[var(--border-default)] hover:bg-[var(--bg-elevated)] transition-colors ${selectedRecipeId === recipe.id ? 'bg-[var(--bg-elevated)] border-l-2 border-l-accent' : ''}`}
              >
                <div className="font-mono text-sm tracking-wide truncate">{recipe.name}</div>
                <div className="flex gap-3 mt-1 text-[10px] font-mono text-[var(--text-muted)] tracking-wide">
                  {recipe.servings && <span>{recipe.servings} srv</span>}
                  {recipe.prepTime && <span>prep {recipe.prepTime}</span>}
                </div>
              </button>
            ))}
          </div>

          {/* Right Panel — Recipe Detail */}
          <div className="flex-1 min-w-0 overflow-y-auto p-6">
            {(() => {
              const recipe = recipes.find(r => r.id === selectedRecipeId);
              if (!recipe) return null;
              return (
                <div className="space-y-6">
                  {editingRecipeId === recipe.id ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs uppercase text-accent tracking-wider">EDIT RECIPE</span>
                        <button onClick={() => { setEditingRecipeId(null); setEditRecipeForm(null); }} className="p-1 hover:text-red-400"><X size={14} /></button>
                      </div>
                      <input value={editRecipeForm.name} onChange={(e) => setEditRecipeForm({ ...editRecipeForm, name: e.target.value })} className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent" placeholder="Recipe Name" />
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="block font-mono text-[10px] uppercase text-[var(--text-muted)] tracking-wider mb-1">Servings</label>
                          <input value={editRecipeForm.servings} onChange={(e) => setEditRecipeForm({ ...editRecipeForm, servings: e.target.value })} placeholder="e.g. 13 cutlets" className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent" />
                        </div>
                        <div>
                          <label className="block font-mono text-[10px] uppercase text-[var(--text-muted)] tracking-wider mb-1">Prep Time</label>
                          <input value={editRecipeForm.prepTime} onChange={(e) => setEditRecipeForm({ ...editRecipeForm, prepTime: e.target.value })} placeholder="e.g. 20 min" className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent" />
                        </div>
                        <div>
                          <label className="block font-mono text-[10px] uppercase text-[var(--text-muted)] tracking-wider mb-1">Cook Time</label>
                          <input value={editRecipeForm.cookTime} onChange={(e) => setEditRecipeForm({ ...editRecipeForm, cookTime: e.target.value })} placeholder="e.g. 30 min" className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent" />
                        </div>
                      </div>
                      <div>
                        <label className="block font-mono text-[10px] uppercase text-[var(--text-muted)] tracking-wider mb-1">Ingredients</label>
                        <textarea value={editRecipeForm.ingredients} onChange={(e) => setEditRecipeForm({ ...editRecipeForm, ingredients: e.target.value })} placeholder="List ingredients here..." className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent resize-none leading-relaxed min-h-[120px]" style={{ fieldSizing: 'content' }} />
                      </div>
                      <div>
                        <label className="block font-mono text-[10px] uppercase text-[var(--text-muted)] tracking-wider mb-1">Instructions</label>
                        <textarea value={editRecipeForm.instructions} onChange={(e) => setEditRecipeForm({ ...editRecipeForm, instructions: e.target.value })} placeholder="Step-by-step instructions..." className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent resize-none leading-relaxed min-h-[120px]" style={{ fieldSizing: 'content' }} />
                      </div>
                      <div>
                        <label className="block font-mono text-[10px] uppercase text-[var(--text-muted)] tracking-wider mb-1">Notes</label>
                        <textarea value={editRecipeForm.notes} onChange={(e) => setEditRecipeForm({ ...editRecipeForm, notes: e.target.value })} placeholder="Any extra notes..." className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent resize-none leading-relaxed min-h-[60px]" style={{ fieldSizing: 'content' }} />
                      </div>
                      <button onClick={handleSaveEditRecipe} className="flex items-center gap-2 px-6 py-3 bg-accent text-[var(--theme-primary-text)] font-mono text-xs uppercase tracking-wider font-bold">
                        <Save size={14} /> SAVE CHANGES
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between">
                        <div>
                          <h2 className="font-heading text-3xl uppercase tracking-normal mb-2">{recipe.name}</h2>
                          <div className="flex gap-4 text-xs font-mono text-[var(--text-muted)] tracking-wide">
                            {recipe.servings && <span>{recipe.servings} SERVINGS</span>}
                            {recipe.prepTime && <span>PREP: {recipe.prepTime}</span>}
                            {recipe.cookTime && <span>COOK: {recipe.cookTime}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setEditingRecipeId(recipe.id);
                              setEditRecipeForm({ ...recipe });
                            }}
                            className="flex items-center gap-2 px-3 py-2 border border-[var(--border-default)] font-mono text-xs uppercase tracking-wider hover:border-accent transition-colors"
                          >
                            <Pencil size={12} /> EDIT
                          </button>
                          <button onClick={() => handleDeleteRecipe(recipe.id)} className="p-2 border border-[var(--border-default)] hover:bg-red-600 hover:border-red-600 hover:text-white transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Tabs */}
                      <div className="flex border-b border-[var(--border-default)]">
                        <button
                          onClick={() => setRecipeDetailTab('details')}
                          className={`px-4 py-2 font-mono text-xs uppercase tracking-wider border-b-2 transition-colors ${
                            recipeDetailTab === 'details'
                              ? 'border-accent text-accent'
                              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                          }`}
                        >
                          <CheckCircle2 size={12} className="inline mr-1.5" /> Details
                        </button>
                        <button
                          onClick={() => setRecipeDetailTab('log')}
                          className={`px-4 py-2 font-mono text-xs uppercase tracking-wider border-b-2 transition-colors ${
                            recipeDetailTab === 'log'
                              ? 'border-accent text-accent'
                              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                          }`}
                        >
                          <Utensils size={12} className="inline mr-1.5" /> Log as Meal
                        </button>
                      </div>

                      {recipeDetailTab === 'details' && (
                        <div className="space-y-6">
                          {recipe.ingredients && (
                            <div>
                              <h3 className="font-mono text-xs uppercase text-[var(--text-muted)] mb-3 tracking-wider">Ingredients</h3>
                              <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)] whitespace-pre-line text-sm text-[var(--text-secondary)] leading-relaxed">{recipe.ingredients}</div>
                            </div>
                          )}

                          {recipe.instructions && (
                            <div>
                              <h3 className="font-mono text-xs uppercase text-[var(--text-muted)] mb-3 tracking-wider">Instructions</h3>
                              <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)] whitespace-pre-line text-sm text-[var(--text-secondary)] leading-relaxed">{recipe.instructions}</div>
                            </div>
                          )}

                          {recipe.notes && (
                            <div>
                              <h3 className="font-mono text-xs uppercase text-[var(--text-muted)] mb-3 tracking-wider">Notes</h3>
                              <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)] text-sm text-[var(--text-secondary)] leading-relaxed">{recipe.notes}</div>
                            </div>
                          )}

                          <div className="border border-[var(--border-default)] p-4">
                            <div className="flex items-center justify-between mb-3">
                              <h3 className="font-mono text-xs uppercase text-accent tracking-wider flex items-center gap-2">
                                <Sparkles size={12} /> AI NUTRITION NOTE
                              </h3>
                              {!recipeAiNote && (
                                <button
                                  onClick={() => handleGenerateRecipeNote(recipe)}
                                  disabled={recipeAiLoading}
                                  className="flex items-center gap-2 px-3 py-1.5 bg-accent text-[var(--theme-primary-text)] font-mono text-[10px] uppercase tracking-wider font-bold disabled:opacity-50"
                                >
                                  {recipeAiLoading ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
                                  GENERATE
                                </button>
                              )}
                            </div>
                            {recipeAiLoading ? (
                              <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                                <Loader2 size={14} className="animate-spin text-accent" />
                                <span className="font-mono tracking-wide">Analyzing recipe...</span>
                              </div>
                            ) : recipeAiNote ? (
                              <p className="text-sm text-[var(--text-secondary)] leading-relaxed tracking-wide">{recipeAiNote}</p>
                            ) : (
                              <p className="text-sm text-[var(--text-muted)] tracking-wide">Click GENERATE to get an AI-powered nutrition analysis of this recipe.</p>
                            )}
                          </div>
                        </div>
                      )}

                      {recipeDetailTab === 'log' && (
                        <div className="space-y-6">
                          {recipeLogConfirm?.id === recipe.id ? (
                            <ConfirmLogCard
                              mode="meal"
                              initialData={{
                                description: (() => {
                                  const form = recipeLogForm;
                                  const qty = form?.quantity || '1 serving';
                                  const extras = form?.extras?.trim();
                                  let desc = `Ate ${qty} of ${recipe.name}.`;
                                  if (recipe.ingredients) desc += ` Recipe ingredients: ${recipe.ingredients}.`;
                                  if (extras) desc += ` Also ate: ${extras}.`;
                                  return desc;
                                })(),
                                mealType: "unspecified",
                                time: recipeLogForm?.time || "",
                              }}
                              onConfirm={async (data) => {
                                await commitMeal(data);
                                setRecipeLogConfirm(null);
                                setRecipeLogForm(null);
                              }}
                              onDiscard={() => { setRecipeLogConfirm(null); setRecipeLogForm(null); }}
                            />
                          ) : (
                            <div className="space-y-4 border border-[var(--border-default)] p-5">
                              <div className="flex items-center justify-between">
                                <span className="font-mono text-xs uppercase text-accent tracking-wider">LOG AS MEAL</span>
                                <button onClick={() => setRecipeDetailTab('details')} className="p-1 hover:text-red-400"><X size={14} /></button>
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <label className="block font-mono text-[10px] uppercase text-[var(--text-muted)] tracking-wider mb-1">Amount Eaten</label>
                                  <input
                                    type="text"
                                    placeholder="e.g. 5 cutlets, 200g, 1 bowl..."
                                    value={recipeLogForm?.quantity || ''}
                                    onChange={(e) => setRecipeLogForm(prev => prev ? { ...prev, quantity: e.target.value } : { recipeId: recipe.id, quantity: e.target.value, extras: '', time: '' })}
                                    className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent"
                                  />
                                </div>
                                <div>
                                  <label className="block font-mono text-[10px] uppercase text-[var(--text-muted)] tracking-wider mb-1">Meal Time</label>
                                  <input
                                    type="time"
                                    value={recipeLogForm?.time || ''}
                                    onChange={(e) => setRecipeLogForm(prev => prev ? { ...prev, time: e.target.value } : { recipeId: recipe.id, quantity: '', extras: '', time: e.target.value })}
                                    className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent"
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="block font-mono text-[10px] uppercase text-[var(--text-muted)] tracking-wider mb-1">Other Items (optional)</label>
                                <textarea
                                  value={recipeLogForm?.extras || ''}
                                  onChange={(e) => setRecipeLogForm(prev => prev ? { ...prev, extras: e.target.value } : { recipeId: recipe.id, quantity: '', extras: e.target.value, time: '' })}
                                  placeholder="Add any extra food, drinks, or sides you had with this meal..."
                                  className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent resize-none leading-relaxed min-h-[80px]"
                                  style={{ fieldSizing: 'content' }}
                                />
                              </div>
                              <button
                                onClick={() => setRecipeLogConfirm(recipe)}
                                className="flex items-center gap-2 px-6 py-3 bg-accent text-[var(--theme-primary-text)] font-mono text-xs uppercase tracking-wider font-bold hover:opacity-90 transition-opacity"
                              >
                                <Sparkles size={14} /> CONTINUE
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          {recipes.map((recipe) => (
            <div key={recipe.id}>
              {recipeLogConfirm?.id === recipe.id ? (
                <ConfirmLogCard
                  mode="meal"
                  initialData={{
                    description: `${recipe.name}. Ingredients: ${recipe.ingredients}`,
                    mealType: "unspecified",
                    time: "",
                  }}
                  onConfirm={async (data) => {
                    await commitMeal(data);
                    setRecipeLogConfirm(null);
                    setRecipeLogForm(null);
                  }}
                  onDiscard={() => { setRecipeLogConfirm(null); setRecipeLogForm(null); }}
                />
              ) : (
                <Card
                  className="p-5 cursor-pointer hover:border-accent transition-colors"
                  onClick={() => handleSelectRecipe(recipe.id)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-heading text-xl uppercase tracking-normal">{recipe.name}</h3>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteRecipe(recipe.id); }}
                      className="p-2 hover:bg-red-600 hover:text-white transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="flex gap-4 text-xs font-mono text-[var(--text-muted)] mb-3 tracking-wide">
                    {recipe.servings && <span>{recipe.servings} SERVINGS</span>}
                    {recipe.prepTime && <span>PREP: {recipe.prepTime}</span>}
                    {recipe.cookTime && <span>COOK: {recipe.cookTime}</span>}
                  </div>
                  {recipe.ingredients && <p className="text-sm text-[var(--text-secondary)] whitespace-pre-line line-clamp-3 leading-relaxed">{recipe.ingredients}</p>}
                  <div className="mt-3 flex items-center gap-2 text-xs font-mono text-accent tracking-wide">
                    <ChevronDown size={10} /> CLICK TO OPEN
                  </div>
                </Card>
              )}
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
