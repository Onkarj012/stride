import * as React from 'react';

/**
 * WorkoutSessionCard — from stride-ui-kit@0.0.1.
 */
export interface WorkoutSessionCardProps {
session: { title: string; date: string; durationMin: number; burnKcal: number; exercises: { name: string; sets: { weight: string; reps: number }[] }[] }; index?: number;
}

export declare const WorkoutSessionCard: React.ComponentType<WorkoutSessionCardProps>;
