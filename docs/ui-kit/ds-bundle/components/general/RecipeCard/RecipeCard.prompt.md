RecipeCard from stride-ui-kit. Use via `window.Stride.RecipeCard` (bundle loaded from the root `_ds_bundle.js`).

## Props

```ts
interface RecipeCardProps {
recipe: { name: string; tag: string; macros: { kcal: number; protein: number; carbs: number; fat: number }; prepMin: number; servings: number; blurb: string; ingredients: string[]; steps: string[] }; onOpen: () => void;
}
```
