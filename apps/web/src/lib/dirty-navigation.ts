'use client';

const prompts = new Map<symbol, string>();
let installed = false;

function onAnchorClick(event: MouseEvent) {
  if (event.defaultPrevented || prompts.size === 0 || !(event.target instanceof Element)) {
    return;
  }
  const anchor = event.target.closest('a');
  const href = anchor?.getAttribute('href');
  if (!anchor || !href || href.startsWith('#') || anchor.target === '_blank') {
    return;
  }
  if (!confirmDirtyNavigation()) {
    event.preventDefault();
    event.stopPropagation();
  }
}

export function registerDirtyNavigation(prompt: string) {
  const token = Symbol('dirty-navigation');
  prompts.set(token, prompt);
  if (!installed) {
    window.addEventListener('click', onAnchorClick, true);
    installed = true;
  }
  return () => {
    prompts.delete(token);
    if (prompts.size === 0) {
      window.removeEventListener('click', onAnchorClick, true);
      installed = false;
    }
  };
}

export function confirmDirtyNavigation(): boolean {
  const prompt = prompts.values().next().value;
  return prompt === undefined || window.confirm(prompt);
}
