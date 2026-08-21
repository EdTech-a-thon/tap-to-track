import { pb } from "$lib/pb";

/** The signed-in teacher, or null. Everything this app stores belongs to one of these. */
class Auth {
  teacher = $state(pb.authStore.record);
  ready = $state(false);

  constructor() {
    pb.authStore.onChange(() => (this.teacher = pb.authStore.record));
  }

  /** Confirms a stored sign-in is still good; a stale one is cleared rather than trusted. */
  async restore() {
    if (pb.authStore.isValid) {
      try {
        await pb.collection("users").authRefresh();
      } catch {
        pb.authStore.clear();
      }
    }
    this.ready = true;
  }

  async signIn(email: string, password: string) {
    await pb.collection("users").authWithPassword(email, password);
  }

  async signUp(email: string, password: string) {
    await pb.collection("users").create({ email, password, passwordConfirm: password });
    await this.signIn(email, password);
  }

  signOut() {
    pb.authStore.clear();
  }
}

export const auth = new Auth();
