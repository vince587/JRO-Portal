import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

function svgDataUri(svg: string): string {
  // Encode parentheses too — unquoted CSS url() tokens terminate at "(" or ")".
  return `data:image/svg+xml,${encodeURIComponent(svg).replace(/\(/g, "%28").replace(/\)/g, "%29")}`;
}

const HEARTS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400" viewBox="0 0 1200 400"><defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#f43f6e"/><stop offset="100%" stop-color="#d81b60"/></linearGradient></defs><rect width="1200" height="400" fill="url(#bg)"/><g fill="#ffffff"><path opacity="0.35" d="M120 80 C120 60 150 40 170 60 C190 40 220 60 220 80 C220 110 170 140 170 140 C170 140 120 110 120 80Z"/><path opacity="0.2" d="M320 200 C320 180 350 160 370 180 C390 160 420 180 420 200 C420 230 370 260 370 260 C370 260 320 230 320 200Z"/><path opacity="0.4" d="M550 60 C550 40 580 20 600 40 C620 20 650 40 650 60 C650 90 600 120 600 120 C600 120 550 90 550 60Z"/><path opacity="0.2" d="M780 180 C780 160 810 140 830 160 C850 140 880 160 880 180 C880 210 830 240 830 240 C830 240 780 210 780 180Z"/><path opacity="0.3" d="M950 90 C950 70 980 50 1000 70 C1020 50 1050 70 1050 90 C1050 120 1000 150 1000 150 C1000 150 950 120 950 90Z"/><path opacity="0.25" d="M200 300 C200 280 230 260 250 280 C270 260 300 280 300 300 C300 330 250 360 250 360 C250 360 200 330 200 300Z"/><path opacity="0.35" d="M650 290 C650 270 680 250 700 270 C720 250 750 270 750 290 C750 320 700 350 700 350 C700 350 650 320 650 290Z"/><path opacity="0.2" d="M1020 280 C1020 260 1050 240 1070 260 C1090 240 1120 260 1120 280 C1120 310 1070 340 1070 340 C1070 340 1020 310 1020 280Z"/></g></svg>`;

const BLUE_GEOMETRIC_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400" viewBox="0 0 1200 400"><defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#1e6fd9"/><stop offset="100%" stop-color="#0d47a1"/></linearGradient></defs><rect width="1200" height="400" fill="url(#bg)"/><g fill="none" stroke="#ffffff" stroke-width="2.5"><rect x="80" y="60" width="120" height="120" rx="8" opacity="0.3"/><rect x="250" y="180" width="90" height="90" rx="6" opacity="0.2"/><polygon points="500,50 560,150 440,150" opacity="0.25"/><circle cx="700" cy="120" r="60" opacity="0.3"/><rect x="850" y="80" width="140" height="80" rx="10" opacity="0.2"/><polygon points="1050,200 1120,300 980,300" opacity="0.25"/><circle cx="180" cy="320" r="45" opacity="0.2"/><rect x="400" y="270" width="100" height="100" rx="8" opacity="0.25"/><rect x="650" y="260" width="130" height="70" rx="6" opacity="0.2"/><circle cx="950" cy="340" r="50" opacity="0.3"/></g></svg>`;

const GREEN_WAVES_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400" viewBox="0 0 1200 400"><defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#388e3c"/><stop offset="100%" stop-color="#1b5e20"/></linearGradient></defs><rect width="1200" height="400" fill="url(#bg)"/><g fill="none" stroke="#ffffff" stroke-width="3"><path opacity="0.35" d="M0 180 Q150 120 300 180 T600 180 T900 180 T1200 180"/><path opacity="0.25" d="M0 240 Q150 180 300 240 T600 240 T900 240 T1200 240"/><path opacity="0.35" d="M0 300 Q150 240 300 300 T600 300 T900 300 T1200 300"/><path opacity="0.25" d="M0 120 Q150 60 300 120 T600 120 T900 120 T1200 120"/><path opacity="0.2" d="M0 60 Q150 0 300 60 T600 60 T900 60 T1200 60"/><path opacity="0.3" d="M0 350 Q150 290 300 350 T600 350 T900 350 T1200 350"/></g></svg>`;

const BLUE_WAVES_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400" viewBox="0 0 1200 400"><defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#0288d1"/><stop offset="100%" stop-color="#01579b"/></linearGradient></defs><rect width="1200" height="400" fill="url(#bg)"/><g fill="none" stroke="#ffffff" stroke-width="3"><path opacity="0.35" d="M0 100 C200 40 400 160 600 100 S1000 40 1200 100"/><path opacity="0.25" d="M0 170 C200 110 400 230 600 170 S1000 110 1200 170"/><path opacity="0.35" d="M0 240 C200 180 400 300 600 240 S1000 180 1200 240"/><path opacity="0.25" d="M0 310 C200 250 400 370 600 310 S1000 250 1200 310"/><path opacity="0.2" d="M0 50 C200 -10 400 110 600 50 S1000 -10 1200 50"/><path opacity="0.3" d="M0 370 C200 310 400 430 600 370 S1000 310 1200 370"/></g></svg>`;

const PINK_BLUSH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400" viewBox="0 0 1200 400"><defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ec407a"/><stop offset="50%" stop-color="#f06292"/><stop offset="100%" stop-color="#e91e63"/></linearGradient></defs><rect width="1200" height="400" fill="url(#bg)"/><g fill="#ffffff"><circle opacity="0.3" cx="100" cy="80" r="60"/><circle opacity="0.2" cx="300" cy="300" r="80"/><circle opacity="0.3" cx="550" cy="120" r="50"/><circle opacity="0.25" cx="750" cy="280" r="70"/><circle opacity="0.3" cx="950" cy="100" r="55"/><circle opacity="0.2" cx="1100" cy="320" r="65"/><circle opacity="0.25" cx="200" cy="200" r="40"/><circle opacity="0.2" cx="450" cy="350" r="45"/><circle opacity="0.25" cx="680" cy="60" r="35"/><circle opacity="0.3" cx="1000" cy="220" r="50"/></g></svg>`;

export interface BannerThemeOption {
  key: string;
  label: string;
  /** Null = default brand green. Otherwise a data URI or URL to the background image. */
  url: string | null;
  /** Solid accent color used for the banner fallback and sidebar active states. Null = brand primary. */
  accent: string | null;
}

export const BANNER_THEMES: BannerThemeOption[] = [
  { key: "default", label: "Brand Green", url: null, accent: null },
  { key: "hearts", label: "Sweet Hearts", url: svgDataUri(HEARTS_SVG), accent: "#d81b60" },
  { key: "blue-geometric", label: "Corporate Blue", url: svgDataUri(BLUE_GEOMETRIC_SVG), accent: "#0d47a1" },
  { key: "green-waves", label: "Fresh Waves", url: svgDataUri(GREEN_WAVES_SVG), accent: "#1b5e20" },
  { key: "blue-waves", label: "Ocean Curve", url: svgDataUri(BLUE_WAVES_SVG), accent: "#01579b" },
  { key: "pink-blush", label: "Pink Blush", url: svgDataUri(PINK_BLUSH_SVG), accent: "#e91e63" },
];

const STORAGE_KEY = "jmcs.banner-theme";

interface BannerThemeContextValue {
  themeKey: string;
  theme: BannerThemeOption;
  setThemeKey: (key: string) => void;
}

const BannerThemeContext = createContext<BannerThemeContextValue | null>(null);

function readStoredKey(): string {
  if (typeof window === "undefined") return "default";
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v && BANNER_THEMES.some((t) => t.key === v)) return v;
  } catch {
    // ignore
  }
  return "default";
}

export function BannerThemeProvider({ children }: { children: ReactNode }) {
  const [themeKey, setThemeKeyState] = useState(readStoredKey);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, themeKey);
    } catch {
      // ignore
    }
  }, [themeKey]);

  const setThemeKey = (key: string) => {
    if (!BANNER_THEMES.some((t) => t.key === key)) return;
    setThemeKeyState(key);
  };

  const theme = BANNER_THEMES.find((t) => t.key === themeKey) ?? BANNER_THEMES[0];

  return (
    <BannerThemeContext.Provider value={{ themeKey, theme, setThemeKey }}>
      {children}
    </BannerThemeContext.Provider>
  );
}

export function useBannerTheme() {
  const ctx = useContext(BannerThemeContext);
  if (!ctx) throw new Error("useBannerTheme must be used within BannerThemeProvider");
  return ctx;
}
