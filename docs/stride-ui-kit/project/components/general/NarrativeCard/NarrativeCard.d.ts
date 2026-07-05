import * as React from 'react';

/**
 * NarrativeCard — from stride-ui-kit@0.0.1.
 */
export interface NarrativeCardProps {
type: 'daily' | 'weekly'; narrative: string; date: string;
}

export declare const NarrativeCard: React.ComponentType<NarrativeCardProps>;
