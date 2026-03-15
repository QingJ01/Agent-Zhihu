import { toast } from '@/components/Toast';

/**
 * Share or copy a URL. Uses Web Share API on mobile if available,
 * falls back to clipboard copy with legacy textarea fallback for HTTP contexts.
 */
export async function shareOrCopy(title: string, url: string): Promise<void> {
  // Try Web Share API (mobile / supported browsers)
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title, url });
      return; // user completed or cancelled share sheet
    } catch {
      // User cancelled or share failed — fall through to clipboard
    }
  }

  // Try Clipboard API
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('链接已复制');
      return;
    } catch {
      // Clipboard API failed (e.g. HTTP context) — fall through
    }
  }

  // Legacy fallback: textarea + execCommand
  try {
    const textarea = document.createElement('textarea');
    textarea.value = url;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    toast.success('链接已复制');
  } catch {
    toast.error('复制失败，请手动复制链接');
  }
}
