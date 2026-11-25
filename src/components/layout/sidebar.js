// Konteks sidebar. Dipakai halaman ujian untuk menyembunyikan sidebar selama ujian berlangsung.
// `open`/`setOpen` dipertahankan agar pemanggil lama tetap berjalan.
import { createContext, useContext } from 'react'

export const SidebarContext = createContext({ open: true, toggle: () => {}, setOpen: () => {}, examMode: false, setExamMode: () => {}, focusMode: false, setFocusMode: () => {} })
export const useSidebar = () => useContext(SidebarContext)
