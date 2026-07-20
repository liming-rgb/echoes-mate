"use client"

import { useState, useEffect, useCallback } from "react"

/**
 * A hook that syncs state with localStorage.
 * Reads the initial value from localStorage (if available),
 * and writes back whenever the value changes.
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(initialValue)

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const item = window.localStorage.getItem(key)
      if (item !== null) {
        setStoredValue(JSON.parse(item))
      }
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error)
    }
  }, [key])

  // Write to localStorage whenever the value changes
  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStoredValue((prev) => {
        const nextValue =
          value instanceof Function ? value(prev) : value
        try {
          window.localStorage.setItem(key, JSON.stringify(nextValue))
        } catch (error) {
          console.error(`Error writing localStorage key "${key}":`, error)
        }
        return nextValue
      })
    },
    [key]
  )

  return [storedValue, setValue]
}
