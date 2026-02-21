// frontend/src/store/user.js
import { create } from "zustand";

const useUserStore = create((set) => ({
  user: null,
  setUser: (u) => set({ user: u }),
  clearUser: () => set({ user: null }),
  // --- NEW: logout flag to signal an intentional logout ---
  logoutFlag: false,
  setLogoutFlag: () => set({ logoutFlag: true }),
  clearLogoutFlag: () => set({ logoutFlag: false }),
  // --- NEW: updateProfile to persist computed profile in store ---
  updateProfile: (profile) => set((state) => ({ user: { ...state.user, profile } })),
}));

export default useUserStore;