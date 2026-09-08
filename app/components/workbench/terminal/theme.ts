// Cude.new - theme.ts (Cude product surface, 2026)
import type { ITheme } from '@xterm/xterm';

const style = getComputedStyle(document.documentElement);
const cssVar = (token: string) => style.getPropertyValue(token) || undefined;

export function getTerminalTheme(overrides?: ITheme): ITheme {
  return {
    cursor: cssVar('--cude-terminal-cursorColor'),
    cursorAccent: cssVar('--cude-terminal-cursorColorAccent'),
    foreground: cssVar('--cude-terminal-textColor'),
    background: cssVar('--cude-terminal-backgroundColor'),
    selectionBackground: cssVar('--cude-terminal-selection-backgroundColor'),
    selectionForeground: cssVar('--cude-terminal-selection-textColor'),
    selectionInactiveBackground: cssVar('--cude-terminal-selection-backgroundColorInactive'),

    // ansi escape code colors
    black: cssVar('--cude-terminal-color-black'),
    red: cssVar('--cude-terminal-color-red'),
    green: cssVar('--cude-terminal-color-green'),
    yellow: cssVar('--cude-terminal-color-yellow'),
    blue: cssVar('--cude-terminal-color-blue'),
    magenta: cssVar('--cude-terminal-color-magenta'),
    cyan: cssVar('--cude-terminal-color-cyan'),
    white: cssVar('--cude-terminal-color-white'),
    brightBlack: cssVar('--cude-terminal-color-brightBlack'),
    brightRed: cssVar('--cude-terminal-color-brightRed'),
    brightGreen: cssVar('--cude-terminal-color-brightGreen'),
    brightYellow: cssVar('--cude-terminal-color-brightYellow'),
    brightBlue: cssVar('--cude-terminal-color-brightBlue'),
    brightMagenta: cssVar('--cude-terminal-color-brightMagenta'),
    brightCyan: cssVar('--cude-terminal-color-brightCyan'),
    brightWhite: cssVar('--cude-terminal-color-brightWhite'),

    ...overrides,
  };
}
