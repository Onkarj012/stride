import * as React from 'react';

/**
 * CoachBubble — from stride-ui-kit@0.0.1.
 */
export interface CoachBubbleProps {
messages: Record<'gentle' | 'motivating' | 'analytical', string>; agentType: 'diet' | 'workout' | 'sleep' | 'hydration' | 'habits' | 'mental' | 'overall'; defaultStyle?: 'gentle' | 'motivating' | 'analytical';
}

export declare const CoachBubble: React.ComponentType<CoachBubbleProps>;
