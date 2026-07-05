import * as React from 'react';

/**
 * AgentBadge — from stride-ui-kit@0.0.1.
 */
export interface AgentBadgeProps {
type: 'diet' | 'workout' | 'sleep' | 'hydration' | 'habits' | 'mental' | 'overall'; size?: 'sm' | 'md';
}

export declare const AgentBadge: React.ComponentType<AgentBadgeProps>;
