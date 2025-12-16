# Specification 002: Design Update - "Mystic Indigo"

## 1. Overview
This specification details the design refactor to align the Soul Wisdom Network's aesthetic with the new official logo. The color palette will shift from "Deep Ocean" (Blue/Slate) to "Mystic Indigo" (Deep Purple/Indigo) with "Celestial Gold" accents.

## 2. Design System Updates
We will update the Tailwind configuration in `globals.css` to reflect the new palette.

### 2.1 Color Palette
*   **Mystic Indigo (Primary Backgrounds - from Logo Background)**
    *   `mystic-indigo-900`: `#1e1035` (Deepest Indigo - Base Background)
    *   `mystic-indigo-800`: `#2e1a4d` (Lighter Indigo - Secondary/Cards)
    *   `mystic-indigo-500`: `#6d28d9` (Purple 600/700 hybrid - Interactive/Highlights)
    *   *Effect*: Deep, spiritual, and mysterious.

*   **Celestial Gold (Text/Accents - from Logo Text)**
    *   `celestial-gold-100`: `#fefce8` (Yellow 50 - Primary Text/Off-white)
    *   `celestial-gold-200`: `#fef08a` (Yellow 200 - Warm Highlights)
    *   `celestial-gold-400`: `#d4af37` (Classic Gold - Buttons/Icons/Borders)
    *   *Effect*: Premium, enlightened, and warm contrast against the indigo.

### 2.2 Typography
*   **Headings**: Keep Sans-serif (Geist/Inter) for now, but style with `text-celestial-gold-100` or `text-transparent bg-clip-text bg-gradient-to-r from-celestial-gold-200 to-celestial-gold-400`.

## 3. Component Updates (Landing Page)

### 3.1 Header / Navigation
*   **Logo**: Display `public/logo.png` in the header or top center.
*   **Nav Links**: `text-white` or `text-celestial-gold-100` with gold hover effects.

### 3.2 Hero Section
*   **Background**: Radial gradient from `mystic-indigo-800` to `mystic-indigo-900`.
*   **Image**: Hero may feature the Logo prominently if appropriate, or keep the abstract background but re-tinted to purple/gold.
*   **CTA Button**: `bg-celestial-gold-400` text-indigo (high contrast) or gradient gold.

### 3.3 Features Cards
*   **Background**: `bg-mystic-indigo-800/40` (Glassmorphic).
*   **Border**: `border-celestial-gold-400/20`.
*   **Icons**: Gold (`text-celestial-gold-400`).

## 4. Implementation Plan
1.  **Assets**: Ensure `public/logo.png` exists.
2.  **Global Styles**: Update `app/globals.css` with new CSS variables.
3.  **Page Logic**: Update `app/page.tsx` class names to use new color tokens.
4.  **Verification**: Visual check via `npm run dev`.

## 5. User Review Required
*   Confirm the "Mystic Indigo" and "Celestial Gold" approximation based on the logo image.
