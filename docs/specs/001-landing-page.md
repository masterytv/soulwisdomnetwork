# Specification 001: Landing Page

## 1. Overview
This specification outlines the design and structure for the initial Landing Page of the Soul Wisdom Network. The goal is to create a high-impact, premium, and spiritually aligned introduction to the platform using the "Deep Ocean" and "Soft Sand" aesthetic.

## 2. Design System
The design capabilities will be implemented using Tailwind CSS. We will extend the Tailwind config to include these specific tokens.

### 2.1 Color Palette
*   **Deep Ocean (Primary Backgrounds/Accents)**
    *   `deep-ocean-900`: `#0f172a` (Slate 900 - Base Dark)
    *   `deep-ocean-800`: `#1e293b` (Slate 800 - Secondary Dark)
    *   `deep-ocean-500`: `#3b82f6` (Blue 500 - Interactive/Highlight)
    *   *Effect*: Used for deep, immersive backgrounds. Creates a sense of depth and mystery.

*   **Soft Sand (Text/Accents/Warmth)**
    *   `soft-sand-100`: `#f5f5f4` (Stone 100 - Primary Text)
    *   `soft-sand-200`: `#e7e5e4` (Stone 200 - Secondary Text)
    *   `soft-sand-300`: `#d6d3d1` (Stone 300 - Borders/Dividers)
    *   *Effect*: Provides grounded warmth, contrast against the deep ocean, and readability.

### 2.2 Visual Style: Glassmorphism & Translucency
*   **Glass Cards**: Backgrounds with low opacity (e.g., `bg-white/5` or `bg-deep-ocean-900/40`) combined with `backdrop-blur-md` or `backdrop-blur-lg`.
*   **Borders**: Subtle, translucent borders (e.g., `border-white/10`) to define edges without harsh lines.
*   **Shapes**: Rounded corners (e.g., `rounded-2xl`, `rounded-3xl`). **NO** sharp, brutalist edges.
*   **Shadows**: Soft, diffuse shadows (e.g., `shadow-xl`, `shadow-deep-ocean-900/50`) to create elevation.

## 3. Landing Page Structure

### 3.1 Hero Section
*   **Background**: Dynamic gradient or subtle video/animation reminiscent of ocean depths or celestial movement.
*   **Content**:
    *   Headline: "Connect Deeper. Ascend Higher." (Placeholder - to be refined)
    *   Subheadline: "The premier network for spiritual growth, connection, and wisdom."
    *   CTA Button: "Join the Collective" (Glassmorphic button with hover glow effect).

### 3.2 Features / Value Proposition
*   **Layout**: Grid of 3 glassmorphic cards.
*   **Card Style**:
    *   Icon: Minimalist, spiritual iconography.
    *   Title: Sans-serif, bold.
    *   Description: Short, inspiring text.
*   **Content**:
    1.  **Curated Wisdom**: Access exclusive content from spiritual masters.
    2.  **Community Connection**: Find your soul tribe.
    3.  **Live Events**: Participate in global meditations and workshops.

### 3.3 About / Mission
*   **Layout**: Split screen (Text + Image/Abstract Visual).
*   **Visual**: Abstract representation of connection (e.g., constellations, neural networks) in "Soft Sand" tones.
*   **Text**: Brief mission statement focusing on "Soul Wisdom."

### 3.4 Footer
*   **Style**: Minimalist, `deep-ocean-900` background.
*   **Links**: Privacy, Terms, Contact, Socials.
*   **Copyright**: "© 2025 Soul Wisdom Network."

## 4. Technical Implementation Plan
1.  **Tailwind Configuration**: Update `tailwind.config.ts` with custom colors (`deep-ocean`, `soft-sand`) and font families.
2.  **Global CSS**: Add base styles for smooth scrolling and default background color.
3.  **Components**: Create reusable `Button`, `Card`, and `Section` components using the glassmorphic style.
4.  **Page Construction**: Assemble `app/page.tsx` using these components.

## 5. User Review Required
*   Confirm adequacy of the "Deep Ocean" and "Soft Sand" color mapping.
*   Approve the general layout of the Landing Page.
