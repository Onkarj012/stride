import * as React from 'react';

/**
 * MilestoneCard — from stride-ui-kit@0.0.1.
 */
export interface MilestoneCardProps {
milestones: { label: string; achieved: boolean }[];
}

export declare const MilestoneCard: React.ComponentType<MilestoneCardProps>;
