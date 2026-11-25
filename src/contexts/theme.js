// Konteks tema (terang/gelap) dan hook-nya (penyedia ada di ThemeContext.jsx).
import { createContext, useContext } from 'react'

export const ThemeContext = createContext({ theme: 'light', toggleTheme: () => {} })
export const useTheme = () => useContext(ThemeContext)
