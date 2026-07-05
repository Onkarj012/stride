import * as React from 'react';

/**
 * WorkoutCard — from stride-ui-kit@0.0.1.
 */
export interface WorkoutCardProps {
exercise: string; sets: number; reps: number; weight: string; burnKcal: number; date: string;
}

export declare const WorkoutCard: React.ComponentType<WorkoutCardProps>;
