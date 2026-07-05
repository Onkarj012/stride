RecipeDetailModal from stride-ui-kit. Use via `window.Stride.RecipeDetailModal` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface RecipeDetailModalProps {
recipe: { name: string; tag: string; macros: { kcal: number; protein: number; carbs: number; fat: number }; prepMin: number; servings: number; blurb: string; ingredients: string[]; steps: string[] }; onClose: () => void; onLog: (r: unknown) => void;
}
```
