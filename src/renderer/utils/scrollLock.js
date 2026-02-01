let lockCount = 0;
let savedOverflow = { body: '', main: '' };

export function lockAppScroll() {
  if (typeof document === 'undefined') return;

  lockCount += 1;
  if (lockCount > 1) return;

  const mainContent = document.getElementById('main-content');
  savedOverflow = {
    body: document.body.style.overflow || '',
    main: mainContent?.style.overflow || ''
  };

  document.body.style.overflow = 'hidden';
  if (mainContent) {
    mainContent.style.overflow = 'hidden';
  }
}

export function unlockAppScroll() {
  if (typeof document === 'undefined') return;
  if (lockCount === 0) return;

  lockCount = Math.max(0, lockCount - 1);
  if (lockCount > 0) return;

  const mainContent = document.getElementById('main-content');
  document.body.style.overflow = savedOverflow.body || '';
  if (mainContent) {
    mainContent.style.overflow = savedOverflow.main || '';
  }
}
