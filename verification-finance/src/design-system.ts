export const designSystem = {
  "meta": {
    "createdAt": "2026-09-01T17:23:48.609Z",
    "version": 1,
    "prompt": "Build a polished personal finance application with:\n1. Dashboard\n2. Transactions\n3. Analytics\n4. Settings\nThe product should feel precise, premium and trustworthy.\nIt should be responsive and use one coherent visual language across every screen.",
    "preset": "technical"
  },
  "identity": {
    "personality": [
      "precise",
      "trustworthy",
      "restrained",
      "financial",
      "information-dense"
    ],
    "audience": "professionals managing personal finances",
    "density": "compact",
    "hierarchy": "data hierarchy, strong numerical readability",
    "platform": "web"
  },
  "colors": {
    "background": "#0A0A0A",
    "surface": "#111111",
    "surfaceElevated": "#181818",
    "surfaceHover": "#1F1F1F",
    "textPrimary": "#FFFFFF",
    "textSecondary": "#A0A0A0",
    "textTertiary": "#777777",
    "border": "#222222",
    "borderStrong": "#303030",
    "accent": "#FFFFFF",
    "accentHover": "#EFEFEF",
    "accentText": "#000000",
    "success": "#22C55E",
    "warning": "#F59E0B",
    "danger": "#EF4444",
    "overlay": "rgba(0,0,0,0.6)"
  },
  "typography": {
    "fontFamily": "'Inter', 'Geist Sans', system-ui, -apple-system, sans-serif",
    "fontMono": "'Geist Mono','JetBrains Mono', monospace",
    "display": {
      "size": "32px",
      "weight": 700,
      "lineHeight": "1.1",
      "letterSpacing": "-0.02em"
    },
    "h1": {
      "size": "22px",
      "weight": 600,
      "lineHeight": "1.3"
    },
    "h2": {
      "size": "18px",
      "weight": 600,
      "lineHeight": "1.4"
    },
    "h3": {
      "size": "15px",
      "weight": 600,
      "lineHeight": "1.4"
    },
    "body": {
      "size": "14px",
      "weight": 400,
      "lineHeight": "1.6"
    },
    "small": {
      "size": "12px",
      "weight": 400,
      "lineHeight": "1.5"
    },
    "caption": {
      "size": "11px",
      "weight": 500,
      "lineHeight": "1.4"
    },
    "tabularNumerals": true
  },
  "spacing": {
    "base": 4,
    "scale": {
      "0": "0",
      "1": "4px",
      "2": "8px",
      "3": "12px",
      "4": "16px",
      "5": "20px",
      "6": "24px",
      "8": "32px",
      "10": "40px",
      "12": "48px"
    },
    "densityMultiplier": 0.85
  },
  "radius": {
    "xs": "4px",
    "sm": "6px",
    "md": "8px",
    "lg": "12px",
    "xl": "16px",
    "full": "9999px"
  },
  "shadow": {
    "none": "none",
    "sm": "0 1px 0 rgba(0,0,0,0.08)",
    "md": "0 2px 8px rgba(0,0,0,0.10)",
    "lg": "0 8px 20px rgba(0,0,0,0.14)"
  },
  "motion": {
    "durationFast": "120ms",
    "durationNormal": "200ms",
    "durationSlow": "320ms",
    "easing": "cubic-bezier(0.4,0,0.2,1)",
    "easingEmphasis": "cubic-bezier(0.2,0,0,1)",
    "reduceMotion": false
  },
  "breakpoints": {
    "sm": "640px",
    "md": "768px",
    "lg": "1024px",
    "xl": "1280px"
  },
  "components": {
    "button": {
      "height": "32px",
      "px": "12px",
      "radius": "8px",
      "fontWeight": 500,
      "textTransform": "none"
    },
    "input": {
      "height": "32px",
      "radius": "8px",
      "borderWidth": "1px"
    },
    "card": {
      "padding": "16px",
      "radius": "12px",
      "borderWidth": "1px"
    },
    "panel": {
      "padding": "16px",
      "radius": "12px"
    },
    "nav": {
      "height": "48px",
      "style": "top-tabs+hamburger-mobile"
    },
    "modal": {
      "radius": "16px",
      "overlay": "rgba(0,0,0,0.6)"
    },
    "badge": {
      "radius": "9999px"
    },
    "table": {
      "rowHeight": "40px",
      "headerWeight": 600
    },
    "emptyState": {
      "iconSize": "40px"
    }
  },
  "platform": {
    "web": {},
    "android": {
      "touchTargetMin": "48px"
    },
    "ios": {
      "touchTargetMin": "44px"
    },
    "desktop": {
      "density": "compact"
    }
  }
} as const;
export type DesignSystem = typeof designSystem;
