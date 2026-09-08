// Cude.new - uno.config.ts (Cude product surface, 2026)
import { globSync } from 'fast-glob';
import fs from 'node:fs/promises';
import { basename } from 'node:path';
import { defineConfig, presetIcons, presetUno, transformerDirectives } from 'unocss';

const iconPaths = globSync('./icons/*.svg');

const collectionName = 'cude';

const customIconCollection = iconPaths.reduce(
  (acc, iconPath) => {
    const [iconName] = basename(iconPath).split('.');

    acc[collectionName] ??= {};
    acc[collectionName][iconName] = async () => fs.readFile(iconPath, 'utf8');

    return acc;
  },
  {} as Record<string, Record<string, () => Promise<string>>>,
);

const BASE_COLORS = {
  white: '#FFFFFF',
  gray: {
    50: '#EFEFEF',
    100: '#D0D0D0',
    200: '#A0A0A0',
    300: '#777777',
    400: '#505050',
    500: '#303030',
    600: '#222222',
    700: '#181818',
    800: '#121212',
    900: '#0D0D0D',
    950: '#000000',
  },
  accent: {
    50: '#EFEFEF',
    100: '#D0D0D0',
    200: '#A0A0A0',
    300: '#777777',
    400: '#505050',
    500: '#FFFFFF',
    600: '#EFEFEF',
    700: '#D0D0D0',
    800: '#121212',
    900: '#0D0D0D',
    950: '#000000',
  },
  green: {
    50: '#F0FDF4',
    100: '#DCFCE7',
    200: '#BBF7D0',
    300: '#86EFAC',
    400: '#4ADE80',
    500: '#22C55E',
    600: '#16A34A',
    700: '#15803D',
    800: '#166534',
    900: '#14532D',
    950: '#052E16',
  },
  orange: {
    50: '#FFFAEB',
    100: '#FEEFC7',
    200: '#FEDF89',
    300: '#FEC84B',
    400: '#FDB022',
    500: '#F79009',
    600: '#DC6803',
    700: '#B54708',
    800: '#93370D',
    900: '#792E0D',
  },
  red: {
    50: '#FEF2F2',
    100: '#FEE2E2',
    200: '#FECACA',
    300: '#FCA5A5',
    400: '#F87171',
    500: '#EF4444',
    600: '#DC2626',
    700: '#B91C1C',
    800: '#991B1B',
    900: '#7F1D1D',
    950: '#450A0A',
  },
};

const COLOR_PRIMITIVES = {
  ...BASE_COLORS,
  alpha: {
    white: generateAlphaPalette(BASE_COLORS.white),
    gray: generateAlphaPalette(BASE_COLORS.gray[900]),
    red: generateAlphaPalette(BASE_COLORS.red[500]),
    accent: generateAlphaPalette(BASE_COLORS.accent[500]),
  },
};

export default defineConfig({
  safelist: [...Object.keys(customIconCollection[collectionName] || {}).map((x) => `i-cude:${x}`)],
  shortcuts: {
    'cude-ease-cubic-bezier': 'ease-[cubic-bezier(0.4,0,0.2,1)]',
    'transition-theme': 'transition-[background-color,border-color,color] duration-150 cude-ease-cubic-bezier',
    kdb: 'bg-cude-code-background text-cude-code-text py-1 px-1.5 rounded-md',
    'max-w-chat': 'max-w-[var(--chat-max-width)]',
  },
  rules: [
    /**
     * This shorthand doesn't exist in Tailwind and we overwrite it to avoid
     * any conflicts with minified CSS classes.
     */
    ['b', {}],
  ],
  theme: {
    colors: {
      ...COLOR_PRIMITIVES,

      /*
       * The design tokens, flat. They used to sit under an extra `elements`
       * level, which put the word into every class name in the application and
       * bought nothing.
       */
      cude: {
        borderColor: 'var(--cude-borderColor)',
        borderColorActive: 'var(--cude-borderColorActive)',
        background: {
          depth: {
            1: 'var(--cude-bg-depth-1)',
            2: 'var(--cude-bg-depth-2)',
            3: 'var(--cude-bg-depth-3)',
            4: 'var(--cude-bg-depth-4)',
          },
        },
        textPrimary: 'var(--cude-textPrimary)',
        textSecondary: 'var(--cude-textSecondary)',
        textTertiary: 'var(--cude-textTertiary)',
        code: {
          background: 'var(--cude-code-background)',
          text: 'var(--cude-code-text)',
        },
        button: {
          primary: {
            background: 'var(--cude-button-primary-background)',
            backgroundHover: 'var(--cude-button-primary-backgroundHover)',
            text: 'var(--cude-button-primary-text)',
          },
          secondary: {
            background: 'var(--cude-button-secondary-background)',
            backgroundHover: 'var(--cude-button-secondary-backgroundHover)',
            text: 'var(--cude-button-secondary-text)',
          },
          danger: {
            background: 'var(--cude-button-danger-background)',
            backgroundHover: 'var(--cude-button-danger-backgroundHover)',
            text: 'var(--cude-button-danger-text)',
          },
        },
        item: {
          contentDefault: 'var(--cude-item-contentDefault)',
          contentActive: 'var(--cude-item-contentActive)',
          contentAccent: 'var(--cude-item-contentAccent)',
          contentDanger: 'var(--cude-item-contentDanger)',
          backgroundDefault: 'var(--cude-item-backgroundDefault)',
          backgroundActive: 'var(--cude-item-backgroundActive)',
          backgroundAccent: 'var(--cude-item-backgroundAccent)',
          backgroundDanger: 'var(--cude-item-backgroundDanger)',
        },
        actions: {
          background: 'var(--cude-actions-background)',
          code: {
            background: 'var(--cude-actions-code-background)',
          },
        },
        artifacts: {
          background: 'var(--cude-artifacts-background)',
          backgroundHover: 'var(--cude-artifacts-backgroundHover)',
          borderColor: 'var(--cude-artifacts-borderColor)',
          inlineCode: {
            background: 'var(--cude-artifacts-inlineCode-background)',
            text: 'var(--cude-artifacts-inlineCode-text)',
          },
        },
        messages: {
          background: 'var(--cude-messages-background)',
          linkColor: 'var(--cude-messages-linkColor)',
          code: {
            background: 'var(--cude-messages-code-background)',
          },
          inlineCode: {
            background: 'var(--cude-messages-inlineCode-background)',
            text: 'var(--cude-messages-inlineCode-text)',
          },
        },
        icon: {
          success: 'var(--cude-icon-success)',
          error: 'var(--cude-icon-error)',
          primary: 'var(--cude-icon-primary)',
          secondary: 'var(--cude-icon-secondary)',
          tertiary: 'var(--cude-icon-tertiary)',
        },
        preview: {
          addressBar: {
            background: 'var(--cude-preview-addressBar-background)',
            backgroundHover: 'var(--cude-preview-addressBar-backgroundHover)',
            backgroundActive: 'var(--cude-preview-addressBar-backgroundActive)',
            text: 'var(--cude-preview-addressBar-text)',
            textActive: 'var(--cude-preview-addressBar-textActive)',
          },
        },
        terminals: {
          background: 'var(--cude-terminals-background)',
          buttonBackground: 'var(--cude-terminals-buttonBackground)',
        },
        dividerColor: 'var(--cude-dividerColor)',
        loader: {
          background: 'var(--cude-loader-background)',
          progress: 'var(--cude-loader-progress)',
        },
        prompt: {
          background: 'var(--cude-prompt-background)',
        },
        sidebar: {
          dropdownShadow: 'var(--cude-sidebar-dropdownShadow)',
          buttonBackgroundDefault: 'var(--cude-sidebar-buttonBackgroundDefault)',
          buttonBackgroundHover: 'var(--cude-sidebar-buttonBackgroundHover)',
          buttonText: 'var(--cude-sidebar-buttonText)',
        },
        cta: {
          background: 'var(--cude-cta-background)',
          text: 'var(--cude-cta-text)',
        },
      },
    },
  },
  transformers: [transformerDirectives()],
  presets: [
    presetUno({
      dark: {
        light: '[data-theme="light"]',
        dark: '[data-theme="dark"]',
      },
    }),
    presetIcons({
      warn: true,
      collections: {
        ...customIconCollection,
      },
      unit: 'em',
    }),
  ],
});

/**
 * Generates an alpha palette for a given hex color.
 *
 * @param hex - The hex color code (without alpha) to generate the palette from.
 * @returns An object where keys are opacity percentages and values are hex colors with alpha.
 *
 * Example:
 *
 * ```
 * {
 *   '1': '#FFFFFF03',
 *   '2': '#FFFFFF05',
 *   '3': '#FFFFFF08',
 * }
 * ```
 */
function generateAlphaPalette(hex: string) {
  return [1, 2, 3, 4, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].reduce(
    (acc, opacity) => {
      const alpha = Math.round((opacity / 100) * 255)
        .toString(16)
        .padStart(2, '0');

      acc[opacity] = `${hex}${alpha}`;

      return acc;
    },
    {} as Record<number, string>,
  );
}
