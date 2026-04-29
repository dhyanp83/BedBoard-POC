# Public Demo Hosting

Use this only for demo data. Do not upload patient data or secrets.

## Fast Path: Render

Render can host a Node web service and provide a public `onrender.com` URL.

1. Put this folder in a GitHub repository.
2. In Render, create a new **Web Service** from that repository.
3. Use these settings:

```text
Runtime: Node
Build command: npm install
Start command: npm start
```

4. Add environment variables:

```text
JWT_SECRET=<make-a-long-random-value>
JWT_EXPIRES_IN=8h
APP_ENV=demo
```

5. Deploy. Render will provide a public URL.

## Important Demo Notes

- The app uses JSON file storage for the POC.
- The public demo starts from seeded workbook data if `data/db.json` is absent.
- File storage on free/ephemeral hosts may reset on redeploy or restart.
- This should not be used for production or PHIA-sensitive data.

## Sample Account

```text
admin.user@example.com
Password123!
```
