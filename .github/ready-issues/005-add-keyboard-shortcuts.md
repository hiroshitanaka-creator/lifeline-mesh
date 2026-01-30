# Issue: Add Keyboard Shortcuts

**Labels:** `good first issue`, `enhancement`, `accessibility`

---

## Description

Add keyboard shortcuts to make the app faster to use, especially important during emergencies.

## Proposed Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+E` | Encrypt message |
| `Ctrl+D` | Decrypt message |
| `Ctrl+K` | Generate/Load keys |
| `Ctrl+Shift+C` | Copy encrypted message |
| `Escape` | Close modals |

## Implementation

Add this to the script section in `app/index.html`:

```javascript
// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Ctrl+E = Encrypt
  if (e.ctrlKey && e.key === 'e') {
    e.preventDefault();
    encryptMsg();
  }
  // Ctrl+D = Decrypt
  if (e.ctrlKey && e.key === 'd') {
    e.preventDefault();
    decryptMsg();
  }
  // Ctrl+K = Generate/Load keys
  if (e.ctrlKey && e.key === 'k') {
    e.preventDefault();
    initOrLoad();
  }
  // Escape = Close modals
  if (e.key === 'Escape') {
    closeQRModal();
    closeQRScanner();
  }
});
```

## Tasks

1. [ ] Add keyboard event listener
2. [ ] Implement shortcuts listed above
3. [ ] Add visual hint in UI (e.g., tooltip on buttons)
4. [ ] Test on Windows, Mac, Linux
5. [ ] Document shortcuts in FAQ or UI

## Bonus

- Add a "Keyboard Shortcuts" help modal showing all shortcuts

## Difficulty

Easy

---

**Files:** `app/index.html`
