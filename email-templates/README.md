# OpSyncPro Email Templates

Branded email templates for Supabase Auth.

## Templates

| Template | Supabase Setting | Description |
|----------|------------------|-------------|
| `confirmation.html` | Confirm signup | Sent when user registers |
| `password-reset.html` | Reset password | Sent for password recovery |
| `magic-link.html` | Magic Link | Passwordless login |
| `invite.html` | Invite user | Admin invitations |
| `email-change.html` | Change Email Address | Email change confirmation |

## How to Apply in Supabase

1. Go to **Supabase Dashboard** → Your Project
2. Navigate to **Authentication** → **Email Templates**
3. For each template type:
   - Click on the template
   - Switch to **Source** mode (HTML editor)
   - Copy/paste the content from the corresponding `.html` file
   - Save

## Template Variables (Supabase)

These placeholders are automatically replaced by Supabase:

- `{{ .ConfirmationURL }}` - The action link (verify, reset, etc.)
- `{{ .Email }}` - User's email address
- `{{ .Token }}` - The confirmation token
- `{{ .TokenHash }}` - Hashed token
- `{{ .SiteURL }}` - Your site URL

## Custom SMTP Setup (Resend)

For emails to come from `support@opsyncpro.io`:

1. Create account at https://resend.com
2. Add domain: `opsyncpro.io`
3. Add DNS records (SPF, DKIM) to Squarespace
4. Create API key
5. In Supabase → **Project Settings** → **Auth** → **SMTP Settings**:
   - Enable custom SMTP
   - Sender email: `OpSyncPro <support@opsyncpro.io>`
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: `[your API key]`

## Design Notes

- Background: Dark gradient header (#1a1a2e → #16213e)
- Accent color: Orange (#f97316)
- Button style: Orange with subtle shadow
- Footer: Links to Privacy Policy and Terms
- Responsive: Works on mobile and desktop
