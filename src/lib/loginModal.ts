export function openLoginModal() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('open-login-modal'));
}
