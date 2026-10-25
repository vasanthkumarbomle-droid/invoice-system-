import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'

/**
 * Accessible, keyboard-navigable searchable option picker.
 * Options use { value, label, searchText? } so codes and display names can both match.
 */
export default function SearchableCombobox({
  options = [],
  value = '',
  onChange,
  placeholder = 'Search options…',
  ariaLabel = 'Search options',
  disabled = false,
  className = '',
}) {
  const id = useId()
  const rootRef = useRef(null)
  const inputRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const selected = options.find((option) => String(option.value) === String(value))

  const filteredOptions = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    if (!needle) return options
    return options.filter((option) =>
      `${option.label || ''} ${option.value || ''} ${option.searchText || ''}`
        .toLocaleLowerCase()
        .includes(needle)
    )
  }, [options, query])

  useEffect(() => {
    if (!open) setQuery(selected?.label || '')
  }, [open, selected?.label, value])

  useEffect(() => {
    if (!open) return undefined
    const handleOutsidePointer = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false)
        setQuery(selected?.label || '')
      }
    }
    document.addEventListener('pointerdown', handleOutsidePointer)
    return () => document.removeEventListener('pointerdown', handleOutsidePointer)
  }, [open, selected?.label])

  const choose = (option) => {
    onChange?.(option.value)
    setQuery(option.label || '')
    setOpen(false)
    setActiveIndex(0)
  }

  const handleKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        setQuery('')
        setActiveIndex(0)
      } else {
        setActiveIndex((current) => Math.min(Math.max(filteredOptions.length - 1, 0), current + 1))
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        setQuery('')
        setActiveIndex(Math.max(filteredOptions.length - 1, 0))
      } else {
        setActiveIndex((current) => Math.max(0, current - 1))
      }
    } else if (event.key === 'Enter' && open) {
      event.preventDefault()
      if (filteredOptions[activeIndex]) choose(filteredOptions[activeIndex])
    } else if (event.key === 'Escape' && open) {
      event.preventDefault()
      setOpen(false)
      setQuery(selected?.label || '')
    }
  }

  return (
    <div className={`lf-search-combobox ${className}`.trim()} ref={rootRef}>
      <div className="lf-search-combobox-control">
        <Search size={15} aria-hidden="true" className="lf-search-combobox-search" />
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-label={ariaLabel}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-options`}
          aria-activedescendant={open && filteredOptions[activeIndex] ? `${id}-option-${activeIndex}` : undefined}
          autoComplete="off"
          disabled={disabled}
          value={open ? query : (selected?.label || '')}
          placeholder={placeholder}
          onFocus={() => {
            if (!disabled) {
              setOpen(true)
              setQuery('')
              setActiveIndex(0)
            }
          }}
          onChange={(event) => {
            setQuery(event.target.value)
            setActiveIndex(0)
            setOpen(true)
          }}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          className="lf-search-combobox-toggle"
          aria-label={open ? 'Close options' : 'Show options'}
          aria-expanded={open}
          disabled={disabled}
          onClick={() => {
            if (open) {
              setOpen(false)
              setQuery(selected?.label || '')
            } else {
              setOpen(true)
              setQuery('')
              setActiveIndex(0)
              inputRef.current?.focus()
            }
          }}
        >
          <ChevronDown size={15} aria-hidden="true" />
        </button>
      </div>
      {open && (
        <div className="lf-search-combobox-options" id={`${id}-options`} role="listbox" aria-label={ariaLabel}>
          {filteredOptions.length === 0 ? (
            <div className="lf-search-combobox-empty">No matching options</div>
          ) : filteredOptions.map((option, index) => (
            <button
              type="button"
              key={String(option.value)}
              id={`${id}-option-${index}`}
              role="option"
              aria-selected={String(option.value) === String(value)}
              className={`lf-search-combobox-option ${index === activeIndex ? 'is-active' : ''}`}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
            >
              <span>{option.label}</span>
              {String(option.value) === String(value) && <Check size={15} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
