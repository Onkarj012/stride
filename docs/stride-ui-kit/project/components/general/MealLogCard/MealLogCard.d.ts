import * as React from 'react';

/**
 * MealLogCard — from stride-ui-kit@0.0.1.
 */
export interface MealLogCardProps {
meal: string; time: string; macros: { kcal: number; protein: number; carbs: number; fat: number }; confirmed: boolean;
}

export declare const MealLogCard: React.ComponentType<MealLogCardProps>;
