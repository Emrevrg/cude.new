/**
 * Cude.new - pick one thing from a searchable list.
 *
 * Written once. The composer had two of these built by hand, each with its own
 * debounce, its own keyboard handling and its own click-outside listener, and
 * they had already drifted: only one of them wrapped at the ends of the list.
 *
 * The arithmetic lives in `listNavigation` and is tested there; this is the
 * part that has to touch the DOM.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { classNames } from '~/utils/classNames';
import {
  filterOptions,
  nextIndex,
  preserveFocus,
  type NavigationKey,
  type Option,
} from '~/lib/cude/state/listNavigation';

export interface ComboboxProps<T extends Option> {
  options: T[];
  value?: string;
  onChange: (option: T) => void;

  label: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  loading?: boolean;
  className?: string;

  /** Rendered on the right of an option, for a badge or a status dot. */
  renderTrailing?: (option: T) => React.ReactNode;
}

const NAVIGATION_KEYS: NavigationKey[] = ['ArrowDown', 'ArrowUp', 'Home', 'End'];

export function Combobox<T extends Option>({
  options,
  value,
  onChange,
  label,
  placeholder = 'Select',
  searchPlaceholder = 'Search',
  emptyMessage = 'Nothing matches that.',
  disabled = false,
  loading = false,
  className,
  renderTrailing,
}: ComboboxProps<T>) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(-1);

  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLLIElement | null>>([]);

  const matches = useMemo(() => filterOptions(options, query), [options, query]);
  const selected = options.find((option) => option.value === value);

  // Refiltering keeps the highlight on the same option where it can.
  useEffect(() => {
    setFocused((current) => preserveFocus(matches, matches[current]?.value ?? value));
  }, [matches, value]);

  useEffect(() => {
    if (open) {
      searchRef.current?.focus();
    } else {
      setQuery('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', onPointerDown);

    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // Keep the highlighted option in view when walking the list by keyboard.
  useEffect(() => {
    optionRefs.current[focused]?.scrollIntoView({ block: 'nearest' });
  }, [focused]);

  const choose = useCallback(
    (option: T | undefined) => {
      if (!option) {
        return;
      }

      onChange(option);
      setOpen(false);
    },
    [onChange],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        choose(matches[focused]);

        return;
      }

      if (NAVIGATION_KEYS.includes(event.key as NavigationKey)) {
        event.preventDefault();
        setFocused((current) => nextIndex(current, matches.length, event.key as NavigationKey));
      }
    },
    [choose, matches, focused],
  );

  return (
    <div ref={rootRef} className={classNames('relative', className)}>
      <button
        type="button"
        disabled={disabled}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (!open && NAVIGATION_KEYS.includes(event.key as NavigationKey)) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={classNames(
          'flex w-full items-center justify-between gap-2 rounded-lg border border-cude-borderColor',
          'bg-cude-background-depth-2 px-2.5 py-1.5 text-sm text-cude-textPrimary',
          'transition-colors hover:border-cude-borderColorActive',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <span className="truncate">
          {loading ? 'Loading' : (selected?.label ?? <span className="text-cude-textTertiary">{placeholder}</span>)}
        </span>
        <ChevronDown className={classNames('h-3.5 w-3.5 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[220px] overflow-hidden rounded-lg border border-cude-borderColor bg-cude-background-depth-1 shadow-lg">
          <div className="flex items-center gap-2 border-b border-cude-borderColor px-2.5 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-cude-textTertiary" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              aria-controls={listId}
              aria-activedescendant={focused >= 0 ? `${listId}-${focused}` : undefined}
              spellCheck={false}
              className="w-full bg-transparent text-sm text-cude-textPrimary outline-none placeholder:text-cude-textTertiary"
            />
          </div>

          <ul id={listId} role="listbox" aria-label={label} className="max-h-64 overflow-y-auto py-1">
            {matches.length === 0 && (
              <li className="px-3 py-3 text-center text-xs text-cude-textTertiary">{emptyMessage}</li>
            )}

            {matches.map((option, index) => {
              const isSelected = option.value === value;

              return (
                <li
                  key={option.value}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  ref={(node) => {
                    optionRefs.current[index] = node;
                  }}
                  onPointerEnter={() => setFocused(index)}
                  onClick={() => choose(option)}
                  className={classNames(
                    'flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm',
                    index === focused ? 'bg-cude-item-backgroundActive' : '',
                    isSelected ? 'text-cude-textPrimary' : 'text-cude-textSecondary',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {option.label}
                    {option.detail && <span className="ml-2 text-[11px] text-cude-textTertiary">{option.detail}</span>}
                  </span>

                  {renderTrailing?.(option)}
                  {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
