import * as React from 'react';

/**
 * RecipeCard — from stride-ui-kit@0.0.1.
 */
export interface RecipeCardProps {
recipe: { name: string; tag: string; macros: { kcal: number; protein: number; carbs: number; fat: number }; prepMin: number; servings: number; blurb: string; ingredients: string[]; steps: string[] }; onOpen: () => void;
}

export declare const RecipeCard: React.ComponentType<RecipeCardProps>;
