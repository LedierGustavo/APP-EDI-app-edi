import { create } from "zustand";

type Cred = { usuario: string; senha: string; senhaRaw: string };
type State = {
  cred: Cred | null;
  basic: string | null;
  setCred: (c: Cred) => void;
  clear: () => void;
};

export const useAuthStore = create<State>((set) => ({
  cred: null,
  basic: null,
  setCred: (c) => set({ cred: c, basic: btoa(`${c.usuario}:${c.senha}`) }),
  clear: () => set({ cred: null, basic: null }),
}));
