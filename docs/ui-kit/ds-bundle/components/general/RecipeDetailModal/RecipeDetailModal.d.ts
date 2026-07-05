import * as React from 'react';

/**
 * RecipeDetailModal — from stride-ui-kit@0.0.1.
 */
export interface RecipeDetailModalProps {
recipe: { name: string; tag: string; macros: { kcal: number; protein: number; carbs: number; fat: number }; prepMin: number; servings: number; blurb: string; ingredients: string[]; steps: string[] }; onClose: () => void; onLog: (r: unknown) => void;
}

export declare const RecipeDetailModal: React.ComponentType<RecipeDetailModalProps>;
