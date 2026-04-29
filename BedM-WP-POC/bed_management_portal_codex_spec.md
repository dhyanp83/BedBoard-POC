# Bed Management Web Portal POC — Codex Implementation Spec

## 1. Project Goal
Build a secure, PHIA-conscious proof-of-concept web portal that allows authorized site users to log in and update bed availability. The portal should also provide dashboard views at the Site/SDO level and Provincial level to view current bed availability across participating sites.

This POC should be simple, clean, and easy for non-technical healthcare users to operate daily.

---

## 2. Core Business Rules

1. At launch, all beds must default to `Occupied`.
2. Authorized site users must be able to update bed status daily.
3. Bed status options for the POC:
   - `Open`
   - `Occupied`
4. Users should only be able to view and update beds for the site(s) they are authorized to manage.
5. SDO-level users should be able to view aggregated bed availability for their SDO.
6. Provincial-level users should be able to view aggregated bed availability across all SDOs/sites.
7. The system should capture who updated a bed status and when.
8. The system should avoid storing unnecessary patient-identifiable information. This POC is focused on bed availability only.

---

## 3. Recommended Tech Stack

Use a simple, modern full-stack web application.

Recommended option:

- Frontend: React + TypeScript
- Backend: Node.js + Express or Next.js API routes
- Database: PostgreSQL
- ORM: Prisma
- Authentication: JWT-based login for POC, with future support for SSO/SAML/OIDC
- Styling: Tailwind CSS or a simple component library

If using Next.js, implement:

- `/login`
- `/beds`
- `/dashboard/site`
- `/dashboard/sdo`
- `/dashboard/provincial`
- `/admin` if admin setup is included

---

## 4. User Roles

### 4.1 Site User
Can:
- Log in
- View beds assigned to their site
- Update bed status to `Open` or `Occupied`
- View basic site-level summary

Cannot:
- View or edit beds from other sites
- Access provincial dashboards
- Manage users

### 4.2 SDO User
Can:
- Log in
- View dashboard data for all sites within their SDO
- Filter by site, facility, bed type/unit if available
- Export or view summary metrics if implemented

Cannot:
- Edit bed statuses unless explicitly assigned site update permissions
- View other SDO data unless authorized

### 4.3 Provincial User
Can:
- Log in
- View provincial dashboard across all SDOs and sites
- Filter by SDO, site, facility, unit, and status
- View total open and occupied beds

Cannot:
- Edit bed statuses unless also assigned site update permissions

### 4.4 Admin User
Can:
- Manage users
- Assign users to roles and sites/SDOs
- Manage site, SDO, and bed reference data
- View audit logs

---

## 5. Data Model

Use the following database entities.

### 5.1 User
Fields:
- `id` UUID primary key
- `email` string unique required
- `password_hash` string required for POC login
- `first_name` string
- `last_name` string
- `role` enum: `SITE_USER`, `SDO_USER`, `PROVINCIAL_USER`, `ADMIN`
- `is_active` boolean default true
- `created_at` timestamp
- `updated_at` timestamp

### 5.2 SDO
Fields:
- `id` UUID primary key
- `name` string required
- `code` string unique optional
- `created_at` timestamp
- `updated_at` timestamp

### 5.3 Site
Fields:
- `id` UUID primary key
- `sdo_id` foreign key to SDO
- `name` string required
- `code` string unique optional
- `address` string optional
- `is_active` boolean default true
- `created_at` timestamp
- `updated_at` timestamp

### 5.4 Bed
Fields:
- `id` UUID primary key
- `site_id` foreign key to Site
- `bed_label` string required
- `unit` string optional
- `bed_type` string optional
- `status` enum: `OPEN`, `OCCUPIED`
- `is_active` boolean default true
- `created_at` timestamp
- `updated_at` timestamp
- `last_updated_by_user_id` foreign key to User nullable
- `last_status_updated_at` timestamp nullable

Default status at seed/launch: `OCCUPIED`.

### 5.5 UserSiteAccess
Use this table to control which sites a user can access.

Fields:
- `id` UUID primary key
- `user_id` foreign key to User
- `site_id` foreign key to Site
- `created_at` timestamp

### 5.6 UserSDOAccess
Use this table to control which SDOs an SDO-level user can access.

Fields:
- `id` UUID primary key
- `user_id` foreign key to User
- `sdo_id` foreign key to SDO
- `created_at` timestamp

### 5.7 BedStatusAuditLog
Fields:
- `id` UUID primary key
- `bed_id` foreign key to Bed
- `previous_status` enum: `OPEN`, `OCCUPIED`
- `new_status` enum: `OPEN`, `OCCUPIED`
- `changed_by_user_id` foreign key to User
- `changed_at` timestamp
- `source` string default `WEB_PORTAL`

---

## 6. Seed Data Requirements

Create seed data for the POC:

- 2 SDOs
- 2 to 3 sites per SDO
- 10 to 20 beds per site
- All seeded beds must have status `OCCUPIED`
- Create sample users:
  - One site user assigned to one site
  - One SDO user assigned to one SDO
  - One provincial user
  - One admin user

Do not seed real patient data.

---

## 7. Pages and User Interface

### 7.1 Login Page
Route: `/login`

Requirements:
- Email field
- Password field
- Login button
- Basic error message for invalid credentials
- Redirect user based on role after login

Redirect rules:
- `SITE_USER` → `/beds`
- `SDO_USER` → `/dashboard/sdo`
- `PROVINCIAL_USER` → `/dashboard/provincial`
- `ADMIN` → `/admin` or `/dashboard/provincial`

---

### 7.2 Bed Management Page
Route: `/beds`

Primary audience: Site users.

Requirements:
- Show site name
- Show date/time of last refresh
- Show summary cards:
  - Total beds
  - Open beds
  - Occupied beds
- Show a searchable/filterable table of beds
- Columns:
  - Bed label
  - Unit
  - Bed type
  - Current status
  - Last updated
  - Updated by
  - Action

Actions:
- If bed is `Occupied`, show button: `Set to Open`
- If bed is `Open`, show button: `Set to Occupied`
- Status update should be quick and require minimal clicks
- After update, refresh counts and table row
- Display success/error toast message

Optional but useful:
- Add filter for status: All / Open / Occupied
- Add filter for unit
- Add search by bed label

---

### 7.3 SDO Dashboard
Route: `/dashboard/sdo`

Primary audience: SDO users.

Requirements:
- Show only data for SDOs the user is authorized to view
- Summary cards:
  - Total sites
  - Total beds
  - Open beds
  - Occupied beds
  - Open bed percentage
- Table grouped by site:
  - Site name
  - Total beds
  - Open beds
  - Occupied beds
  - Open percentage
  - Last updated
- Chart suggestions:
  - Bar chart: Open vs Occupied by site
  - Pie/donut chart: Overall Open vs Occupied

Filters:
- Site
- Unit, if available
- Bed type, if available

Read-only for SDO users unless they also have site update permissions.

---

### 7.4 Provincial Dashboard
Route: `/dashboard/provincial`

Primary audience: Provincial users and admin users.

Requirements:
- Show all SDOs and sites
- Summary cards:
  - Total SDOs
  - Total sites
  - Total beds
  - Open beds
  - Occupied beds
  - Provincial open bed percentage
- Table grouped by SDO and site:
  - SDO name
  - Site name
  - Total beds
  - Open beds
  - Occupied beds
  - Open percentage
  - Last updated
- Chart suggestions:
  - Bar chart: Open beds by SDO
  - Stacked bar chart: Open vs Occupied by SDO
  - Table with drilldown to site level

Filters:
- SDO
- Site
- Unit, if available
- Bed type, if available

Read-only for provincial users unless explicitly granted edit permissions.

---

### 7.5 Admin Page
Route: `/admin`

For POC, keep admin simple.

Requirements:
- View users
- Create/edit users
- Assign user role
- Assign user to site(s) or SDO(s)
- View beds
- Create/edit beds
- View audit logs

This can be basic and functional rather than polished.

---

## 8. API Endpoints

Use REST-style endpoints unless using a full-stack framework with server actions.

### 8.1 Auth

#### POST `/api/auth/login`
Request:
```json
{
  "email": "user@example.com",
  "password": "password"
}
```

Response:
```json
{
  "token": "jwt-token",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "SITE_USER"
  }
}
```

#### POST `/api/auth/logout`
Invalidate session client-side for POC.

#### GET `/api/auth/me`
Returns current user from token/session.

---

### 8.2 Beds

#### GET `/api/beds`
Returns beds visible to the current user.

Query params:
- `siteId`
- `status`
- `unit`
- `bedType`

Access rules:
- Site users only get beds for assigned sites
- Admin users can access all
- Provincial users should not use this endpoint for editing unless authorized

#### PATCH `/api/beds/:bedId/status`
Updates bed status.

Request:
```json
{
  "status": "OPEN"
}
```

Rules:
- Only `OPEN` or `OCCUPIED` allowed
- User must be authorized for the bed's site
- Write audit log row
- Update `last_updated_by_user_id`
- Update `last_status_updated_at`

Response:
```json
{
  "id": "bed-uuid",
  "status": "OPEN",
  "lastStatusUpdatedAt": "timestamp"
}
```

---

### 8.3 Dashboards

#### GET `/api/dashboard/site`
Returns summary for site user assigned sites.

#### GET `/api/dashboard/sdo`
Returns SDO-level summary for authorized SDO user.

Response example:
```json
{
  "sdoId": "uuid",
  "sdoName": "Example SDO",
  "totalSites": 3,
  "totalBeds": 60,
  "openBeds": 12,
  "occupiedBeds": 48,
  "openPercentage": 20,
  "sites": [
    {
      "siteId": "uuid",
      "siteName": "Example Site",
      "totalBeds": 20,
      "openBeds": 4,
      "occupiedBeds": 16,
      "openPercentage": 20,
      "lastUpdatedAt": "timestamp"
    }
  ]
}
```

#### GET `/api/dashboard/provincial`
Returns full provincial summary for provincial/admin users.

---

### 8.4 Admin

#### GET `/api/admin/users`
Admin only.

#### POST `/api/admin/users`
Admin only.

#### PATCH `/api/admin/users/:userId`
Admin only.

#### GET `/api/admin/audit-logs`
Admin only.

---

## 9. Security and PHIA-Conscious Design Requirements

This POC must be designed with PHIA-conscious principles, but final PHIA compliance requires organizational/legal/security review.

Implementation requirements:

1. Authentication required for all pages except `/login`.
2. Passwords must be hashed using bcrypt or equivalent.
3. Use HTTPS in deployed environments.
4. Use role-based access control.
5. Enforce authorization on the backend, not only in the frontend.
6. Do not expose beds from unauthorized sites.
7. Avoid storing PHI or patient identifiers.
8. Log bed status changes in an audit table.
9. Capture user ID, timestamp, previous status, and new status for every status change.
10. Protect against common web risks:
    - SQL injection by using ORM/prepared statements
    - XSS by escaping rendered content
    - CSRF protection if cookie-based sessions are used
    - Secure JWT/session storage
11. Use environment variables for secrets.
12. Do not commit secrets to source control.
13. Include basic session timeout or token expiry.
14. Apply least-privilege access by role and assigned site/SDO.
15. Include clear error handling without exposing sensitive system details.

Recommended future security enhancements:
- SSO integration through Azure AD / Entra ID
- MFA
- Formal audit logging review
- Security threat modelling
- Penetration testing
- Privacy impact assessment

---

## 10. Validation Rules

### Bed status update validation
- Status must be either `OPEN` or `OCCUPIED`.
- Bed must exist.
- Bed must be active.
- User must have access to the bed's site.
- If new status equals current status, return success but do not duplicate audit log unless desired.

### User validation
- Email required and unique.
- Role required.
- Inactive users cannot log in.
- Site users require at least one site assignment.
- SDO users require at least one SDO assignment.

---

## 11. UI Design Expectations

Keep the look and feel simple and operational.

Design principles:
- Clean healthcare-style interface
- Minimal clicks
- Large, clear status buttons
- Clear distinction between `Open` and `Occupied`
- Mobile/tablet friendly if possible
- Avoid clutter
- Dashboard should be readable by leadership at a glance

Suggested visual layout:
- Top navigation bar with user name, role, logout
- Summary cards across the top
- Main table below
- Filters above table
- Dashboard charts below summary cards

---

## 12. Acceptance Criteria

### Login
- User can log in with valid credentials.
- Invalid credentials show an error.
- Inactive users cannot log in.
- User is redirected based on role.

### Site user bed updates
- Site user can view only beds for assigned site(s).
- Site user can change a bed from `Occupied` to `Open`.
- Site user can change a bed from `Open` to `Occupied`.
- Counts update after a status change.
- Audit log captures each change.

### SDO dashboard
- SDO user can view only assigned SDO data.
- Dashboard displays total beds, open beds, occupied beds, and open percentage.
- SDO user cannot see other SDO data.

### Provincial dashboard
- Provincial user can view all SDO/site summaries.
- Provincial dashboard displays provincial totals and breakdowns by SDO/site.

### Admin
- Admin can view all users, beds, sites, SDOs, and audit logs.
- Admin can assign users to roles and site/SDO access.

### Security
- Unauthenticated users are redirected to login.
- Unauthorized users cannot access restricted API data.
- Backend validates all permissions.
- No patient-level data is stored in the POC.

---

## 13. Non-Functional Requirements

- Application should load quickly for daily users.
- Bed update should complete in under 2 seconds under normal POC conditions.
- Dashboard data should refresh when page loads.
- Optional: add manual refresh button.
- Code should be modular and easy to extend.
- Use clear naming and comments where helpful.
- Include README setup instructions.

---

## 14. README Requirements

Generate a README with:

1. Project overview
2. Tech stack
3. Setup instructions
4. Environment variables
5. Database migration instructions
6. Seed data instructions
7. How to run locally
8. Sample login accounts
9. Security notes
10. Known POC limitations

---

## 15. Environment Variables

Use `.env.example` with:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/bed_management_portal"
JWT_SECRET="replace-with-secure-secret"
JWT_EXPIRES_IN="8h"
APP_ENV="development"
```

Do not include real secrets.

---

## 16. POC Limitations to Document

Clearly document that:

- This is a proof of concept.
- Final PHIA compliance requires privacy, legal, and security review.
- SSO/MFA should be added before production use.
- No patient data should be stored.
- Dashboards are based on manually updated bed statuses.
- Integrations with existing source systems can be added later.

---

## 17. Future Enhancements

Potential future functionality:

- SSO with Entra ID
- MFA
- Automated daily reminders for site users
- Bulk bed updates
- Import bed list from CSV
- Export dashboard data
- Historical trend reporting
- Integration with APF, ADT, or another bed management source system
- API integration with provincial reporting systems
- Notifications when sites have not updated bed status by a defined time
- Audit reporting dashboard
- More statuses such as `Reserved`, `Closed`, `Cleaning`, or `Unavailable`

---

## 18. Implementation Instruction for Codex

Build the application according to this spec. Prioritize a working POC over excessive complexity. Start with authentication, role-based access, seeded data, bed update workflow, audit logging, and dashboards. Keep UI simple, clean, and healthcare-appropriate.

Do not include patient-identifiable data anywhere in the seed data, UI, logs, or database schema.
