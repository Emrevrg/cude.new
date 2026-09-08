// Cude.new - CodeBlock.tsx (Cude product surface, 2026)
import { memo, useEffect, useState } from 'react';
import type { BundledLanguage, SpecialLanguage } from 'shiki';
import { classNames } from '~/utils/classNames';
import { createScopedLogger } from '~/utils/logger';

import styles from './CodeBlock.module.scss';

const logger = createScopedLogger('CodeBlock');

interface CodeBlockProps {
  className?: string;
  code: string;
  language?: BundledLanguage | SpecialLanguage;
  theme?: 'light-plus' | 'dark-plus';
  disableCopy?: boolean;
}

export const CodeBlock = memo(
  ({ className, code, language = 'plaintext', theme = 'dark-plus', disableCopy = false }: CodeBlockProps) => {
    const [html, setHTML] = useState<string | undefined>(undefined);
    const [copied, setCopied] = useState(false);

    const copyToClipboard = () => {
      if (copied) {
        return;
      }

      navigator.clipboard.writeText(code);

      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 2000);
    };

    /*
     * Shiki, and the regex engine it compiles to WebAssembly, are the largest
     * thing on this page — about a megabyte between them. Imported here rather
     * than at the top of the file, so they arrive with the first block of code
     * somebody actually looks at instead of with the landing page.
     */
    useEffect(() => {
      let current = true;

      const highlight = async () => {
        const { bundledLanguages, codeToHtml, isSpecialLang } = await import('shiki');

        let effectiveLanguage = language;

        if (language && !isSpecialLang(language) && !(language in bundledLanguages)) {
          logger.warn(`Unsupported language '${language}', falling back to plaintext`);
          effectiveLanguage = 'plaintext';
        }

        logger.trace(`Language = ${effectiveLanguage}`);

        const highlighted = await codeToHtml(code, { lang: effectiveLanguage, theme });

        // The block may have been replaced while the grammar was loading.
        if (current) {
          setHTML(highlighted);
        }
      };

      highlight().catch((error) => logger.warn('Could not highlight this block:', error));

      return () => {
        current = false;
      };
    }, [code, language, theme]);

    return (
      <div className={classNames('relative group text-left', className)}>
        <div
          className={classNames(
            styles.CopyButtonContainer,
            'bg-transparant absolute top-[10px] right-[10px] rounded-md z-10 text-lg flex items-center justify-center opacity-0 group-hover:opacity-100',
            {
              'rounded-l-0 opacity-100': copied,
            },
          )}
        >
          {!disableCopy && (
            <button
              className={classNames(
                'flex items-center bg-cude-background-depth-1 border border-cude-borderColor text-cude-textSecondary hover:text-cude-textPrimary hover:bg-cude-background-depth-2 p-[6px] justify-center rounded-md shadow-sm transition-colors',
                {
                  'before:opacity-0': !copied,
                  'before:opacity-100': copied,
                },
              )}
              title="Copy Code"
              onClick={() => copyToClipboard()}
            >
              <div className="i-ph:clipboard-text-duotone"></div>
            </button>
          )}
        </div>
        <div dangerouslySetInnerHTML={{ __html: html ?? '' }}></div>
      </div>
    );
  },
);
