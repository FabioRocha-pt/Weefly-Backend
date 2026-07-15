# WeeFly PRO - B2B Platform

A B2B authentication, onboarding, and dashboard platform for service providers and agents in Cape Verde.

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Styling**: Tailwind CSS
- **Components**: shadcn/ui (Radix UI primitives)
- **Forms**: React Hook Form + Zod
- **Icons**: Lucide React
- **Backend/Auth**: Supabase

## Features

### Authentication Flow
- Registration with 3-step onboarding indicator
- Login with "Remember me" and password visibility toggle
- Email verification success state
- Password reset request and new password forms

### Onboarding
- Multi-step company creation wizard
- Company type selection (Frota/Carros, Casas/Aluguer, Excursões)
- Company data collection with validation

### Dashboard
- **Provider Mode**: Light sidebar with company management
- **Agent Mode**: Dark sidebar with request management
- Mode toggle between Supplier and Agent views

## Project Structure

```
src/
├── app/
│   ├── (auth)/
│   │   ├── layout.tsx           # Auth layout with navigation
│   │   ├── registro/
│   │   │   └── page.tsx         # Registration page
│   │   ├── login/
│   │   │   └── page.tsx         # Login page
│   │   ├── confirmar-email/
│   │   │   └── page.tsx         # Email verification pending
│   │   ├── email-confirmado/
│   │   │   └── page.tsx         # Email confirmed success
│   │   ├── link-invalido/
│   │   │   └── page.tsx         # Invalid/expired link
│   │   ├── recuperar-password/
│   │   │   └── page.tsx         # Password reset request
│   │   └── nova-password/
│   │       └── page.tsx         # Set new password
│   ├── (dashboard)/
│   │   ├── layout.tsx           # Dashboard layout with sidebar
│   │   ├── inicio/
│   │   │   └── page.tsx         # Provider home - all companies
│   │   ├── empresa/
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx     # Company dashboard
│   │   │   ├── produtos/
│   │   │   │   └── page.tsx     # Products management
│   │   │   ├── calendario/
│   │   │   │   └── page.tsx     # Calendar & pricing
│   │   │   ├── reservas/
│   │   │   │   └── page.tsx     # Reservations
│   │   │   ├── avaliacoes/
│   │   │   │   └── page.tsx     # Reviews
│   │   │   ├── financeiro/
│   │   │   │   └── page.tsx     # Financial
│   │   │   └── definicoes/
│   │   │       └── page.tsx     # Company settings
│   │   ├── agente/
│   │   │   └── page.tsx         # Agent dashboard (dark theme)
│   │   └── criar-empresa/
│   │       └── page.tsx         # Company creation wizard
│   └── layout.tsx               # Root layout
├── components/
│   ├── ui/                      # shadcn/ui components
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── card.tsx
│   │   ├── select.tsx
│   │   ├── label.tsx
│   │   ├── checkbox.tsx
│   │   ├── badge.tsx
│   │   ├── avatar.tsx
│   │   ├── separator.tsx
│   │   └── progress.tsx
│   ├── auth/
│   │   ├── auth-navbar.tsx      # Auth pages navigation
│   │   ├── auth-card.tsx        # Auth card wrapper
│   │   └── onboarding-steps.tsx # 3-step indicator
│   ├── dashboard/
│   │   ├── sidebar.tsx          # Main sidebar
│   │   ├── mode-toggle.tsx      # Provider/Agent toggle
│   │   ├── stats-card.tsx       # Dashboard stat cards
│   │   └── request-list.tsx     # Agent requests list
│   └── forms/
│       ├── register-form.tsx    # Registration form
│       ├── login-form.tsx       # Login form
│       ├── password-reset-form.tsx
│       └── company-form.tsx     # Company creation
├── lib/
│   ├── utils.ts                 # Utility functions
│   └── validations.ts           # Zod schemas
├── hooks/
│   └── use-auth.ts              # Auth hook
└── types/
    └── index.ts                 # TypeScript types
```

## Design System

### Colors
- **Primary/Brand**: Orange (#EA580C / orange-600)
- **Background Light**: Slate 50 (#F8FAFC)
- **Background Dark**: Gray 900 (#111827)
- **Text Primary**: Slate 900 (#0F172A)
- **Text Secondary**: Slate 500 (#64748B)

### Spacing & Sizing
- Auth cards: `rounded-2xl` with `p-8`
- Dashboard cards: `rounded-xl` with `p-6`
- Sidebar width: `w-64` (256px)
- Content max-width: `max-w-7xl`

### Shadows
- Cards: `shadow-sm` to `shadow-md`
- Buttons: `hover:shadow-md` on interaction
