import * as React from 'react';

/**
 * InputBar — from stride-ui-kit@0.0.1.
 */
export interface InputBarProps {
placeholder?: string; activeMode: 'type' | 'voice' | 'photo' | 'barcode' | 'ocr'; onModeChange?: (mode: 'type' | 'voice' | 'photo' | 'barcode' | 'ocr') => void;
}

export declare const InputBar: React.ComponentType<InputBarProps>;
