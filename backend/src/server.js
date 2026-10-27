import 'dotenv/config';
import { connectDB } from './config/db.js';
import { createApp } from './app.js';

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is not set');
  process.exit(1);
}

const port = process.env.PORT || 5000;

connectDB()
  .then(() => createApp().listen(port, () => console.log(`API listening on :${port}`)))
  .catch((err) => {
    console.error('Failed to start:', err.message);
    process.exit(1);
  });
