export const state = {
  tools: null,
  rows: null,
  currentView: 'home',
  searchQuery: '',
  isMobile: window.matchMedia('(max-width: 720px)').matches,
  store: null,
  sig: null,
  dirty: false,
  focusRow: null,
  known: new Set(),
  initialized: false,
  modal: null,
};
