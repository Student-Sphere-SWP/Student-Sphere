// public/js/theme.js — Student Sphere Theme Switching

class ThemeManager {
  constructor() {
    this.STORAGE_KEY = 'student-sphere-theme';
    this.LIGHT_THEME = 'light';
    this.DARK_THEME = 'dark';
    this.init();
  }

  init() {
    // Load saved theme or use system preference
    const savedTheme = localStorage.getItem(this.STORAGE_KEY);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = savedTheme || (prefersDark ? this.DARK_THEME : this.DARK_THEME); // Default to dark
    
    this.setTheme(theme, false); // Don't save on init
  }

  setTheme(theme, saveToStorage = true) {
    if (theme === this.LIGHT_THEME) {
      document.documentElement.setAttribute('data-theme', 'light');
      document.body.classList.add('light-mode');
      this.updateToggleButton(true);
    } else {
      document.documentElement.removeAttribute('data-theme');
      document.body.classList.remove('light-mode');
      this.updateToggleButton(false);
    }

    if (saveToStorage) {
      localStorage.setItem(this.STORAGE_KEY, theme);
    }
  }

  toggle() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || this.DARK_THEME;
    const newTheme = currentTheme === this.LIGHT_THEME ? this.DARK_THEME : this.LIGHT_THEME;
    this.setTheme(newTheme, true);
  }

  updateToggleButton(isLight) {
    const btn = document.getElementById('theme-toggle-btn');
    const desktopBtn = document.getElementById('theme-toggle-desktop');
    const desktopIcon = document.getElementById('theme-toggle-icon');
    
    if (btn) {
      btn.textContent = isLight ? '🌙' : '☀️';
      btn.setAttribute('aria-label', isLight ? 'Switch to dark mode' : 'Switch to light mode');
      btn.title = isLight ? 'Dark Mode' : 'Light Mode';
    }
    
    if (desktopBtn && desktopIcon) {
      desktopIcon.textContent = isLight ? '🌙' : '☀️';
      const text = desktopBtn.querySelector('span:last-child');
      if (text) {
        text.textContent = isLight ? 'Dark Mode' : 'Light Mode';
      }
    }
  }

  getCurrentTheme() {
    return document.documentElement.getAttribute('data-theme') || this.DARK_THEME;
  }
}

// Initialize theme manager when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.themeManager = new ThemeManager();
  });
} else {
  window.themeManager = new ThemeManager();
}
