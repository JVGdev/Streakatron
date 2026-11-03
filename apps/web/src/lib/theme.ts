/** Dark mode follows the system (a manual switch can come with the settings page). */
export function followSystemTheme() {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const apply = () => document.documentElement.classList.toggle('dark', media.matches);
  apply();
  media.addEventListener('change', apply);
}
