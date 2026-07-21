// Detects whether the current browser is running on a mobile/tablet device.
//
// This is deliberately stricter than the width-based `useIsMobile` hook: it
// inspects the user agent and the presence of touch + coarse pointers so the
// portal can refuse to open on phones/tablets and require a desktop computer.

export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;

  const ua = navigator.userAgent || "";

  // Strong user-agent signals for phones/tablets.
  const uaRegex =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet/i;
  if (uaRegex.test(ua)) return true;

  // iPadOS 13+ reports as "Macintosh" but exposes touch points.
  const isIPadOS =
    /Macintosh/i.test(ua) &&
    typeof (navigator as any).maxTouchPoints === "number" &&
    (navigator as any).maxTouchPoints > 1;
  if (isIPadOS) return true;

  // Coarse pointer + touch with no fine pointer strongly implies a phone/tablet.
  if (typeof window !== "undefined" && window.matchMedia) {
    const coarse =
      window.matchMedia("(pointer: coarse)").matches &&
      !window.matchMedia("(pointer: fine)").matches;
    const touch =
      typeof (navigator as any).maxTouchPoints === "number" &&
      (navigator as any).maxTouchPoints > 0;
    if (coarse && touch && window.innerWidth < 1024) return true;
  }

  return false;
}
