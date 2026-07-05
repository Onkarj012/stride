import * as React from 'react';

/**
 * WaterTracker — from stride-ui-kit@0.0.1.
 */
export interface WaterTrackerProps {
initial?: number; target?: number; unit?: 'ml' | 'oz';
}

export declare const WaterTracker: React.ComponentType<WaterTrackerProps>;
