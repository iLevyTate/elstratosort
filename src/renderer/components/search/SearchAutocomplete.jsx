import React, { useState, useEffect, useRef, useMemo, memo } from 'react';
import PropTypes from 'prop-types';
import { Search, Clock, FileText, Tag, X, ArrowUp, ArrowDown } from 'lucide-react';
import { Text } from '../ui/Typography';

const RECENT_SEARCHES_KEY = 'stratosort-recent-searches';
const MAX_RECENT_SEARCHES = 10;
const MAX_SUGGESTIONS = 5;

const isMac =
  navigator.userAgentData?.platform === 'macOS' || /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);

function loadRecentSearches() {
  try {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveRecentSearches(searches) {
  try {
    localStorage.setItem(
      RECENT_SEARCHES_KEY,
      JSON.stringify(searches.slice(0, MAX_RECENT_SEARCHES))
    );
  } catch {
    // Ignore storage errors
  }
}

export function addToRecentSearches(query) {
  if (!query || query.trim().length < 2) return;

  const trimmed = query.trim();
  const recent = loadRecentSearches();

  const filtered = recent.filter((s) => s.toLowerCase() !== trimmed.toLowerCase());
  const updated = [trimmed, ...filtered].slice(0, MAX_RECENT_SEARCHES);

  saveRecentSearches(updated);
}

export function clearRecentSearches() {
  try {
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  } catch {
    // Ignore
  }
}

const SearchAutocomplete = memo(
  ({
    value,
    onChange,
    onSearch,
    placeholder = 'Search...',
    ariaLabel = 'Search',
    autoFocus = false,
    disabled = false,
    className = ''
  }) => {
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [suggestions, setSuggestions] = useState([]);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const [recentSearches, setRecentSearches] = useState([]);

    const inputRef = useRef(null);
    const containerRef = useRef(null);
    const fetchTimeoutRef = useRef(null);
    const latestQueryRef = useRef('');

    useEffect(() => {
      setRecentSearches(loadRecentSearches());
    }, []);

    useEffect(() => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }

      const trimmed = value?.trim() || '';
      latestQueryRef.current = trimmed;

      if (trimmed.length < 2) {
        setSuggestions([]);
        return undefined;
      }

      let isCancelled = false;

      fetchTimeoutRef.current = setTimeout(async () => {
        const queryAtScheduleTime = trimmed;
        try {
          const result = await window.electronAPI?.embeddings?.search?.(queryAtScheduleTime, {
            topK: MAX_SUGGESTIONS,
            mode: 'hybrid',
            rerank: false
          });

          if (
            !isCancelled &&
            latestQueryRef.current === queryAtScheduleTime &&
            result?.success &&
            result.results
          ) {
            const fileSuggestions = result.results.map((r, index) => ({
              type: 'file',
              label: r.metadata?.name || r.id,
              value: r.metadata?.name || r.id,
              path: r.metadata?.path,
              score: r.score,
              rank: index
            }));
            setSuggestions(fileSuggestions);
          }
        } catch {
          // Ignore fetch errors
        }
      }, 200);

      return () => {
        isCancelled = true;
        if (fetchTimeoutRef.current) {
          clearTimeout(fetchTimeoutRef.current);
        }
      };
    }, [value]);

    useEffect(() => {
      const handleClickOutside = (e) => {
        if (containerRef.current && !containerRef.current.contains(e.target)) {
          setShowSuggestions(false);
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const allSuggestions = useMemo(() => {
      const items = [];
      const trimmed = value?.trim() || '';

      if (trimmed.length < 2) {
        recentSearches.slice(0, 5).forEach((search) => {
          items.push({
            type: 'recent',
            label: search,
            value: search
          });
        });
      } else {
        recentSearches
          .filter((s) => s.toLowerCase().includes(trimmed.toLowerCase()))
          .slice(0, 3)
          .forEach((search) => {
            items.push({
              type: 'recent',
              label: search,
              value: search
            });
          });

        suggestions.forEach((s) => {
          if (!items.find((i) => i.value === s.value)) {
            items.push(s);
          }
        });
      }

      return items.slice(0, 8);
    }, [value, recentSearches, suggestions]);

    useEffect(() => {
      if (selectedIndex >= allSuggestions.length) {
        setSelectedIndex(allSuggestions.length > 0 ? allSuggestions.length - 1 : -1);
      }
    }, [allSuggestions.length, selectedIndex]);

    useEffect(() => {
      if (selectedIndex >= 0) {
        const element = document.getElementById(`search-suggestion-${selectedIndex}`);
        element?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }, [selectedIndex]);

    const handleInputChange = (e) => {
      onChange(e.target.value);
      setSelectedIndex(-1);
      setShowSuggestions(true);
    };

    const handleSelectSuggestion = (suggestion) => {
      onChange(suggestion.value);
      setShowSuggestions(false);
      setSelectedIndex(-1);

      if (onSearch) {
        addToRecentSearches(suggestion.value);
        onSearch(suggestion.value);
      }
    };

    const handleKeyDown = (e) => {
      const items = allSuggestions;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (!showSuggestions) {
            setShowSuggestions(true);
          } else {
            setSelectedIndex((prev) => Math.min(prev + 1, items.length - 1));
          }
          break;

        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, -1));
          break;

        case 'Enter':
          e.preventDefault();
          if (selectedIndex >= 0 && items[selectedIndex]) {
            handleSelectSuggestion(items[selectedIndex]);
          } else if (value?.trim()) {
            addToRecentSearches(value);
            if (onSearch) {
              onSearch(value);
            }
            setShowSuggestions(false);
          }
          break;

        case 'Escape':
          setShowSuggestions(false);
          setSelectedIndex(-1);
          break;

        case 'Tab':
          setShowSuggestions(false);
          break;
      }
    };

    const handleClearRecent = (e, searchToRemove) => {
      e.stopPropagation();
      const updated = recentSearches.filter((s) => s !== searchToRemove);
      setRecentSearches(updated);
      saveRecentSearches(updated);
    };

    const items = allSuggestions;
    const showDropdown = showSuggestions && items.length > 0;

    return (
      <div ref={containerRef} className={`relative ${className}`}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-system-gray-400 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={handleInputChange}
            onClick={() => setShowSuggestions(true)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            aria-label={ariaLabel}
            aria-autocomplete="list"
            aria-expanded={showDropdown}
            aria-owns={showDropdown ? 'search-suggestions-listbox' : undefined}
            aria-activedescendant={
              selectedIndex >= 0 ? `search-suggestion-${selectedIndex}` : undefined
            }
            role="combobox"
            autoFocus={autoFocus}
            disabled={disabled}
            className={`
            w-full pl-9 pr-4 py-2 text-sm
            border-none rounded-xl
            bg-transparent focus:bg-transparent
            focus:outline-none focus:ring-0
            placeholder:text-system-gray-500
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors
          `}
            autoComplete="off"
            spellCheck="false"
          />

          {value && (
            <button
              type="button"
              onClick={() => {
                onChange('');
                inputRef.current?.focus();
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-system-gray-100 text-system-gray-400 hover:text-system-gray-600"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {!value && !disabled && (
            <Text
              as="span"
              variant="tiny"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-system-gray-400 bg-system-gray-100 px-1.5 py-0.5 rounded border border-system-gray-200 font-medium pointer-events-none"
            >
              {isMac ? '⌘K' : 'Ctrl+K'}
            </Text>
          )}
        </div>

        {showDropdown && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-system-gray-200 rounded-lg shadow-lg overflow-hidden">
            <div className="px-3 py-1.5 bg-system-gray-50 border-b border-system-gray-100 flex items-center gap-3">
              <Text
                as="span"
                variant="tiny"
                className="flex items-center gap-1 text-system-gray-400"
              >
                <ArrowUp className="w-3 h-3" />
                <ArrowDown className="w-3 h-3" />
                navigate
              </Text>
              <Text as="span" variant="tiny" className="text-system-gray-400">
                Enter to select
              </Text>
              <Text as="span" variant="tiny" className="text-system-gray-400">
                Esc to close
              </Text>
            </div>

            <ul
              id="search-suggestions-listbox"
              className="max-h-64 overflow-y-auto"
              role="listbox"
              aria-label="Search suggestions"
            >
              {items.map((item, index) => (
                <li
                  key={`${item.type}-${item.value}-${index}`}
                  id={`search-suggestion-${index}`}
                  role="option"
                  aria-selected={index === selectedIndex}
                  onClick={() => handleSelectSuggestion(item)}
                  className={`
                  px-3 py-2 cursor-pointer flex items-center gap-2 text-sm
                  ${index === selectedIndex ? 'bg-stratosort-blue/10 text-stratosort-blue' : 'hover:bg-system-gray-50'}
                `}
                >
                  {item.type === 'recent' && (
                    <Clock className="w-4 h-4 text-system-gray-400 shrink-0" />
                  )}
                  {item.type === 'file' && (
                    <FileText className="w-4 h-4 text-stratosort-blue shrink-0" />
                  )}
                  {item.type === 'tag' && <Tag className="w-4 h-4 text-emerald-500 shrink-0" />}

                  <Text variant="small" className="flex-1 truncate">
                    {item.label}
                  </Text>

                  {item.type === 'file' && item.rank !== undefined && item.rank < 3 && (
                    <Text
                      as="span"
                      variant="tiny"
                      className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 font-medium ${
                        item.rank === 0
                          ? 'bg-amber-100 text-amber-700'
                          : item.rank === 1
                            ? 'bg-system-gray-100 text-system-gray-600'
                            : 'bg-orange-50 text-orange-600'
                      }`}
                    >
                      {item.rank === 0 ? '1st' : item.rank === 1 ? '2nd' : '3rd'}
                    </Text>
                  )}

                  {item.type === 'recent' && (
                    <button
                      type="button"
                      onClick={(e) => handleClearRecent(e, item.value)}
                      className="p-0.5 rounded hover:bg-system-gray-200 text-system-gray-400 hover:text-system-gray-600 shrink-0"
                      aria-label="Remove from history"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }
);

SearchAutocomplete.displayName = 'SearchAutocomplete';

SearchAutocomplete.propTypes = {
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  onSearch: PropTypes.func,
  placeholder: PropTypes.string,
  ariaLabel: PropTypes.string,
  autoFocus: PropTypes.bool,
  disabled: PropTypes.bool,
  className: PropTypes.string
};

export default SearchAutocomplete;
