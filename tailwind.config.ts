import type { Config } from "tailwindcss";

/**
 * Design tokens.
 *
 * Structure comes from surfaces and type, not outlines: content sits on white
 * `surface` panels over a slightly deeper `canvas`, so a panel reads as a
 * separate plane without needing a border. Borders are kept for the places
 * where they carry meaning — form controls (`edge`) and fine row separators
 * (`line`). Everything visual in the application is built from these; components
 * do not introduce their own colours, radii or shadows.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        /** The page behind everything. Deep enough that a white surface lifts off it. */
        canvas: "#f1f4f8",
        surface: {
          DEFAULT: "#ffffff",
          /** A quiet band inside a surface: footers, composers, the latest-update strip. */
          muted: "#f7f9fc",
          /** Recessed wells: segmented-control tracks, icon wells. */
          sunken: "#e9eef4",
        },
        /** Decorative separators — table rows, section hairlines. Never a control's boundary. */
        line: {
          DEFAULT: "#e2e8f0",
          strong: "#cbd5e1",
        },
        ink: {
          DEFAULT: "#0f172a",
          muted: "#475569",
          /** The lightest text colour allowed: ~4.8:1 on white, so it passes AA. */
          subtle: "#64748b",
        },
        /**
         * The visible boundary of a form control. WCAG 1.4.11 asks for 3:1
         * against the surrounding colour when the boundary is how a control is
         * recognised, which for a text input it is. `edge` is ~3.6:1 on white;
         * `edge-strong` (~4.8:1) is the hover state.
         */
        edge: {
          DEFAULT: "#7f8896",
          strong: "#64748b",
        },
        brand: {
          50: "#eef4ff",
          100: "#d9e6ff",
          200: "#bcd3ff",
          300: "#8eb6ff",
          400: "#598eff",
          500: "#3366f5",
          600: "#1f47e0",
          700: "#1a37b5",
          800: "#1b3190",
          900: "#1c2e72",
          950: "#0f1a45",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        /** Section headings: clearly above body text, clearly below a page title. */
        title: ["1.1875rem", { lineHeight: "1.625rem", letterSpacing: "-0.01em", fontWeight: "600" }],
        "display-sm": ["1.75rem", { lineHeight: "2.25rem", letterSpacing: "-0.02em", fontWeight: "700" }],
        "display-md": ["2.25rem", { lineHeight: "2.75rem", letterSpacing: "-0.025em", fontWeight: "700" }],
        /** The tracking result's status headline — the focal point of the public page. */
        "display-lg": ["2.75rem", { lineHeight: "3.125rem", letterSpacing: "-0.03em", fontWeight: "700" }],
      },
      boxShadow: {
        /** What separates a surface from the canvas, in place of a border. */
        surface: "0 1px 2px 0 rgb(15 23 42 / 0.05), 0 4px 14px -6px rgb(15 23 42 / 0.10)",
        raised: "0 4px 16px -4px rgb(15 23 42 / 0.10), 0 2px 4px -2px rgb(15 23 42 / 0.06)",
        overlay: "0 16px 40px -12px rgb(15 23 42 / 0.25), 0 4px 12px -4px rgb(15 23 42 / 0.10)",
        "inset-field": "inset 0 1px 2px 0 rgb(15 23 42 / 0.05)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 220ms cubic-bezier(0.2, 0, 0, 1) both",
      },
    },
  },
  plugins: [],
};

export default config;
