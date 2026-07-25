export function isControlTowerAuthorized(headerValue: string | undefined): boolean {
  const key = process.env.BENSON_CONTROL_TOWER_KEY?.trim();
  if (!key) {
    return process.env.BENSON_API_MODE !== 'production';
  }
  return headerValue === key;
}

export function controlTowerUnauthorizedMessage(): string {
  if (process.env.BENSON_CONTROL_TOWER_KEY?.trim()) {
    return 'Control Tower requires admin authorization.';
  }
  return 'Set BENSON_CONTROL_TOWER_KEY in production to protect Control Tower actions.';
}
