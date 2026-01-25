# Signup Disable Feature - UI Mockups

This document provides text-based mockups of the three required UI states.

---

## 1. Admin Panel - Signup Control Toggle

### When Signups are ENABLED (Default State)

```
┌─────────────────────────────────────────────────────────────────┐
│ 👤 New Signup Control                                           │
│ Disable new account registrations. Existing users can still    │
│ log in.                                                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────────────────────────────┬──────────────────┐  │
│  │ 🟢 New Signups: ENABLED                │  [ Disable     ] │  │
│  │                                        │  [ Signups     ] │  │
│  │ New users can register accounts        │  └──────────────┘ │  │
│  │ normally.                              │  (Red Button)     │  │
│  └───────────────────────────────────────┴──────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### When Signups are DISABLED

```
┌─────────────────────────────────────────────────────────────────┐
│ 👤 New Signup Control                                           │
│ Disable new account registrations. Existing users can still    │
│ log in.                                                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────────────────────────────┬──────────────────┐  │
│  │ 🔴 New Signups: DISABLED               │  [ Enable      ] │  │
│  │                                        │  [ Signups     ] │  │
│  │ New users cannot create accounts.      │  └──────────────┘ │  │
│  │ Signup page shows "Coming Soon"        │  (Green Button)   │  │
│  │ message.                               │                   │  │
│  └───────────────────────────────────────┴──────────────────┘  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 🛡️ ⚠️ New signups are currently disabled.              │   │
│  │                                                          │   │
│  │ The signup page will display a "Coming Soon" message to │   │
│  │ new visitors. Remember to re-enable signups when ready. │   │
│  └─────────────────────────────────────────────────────────┘   │
│  (Red warning banner)                                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Signup Page - Coming Soon Message (When Disabled)

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                         [OpSyncPro Logo]                        │
│                                                                 │
│                     Create your account                         │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                            ┌───┐                                │
│                            │ 🔒 │                                │
│                            └───┘                                │
│                     (Lock icon in circle)                       │
│                                                                 │
│                                                                 │
│                  New Signups Coming Soon                        │
│                                                                 │
│          We're currently not accepting new account             │
│                    registrations.                               │
│                                                                 │
│        Please check back later or contact support if           │
│                     you have questions.                         │
│                                                                 │
│                                                                 │
│ ─────────────────────────────────────────────────────────────── │
│                                                                 │
│           Already have an account? [Sign in]                   │
│                                     (clickable link)            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Key Visual Elements:**
- Lock icon in a circular accent-colored background (light purple/blue)
- Large heading "New Signups Coming Soon" (centered, bold)
- Clean, simple message explaining signups are disabled
- Helpful "contact support" text
- Clear link back to sign in
- No form fields visible

---

## 3. Signup Page - Normal Form (When Enabled)

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                         [OpSyncPro Logo]                        │
│                                                                 │
│                     Create your account                         │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Full Name *                                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Enter your full name                                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Username *                                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Choose a username                                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Email Address *                                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Enter your email address                                 │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Password *                                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Create a password                                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Confirm Password *                                             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Confirm your password                                    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │               [ Create Account ]                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                   (Blue/Accent button)                          │
│                                                                 │
│           Already have an account? [Sign in]                   │
│                                     (clickable link)            │
│                                                                 │
│ ───────────────────────────────────────────────────────────────│
│ Features:                                                       │
│ • Automated price reduction strategies                         │
│ • Real-time market analysis                                    │
│ • Custom minimum price protection                              │
│ • Multiple pricing algorithms                                  │
│ • Detailed price history tracking                              │
│ • Bulk listing management                                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## User Flow Comparison

### Current Behavior (No Changes to Login):
1. User clicks "Sign up" → Sees full signup form → Can create account
2. Admin can disable logins → Login page shows error
3. Signups always work (no disable option)

### New Behavior (With Signup Disable):
1. **Signups Enabled (Default):**
   - User clicks "Sign up" → Sees full signup form → Can create account
   - Same as current behavior

2. **Signups Disabled (Admin Toggle):**
   - User clicks "Sign up" → Sees "Coming Soon" message → Cannot create account
   - "Sign in" link still works
   - Existing users can still log in normally

3. **Admin Control:**
   - Navigate to Account → Admin tab
   - See "New Signup Control" section
   - Toggle between enabled/disabled
   - Visual feedback (color indicators, warning messages)

---

## Responsive Design Notes

All layouts are responsive and work on:
- Desktop (1920x1080+)
- Tablet (768x1024)
- Mobile (375x667+)

The "Coming Soon" message and admin controls scale appropriately for all screen sizes.

---

## Color Scheme

- **Success/Enabled:** Green (#10B981 or theme success color)
- **Error/Disabled:** Red (#EF4444 or theme error color)
- **Accent:** Purple/Blue (theme accent color)
- **Background:** Theme-aware (light/dark mode)
- **Text:** Theme-aware (primary/secondary/tertiary)

---

## Accessibility

- All buttons have proper labels
- Color indicators supplemented with text
- Screen reader friendly
- Keyboard navigation supported
- ARIA labels where appropriate
- High contrast ratios maintained

---

## Animation/Transitions

- Smooth fade-in when switching between signup/coming-soon views
- Button hover states (color changes)
- Loading spinner when checking signup status
- Toggle button state changes smoothly

---

## Edge Cases Handled

1. **Network error checking signup status:**
   - Default to allowing signups
   - Log error to console
   - User sees normal signup form

2. **Admin toggle in progress:**
   - Button shows loading state
   - Button is disabled during API call
   - Status updates immediately on success

3. **Rapid toggling:**
   - Debounced to prevent race conditions
   - Loading state prevents multiple clicks

4. **Page refresh during disabled state:**
   - Frontend re-checks status on mount
   - User sees correct state immediately

---

This completes the UI mockup documentation for the signup disable feature.
