import { sanitizePlan, type FamilyPlan } from "../engine";

/**
 * Everything lives in this browser's localStorage. There is no server and no
 * account: a family's schedule never leaves the device unless they share a link.
 */
const STORAGE_KEY = "gapless:v1";

export interface SavedState {
  plan: FamilyPlan | null;
  /** Demo-unlock flag. In production this would come from a checkout receipt. */
  pro: boolean;
}

export const EMPTY_STATE: SavedState = { plan: null, pro: false };

export function loadState(today: string): SavedState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    const data = JSON.parse(raw) as Partial<SavedState>;
    // Saved plans move forward to today: past days are history.
    const plan = data.plan ? sanitizePlan({ ...data.plan, today: today > data.plan.today ? today : data.plan.today }, today) : null;
    return { plan, pro: data.pro === true };
  } catch {
    return EMPTY_STATE;
  }
}

export function saveState(state: SavedState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked; the app still works for this session.
  }
}

export function clearState(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}
