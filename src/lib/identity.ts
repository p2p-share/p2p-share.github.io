export function requiresDisplayName(name: string | null | undefined) {
  return !name?.trim() || /guest/i.test(name);
}

