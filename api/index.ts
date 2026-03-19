import express from 'express';
import cors from 'cors';
import routes from '../server/routes';

const app = express();

app.use(cors());
app.use(express.json());

// Mount the routes at /api
app.use('/api', routes);

// Global error handler for API routes
app.use('/api', (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled API error:', err);
  res.status(500).json({ error: err?.message || 'Internal Server Error' });
});

export default app;
